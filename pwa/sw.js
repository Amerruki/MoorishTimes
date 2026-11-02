/* MoorishSW v3.1 — The Moorish Times service worker.
 *
 * Doctrine: pages are NEVER cached — every navigation is network-first, so a
 * site publish can never be masked. What v3.0 adds is a small versioned
 * SHELL cache of stable brand assets (wordmark, app icon, Open Sans), so the
 * offline page can wear the site's real header: masthead, category nav, type.
 * Font files also cache-first at runtime (they are immutable by URL).
 *
 * Web Push (since v2.0): show the backend's composed notification, open the
 * article on tap. Subscribing lives in MoorishPWA.js — this file never asks.
 *
 * Served same-origin at moorishtimes.com/sw.js by the `mt-pwa` Cloudflare
 * zone worker (commit-pinned jsDelivr proxy). Kill switch: repin the zone
 * worker to serve pwa/sw-noop.js instead (it clears every moorish-* cache).
 */

var SHELL_CACHE = 'moorish-shell-v1';

var WORDMARK = 'https://cdn.prod.website-files.com/603218b0b7c47aa6470d49b0/60321dcc615751d58ea7b297_MoorishTimes-p-500.png';
var APP_ICON = '/pwa/icons/icon-192-v2.png';
var FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap';

var PRECACHE = [WORDMARK, APP_ICON, FONTS_CSS];

function isShellAsset(url) {
  if (PRECACHE.indexOf(url.href) !== -1) return true;
  if (url.hostname === 'fonts.gstatic.com') return true; // immutable font files
  return false;
}

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    var cache = await caches.open(SHELL_CACHE);
    // Tolerant precache: a missing asset must never block installation.
    await Promise.all(PRECACHE.map(async function (u) {
      try {
        var res = await fetch(u, { mode: 'cors' });
        if (res.ok) await cache.put(u, res);
      } catch (e) { /* cached on a later visit via runtime caching */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    // Purge every moorish-* cache except the current shell version.
    var keys = await caches.keys();
    await Promise.all(keys
      .filter(function (k) { return k.indexOf('moorish-') === 0 && k !== SHELL_CACHE; })
      .map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
    // Hint every open window that a deployment happened. This is a nudge, not
    // a command: pages confirm against /pwa/release.json before showing the
    // update toast (MoorishPWA.js), and never auto-reload.
    var windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach(function (c) { c.postMessage({ type: 'MT_SW_ACTIVATED' }); });
  })());
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function () { return shellResponse(url); })
    );
    return;
  }

  // Shell assets: cache-first, filling the cache on first sight.
  if (event.request.method === 'GET' && isShellAsset(url)) {
    event.respondWith((async function () {
      var cached = await caches.match(event.request.url, { cacheName: SHELL_CACHE });
      if (cached) return cached;
      var res = await fetch(event.request);
      if (res.ok) {
        var cache = await caches.open(SHELL_CACHE);
        cache.put(event.request.url, res.clone());
      }
      return res;
    })());
  }
  // Everything else: untouched passthrough.
});

self.addEventListener('push', function (event) {
  // Payload: {title, body, url, tag, locale, section} — unknown fields ignored.
  // Always show something: Safari revokes the subscription on silent pushes.
  var n = null;
  try {
    n = event.data ? event.data.json() : null;
  } catch (e) {
    n = null;
  }
  var title = (n && n.title) || 'The Moorish Times';
  var options = {
    body: (n && n.body) || '',
    icon: '/pwa/icons/icon-192-v2.png',
    badge: '/pwa/icons/badge-96.png',
    tag: (n && n.tag) || 'mt-news',
    data: { url: (n && n.url) || '/' },
  };
  event.waitUntil((async function () {
    await self.registration.showNotification(title, options);
    if ('setAppBadge' in navigator) {
      try { await navigator.setAppBadge(); } catch (e) { /* badge is garnish */ }
    }
  })());
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async function () {
    if ('clearAppBadge' in navigator) {
      try { await navigator.clearAppBadge(); } catch (e) { /* ignore */ }
    }
    var windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (var i = 0; i < windows.length; i++) {
      var client = windows[i];
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});

function shellResponse(url) {
  var en = url.pathname === '/en' || url.pathname.indexOf('/en/') === 0;
  var t = en
    ? {
        lang: 'en',
        title: 'You are offline',
        body: 'The connection dropped. This page will be waiting once the network returns.',
        retry: 'Try again',
        nav: [['Home', '/en'], ['Articles', '/en/articles'], ['News', '/en/news'], ['History', '/en/cat/history'], ['Culture', '/en/cat/culture'], ['Politics', '/en/cat/politics']],
      }
    : {
        lang: 'fr',
        title: 'Vous êtes hors ligne',
        body: 'La connexion s’est interrompue. Cette page vous attendra dès que le réseau reviendra.',
        retry: 'Réessayer',
        nav: [['Accueil', '/'], ['Articles', '/articles'], ['Actualité', '/news'], ['Histoire', '/cat/hist'], ['Culture', '/cat/cult'], ['Politique', '/cat/pol']],
      };
  var navHtml = t.nav
    .map(function (l) { return '<a href="' + l[1] + '">' + l[0] + '</a>'; })
    .join('');
  var html = '<!DOCTYPE html>\n<html lang="' + t.lang + '">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="theme-color" content="#151515">\n' +
    '<title>' + t.title + ' — The Moorish Times</title>\n' +
    '<link rel="stylesheet" href="' + FONTS_CSS + '">\n' +
    '<style>\n' +
    "  body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:#151515;color:#fff;\n" +
    "    font-family:'Open Sans',-apple-system,'Segoe UI','Helvetica Neue',Arial,sans-serif}\n" +
    '  header{padding:26px 20px 0;text-align:center}\n' +
    '  header img{max-width:230px;width:60%;height:auto}\n' +
    '  nav{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 26px;padding:24px 16px 20px;\n' +
    '    border-bottom:1px solid rgba(255,255,255,.14)}\n' +
    '  nav a{color:#fff;text-decoration:none;font-size:12px;font-weight:600;letter-spacing:.14em;\n' +
    '    text-transform:uppercase;padding:4px 0}\n' +
    '  nav a:hover{color:#4FA3D9}\n' +
    '  main{flex:1;display:flex;align-items:center;justify-content:center;text-align:center;padding:40px 28px}\n' +
    '  .plate{max-width:26em}\n' +
    '  .star{font-size:52px;line-height:1;color:#7C6F65}\n' +
    '  .rule{width:72px;height:2px;background:rgba(255,255,255,.92);border:0;margin:26px auto}\n' +
    '  h1{margin:0 0 12px;font-size:23px;font-weight:700}\n' +
    '  p{margin:0 0 28px;font-size:15px;line-height:1.65;color:#C9C4BC}\n' +
    '  button{appearance:none;border:0;border-radius:3px;cursor:pointer;background:#1D7BBC;color:#fff;\n' +
    '    padding:11px 30px;font:600 14px/1 inherit;letter-spacing:.04em}\n' +
    '  button:hover{background:#125A8C}\n' +
    '  footer{padding:18px;text-align:center;font-size:11px;letter-spacing:.1em;color:#777}\n' +
    '</style>\n</head>\n<body>\n' +
    '<header><a href="' + (en ? '/en' : '/') + '"><img src="' + WORDMARK + '" alt="The Moorish Times"></a></header>\n' +
    '<nav>' + navHtml + '</nav>\n' +
    '<main><div class="plate">\n' +
    '  <div class="star">۞</div>\n' +
    '  <hr class="rule">\n' +
    '  <h1>' + t.title + '</h1>\n' +
    '  <p>' + t.body + '</p>\n' +
    '  <button onclick="location.reload()">' + t.retry + '</button>\n' +
    '</div></main>\n' +
    '<footer>THE MOORISH TIMES</footer>\n' +
    '</body>\n</html>';
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
