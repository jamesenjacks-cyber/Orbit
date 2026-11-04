/* (4 Nov 2026, James: "animate all the buttons") The tap ring: when a finger or mouse presses a button,
   an orange ring grows out of it and fades (css/motion.css .is-tapped / orbit-tap). Phones have no hover,
   so this (with the press squeeze) is what tells a visitor "got it". Decoration only: it never stops or
   changes a click. Off with reduced motion. */
(function () {
  'use strict';
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var SEL = '.btn, .nav__chip, .nav__menu, .language-switch button, .hero__modes button, .hero__tools button, ' +
    '.compare__chap, .compare__play, .design__modes button, .design__tool, .design__vbtn, .design__padbtn, ' +
    '.design__opt, .design__pick, .design__swatch, .scan__btn, .walk__btn, .floor__btn, .examples__close, ' +
    '.vd-exit, .book__chip';
  document.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return;                                    // left mouse button or touch only
    var b = e.target && e.target.closest && e.target.closest(SEL);
    if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return;
    b.classList.remove('is-tapped');
    void b.offsetWidth;                                          // restart the ring on quick double taps
    b.classList.add('is-tapped');
  }, { passive: true, capture: true });
  document.addEventListener('animationend', function (e) {
    if (e.animationName === 'orbit-tap' && e.target.classList) e.target.classList.remove('is-tapped');
  }, true);
})();
