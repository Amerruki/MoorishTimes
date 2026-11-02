/*!
 * MoorishGallery v2.1 — CMS photo galleries as grid + lightbox.
 * One script, replaces both the 2021 slider-init paste and mt-gallery.js.
 *
 * v2.1: galleries anchor on the CMS wrapper when the slider element is absent
 * — the 7 template slider components are now deletable in the Designer (the
 * wrappers stay: they are the data). Layout niceties live in mt-gallery.css
 * (orphan-tile spans, editorial-gutter alignment).
 *
 * Why v2: v1 populated the CMS slider DOM and a stylesheet dressed it as a
 * grid — but the platform slider engine (autoplay fade, 4s) kept writing inline
 * transform/visibility on the same nodes, flying tiles off-screen and leaving
 * the mask's height as an empty gap. Rig tape: translateX(-7063px) +
 * visibility:hidden on every slide, every tick.
 *
 * v2 never fights the engine: for each #MultiImageCollectionWrapperN it reads
 * the CMS items' background-image URLs, builds its own .mt-gallery grid of
 * lazy <img> tiles in the slider's place, then REMOVES the slider and wrapper
 * nodes entirely — the slider engine finds nothing to bind. All images show
 * (no more slide-count cap). Empty galleries and empty rich-text sections
 * self-remove. Click a tile for the lightbox (Esc / arrows / swipe).
 *
 * Runs IMMEDIATELY at parse time (the script sits at end of body, below the
 * content): the slider nodes are gone before the platform's DOM-ready slider init
 * queries ".w-slider", so the engine never binds and no autoplay timer ever
 * starts. Falls back to DOMContentLoaded only if it finds nothing mid-parse
 * (e.g. someone moves the tag into the head). No dependencies.
 */
(function () {
  'use strict';

  var MAX_GALLERIES = 20;

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, attrs[k]);
      }
    }
    return node;
  }

  // Quoted url("…") first — filenames may contain ')' (e.g. "(1887-1981).jpg"),
  // so a naive [^)]+ match truncates. Unquoted url(…) as fallback.
  function extractUrl(style) {
    var m = style.match(/url\((['"])([\s\S]*?)\1\)/);
    if (!m) m = style.match(/url\(([^)]*)\)/);
    var url = m ? (m[2] !== undefined ? m[2] : m[1]).trim() : '';
    return url && url !== 'none' ? url : null;
  }

  function imageUrls(wrapper) {
    var urls = [];
    var items = wrapper.querySelectorAll('.w-dyn-item');
    for (var i = 0; i < items.length; i++) {
      var url = extractUrl(items[i].getAttribute('style') || '');
      if (url) urls.push(url);
    }
    return urls;
  }

  function buildGallery(urls, n) {
    var g = el('div', 'mt-gallery', {
      'data-count': urls.length,
      role: 'group',
      'aria-label': 'Galerie photo ' + n
    });
    for (var i = 0; i < urls.length; i++) {
      var fig = el('figure', 'mt-gallery__item');
      var btn = el('button', 'mt-gallery__zoom', {
        type: 'button',
        'data-index': i,
        'aria-label': 'Agrandir l’image ' + (i + 1) + ' sur ' + urls.length
      });
      var img = el('img', null, { alt: '', loading: 'lazy', decoding: 'async' });
      img.src = urls[i];
      btn.appendChild(img);
      fig.appendChild(btn);
      g.appendChild(fig);
    }
    return g;
  }

  function initGalleries() {
    var built = [];
    built.found = 0;
    for (var n = 1; n <= MAX_GALLERIES; n++) {
      var slider = document.getElementById('MultiImageSlider' + n);
      var wrapper = document.getElementById('MultiImageCollectionWrapper' + n);
      if (!slider && !wrapper) continue;
      built.found++;

      var conditionHidden =
        (slider && slider.className.indexOf('w-condition-invisible') !== -1) ||
        (!slider && wrapper && wrapper.className.indexOf('w-condition-invisible') !== -1);
      var urls = wrapper ? imageUrls(wrapper) : [];
      var anchor = slider || wrapper;

      if (anchor && urls.length && !conditionHidden) {
        var gallery = buildGallery(urls, n);
        anchor.parentNode.insertBefore(gallery, anchor);
        built.push({ gallery: gallery, urls: urls });
      }
      // Either way the platform slider machinery leaves the page.
      if (slider) slider.parentNode.removeChild(slider);
      if (wrapper) wrapper.parentNode.removeChild(wrapper);
    }
    return built;
  }

  // ── Empty rich-text sections self-remove (unchanged from mt-gallery) ──
  function hideEmptySections() {
    var richTexts = document.querySelectorAll('.w-richtext');
    for (var i = 0; i < richTexts.length; i++) {
      var rt = richTexts[i];
      var parent = rt.closest('[class*="post-text"]') || rt;
      if (parent.classList.contains('references')) continue;
      if (rt.textContent.trim() || rt.querySelector('img') || rt.querySelector('figure')) continue;
      parent.style.display = 'none';
      var prev = parent.previousElementSibling;
      if (prev && (prev.classList.contains('divider') || prev.classList.contains('section-divider'))) {
        prev.style.display = 'none';
      }
    }
  }

  // ── Lightbox ──
  var lightbox, lightboxImg, lightboxCounter, currentImages = [], currentIndex = 0;

  function createLightbox() {
    lightbox = el('div', 'mt-lightbox', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Galerie d’images'
    });

    var close = el('button', 'mt-lightbox__close', { type: 'button', 'aria-label': 'Fermer' });
    close.textContent = '×';
    var prev = el('button', 'mt-lightbox__nav mt-lightbox__prev', { type: 'button', 'aria-label': 'Image précédente' });
    prev.textContent = '‹';
    lightboxImg = el('img', 'mt-lightbox__img', { alt: '' });
    var next = el('button', 'mt-lightbox__nav mt-lightbox__next', { type: 'button', 'aria-label': 'Image suivante' });
    next.textContent = '›';
    lightboxCounter = el('div', 'mt-lightbox__counter');

    lightbox.appendChild(close);
    lightbox.appendChild(prev);
    lightbox.appendChild(lightboxImg);
    lightbox.appendChild(next);
    lightbox.appendChild(lightboxCounter);
    document.body.appendChild(lightbox);

    close.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });
    prev.addEventListener('click', function (e) { e.stopPropagation(); navigate(-1); });
    next.addEventListener('click', function (e) { e.stopPropagation(); navigate(1); });
    document.addEventListener('keydown', function (e) {
      if (!lightbox.classList.contains('active')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    });
    var touchStartX = 0;
    lightbox.addEventListener('touchstart', function (e) {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    lightbox.addEventListener('touchend', function (e) {
      var diff = touchStartX - e.changedTouches[0].screenX;
      if (Math.abs(diff) > 50) navigate(diff > 0 ? 1 : -1);
    }, { passive: true });
  }

  function openLightbox(images, index) {
    currentImages = images;
    currentIndex = index;
    lightbox.setAttribute('data-count', images.length);
    showImage();
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }

  function navigate(dir) {
    currentIndex = (currentIndex + dir + currentImages.length) % currentImages.length;
    showImage();
  }

  function showImage() {
    lightboxImg.src = currentImages[currentIndex];
    lightboxImg.alt = 'Image ' + (currentIndex + 1) + ' sur ' + currentImages.length;
    lightboxCounter.textContent = (currentIndex + 1) + ' / ' + currentImages.length;
  }

  function attachHandlers(built) {
    for (var i = 0; i < built.length; i++) {
      (function (entry) {
        entry.gallery.addEventListener('click', function (e) {
          var btn = e.target.closest && e.target.closest('.mt-gallery__zoom');
          if (!btn || !entry.gallery.contains(btn)) return;
          openLightbox(entry.urls, parseInt(btn.getAttribute('data-index'), 10) || 0);
        });
      })(built[i]);
    }
  }

  function run() {
    var built = initGalleries();
    if (!built.found && document.readyState === 'loading') {
      // Tag was placed above the content — retry once the DOM is parsed.
      document.addEventListener('DOMContentLoaded', run, { once: true });
      return;
    }
    hideEmptySections();
    if (built.length) {
      createLightbox();
      attachHandlers(built);
    }
  }

  run();
})();
