/*!
 * MoorishQus v1.3 — Disqus comment counts, and click-to-load threads
 * Zero dependencies. Companion to the Posts V1/V2/V3 component family.
 *
 * v1.3: On a page that has a comment thread, Disqus stays unloaded until the
 * reader presses Show comments / Afficher les commentaires. That covers
 * embed.js, count.js, and any later insert of those two scripts. The button
 * is a real <button>, in normal flow, and focus moves to the thread once
 * embed.js has loaded. The section's height is held so the button's removal
 * does not collapse the slot. Existing disqus_config is left untouched.
 * Listing pages (no thread) still derive card counts and load count.js.
 *
 * v1.2: Posts V1 cards are no longer anchors (de-anchored 2026-07-22 — the link
 * lives on the inner .post-info-link plate). The card's URL is now derived from
 * the first inner anchor when the root carries no href of its own.
 *
 * Why: Webflow components cannot host CMS-bound embeds (five separate platform
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
 * count.js if the page lacks it. On a thread page that request waits for the
 * button. Inert on pages without matching cards; no-JS degrades to no counts.
 */
(function () {
  "use strict";

  var EMBED_JS = "https://moorishtimes.disqus.com/embed.js";
  var COUNT_JS = "https://moorishtimes.disqus.com/count.js";
  var LABELS = { en: "Show comments", fr: "Afficher les commentaires" };
  var DISQUS_SRC = /disqus\.com\/(?:embed|count)\.js/i;
  var optedIn = false;
  var blockCounts = false;
  var guardOn = false;

  function pageLang() {
    return (document.documentElement.lang || "fr").slice(0, 2) === "en" ? "en" : "fr";
  }

  function isDisqusLoader(node) {
    if (!node || node === document.currentScript) return false;
    if (String(node.tagName).toUpperCase() !== "SCRIPT") return false;
    var src = node.getAttribute("src") || "";
    if (DISQUS_SRC.test(src)) return true;
    if (src) return false;
    var code = node.textContent || "";
    if (code.indexOf("MoorishQus") !== -1) return false;
    return DISQUS_SRC.test(code);
  }

  function installGuard() {
    if (guardOn || !window.Element || !window.Element.prototype) return;
    guardOn = true;
    var proto = window.Element.prototype;
    var append = proto.appendChild;
    var insert = proto.insertBefore;
    // embed.js is refused until the reader opts in. count.js is refused only on
    // a thread page (blockCounts), so listing pages can still load card counts.
    function blocked(node) {
      if (optedIn || !isDisqusLoader(node)) return false;
      var src = node.getAttribute("src") || "";
      if (/count\.js/i.test(src)) return blockCounts;
      if (!src && /count\.js/i.test(node.textContent || "") && !/embed\.js/i.test(node.textContent || "")) {
        return blockCounts;
      }
      return true;
    }
    proto.appendChild = function (node) {
      if (blocked(node)) return node;
      return append.call(this, node);
    };
    if (typeof insert === "function") {
      proto.insertBefore = function (node, ref) {
        if (blocked(node)) return node;
        return insert.call(this, node, ref);
      };
    }
  }

  function quiesce() {
    if (optedIn) return;
    var list = document.querySelectorAll("script");
    for (var i = list.length - 1; i >= 0; i--) {
      var script = list[i];
      if (isDisqusLoader(script) && script.parentNode) script.parentNode.removeChild(script);
    }
  }

  function requestCounts() {
    if (!document.querySelector(".disqus-comment-count")) return;
    if (window.DISQUSWIDGETS && typeof window.DISQUSWIDGETS.getCount === "function") {
      window.DISQUSWIDGETS.getCount({ reset: true });
    } else if (!document.querySelector('script[src*="disqus.com/count.js"]')) {
      var s = document.createElement("script");
      s.src = COUNT_JS;
      s.async = true;
      document.body.appendChild(s);
    }
  }

  function mountGate() {
    var thread = document.getElementById("disqus_thread");
    var section = document.querySelector(".comment-section");
    if (!thread && section) {
      thread = document.createElement("div");
      thread.id = "disqus_thread";
      thread.className = "disqus_thread";
      section.appendChild(thread);
    }
    if (!thread) return false;
    var root = section || thread.parentNode;
    if (!root) return false;

    if (!optedIn) {
      blockCounts = true;
      installGuard();
      quiesce();
    }
    if (optedIn || root.querySelector(".mt-disqus-show")) return true;

    var dupes = document.querySelectorAll("[id='disqus_thread']");
    for (var i = 0; i < dupes.length; i++) {
      if (dupes[i] !== thread) dupes[i].removeAttribute("id");
    }
    while (thread.firstChild) thread.removeChild(thread.firstChild);
    thread.setAttribute("tabindex", "-1");

    var button = document.createElement("button");
    button.type = "button";
    button.className = "button mt-disqus-show";
    button.textContent = LABELS[pageLang()];
    button.setAttribute("aria-controls", "disqus_thread");
    root.insertBefore(button, thread);

    button.addEventListener("click", function () {
      if (optedIn) return;
      optedIn = true;
      var hold = root.offsetHeight;
      if (hold > 0) root.style.minHeight = hold + "px";
      button.disabled = true;
      button.setAttribute("aria-busy", "true");

      var s = document.createElement("script");
      s.src = EMBED_JS;
      s.async = true;
      s.setAttribute("data-timestamp", String(+new Date()));
      s.onload = function () {
        button.hidden = true;
        thread.focus();
      };
      s.onerror = function () {
        optedIn = false;
        button.disabled = false;
        button.removeAttribute("aria-busy");
      };
      (document.head || document.body).appendChild(s);
      requestCounts();
    });
    return true;
  }

  function init() {
    var gated = mountGate();
    var cards = document.querySelectorAll(".post-v1, a.post-v2, a.post-v3");
    var added = 0;

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.querySelector(".disqus-comment-count")) continue;

      var read = card.querySelector(".post-read");
      if (!read) continue;

      var path = card.getAttribute("href") || "";
      if (!path) {
        var inner = card.querySelector("a[href]");
        path = inner ? inner.getAttribute("href") || "" : "";
      }
      if (path.indexOf("/en/") === 0) path = path.slice(3);
      if (!/^\/articles\//.test(path)) continue;

      var wrap = document.createElement("div");
      wrap.className = "comments-text w-embed";
      var count = document.createElement("text");
      count.className = "disqus-comment-count";
      count.setAttribute("data-disqus-url", "https://moorishtimes.com" + path);
      wrap.appendChild(count);
      read.insertBefore(wrap, read.querySelector(".underline"));
      added++;
    }

    if (gated && !optedIn) return;
    if (!added && !document.querySelector(".disqus-comment-count")) return;
    requestCounts();
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

  // Arm before DOMContentLoaded so a copy loaded in the head can refuse the
  // inline embed.js insert while the rest of the page is still parsing.
  installGuard();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
