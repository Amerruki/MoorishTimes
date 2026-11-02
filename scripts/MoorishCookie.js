// The Moorish Times Cookie Consent Script — v2.2
// Self-contained consent banner wired to Google Consent Mode v2.
// Markup contract: [mtcc="banner"], [mtcc="allow"], [mtcc="deny"].
// Pairs with the inline "consent default" snippet in the site head,
// which reads the same cookie so returning visitors get the right
// consent state before GTM boots.
//
// v2.1: the script owns the banner's entrance and exit animations.
// The legacy page interaction ("Cookie Show Up") only fired on a
// homepage scroll marker, so the banner never appeared on any other
// landing page; its baked initial state (off-screen right, opacity 0)
// kept the banner invisible site-wide. The entrance below reproduces
// the designed slide-in on every page. The exit mirrors "Cookie Bye"
// and coexists with it if the interaction is still present.
//
// v2.2: honors prefers-reduced-motion — the banner appears in place
// (same 800ms delay, no slide) and dismissal hides it immediately.
// Queried per action, so an OS-level toggle applies without a reload.

(function () {
  var COOKIE_NAME = 'moorishcookie';
  var COOKIE_DAYS = 365;
  var ACCEPTED = 'accepted';
  var REFUSED = 'refused';
  var ENTRANCE_DELAY = 800; // ms before the slide-in starts
  var EXIT_HIDE_AFTER = 2600; // ms before display:none, lets the slide-out finish

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? match[1] : null;
  }

  function setCookie(name, value, days) {
    var maxAge = days * 24 * 60 * 60;
    var attrs = ';path=/;max-age=' + maxAge + ';SameSite=Lax';
    if (location.protocol === 'https:') attrs += ';Secure';
    document.cookie = name + '=' + value + attrs;
  }

  // Use the gtag defined by the head snippet; fall back to a local stub
  // so consent updates still reach the dataLayer if the snippet is absent.
  function gtagCall() {
    if (typeof window.gtag === 'function') {
      window.gtag.apply(null, arguments);
    } else {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(arguments);
    }
  }

  function updateConsent(granted) {
    var state = granted ? 'granted' : 'denied';
    gtagCall('consent', 'update', {
      ad_storage: state,
      analytics_storage: state,
      ad_user_data: state,
      ad_personalization: state
    });
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: granted ? 'mtcc-allow' : 'mtcc-deny' });
  }

  function banner() {
    return document.querySelector('[mtcc="banner"]');
  }

  function reducedMotion() {
    return window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function showBanner() {
    var el = banner();
    if (!el) return;
    if (reducedMotion()) {
      // Appear in place after the same delay — no slide, no fade.
      setTimeout(function () {
        el.style.transition = 'none';
        el.style.transform = 'translate3d(-15px, 0, 0)';
        el.style.opacity = '1';
        el.style.display = 'flex';
      }, ENTRANCE_DELAY);
      return;
    }
    // Start from the designed off-screen state. The legacy interaction
    // bakes the same state inline, but never rely on it being there.
    el.style.transition = 'none';
    el.style.transform = 'translate3d(100vw, 0, 0)';
    el.style.opacity = '0';
    el.style.display = 'flex';
    setTimeout(function () {
      el.style.transition = 'transform 0.9s ease-in-out, opacity 1s ease-in-out';
      el.style.transform = 'translate3d(-15px, 0, 0)';
      el.style.opacity = '1';
    }, ENTRANCE_DELAY);
  }

  function hideBanner() {
    var el = banner();
    if (el) el.style.display = 'none';
  }

  function dismissBanner() {
    var el = banner();
    if (!el) return;
    if (reducedMotion()) { hideBanner(); return; }
    el.style.transition = 'transform 0.9s ease-in-out, opacity 0.9s ease-in-out';
    el.style.transform = 'translate3d(100vw, 0, 0)';
    el.style.opacity = '0';
    setTimeout(hideBanner, EXIT_HIDE_AFTER);
  }

  function choose(value, granted) {
    setCookie(COOKIE_NAME, value, COOKIE_DAYS);
    updateConsent(granted);
    dismissBanner();
  }

  function init() {
    var consent = getCookie(COOKIE_NAME);

    if (consent === ACCEPTED || consent === REFUSED) {
      // Returning visitor: the head snippet already applied their state.
      hideBanner();
      return;
    }

    // First visit: defaults are denied (head snippet); show the banner.
    var allowBtn = document.querySelector('[mtcc="allow"]');
    var denyBtn = document.querySelector('[mtcc="deny"]');

    if (allowBtn) allowBtn.addEventListener('click', function (e) {
      e.preventDefault();
      choose(ACCEPTED, true);
    });
    if (denyBtn) denyBtn.addEventListener('click', function (e) {
      e.preventDefault();
      choose(REFUSED, false);
    });

    showBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
