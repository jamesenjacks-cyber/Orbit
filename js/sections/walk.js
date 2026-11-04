/* Walk act (#walk, round 8, step 4, research/10 section 3). One IntersectionObserver reads which
   beat crosses the screen centre (approach > patio) and writes data-phase. The stage (OrbitStage.walk,
   builder E) tells us two things:
     "explore"  the visitor grabbed the scene: the words fade out (data-explore on the section; opacity
                only, no layout shift; the words stay in the page for screen readers)
     "resume"   they scrolled: the words fade back
   There is no exit button. The words never take the pointer (CSS), so the grab always works.
   Non-drag alternative: while the scene has focus, or after the first look on touch, two small
   buttons "Turn left" / "Turn right" send the arrow keys to the scene (the stage listens for keys
   on .stage-hit[data-hit="walk"]). One hint chip per load: "Drag to look around", then
   "Scroll to continue" for 2.5 s after the first look. */
(function () {
  "use strict";
  var sec = document.querySelector(".sec--walk");
  if (!sec) return;

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = matchMedia("(pointer: coarse)").matches;
  var hit = sec.querySelector("[data-hit='walk']");
  var chip = sec.querySelector("[data-walk-chip]");
  var turn = sec.querySelector("[data-walk-turn]");
  var statusEl = sec.querySelector("[data-walk-status]");

  var phase = sec.getAttribute("data-phase") || "approach";
  var inView = false, W = null, exploring = false, chipDone = false, firstLook = false, chipT = 0, focused = false;

  function walk() { var S = window.OrbitStage; return S && S.walk ? S.walk : null; }
  function say(t) { if (statusEl) { statusEl.textContent = ""; setTimeout(function () { statusEl.textContent = t; }, 30); } }

  // ---------- chip + turn buttons ----------
  function showChip(text, ms) {
    if (!chip) return;
    clearTimeout(chipT);
    chip.textContent = text;
    chip.hidden = false;
    if (ms) chipT = setTimeout(function () { chip.hidden = true; }, ms);
  }
  function syncTurn() {
    if (!turn) return;
    var on = inView && phase === "patio" && (focused || (coarse && firstLook) || exploring);
    turn.hidden = !on;
  }
  function syncChip() {
    if (!chip) return;
    if (!inView || phase !== "patio") { clearTimeout(chipT); chip.hidden = true; return; }
    if (!chipDone && !exploring) { showChip(coarse ? "Drag to look around" : "Drag to look around", 0); }
  }

  // ---------- tab stop only while the scene is really there ----------
  function syncFocus() {
    if (!hit) return;
    var on = inView && (phase === "patio" || phase === "approach");
    hit.tabIndex = on ? 0 : -1;
  }

  // ---------- explore / resume ----------
  function setExplore(on) {
    if (on === exploring) return;
    exploring = on;
    if (on) {
      sec.setAttribute("data-explore", "");
      firstLook = true;
      chipDone = true;
      showChip("Scroll to continue", 2500);
      say("Looking around. Scroll to continue.");
    } else {
      sec.removeAttribute("data-explore");
      if (chip) { clearTimeout(chipT); chip.hidden = true; }
      say("Back to the story.");
    }
    syncTurn();
  }
  function hook() {
    var w = walk();
    if (W || !w || typeof w.on !== "function") return;
    W = w;
    w.on("explore", function () { setExplore(true); });
    w.on("resume", function () { setExplore(false); });
    try { if (typeof w.exploring === "function" && w.exploring()) setExplore(true); } catch (e) {}
  }
  hook();
  document.addEventListener("orbit:stage-ready", hook);
  window.addEventListener("load", hook);

  // ---------- phases and visibility ----------
  function setPhase(p) {
    if (!p || p === phase) return;
    phase = p;
    sec.setAttribute("data-phase", p);
    syncChip(); syncTurn(); syncFocus();
  }
  var marks = Array.prototype.slice.call(sec.querySelectorAll(":scope > [data-phase]"));
  var hitNow = marks.map(function () { return false; });
  if ("IntersectionObserver" in window && marks.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { hitNow[marks.indexOf(e.target)] = e.isIntersecting; });
      for (var i = marks.length - 1; i >= 0; i--) if (hitNow[i]) { setPhase(marks[i].getAttribute("data-phase")); return; }
      var e0 = entries[entries.length - 1];
      var past = e0.boundingClientRect.top < (e0.rootBounds ? e0.rootBounds.top : innerHeight / 2);
      setPhase(marks[past ? marks.length - 1 : 0].getAttribute("data-phase"));
    }, { rootMargin: "-49% 0px -49% 0px", threshold: 0 });
    marks.forEach(function (m) { io.observe(m); });
  }
  var pin = sec.querySelector(".walk__pin");
  if (pin && "IntersectionObserver" in window) {
    new IntersectionObserver(function (en) {
      var v = en[0].intersectionRatio > 0.3;
      if (v === inView) return;
      inView = v;
      sec.classList.toggle("is-seen", v || en[0].isIntersecting);
      syncChip(); syncTurn(); syncFocus();
      if (!v) { if (exploring) setExplore(false); setTimeout(focusAway, 0); }
    }, { threshold: [0, 0.1, 0.3, 0.6] }).observe(pin);
  } else { inView = true; sec.classList.add("is-seen"); syncFocus(); }
  // the words show up as soon as the pin is on screen at all
  if (pin && "IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { sec.classList.toggle("is-seen", en[0].isIntersecting); }, { threshold: 0 }).observe(pin);
  }
  function focusAway() {
    var a = document.activeElement;
    if (!a || a === document.body || !sec.contains(a)) return;
    if (inView) return;
    var h = sec.querySelector("#walk-title");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  }

  /* ---------- Round 9: the stop captions, one loop per animation frame while the act is near ----------
     The stage says which garden stop the camera is at and how settled it is (OrbitStage.walk.state():
     stop, cap 0..1, fade 0..1 = the scene going dark before the next section). data-stop picks the
     caption, --walk-cap fades it. No stage: no captions (the words still say it). */
  var near = false, raf = 0, lastStop = null, lastCap = -1, lastWords = -1;
  function tick() {
    raf = 0;
    if (!near) return;
    var w = walk(), st = null;
    try { st = w && typeof w.state === "function" ? w.state() : null; } catch (e) { st = null; }
    var cap = 0, stop = lastStop;
    if (st && st.live) { stop = String(st.stop); cap = Math.max(0, Math.min(1, st.cap * st.fade)); }
    // fix round: the words come in only once the garden is there (after the light of the dive); while the
    // cards of #scan still own the stage (the section scrolling in) they wait too. No stage: always shown.
    var S = window.OrbitStage, tw = null;
    try { tw = S && S.two && typeof S.two.state === "function" ? S.two.state() : null; } catch (e) { tw = null; }
    var wv = st && st.live ? (typeof st.words === "number" ? st.words : 1) : (tw && tw.live ? 0 : 1);
    wv = Math.round(wv * 1000) / 1000;
    if (wv !== lastWords) { lastWords = wv; sec.style.setProperty("--walk-words", String(wv)); }
    // the scene is going dark (end of the act): the hint and the turn buttons go with it
    var ending = !!(st && st.live && st.fade < 0.7);
    if (ending !== sec.classList.contains("is-ending")) sec.classList.toggle("is-ending", ending);
    if (stop !== lastStop && stop !== null) { lastStop = stop; sec.setAttribute("data-stop", stop); }
    cap = Math.round(cap * 1000) / 1000;
    if (cap !== lastCap) { lastCap = cap; sec.style.setProperty("--walk-cap", String(cap)); }
    raf = requestAnimationFrame(tick);
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) {
      near = en[0].isIntersecting;
      if (near && !raf) raf = requestAnimationFrame(tick);
    }, { rootMargin: "30% 0px 30% 0px", threshold: 0 }).observe(sec);
  }

  // ---------- keyboard and the turn buttons ----------
  if (hit) {
    hit.addEventListener("focus", function () { focused = true; syncTurn(); if (!chipDone) showChip("Arrow keys look around. Scroll to continue.", 3000); });
    hit.addEventListener("blur", function () { setTimeout(function () { focused = sec.contains(document.activeElement) && document.activeElement !== document.body; syncTurn(); }, 0); });
    hit.addEventListener("pointerdown", function () { if (!firstLook && coarse) { firstLook = true; syncTurn(); } });
  }
  if (turn) {
    turn.addEventListener("focusin", function () { focused = true; syncTurn(); });
    turn.addEventListener("focusout", function () { setTimeout(function () { focused = sec.contains(document.activeElement) && document.activeElement !== document.body; syncTurn(); }, 0); });
    turn.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button") : null;
      if (!b || !hit) return;
      var key = b.getAttribute("data-turn") === "left" ? "ArrowLeft" : "ArrowRight";
      // the same keys the scene itself listens for (js/stage-aerial.js, on the focused view)
      hit.dispatchEvent(new KeyboardEvent("keydown", { key: key, bubbles: true, cancelable: true }));
      say(key === "ArrowLeft" ? "Turned left." : "Turned right.");
    });
  }
  void reduce;
})();