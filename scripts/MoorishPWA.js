// MoorishPWA v1.2 — installed-app chrome for The Moorish Times.
// v1.2: cog + bookmark redrawn as inline stroke SVGs (site style, sized to the
// circle); FR copy « publications » per owner; served same-origin at
// /pwa/app.js by the mt-pwa worker, which injects var MT_APP_PIN — the update
// toast compares that against /pwa/release.json (script-src pin as fallback).
// v1.1: update toast, utm launch-param tidy + pwa_context analytics,
// SW updateViaCache:'none' + visible-hour update polls.
// Replaces MoorishPush (v1.0.x): the bell is retired for two honest controls.
//
//   ⚙ bottom-LEFT  — app settings: a small panel with two tabs.
//        Alertes     — publication alerts by section (Articles: Histoire,
//                      Culture · Actualités: Politique, Économie, Sport,
//                      Actualité) or everything. Permission is requested only
//                      when the reader first enables something.
//        Sauvegardés — the reading list (see below).
//   🔖 bottom-RIGHT — on article/news pages only: bookmark the piece into
//        IndexedDB. Article-scoped control, article-side placement.
//
// Installed app only (display-mode: standalone); the website never sees any
// of it. iOS is excluded — the native app owns that platform. All DOM is
// built with createElement/textContent — no innerHTML anywhere. Loaded
// commit-pinned from jsDelivr in the site-wide footer.

(function () {
  'use strict';

  // ---- gates --------------------------------------------------------------
  if (!/(^|\.)moorishtimes\.com$/.test(location.hostname)) return;
  var standalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
  if (!standalone) return;
  var ua = navigator.userAgent || '';
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIOS) return;

  var canPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  if ('clearAppBadge' in navigator) {
    try { navigator.clearAppBadge(); } catch (e) { /* garnish */ }
  }

  var EN = location.pathname === '/en' || location.pathname.indexOf('/en/') === 0;
  var API = location.origin + '/app-api/v1';
  var LS_SECTIONS = 'mt-alert-sections';
  var LS_SYNCED = 'mt-push-synced-at';
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  var ALL = ['hist', 'cult', 'pol', 'eco', 'sport', 'actu'];

  var T = EN
    ? {
        settings: 'Settings', alerts: 'Alerts', saved: 'Saved',
        all: 'All publications', articles: 'Articles', news: 'News',
        sections: { hist: 'History', cult: 'Culture', pol: 'Politics', eco: 'Economy', sport: 'Sport', actu: 'News wire' },
        noPush: 'Alerts are not supported in this browser.',
        denied: 'Notifications are blocked in your browser settings.',
        empty: 'No saved articles yet. Tap the bookmark on any piece to keep it here.',
        bookmark: 'Save this article', bookmarked: 'Saved - tap to remove', remove: 'Remove',
      }
    : {
        settings: 'Réglages', alerts: 'Alertes', saved: 'Sauvegardés',
        all: 'Toutes les publications', articles: 'Articles', news: 'Actualités',
        sections: { hist: 'Histoire', cult: 'Culture', pol: 'Politique', eco: 'Économie', sport: 'Sport', actu: 'Actualité' },
        noPush: 'Les alertes ne sont pas prises en charge par ce navigateur.',
        denied: 'Les notifications sont bloquées dans les réglages du navigateur.',
        empty: 'Aucun article sauvegardé. Touchez le marque-page sur un article pour le garder ici.',
        bookmark: 'Sauvegarder cet article', bookmarked: 'Sauvegardé — toucher pour retirer', remove: 'Retirer',
      };
  var GROUPS = [
    { label: T.articles, keys: ['hist', 'cult'] },
    { label: T.news, keys: ['pol', 'eco', 'sport', 'actu'] },
  ];

  // ---- styles -------------------------------------------------------------
  var css = '' +
    '.mt-app-fab{position:fixed;z-index:999;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.28);' +
    ' background:#151515;color:#F8DB5A;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;' +
    ' box-shadow:0 2px 10px rgba(0,0,0,.35);transition:transform .15s ease,background .2s ease}' +
    '.mt-app-fab svg{width:21px;height:21px;display:block}' +
    '#mt-app-mark.mt-on svg .mt-fillable{fill:currentColor}' +
    '.mt-app-fab:hover{transform:scale(1.08)}' +
    '#mt-app-cog{bottom:16px;left:16px}' +
    '#mt-app-mark{bottom:88px;right:16px}' +
    '#mt-app-mark.mt-on{background:#1D7BBC;color:#fff;border-color:#1D7BBC}' +
    '#mt-app-panel{position:fixed;z-index:1000;bottom:68px;left:16px;width:min(320px,calc(100vw - 32px));' +
    ' background:#151515;color:#fff;border:1px solid rgba(255,255,255,.22);border-radius:3px;' +
    ' box-shadow:0 8px 32px rgba(0,0,0,.5);font-family:\'Open Sans\',-apple-system,\'Segoe UI\',sans-serif}' +
    '#mt-app-panel .mt-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.14)}' +
    '#mt-app-panel .mt-tabs button{flex:1;background:none;border:0;color:#C9C4BC;font:600 12px/1 inherit;' +
    ' letter-spacing:.12em;text-transform:uppercase;padding:13px 0;cursor:pointer;border-bottom:2px solid transparent}' +
    '#mt-app-panel .mt-tabs button.mt-active{color:#fff;border-bottom-color:#1D7BBC}' +
    '#mt-app-panel .mt-body{padding:14px 16px 16px;max-height:52vh;overflow:auto}' +
    '.mt-row{display:flex;align-items:center;gap:10px;padding:7px 0;font-size:14px}' +
    '.mt-row input{accent-color:#1D7BBC;width:16px;height:16px;margin:0}' +
    '.mt-group{margin:10px 0 2px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#777}' +
    '.mt-master{border-bottom:1px solid rgba(255,255,255,.14);padding-bottom:10px;margin-bottom:4px;font-weight:600}' +
    '.mt-note{font-size:12.5px;color:#C9C4BC;line-height:1.5;margin:6px 0 0}' +
    '.mt-saved-item{display:flex;align-items:baseline;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)}' +
    '.mt-saved-item a{color:#fff;text-decoration:none;font-size:13.5px;line-height:1.45;flex:1}' +
    '.mt-saved-item a:hover{color:#4FA3D9}' +
    '.mt-saved-item button{background:none;border:0;color:#777;cursor:pointer;font-size:14px;padding:0 2px}' +
    '.mt-saved-item button:hover{color:#F24137}' +
    '#mt-update-toast{position:fixed;z-index:1001;left:50%;transform:translateX(-50%);bottom:74px;' +
    ' display:flex;align-items:center;gap:14px;background:#151515;color:#fff;border:1px solid rgba(255,255,255,.22);' +
    ' border-radius:3px;box-shadow:0 8px 32px rgba(0,0,0,.5);padding:12px 14px 12px 18px;font-size:14px;' +
    ' font-family:\'Open Sans\',-apple-system,\'Segoe UI\',sans-serif;max-width:calc(100vw - 32px)}' +
    '#mt-update-toast .mt-up{background:#1D7BBC;color:#fff;border:0;border-radius:3px;cursor:pointer;' +
    ' padding:9px 20px;font:600 13px/1 inherit;letter-spacing:.04em}' +
    '#mt-update-toast .mt-up:hover{background:#125A8C}' +
    '#mt-update-toast .mt-x{background:none;border:0;color:#777;cursor:pointer;font-size:15px;padding:0 2px}';
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // small DOM helper: el('div', 'class', 'text content')
  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text) n.textContent = text;
    return n;
  }

  // Inline stroke icons in the site's line style (currentColor, round caps).
  function svgIcon(paths) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    paths.forEach(function (d) {
      var p = document.createElementNS(NS, d[0]);
      Object.keys(d[1]).forEach(function (k) { p.setAttribute(k, d[1][k]); });
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '1.8');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(p);
    });
    return svg;
  }
  function settingsIcon() { // two sliders — the house-minimal « réglages » mark
    return svgIcon([
      ['line', { x1: 4, y1: 8, x2: 20, y2: 8 }],
      ['circle', { cx: 14.6, cy: 8, r: 2.6, fill: '#151515' }],
      ['line', { x1: 4, y1: 16, x2: 20, y2: 16 }],
      ['circle', { cx: 9.4, cy: 16, r: 2.6, fill: '#151515' }],
    ]);
  }
  function bookmarkIcon() {
    return svgIcon([
      ['path', { d: 'M7 4.5h10a1 1 0 0 1 1 1V20l-6-4.4L6 20V5.5a1 1 0 0 1 1-1z', 'class': 'mt-fillable' }],
    ]);
  }

  // ---- IndexedDB bookmarks ------------------------------------------------
  function withDB(fn) {
    return new Promise(function (resolve, reject) {
      var open = indexedDB.open('moorish-app', 1);
      open.onupgradeneeded = function () {
        open.result.createObjectStore('bookmarks', { keyPath: 'url' });
      };
      open.onsuccess = function () { resolve(fn(open.result)); };
      open.onerror = function () { reject(open.error); };
    });
  }
  function idbOp(mode, run) {
    return withDB(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('bookmarks', mode);
        var req = run(tx.objectStore('bookmarks'));
        tx.oncomplete = function () { resolve(req && req.result); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function getBookmark(url) { return idbOp('readonly', function (s) { return s.get(url); }); }
  function allBookmarks() { return idbOp('readonly', function (s) { return s.getAll(); }); }
  function putBookmark(b) { return idbOp('readwrite', function (s) { return s.put(b); }); }
  function delBookmark(url) { return idbOp('readwrite', function (s) { return s.delete(url); }); }

  // ---- alert preferences --------------------------------------------------
  function savedSections() {
    try {
      var v = JSON.parse(localStorage.getItem(LS_SECTIONS) || 'null');
      if (Array.isArray(v)) return v.filter(function (s) { return ALL.indexOf(s) !== -1; });
    } catch (e) { /* fallthrough */ }
    return [];
  }
  function storeSections(list) {
    try { localStorage.setItem(LS_SECTIONS, JSON.stringify(list)); } catch (e) {}
  }

  function b64urlToUint8(s) {
    var pad = s.length % 4 === 0 ? '' : '===='.slice(s.length % 4);
    var raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function registerWithBackend(sub, sections) {
    var j = sub.toJSON();
    return fetch(API + '/web-push/subscriptions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        endpoint: j.endpoint,
        keys: { p256dh: j.keys.p256dh, auth: j.keys.auth },
        locale: EN ? 'en' : 'fr',
        sections: sections,
      }),
    }).then(function (r) {
      if (r.ok) { try { localStorage.setItem(LS_SYNCED, String(Date.now())); } catch (e) {} }
      return r.ok;
    });
  }

  /** Make reality match `sections`: subscribe/re-register, or tear down on []. */
  function applySections(sections) {
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription().then(function (existing) {
        if (sections.length === 0) {
          if (!existing) return true;
          return fetch(API + '/web-push/subscriptions', {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ endpoint: existing.endpoint }),
          }).catch(function () {}).then(function () { return existing.unsubscribe(); })
            .then(function () { return true; });
        }
        if (existing) return registerWithBackend(existing, sections);
        return Notification.requestPermission().then(function (perm) {
          if (perm !== 'granted') return false;
          return fetch(API + '/web-push/vapid-public-key')
            .then(function (r) { return r.json(); })
            .then(function (j) {
              return reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: b64urlToUint8(j.key),
              });
            })
            .then(function (sub) { return registerWithBackend(sub, sections); });
        });
      });
    });
  }

  // ---- panel --------------------------------------------------------------
  var panel = null;

  function closePanel() {
    if (panel) { panel.remove(); panel = null; }
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function checkboxRow(labelText, value, checked, extraClass) {
    var label = el('label', 'mt-row' + (extraClass ? ' ' + extraClass : ''));
    var input = document.createElement('input');
    input.type = 'checkbox';
    if (value) { input.className = 'mt-sec'; input.value = value; }
    else input.id = 'mt-all';
    input.checked = checked;
    label.appendChild(input);
    label.appendChild(document.createTextNode(' ' + labelText));
    return label;
  }

  function renderAlertsTab(body) {
    clearChildren(body);
    if (!canPush) { body.appendChild(el('p', 'mt-note', T.noPush)); return; }
    if (Notification.permission === 'denied') { body.appendChild(el('p', 'mt-note', T.denied)); return; }
    var sections = savedSections();
    body.appendChild(checkboxRow(T.all, null, sections.length === ALL.length, 'mt-master'));
    GROUPS.forEach(function (g) {
      body.appendChild(el('div', 'mt-group', g.label));
      g.keys.forEach(function (k) {
        body.appendChild(checkboxRow(T.sections[k], k, sections.indexOf(k) !== -1));
      });
    });
    wireAlerts(body);
  }

  function renderSavedTab(body) {
    clearChildren(body);
    allBookmarks().then(function (items) {
      if (!items || items.length === 0) {
        body.appendChild(el('p', 'mt-note', T.empty));
        return;
      }
      items.sort(function (a, b) { return b.savedAt - a.savedAt; });
      items.forEach(function (b) {
        var row = el('div', 'mt-saved-item');
        var a = el('a', null, b.title);
        a.href = b.url;
        var x = el('button', null, '✕');
        x.type = 'button';
        x.setAttribute('aria-label', T.remove);
        x.onclick = function () {
          delBookmark(b.url).then(function () {
            row.remove();
            if (markBtn && b.url === location.pathname) setMark(false);
          });
        };
        row.appendChild(a);
        row.appendChild(x);
        body.appendChild(row);
      });
    });
  }

  function wireAlerts(body) {
    var boxes = body.querySelectorAll('.mt-sec');
    var master = body.querySelector('#mt-all');
    if (!master) return;
    function current() {
      var out = [];
      boxes.forEach(function (b) { if (b.checked) out.push(b.value); });
      return out;
    }
    function sync() {
      var list = current();
      master.checked = list.length === ALL.length;
      storeSections(list);
      applySections(list).then(function (ok) {
        if (ok === false) { // permission refused: reset the UI to reality
          boxes.forEach(function (b) { b.checked = false; });
          master.checked = false;
          storeSections([]);
          if (Notification.permission === 'denied') renderAlertsTab(body);
        }
      });
    }
    master.addEventListener('change', function () {
      boxes.forEach(function (b) { b.checked = master.checked; });
      sync();
    });
    boxes.forEach(function (b) { b.addEventListener('change', sync); });
  }

  function openPanel() {
    if (panel) { closePanel(); return; }
    panel = el('div');
    panel.id = 'mt-app-panel';
    var tabs = el('div', 'mt-tabs');
    var body = el('div', 'mt-body');

    function makeTab(name, label, render) {
      var b = el('button', null, label);
      b.type = 'button';
      b.setAttribute('data-tab', name);
      b.addEventListener('click', function () {
        tabs.querySelectorAll('button').forEach(function (o) { o.classList.remove('mt-active'); });
        b.classList.add('mt-active');
        render(body);
      });
      tabs.appendChild(b);
      return b;
    }
    var alertsBtn = makeTab('alerts', T.alerts, renderAlertsTab);
    makeTab('saved', T.saved, renderSavedTab);

    panel.appendChild(tabs);
    panel.appendChild(body);
    document.body.appendChild(panel);
    alertsBtn.classList.add('mt-active');
    renderAlertsTab(body);
  }

  // ---- bookmark control ---------------------------------------------------
  var ARTICLE_RE = /^(\/en)?\/(articles|news)\/[^/]+$/;
  var markBtn = null;

  function setMark(on) {
    markBtn.classList.toggle('mt-on', on);
    markBtn.title = on ? T.bookmarked : T.bookmark;
    markBtn.setAttribute('aria-label', markBtn.title);
  }

  function pageTitle() {
    var og = document.querySelector('meta[property="og:title"]');
    var t = (og && og.content) || document.title;
    return t.replace(/\s*[-—|]\s*The Moorish Times.*$/i, '').trim() || t;
  }

  function makeMark() {
    markBtn = el('button', 'mt-app-fab');
    markBtn.id = 'mt-app-mark';
    markBtn.type = 'button';
    markBtn.appendChild(bookmarkIcon());
    document.body.appendChild(markBtn);
    getBookmark(location.pathname).then(function (b) { setMark(!!b); });
    markBtn.addEventListener('click', function () {
      getBookmark(location.pathname).then(function (b) {
        if (b) return delBookmark(location.pathname).then(function () { setMark(false); });
        return putBookmark({
          url: location.pathname,
          title: pageTitle(),
          locale: EN ? 'en' : 'fr',
          savedAt: Date.now(),
        }).then(function () { setMark(true); });
      });
    });
  }

  // ---- update toast (« Nous avons fait une mise à jour ») -----------------
  // Staleness in this MPA is THIS pinned script inside a long-lived standalone
  // window. The mt-pwa worker announces the current pin at /pwa/release.json;
  // we read our own <script src> pin and compare. Never auto-reload.
  var UP_T = EN
    ? { msg: "We've made an update", btn: 'Refresh' }
    : { msg: 'Nous avons fait une mise à jour', btn: 'Actualiser' };
  var CHECK_MIN_GAP = 5 * 60 * 1000;
  var lastCheck = 0;
  var toastEl = null;

  function ownPin() {
    if (typeof MT_APP_PIN === 'string' && MT_APP_PIN) return MT_APP_PIN;
    var scripts = document.querySelectorAll('script[src*="/scripts/MoorishPWA.js"]');
    for (var i = 0; i < scripts.length; i++) {
      var m = scripts[i].src.match(/MoorishTimes@([0-9a-f]{7,40})\//);
      if (m) return m[1];
    }
    return null;
  }

  function showUpdateToast(newPin) {
    if (toastEl) return;
    try { if (sessionStorage.getItem('mt-update-dismissed') === newPin) return; } catch (e) {}
    toastEl = el('div');
    toastEl.id = 'mt-update-toast';
    toastEl.appendChild(el('span', null, UP_T.msg));
    var go = el('button', 'mt-up', UP_T.btn);
    go.type = 'button';
    go.onclick = function () { location.reload(); };
    var x = el('button', 'mt-x', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', 'OK');
    x.onclick = function () {
      try { sessionStorage.setItem('mt-update-dismissed', newPin); } catch (e) {}
      toastEl.remove();
      toastEl = null;
    };
    toastEl.appendChild(go);
    toastEl.appendChild(x);
    document.body.appendChild(toastEl);
  }

  function checkRelease(force) {
    var now = Date.now();
    if (!force && now - lastCheck < CHECK_MIN_GAP) return;
    if (document.visibilityState !== 'visible') return;
    lastCheck = now;
    var mine = ownPin();
    if (!mine) return;
    fetch('/pwa/release.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.app && j.app.indexOf(mine) !== 0 && mine.indexOf(j.app) !== 0) {
          showUpdateToast(j.app);
        }
      })
      .catch(function () { /* next trigger retries */ });
  }

  function wireUpdateChecks() {
    setTimeout(function () { checkRelease(true); }, 5000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { checkRelease(); swUpdate(); }
    });
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) checkRelease(); // bfcache restore: no SW/network involved
    });
    setInterval(function () { checkRelease(); swUpdate(); }, 60 * 60 * 1000);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'MT_SW_ACTIVATED') checkRelease(true);
      });
    }
  }

  // Long-lived windows never navigate, so they stop checking /sw.js on their
  // own — nudge the browser's byte-diff check while visible.
  function swUpdate() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (reg) reg.update().catch(function () {});
    });
  }

  // ---- launch analytics ---------------------------------------------------
  // GA4 reads utm_source=pwa from the landing URL on its own; we add the
  // display-mode dimension, then tidy the address bar for readers.
  function launchAnalytics() {
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'pwa_context', { pwa_display_mode: 'standalone' });
      }
      var url = new URL(location.href);
      if (url.searchParams.get('utm_source') === 'pwa') {
        url.searchParams.delete('utm_source');
        url.searchParams.delete('utm_medium');
        history.replaceState(history.state, '', url.pathname + (url.search || '') + url.hash);
      }
    } catch (e) { /* analytics is garnish */ }
  }

  // ---- boot ---------------------------------------------------------------
  window.addEventListener('load', function () {
    var cog = el('button', 'mt-app-fab');
    cog.id = 'mt-app-cog';
    cog.type = 'button';
    cog.appendChild(settingsIcon());
    cog.title = T.settings;
    cog.setAttribute('aria-label', T.settings);
    cog.addEventListener('click', openPanel);
    document.body.appendChild(cog);

    if (ARTICLE_RE.test(location.pathname)) makeMark();

    launchAnalytics();
    wireUpdateChecks();
    // Re-assert the registration with updateViaCache:'none' so the SW's own
    // update checks always hit the network (the head block registers plain).
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(function () {});
    }

    // Weekly re-sync keeps the registry's updated_at fresh.
    if (canPush) {
      navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription();
      }).then(function (sub) {
        if (!sub) return;
        var last = 0;
        try { last = parseInt(localStorage.getItem(LS_SYNCED) || '0', 10) || 0; } catch (e) {}
        var sections = savedSections();
        if (sections.length > 0 && Date.now() - last > WEEK_MS) registerWithBackend(sub, sections);
      }).catch(function () { /* nothing to sync */ });
    }
  });
})();
