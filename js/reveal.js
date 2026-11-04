/* (4 Nov 2026, James) Things appear as you scroll, on every page. Looks: css/motion.css part 5 (title / text /
   card). This only says WHEN: it adds .is-in once a part reaches the screen (once, it never hides again), then
   .rv-done after it landed. Parts above the screen (a reload half way down, a jump to #contact) show at once,
   so scrolling back up never finds empty space. One IntersectionObserver, no scroll listener (CONTRACT).
   Keep LIST the same as the selectors in css/motion.css. */
(function () {
  'use strict';
  var root = document.documentElement;
  window.OrbitReveal = true;                                     // the safety timer in src/sub.html checks this
  var LIST = '[data-reveal]:not(.sec--scan *)';
  if (root.classList.contains('rv')) LIST += ', .pg-title, .pg-h2, .ab-next__title, .lg-sec > h2, .pg-lede, ' +
    '.pg-head > .pg-text, .ab-by, .lg-date, .ab-next__text, .pg-end > .pg-text, .ticks > li, .lg-sec > :not(h2), ' +
    '.pg-act, .ab-mv__card, .ab-founder, .vd-drop, .site-foot__row';
  var items = Array.prototype.slice.call(document.querySelectorAll(LIST));
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function show(el) { el.classList.add('is-in'); }
  if (still || !('IntersectionObserver' in window)) { items.forEach(function (el) { show(el); el.classList.add('rv-done'); }); return; }

  // parts that share a parent follow each other (title, then text, then buttons); a page's own --i wins
  var count = new Map();
  items.forEach(function (el) {
    var p = el.parentElement, n = count.get(p) || 0;
    count.set(p, n + 1);
    if (!el.style.getPropertyValue('--i')) el.style.setProperty('--i', String(Math.min(n, 5)));
  });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      var above = en.boundingClientRect.bottom < 0;
      if (!en.isIntersecting && !above) return;
      if (above) { en.target.style.setProperty('--i', '0'); en.target.classList.add('rv-done'); }
      show(en.target);
      io.unobserve(en.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
  items.forEach(function (el) { io.observe(el); });

  // landed = hand the part's own transitions back (hover glows, drag-over light)
  document.addEventListener('transitionend', function (e) {
    var el = e.target;
    if (e.propertyName !== 'opacity' || !el.classList || !el.classList.contains('is-in') || el.classList.contains('rv-done')) return;
    if (items.indexOf(el) >= 0) el.classList.add('rv-done');
  });
})();
