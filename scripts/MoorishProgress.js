/* MoorishProgress v1.0: true reading-progress bar for article & news pages.
 *
 * Replaces the IX2 "Scroll Progress" animation (a-40). That animation
 * remapped the .page-content viewport-traversal through static 20/80
 * offsets — a constant that cannot equal reading-position/article-length
 * for every article (measured live: bar at 55% when a short article ends;
 * bar full with ~1,900px still unread on a long one). True progress needs
 * article-relative math, which IX2 cannot express.
 *
 * Progress = (viewport bottom - article top) / article span, where the
 * span runs from the first to the last visible .post-text section
 * (references included). Done = the end of the piece enters the viewport.
 *
 * Anatomy contract: figure.progress-bar — fixed top strip, width:100%,
 * transform-origin:0% (all from the Designer class). This script owns its
 * transform (scaleX) and opacity; the Designer IX2 events on .page-content
 * and .page-content-2 must be deleted or they fight these same properties.
 *
 * Zero-dep ES5 IIFE. Inert when the page carries no .progress-bar.
 * Sections hidden by MoorishGallery's empty-section removal are skipped
 * (offsetParent check); geometry is re-read every frame, so lazy images
 * and gallery builds never stale the measurement.
 */
(function () {
  var bar = document.querySelector('.progress-bar');
  if (!bar) return;

  bar.style.transform = 'scaleX(0)';
  bar.style.opacity = '0';
  bar.style.transition = 'opacity .3s ease';

  var ticking = false;

  function frame() {
    ticking = false;
    var sections = document.querySelectorAll('.post-text');
    var first = null, last = null, i, el;
    for (i = 0; i < sections.length; i++) {
      el = sections[i];
      if (el.offsetParent === null) continue;
      if (!first) first = el;
      last = el;
    }
    if (!first) { bar.style.opacity = '0'; return; }

    var top = first.getBoundingClientRect().top;
    var end = last.getBoundingClientRect().bottom;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var span = end - top;
    if (span <= 0) { bar.style.opacity = '0'; return; }

    var p = (vh - top) / span;
    if (p < 0) p = 0;
    if (p > 1) p = 1;

    bar.style.transform = 'scaleX(' + p + ')';
    /* Visible mid-read; hidden before the article starts and once done —
       mirrors the old animation's fade-out at completion. */
    bar.style.opacity = (p > 0.005 && p < 0.999) ? '1' : '0';
  }

  function requestTick() {
    if (ticking) return;
    ticking = true;
    /* rAF is suspended in hidden/background tabs; a queued-but-never-run
       frame would latch `ticking` and swallow scroll events until the tab
       is shown. Route through setTimeout whenever the page is hidden. */
    if (window.requestAnimationFrame && !document.hidden) window.requestAnimationFrame(frame);
    else window.setTimeout(frame, 33);
  }

  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', requestTick);
  window.addEventListener('load', requestTick);
  requestTick();
})();
