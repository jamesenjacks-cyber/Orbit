/* 07 Floor (round 8, CONTRACT 8.3, research/10 section 6): the DOM of the whole floor act.
   The camera, the return to the reference view and the exit gate belong to js/stage-tour.js
   (window.OrbitStage.floor, F1). Once per animation frame while the act is near (no scroll listeners)
   this file reads the beat across the screen centre (arrive / explore / return / exit) and:
     - lets the view take drags in arrive + explore only (CSS on data-phase), focusable there
     - shows "Drag to look around" once, and how to drag again during the return beat
     - shows the words only while the whole floor is on screen (.is-shown, round 9)
     - + / - / Reset view glass buttons (explore beat), keys on the focused view
     - tells "Back to the whole floor." in the aria-live line when the stage says "returned". */
(function () {
  "use strict";
  var sec = document.querySelector(".sec--floor");
  if (!sec) return;

  var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  var mac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");
  var $ = function (s) { return sec.querySelector(s); };
  var hit = $(".floor__hit"), hint = $("[data-hint]"), ctl = $("[data-ctl]"), statusEl = $("[data-status]");
  var beats = Array.prototype.slice.call(sec.querySelectorAll(":scope > .beat[data-phase]"));

  var HINT_LOOK = coarse ? "Drag sideways to look around. Pinch to zoom." : "Drag to look around. " + (mac ? "Cmd" : "Ctrl") + " + scroll to zoom.";
  // round 9 (review C Floor 2): plain and correct (the old "Scroll up to explore" sounded like "go back")
  var HINT_BACK = "To drag the floor again, scroll up a little";
  var HINT_KEYS = "Arrow keys turn. Plus and minus zoom. Home goes back.";

  function F() { var S = window.OrbitStage; return S && S.floor && S.floor.view ? S.floor : null; }
  function call(fn, d) { try { var r = fn(); return r === undefined ? d : r; } catch (e) { return d; } }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  var sayT = 0;
  function say(t) { clearTimeout(sayT); statusEl.textContent = ""; sayT = setTimeout(function () { statusEl.textContent = t; }, 40); }

  var running = false, raf = 0, phase = null, isLive = false, isIn = false, hookedF = null, floorReady = false;
  var used = false, looked = false, hintT = 0, hintMode = null, wheelHinted = false;

  function showHint(text, ms, mode) {
    hint.textContent = text;
    hint.classList.add("is-on");
    hintMode = mode || "temp";
    clearTimeout(hintT);
    if (ms) hintT = setTimeout(function () { hint.classList.remove("is-on"); hintMode = null; }, ms);
  }
  function hideHint() { clearTimeout(hintT); hint.classList.remove("is-on"); hintMode = null; }
  var spin = $("[data-spin]"), spinText = $("[data-spin-text]");
  if (spinText && coarse) spinText.textContent = "Swipe to spin it around";
  function interacted() {
    used = true;
    if (spin) spin.classList.add("is-used");
    if (hintMode === "temp") { clearTimeout(hintT); hintT = setTimeout(hideHint, 2500); }
  }

  var wp = 0;   // how far through the beat across the screen centre (0..1)
  function where() {
    var c = innerHeight / 2;
    for (var i = 0; i < beats.length; i++) {
      var r = beats[i].getBoundingClientRect();
      if (c >= r.top && c < r.bottom) { wp = (c - r.top) / Math.max(1, r.height); return beats[i].getAttribute("data-phase"); }
    }
    wp = 0;
    return sec.getBoundingClientRect().top > c ? "before" : "after";
  }
  /* round 9 (review A4 + A6, rule 9.1): the words only while the whole floor is on screen: from the
     end of the arrive flight (the camera is there at about 75 % of it) through explore and return.
     Gone in the exit AND after it (they used to come back while the section scrolled away). */
  var shown = false;
  function setShown(on) { if (on !== shown) { shown = on; sec.classList.toggle("is-shown", on); } }
  function hook(f) {
    hookedF = f;
    if (typeof f.on !== "function") return;
    call(function () { f.on("ready", function () { floorReady = true; }); });
    call(function () { f.on("interact", interacted); });
    call(function () { f.on("returned", function () { say("Back to the whole floor."); }); });
  }
  function liveNow() {
    if (floorReady) return true;
    var S = window.OrbitStage, t = S && S.tour;
    var st = t && typeof t.state === "function" ? call(function () { return t.state(); }, null) : null;
    return !!(st && st.ready) || !!(F() && F().ready === true);
  }
  function setPhase(p) {
    var was = phase;
    phase = p;
    sec.setAttribute("data-phase", p);
    var canUse = p === "arrive" || p === "explore";
    hit.tabIndex = isLive && canUse ? 0 : -1;
    if (!canUse && document.activeElement && (document.activeElement === hit || ctl.contains(document.activeElement))) {
      // the view and its buttons go quiet in the return beat: keep keyboard focus on the heading
      var h = $("#floor-title");
      if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    }
    if (window.OrbitEngage && !canUse) OrbitEngage.release("floor");
    if (!isLive) return;
    if (p === "return") showHint(HINT_BACK, 0, "back");
    else if (hintMode === "back") hideHint();
    if (p === "explore" && !looked && !used) { looked = true; showHint(HINT_LOOK, 3600, "temp"); }
    if (p === "exit" || p === "after" || p === "before") hideHint();
    if (was === "return" && p === "explore") say("You can drag the floor again.");
  }

  function frame() {
    raf = running ? requestAnimationFrame(frame) : 0;
    var f = F();
    if (f && f !== hookedF) hook(f);
    var live = liveNow();
    if (live !== isLive) {
      isLive = live;
      sec.classList.toggle("is-live", live);
      phase = null;   // re-apply the phase with the view ready
    }
    var ar = sec.getBoundingClientRect(), H = innerHeight;
    var inNow = ar.top <= H * 0.4 && ar.bottom >= H * 0.6;
    if (inNow !== isIn) { isIn = inNow; sec.classList.toggle("is-in", inNow); }
    var p = where();
    if (p !== phase) setPhase(p);
    // (30 Oct, James) the words stay through the exit and scroll up with the model
    setShown(p === "explore" || p === "return" || p === "exit" || p === "after" || (p === "arrive" && wp >= 0.78));
  }
  function start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    hideHint();
    if (isIn) { isIn = false; sec.classList.remove("is-in"); }
    setShown(false);
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { if (en[0].isIntersecting) start(); else stop(); }, { rootMargin: "50% 0px 50% 0px" }).observe(sec);
  } else start();

  /* ---------- view: keys, Ctrl + wheel / pinch, buttons ---------- */
  function canUse() { return isLive && (phase === "arrive" || phase === "explore"); }
  function engage() { if (window.OrbitEngage) OrbitEngage.claim("scene", "floor", function () {}); }
  function zoomBy(k) {
    var f = F();
    if (!f || typeof f.view.zoom !== "function") return;
    var z = call(function () { return f.view.zoom(k); }, null);
    if (z && typeof z === "object") {
      ctl.querySelector('[data-view-act="in"]').disabled = !!z.max;
      ctl.querySelector('[data-view-act="out"]').disabled = !!z.min;
    }
  }
  hit.addEventListener("keydown", function (e) {
    var f = F();
    if (!canUse() || !f || e.ctrlKey || e.metaKey || e.altKey) return;
    var big = e.shiftKey ? 2 : 1, key = e.key, v = f.view;
    if (key === "ArrowLeft") call(function () { v.orbit(-12 * big, 0); });
    else if (key === "ArrowRight") call(function () { v.orbit(12 * big, 0); });
    else if (key === "ArrowUp") call(function () { v.orbit(0, 5 * big); });
    else if (key === "ArrowDown") call(function () { v.orbit(0, -5 * big); });
    else if (key === "+" || key === "=") zoomBy(1.15);
    else if (key === "-" || key === "_") zoomBy(1 / 1.15);
    else if (key === "Home" || key === "0") call(function () { v.reset(); });
    else return;
    e.preventDefault();
    engage(); interacted();
  });
  hit.addEventListener("focus", function () { if (canUse() && hit.matches(":focus-visible")) showHint(HINT_KEYS, 3000, "temp"); });
  hit.addEventListener("pointerdown", function () { if (canUse()) interacted(); }, { passive: true });
  hit.addEventListener("wheel", function (e) {
    if (!canUse()) return;
    if (!(e.ctrlKey || e.metaKey)) {
      // a plain wheel always scrolls the page (it is what starts the return to the reference view)
      if (!wheelHinted && phase === "explore" && hintMode !== "back") { wheelHinted = true; showHint(coarse ? "Pinch to zoom" : mac ? "Pinch or Cmd + scroll to zoom" : "Pinch or Ctrl + scroll to zoom", 2500, "temp"); }
      return;
    }
    e.preventDefault();
    zoomBy(clamp(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.06 : 0.0025)), 0.6, 1.6));
    interacted();
  }, { passive: false });
  var gScale = 1;
  hit.addEventListener("gesturestart", function (e) { if (!canUse()) return; e.preventDefault(); gScale = e.scale || 1; });
  hit.addEventListener("gesturechange", function (e) {
    if (!canUse()) return;
    e.preventDefault();
    var s = e.scale || 1;
    zoomBy(clamp(s / gScale, 0.6, 1.6));
    gScale = s;
  });
  ctl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-view-act]"), f = F();
    if (!b || !f) return;
    var a = b.getAttribute("data-view-act");
    if (a === "in") zoomBy(1.2);
    else if (a === "out") zoomBy(1 / 1.2);
    else if (a === "reset") {
      call(function () { f.view.reset(); });
      ctl.querySelectorAll("button").forEach(function (x) { x.disabled = false; });
      say("Back to the whole floor.");
    }
    interacted();
  });
})();
