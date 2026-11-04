/* 10 Contact: magnetic "Book a scan". With a mouse, the button leans a few
   pixels towards the pointer while it is near (transform only), so the one
   call to action feels alive. Off for touch and under reduced motion. */
(function () {
  "use strict";
  var btn = document.querySelector(".sec--contact [data-magnet]");
  if (!btn) return;
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var area = btn.parentElement;   // the row with the button and the email link
  var MAX = 8, raf = 0, tx = 0, ty = 0;

  function apply() {
    raf = 0;
    btn.style.setProperty("--mx", tx.toFixed(1) + "px");
    btn.style.setProperty("--my", ty.toFixed(1) + "px");
  }
  area.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    var r = btn.getBoundingClientRect();
    var dx = e.clientX - (r.left + r.width / 2);
    var dy = e.clientY - (r.top + r.height / 2);
    var reach = Math.max(r.width, 120);
    var k = Math.max(0, 1 - Math.hypot(dx, dy) / reach);
    tx = Math.max(-MAX, Math.min(MAX, dx * 0.25 * k));
    ty = Math.max(-MAX, Math.min(MAX, dy * 0.35 * k));
    if (!raf) raf = requestAnimationFrame(apply);
  });
  area.addEventListener("pointerleave", function () {
    tx = 0; ty = 0;
    if (!raf) raf = requestAnimationFrame(apply);
  });
})();
