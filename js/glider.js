/* (4 Nov 2026, James) Sliding switches: the white "pill" behind the chosen option glides to the other
   option instead of jumping (idea from Uiverse "tabs" by Pradeepsaranbishnoi). One script for every
   two-way switch on the site: EN | NL, hero and design stop "Real scan | 3D Model", compare
   "360 photo | 3D scan". The buttons stay exactly as they were (aria-pressed is still the truth, set by
   the section scripts); this only adds one decorative <span class="glider"> per switch and moves it to
   the pressed button. Looks: css/motion.css. Reduced motion: it jumps (no slide). */
(function () {
  'use strict';
  var GROUPS = '.language-switch, .hero__modes, .compare__chaps, .design__modes';
  var groups = [];

  function place(g, animate) {
    var on = g.el.querySelector('button[aria-pressed="true"]');
    if (!on || !g.el.offsetWidth) return;              // hidden switch: placed once it shows (ResizeObserver)
    if (!g.el.classList.contains('is-gliding')) animate = false;   // first time it can be measured: just appear
    // sub-pixel exact (offsetLeft rounds): the button's box inside the switch's padding box
    var a = g.el.getBoundingClientRect(), b = on.getBoundingClientRect();
    var sx = a.width / g.el.offsetWidth || 1;            // a switch that is scaled (transform) still lines up
    var x = (b.left - a.left) / sx - g.el.clientLeft, y = (b.top - a.top) / sx - g.el.clientTop;
    var w = b.width / sx, h = b.height / sx;
    if (!animate) g.el.classList.remove('is-gliding');
    g.glider.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    g.glider.style.width = w + 'px';
    g.glider.style.height = h + 'px';
    g.el.setAttribute('data-glide-on', on.getAttribute('data-language') || on.getAttribute('data-hero-mode') ||
      on.getAttribute('data-design-mode') || on.getAttribute('data-mode') || '');
    if (!animate) { void g.glider.offsetWidth; requestAnimationFrame(function () { g.el.classList.add('is-gliding'); }); }
  }

  function setup(el) {
    if (el.querySelector(':scope > .glider')) return;
    var glider = document.createElement('span');
    glider.className = 'glider';
    glider.setAttribute('aria-hidden', 'true');
    el.insertBefore(glider, el.firstChild);
    el.classList.add('has-glider');
    // the glider is measured from this box (keep any position the switch already has)
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    var g = { el: el, glider: glider };
    groups.push(g);
    place(g, false);
    // aria-pressed changes (any script) = slide
    new MutationObserver(function () { place(g, true); })
      .observe(el, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
    // size changes (Dutch words are longer, a hidden switch shows, the window turns) = follow without sliding
    if ('ResizeObserver' in window) {
      var last = '';
      new ResizeObserver(function () {
        var on = el.querySelector('button[aria-pressed="true"]');
        var key = on ? on.offsetLeft + ',' + on.offsetWidth + ',' + on.offsetHeight : '';
        if (key !== last) { last = key; place(g, glider.style.width !== ''); }
      }).observe(el);
    }
  }

  function init() { document.querySelectorAll(GROUPS).forEach(setup); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  // after a language swap the words change width: re-measure once the new words are in
  document.addEventListener('orbit:language', function () {
    requestAnimationFrame(function () { groups.forEach(function (g) { place(g, true); }); });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { groups.forEach(function (g) { place(g, false); }); });
})();
