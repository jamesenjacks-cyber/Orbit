/* Scan act (#scan, round 8, step 3). One IntersectionObserver reads which beat crosses the screen
   centre and writes data-phase on the section: gather > reveal > two (no scroll events).
   "two" = two cards, [data-card="splat"] and [data-card="model"]. The stage (OrbitStage.two, builder E)
   draws both views inside the card rects; this file only does the DOM around them:
   - the focusable views (.stage-hit[data-hit="two-splat"|"two-model"]) are tab stops only while the
     two-card beat is on screen (never a dead tab stop, never a page jump);
   - the +, - and Reset buttons of each card call OrbitStage.two.zoom(card, k) and .reset(card);
   - the hint chip of a card (the one .hint style of the page): the first plain wheel over a card says
     "Pinch or Ctrl + scroll to zoom" (Cmd on a Mac); an engaged card says "Scroll to zoom. Esc or click
     outside to scroll the page" with a Done button (Done = the same as Esc, via OrbitEngage);
   - the aria-live line says what changed.
   A plain wheel never zooms until a card is engaged (OrbitEngage kind "card", done by the stage). */
(function () {
  "use strict";
  var sec = document.querySelector(".sec--scan");
  if (!sec) return;

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
  var statusEl = sec.querySelector("[data-scan-status]");
  var cards = {};
  ["splat", "model"].forEach(function (k) {
    cards[k] = {
      key: k,
      card: sec.querySelector('[data-card="' + k + '"]'),
      hit: sec.querySelector('[data-hit="two-' + k + '"]'),
      chip: sec.querySelector('[data-chip="' + k + '"]'),
      timer: 0, wheelHint: false, engaged: false, hoverT: 0
    };
  });
  var ORDER = ["gather", "reveal", "two"];
  var phase = sec.getAttribute("data-phase") || "gather";
  var inView = true, lastCard = null;

  function call(fn) { try { return fn(); } catch (e) { return undefined; } }
  function two() { var S = window.OrbitStage; return S && S.two ? S.two : null; }
  function say(t) { if (statusEl) { statusEl.textContent = ""; setTimeout(function () { statusEl.textContent = t; }, 30); } }
  function name(k) { return k === "splat" ? "Scan" : "Model"; }

  /* ---------- Round 9: one loop per animation frame while the act is near (no scroll events) ----------
     0. (30 Oct, option C) the who -> "One space." change in the same frame: over the 0.7 screen around the
        moment the gather beat's top passes the screen centre (the same moment js/space.js hands the points
        from the house to the building), the small lines fade out top first (--w1..3), the old title rolls
        up out of its mask (--wt), "One space." rolls up into it (--st) and the line under it comes in (--sn).
     1. --scan-open: the opening words leave with the scroll (lifting a little, never dropping) over the
        ~0.2 screen around the start of the reveal beat, before the real aerial shows (review C Scan 1 + 2).
     2. --scan-fa / --scan-fb / --scan-ft: while the stage draws the act, the frames, captions and title
        follow the stage's own numbers (OrbitStage.two.state()), so a frame only shows once its picture is
        inside it, both ways (review A1, A2). Without them the phase classes in scan.css do it. */
  function sstep(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  var revealBeat = sec.querySelector(':scope > [data-phase="reveal"]');
  var gatherBeat = sec.querySelector(':scope > [data-phase="gather"]');
  var near = false, raf = 0, everLive = false, last = { o: -1, a: -1, b: -1, t: -1, d: null };
  var SWAP = [["--w1", 0, .3], ["--w2", .07, .37], ["--w3", .14, .44], ["--wt", .3, .6], ["--st", .4, .72], ["--sn", .62, .95]];
  function setVar(name, key, v) {
    v = Math.round(v * 1000) / 1000;
    if (last[key] === v) return;
    last[key] = v;
    sec.style.setProperty(name, String(v));
  }
  function tick() {
    raf = 0;
    if (!near) return;
    var vh = innerHeight || 800;
    if (gatherBeat) {
      var u = (vh / 2 - gatherBeat.getBoundingClientRect().top + 0.35 * vh) / (0.7 * vh);
      for (var i = 0; i < SWAP.length; i++) setVar(SWAP[i][0], SWAP[i][0], sstep(SWAP[i][1], SWAP[i][2], u));
    }
    if (revealBeat) {
      // Codex request check: the words are read over the gathering points and are gone just as the real
      // aerial begins to show (the stage fades it in over the reveal beat), so they never sit on the buildings
      // (30 Oct night) the words stay while the points form in card A and go as the cards' title comes
      var rt = vh / 2 - revealBeat.getBoundingClientRect().bottom;   // > 0 once the reveal end passed the screen centre
      setVar("--scan-open", "o", 1 - sstep(-0.42 * vh, -0.2 * vh, rt));
      if (!sec.classList.contains("is-open-driven")) sec.classList.add("is-open-driven");
    }
    var t = two(), st = t && typeof t.state === "function" ? call(function () { return t.state(); }) : null;
    if (st && st.live) everLive = true;
    // once the stage has drawn the act, its numbers rule (no class fade can then flash a frame back in);
    // while it is not drawing the cards (before / after them) everything of the cards is gone
    // (30 Oct night) also once the aerial is loaded: the short in-between means the cards' beat can start
    // before the stage first drew it, and the class fade must not show the frames over the full-screen splat
    var drive = everLive || !!(st && st.ready);
    if (drive !== last.d) { last.d = drive; sec.classList.toggle("is-driven", drive); }
    if (drive) {
      var fa = 0, fb = 0, ft = 0;
      if (st && st.live) { fa = st.frameA; fb = st.frameB; ft = st.title; }
      else if (phase === "two") { fa = Math.max(0, last.a); fb = Math.max(0, last.b); ft = Math.max(0, last.t); }
      setVar("--scan-fa", "a", fa); setVar("--scan-fb", "b", fb); setVar("--scan-ft", "t", ft);
      sec.classList.toggle("is-a-off", fa < 0.04);
      sec.classList.toggle("is-b-off", fb < 0.04);
      sec.classList.toggle("is-t-off", ft < 0.04);
    }
    raf = requestAnimationFrame(tick);
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) {
      near = en[0].isIntersecting;
      if (near && !raf) raf = requestAnimationFrame(tick);
    // (3 Nov, phone speed) 10 % instead of 50 %: on a phone the act starts one screen under the hero, so with
    // 50 % this loop ran every frame while the visitor was still in the hero (rects read for nothing)
    }, { rootMargin: "10% 0px 10% 0px", threshold: 0 }).observe(sec);
  } else { near = true; raf = requestAnimationFrame(tick); }

  // ---------- Tab stops only while the cards are really there ----------
  function syncFocus() {
    var on = phase === "two" && inView;
    Object.keys(cards).forEach(function (k) { if (cards[k].hit) cards[k].hit.tabIndex = on ? 0 : -1; });
    sec.querySelectorAll(".scan__tools").forEach(function (t) { if (on) t.removeAttribute("inert"); else t.setAttribute("inert", ""); });
  }
  var pinEl = sec.querySelector(".scan__pin");
  if (pinEl && "IntersectionObserver" in window) {
    new IntersectionObserver(function (en) {
      var v = en[0].intersectionRatio > 0.25;
      if (v === inView) return;
      inView = v; syncFocus();
      if (!v) setTimeout(focusAway, 0);
    }, { threshold: [0, 0.25, 0.5] }).observe(pinEl);
  }
  function focusAway() {
    var a = document.activeElement;
    if (!a || a === document.body || !sec.contains(a)) return;
    if (phase === "two" && inView) return;
    if (!a.closest(".scan__two")) return;
    var h = sec.querySelector("#scan-title");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  }
  function setPhase(p) {
    if (!p || p === phase) return;
    phase = p;
    sec.setAttribute("data-phase", p);
    syncFocus();
    if (p !== "two") { Object.keys(cards).forEach(function (k) { hideChip(cards[k]); }); setTimeout(focusAway, 0); }
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
  syncFocus();

  // ---------- Hint chips ----------
  function hideChip(c) {
    if (!c.chip) return;
    clearTimeout(c.timer);
    c.chip.hidden = true;
  }
  function showChip(c, text, ms, withDone) {
    if (!c.chip) return;
    clearTimeout(c.timer);
    c.chip.textContent = text;
    if (withDone) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "scan__done"; b.textContent = "Done";
      b.setAttribute("aria-label", "Done. Scroll the page again");
      b.addEventListener("click", function () { releaseCard(); });
      c.chip.appendChild(b);
    }
    c.chip.hidden = false;
    if (ms) c.timer = setTimeout(function () { if (!c.engaged) c.chip.hidden = true; }, ms);
  }
  function releaseCard() {
    // the same as Esc: OrbitEngage tells the holder (the stage) to let go
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }
  var zoomText = mac ? "Pinch or Cmd + scroll to zoom" : "Pinch or Ctrl + scroll to zoom";
  Object.keys(cards).forEach(function (k) {
    var c = cards[k];
    if (!c.card) return;
    c.card.addEventListener("pointerdown", function () { lastCard = k; });
    c.card.addEventListener("wheel", function (e) {
      if (c.engaged || e.ctrlKey || e.metaKey || c.wheelHint) return;
      c.wheelHint = true;
      showChip(c, zoomText, 2500);
    }, { passive: true });
    c.card.addEventListener("pointerenter", function (e) {
      if (e.pointerType !== "mouse" || c.engaged || c.chip && !c.chip.hidden) return;
      clearTimeout(c.hoverT);
      c.hoverT = setTimeout(function () { if (!c.wheelHint) { c.wheelHint = true; showChip(c, "Drag to turn. " + zoomText, 2500); } }, 600);
    });
    c.card.addEventListener("pointerleave", function () { clearTimeout(c.hoverT); });
    if (c.hit) c.hit.addEventListener("focus", function () {
      if (c.engaged) return;
      showChip(c, "Arrow keys turn it. Plus and minus zoom.", 3000);
    });
  });

  // ---------- Engaged cards (OrbitEngage kind "card", set by the stage) ----------
  function whichCard(detail) {
    var id = String(detail.id || "");
    if (/model/i.test(id)) return "model";
    if (/splat|scan/i.test(id)) return "splat";
    return lastCard;
  }
  document.addEventListener("orbit:engage", function (e) {
    var d = e.detail || {};
    if (d.kind !== "card") return;
    var k = d.on ? whichCard(d) : null;
    Object.keys(cards).forEach(function (key) {
      var c = cards[key];
      if (d.on && key === k) {
        c.engaged = true;
        if (c.card) c.card.classList.add("is-engaged");
        showChip(c, "Scroll to zoom. Esc or click outside to scroll the page.", 0, true);
        say(name(key) + " view: scroll zooms. Esc to scroll the page.");
      } else if (c.engaged) {
        c.engaged = false;
        if (c.card) c.card.classList.remove("is-engaged");
        hideChip(c);
      }
    });
    if (!d.on) say("Back to scrolling the page.");
  });

  // ---------- Buttons ----------
  function used(c) { if (c) hideChip(c); }
  sec.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-for]") : null;
    if (!b) return;
    var k = b.getAttribute("data-for"), t = two(), c = cards[k];
    if (b.hasAttribute("data-reset")) {
      if (t && typeof t.reset === "function") { call(function () { t.reset(k); }); say(name(k) + " view reset."); }
    } else if (b.getAttribute("data-zoom") === "in") {
      if (t && typeof t.zoom === "function") { call(function () { t.zoom(k, 1.25); }); say(name(k) + " zoomed in."); }
    } else if (b.getAttribute("data-zoom") === "out") {
      if (t && typeof t.zoom === "function") { call(function () { t.zoom(k, 0.8); }); say(name(k) + " zoomed out."); }
    }
    used(c);
  });

  // The stage tells us when the visitor used a view: the chip has done its job.
  var hooked = false;
  function hook() {
    var t = two();
    if (hooked || !t || typeof t.on !== "function") return;
    hooked = true;
    t.on("interact", function (k) {
      var key = typeof k === "string" ? k : (k && (k.card || k.id)) || null;
      Object.keys(cards).forEach(function (ck) { if (!key || key === ck) { if (!cards[ck].engaged) hideChip(cards[ck]); } });
    });
  }
  hook();
  document.addEventListener("orbit:stage-ready", hook);
  window.addEventListener("load", hook);
  void ORDER;
})();