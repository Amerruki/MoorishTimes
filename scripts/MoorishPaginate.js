/*!
 * MoorishPaginate v1.3 — seamless CMS pagination for moorishtimes.com
 * Replaces jquery.pjax 2.0.1 (archived upstream). Zero dependencies.
 *
 * Behavior: intercepts CMS pagination links (.w-pagination-wrapper a),
 * fetches the target page (cache-first), swaps the #seamless-replace
 * container in place (inside a View Transition where supported), updates
 * the URL, re-inits page interactions once, and smooth-scrolls back to
 * the top of the list — offset by the fixed nav's clearance. Neighbor pages
 * are prefetched at idle and after every swap, so clicks are instant.
 * Any failure (timeout, missing container, HTTP error) falls back to a
 * normal full navigation. Inert on pages without the container.
 *
 * v1.1: nav-clearance scroll offset (reads the Nav Clearance design token,
 * falls back to 104px) · pagination prefetch with a small session cache ·
 * double-click guard + busy dim on the container.
 * v1.2: the scroll starts immediately on click, in parallel with the fetch —
 * the swap lands mid-glide (target Y precomputed from the stable layout
 * above the list, so the destination never shifts).
 * v1.3: honors prefers-reduced-motion — instant jump instead of the glide,
 * plain swap instead of the View Transition crossfade. Queried per action,
 * so an OS-level toggle applies without a reload. The opacity dim stays:
 * fades are the reduced-motion-safe feedback.
 */
(function () {
  'use strict';

  var SEL = '#seamless-replace';
  var SCROLL_TARGET = '#Beginarticles';
  var TIMEOUT_MS = 2500;
  var SCROLL_MS = 1000;
  var NAV_CLEARANCE_FALLBACK = 104;   // px — mirrors the Nav Clearance token
  var CACHE_MAX = 8;

  if (window.__mtPaginate) return;            // paste-twice / double-load guard
  if (!document.querySelector(SEL)) return;   // no container on this page → stay inert
  window.__mtPaginate = true;

  var pages = new Map();                      // absolute URL → Promise<html text>
  var busy = false;

  function reinitInteractions() {
    try {
      if (window.Webflow && Webflow.require) Webflow.require('ix2').init();
    } catch (e) { /* ix2 absent — nothing to re-init */ }
  }

  function navOffset() {
    var v = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--_tokens---nav-clearance'));
    return isNaN(v) ? NAV_CLEARANCE_FALLBACK : v;
  }

  function reducedMotion() {
    return window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // jQuery-free equivalent of the old $('html,body').animate(..., 1000),
  // landing the target just below the fixed nav instead of underneath it
  function scrollToList() {
    var t = document.querySelector(SCROLL_TARGET) || document.querySelector(SEL);
    if (!t) return;
    var from = window.pageYOffset || document.documentElement.scrollTop || 0;
    var to = Math.max(0, t.getBoundingClientRect().top + from - navOffset());
    if (reducedMotion()) { window.scrollTo(0, to); return; }
    var start;
    function step(ts) {
      if (start === undefined) start = ts;
      var p = Math.min((ts - start) / SCROLL_MS, 1);
      var eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      window.scrollTo(0, from + (to - from) * eased);
      if (p < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  // Single fetch path for prefetches and clicks — concurrent callers share
  // one request; failures evict so a retry stays possible.
  function fetchPage(url) {
    if (!pages.has(url)) {
      if (pages.size >= CACHE_MAX) pages.delete(pages.keys().next().value);
      pages.set(url, fetch(url, { credentials: 'same-origin' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .catch(function (e) {
          pages.delete(url);
          throw e;
        }));
    }
    return pages.get(url);
  }

  // Warm the cache with every pagination link in the current container
  // (the CMS emits at most prev + next). Respects the browser's data saver.
  function prefetch() {
    if (navigator.connection && navigator.connection.saveData) return;
    var c = document.querySelector(SEL);
    if (!c) return;
    var links = c.querySelectorAll('.w-pagination-wrapper a[href]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].origin === window.location.origin) {
        fetchPage(links[i].href).catch(function () {});
      }
    }
  }

  function schedulePrefetch() {
    var go = function () {
      if (window.requestIdleCallback) window.requestIdleCallback(prefetch, { timeout: 4000 });
      else setTimeout(prefetch, 800);
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
  }

  function swap(url, push) {
    var container = document.querySelector(SEL);
    if (!container) { window.location.href = url; return; }
    if (busy) return;                          // double-tap guard
    busy = true;
    container.style.transition = 'opacity .15s';
    container.style.opacity = '0.55';          // instant feedback on cold fetches
    scrollToList();                            // v1.2: glide starts NOW, parallel with the fetch

    var timedOut = new Promise(function (ignore, reject) {
      setTimeout(reject, TIMEOUT_MS, new Error('timeout'));
    });

    Promise.race([fetchPage(url), timedOut])
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var next = doc.querySelector(SEL);
        if (!next) throw new Error('no ' + SEL + ' in response');

        function apply() {
          container.replaceWith(next);
          reinitInteractions();
        }

        var transitioned = (document.startViewTransition && !reducedMotion())
          ? document.startViewTransition(apply).finished.catch(function () {})
          : (apply(), Promise.resolve());

        return transitioned.then(function () {
          if (push) {
            // mark the current entry the first time, so Back can return to it seamlessly
            if (!window.history.state || !window.history.state.mtPaginate) {
              window.history.replaceState({ mtPaginate: true }, '', window.location.href);
            }
            window.history.pushState({ mtPaginate: true }, '', url);
          }
          if (doc.title) document.title = doc.title;
          busy = false;
          prefetch();                          // warm the new neighbors (page 3, …)
        });
      })
      .catch(function () {
        window.location.href = url;            // graceful degradation, always
      });
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest && e.target.closest('.w-pagination-wrapper a');
    if (!a || !a.href) return;
    if (a.target && a.target !== '_self') return;
    if (a.origin !== window.location.origin) return;
    e.preventDefault();
    swap(a.href, true);
  });

  window.addEventListener('popstate', function (e) {
    if (e.state && e.state.mtPaginate) swap(window.location.href, false);
  });

  schedulePrefetch();
})();
