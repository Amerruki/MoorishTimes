/*!
 * MoorishQus v1.2 — Disqus comment counts for component-rendered cards on moorishtimes.com
 * Zero dependencies. Companion to the Posts V1/V2/V3 component family.
 *
 * v1.2: Posts V1 cards are no longer anchors (de-anchored 2026-07-22 — the link
 * lives on the inner .post-info-link plate). The card's URL is now derived from
 * the first inner anchor when the root carries no href of its own.
 *
 * Why: Site components cannot host CMS-bound embeds (five separate platform
 * walls, proven 2026-07-18), so componentized article cards lose the per-card
 * <text class="disqus-comment-count" data-disqus-url="..."> embed the raw cards
 * carried. But Disqus counts are client-side anyway: count.js scans the DOM for
 * .disqus-comment-count elements. Each card already knows its article URL — its
 * own href — so the embed can be derived instead of bound.
 *
 * Behavior: for every article card (a.post-v1 / .post-v2 / .post-v3) that has a
 * .post-read row and no count element yet, injects the count element with
 * data-disqus-url built from the card's href — normalized to the FR canonical
 * (https://moorishtimes.com/articles/<slug>), preserving the site's historical
 * unified-count behavior across locales. Then asks Disqus to (re)count: via
 * DISQUSWIDGETS.getCount({reset}) when count.js is already live, or by loading
 * count.js if the page lacks it. Inert on pages without matching cards; no-JS
 * degrades to no counts — identical to Disqus native behavior. No motion, no
 * layout shift beyond the count text appearing (same as the raw embeds).
 */
(function () {
  "use strict";

  var COUNT_JS = "https://moorishtimes.disqus.com/count.js";

  function init() {
    var cards = document.querySelectorAll(".post-v1, a.post-v2, a.post-v3");
    var added = 0;

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.querySelector(".disqus-comment-count")) continue; // raw cards keep their embed

      var read = card.querySelector(".post-read");
      if (!read) continue;

      var path = card.getAttribute("href") || "";
      if (!path) {
        // De-anchored V1 cards: the URL lives on the inner info-plate link.
        var inner = card.querySelector("a[href]");
        path = inner ? inner.getAttribute("href") || "" : "";
      }
      if (path.indexOf("/en/") === 0) path = path.slice(3); // unify locales on the FR canonical
      if (!/^\/articles\//.test(path)) continue; // articles only — news briefs carry no counts

      var wrap = document.createElement("div");
      wrap.className = "comments-text w-embed";
      var count = document.createElement("text");
      count.className = "disqus-comment-count";
      count.setAttribute("data-disqus-url", "https://moorishtimes.com" + path);
      wrap.appendChild(count);
      read.insertBefore(wrap, read.querySelector(".underline"));
      added++;
    }

    if (!added) return;

    if (window.DISQUSWIDGETS && typeof window.DISQUSWIDGETS.getCount === "function") {
      window.DISQUSWIDGETS.getCount({ reset: true });
    } else if (!document.querySelector('script[src*="disqus.com/count.js"]')) {
      var s = document.createElement("script");
      s.src = COUNT_JS;
      s.async = true;
      document.body.appendChild(s);
    }
    // else: count.js is queued on this page and will scan our elements when it runs.
  }

  function start() {
    init();
    // MoorishPaginate replaces the #seamless-replace NODE itself on swap, so an
    // observer on that node dies with it (v1 bug). Watch a stable ancestor
    // instead; init is idempotent and cheap, debounced to coalesce the swap.
    if (window.MutationObserver) {
      var pending = null;
      new MutationObserver(function () {
        if (pending) clearTimeout(pending);
        pending = setTimeout(init, 150);
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
