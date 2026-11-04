/* 06 Design (round 8, CONTRACT 8.3, research/10 section 5): the DOM of the station tour.
   The 3D camera, the model and the drags belong to js/stage-tour.js (window.OrbitStage.tour, F1).
   This file, once per animation frame while the act is near (no scroll listeners):
     - reads which beat crosses the screen centre (overview / tv / couch / kitchen, travel / hold)
       and shows that stop's words, moves the step bar thumb, toggles the dock
     - opens the compact glass panel when the camera has arrived (state().k >= 0.9 in a hold band),
       places it above the piece from tour.anchor(station) (clamped 12 px inside the screen, under the
       76 px nav, off the words, never over the piece; phones fall back to a short bottom sheet only
       when it cannot fit above), and closes it 150 ms after the hold band is left
     - fills the panel: pick a piece, picture choices (options), wall colours (paints), Move / Turn /
       Restore; every change is told in the act's aria-live line
     - the kitchen: a glow dot on each lamp (tour.lamps()) is its switch; the lamp's name tag shows on
       hover / keyboard focus / 2.5 s after a tap; a finger shows the way until the first lamp tap
   Keys: on the focused 3D view arrows turn, + / - zoom, Home = the stop's view; on the Move button
   arrows move the piece (Shift = further), [ and ] turn it, Esc ends moving.
   Without OrbitStage.tour (or before it is ready) the act reads as words over the film. */
(function () {
  "use strict";
  var sec = document.querySelector(".sec--design");
  if (!sec) return;

  var RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  var mac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");
  var $ = function (s) { return sec.querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || sec).querySelectorAll(s)); };

  var pin = $(".design__pin"), hit = $(".design__hit"), panel = $("[data-panel]");
  var leader = $("[data-leader]"), ring = $("[data-ring]"), grab = $("[data-grab]"), hint = $("[data-hint]");
  var dock = $(".design__dock"), steps = $("[data-steps]"), thumb = $("[data-thumb]"), viewEl = $("[data-view]");
  var statusEl = $("[data-status]");
  var phead = $("[data-phead]"), ptitle = $("[data-ptitle]"), picks = $("[data-picks]"), opts = $("[data-opts]"), optLabel = $("[data-opt-label]");
  var swatches = $("[data-swatches]"), paintLabel = $("[data-paint-label]"), pad = $("[data-pad]"), moveNote = $("[data-move-note]");
  var lampsEl = $("[data-lamps]"), lampCount = $("[data-lamp-count]"), tapdemo = $("[data-tapdemo]"), pwords = $("[data-pwords]");
  var modesEl = $("[data-modes]"), modeBtns = $$("[data-design-mode]");
  var navIsland = document.querySelector(".nav__island");
  var compView = document.querySelector(".compare__view");   // #compare's viewer (round 9 seam)
  var rows = {};
  $$("[data-prow]").forEach(function (r) { rows[r.getAttribute("data-prow")] = r; });
  var tool = function (n) { return panel.querySelector('[data-tool="' + n + '"]'); };
  var lines = $$("[data-line]");
  var beats = $$(":scope > .beat[data-station]");
  var stepBtns = $$("[data-go]");

  var NAV = 76, M = 12, GAP = 24;
  /* The piece of each stop stays in the MIDDLE of the screen (the camera's own framing); the sheet
     goes where it fits: on arrival design.js measures the piece on screen and takes the side
     (left / right) where the sheet covers the least of it, and keeps it while the visitor is at
     that stop (no jumping while they drag). SIDE = the first guess before the first measure
     (the words card sits there during the flight). The overview fits the room beside its card.
     Phones: always the compact strip at the foot. */
  // (round 9) the kitchen sheet is measured to the left on computers: its card waits there too, so the
  // card that appears at the end of the flight is where the sheet then opens
  var SIDE = { overview: "right", tv: "right", couch: "right", kitchen: "left" };
  // James's pick (29 Oct): on computers the TV sheet (over the table) and the couch sheet sit on the right
  var FIXED = { tv: "right", couch: "right" };
  var sideFor = {};        // measured side per stop (cleared on resize)
  function small() { return innerWidth < 768; }
  var ORDER = ["overview", "tv", "couch", "kitchen"];
  var NAMES = { overview: "Overview", tv: "TV", couch: "Couch", kitchen: "Kitchen" };
  var TELL = {
    tv: "TV stop. Try a wall colour, or another piece for the TV.",
    couch: "Couch stop. Move the sofa, turn it, or try another.",
    kitchen: "Kitchen stop. Each lamp is a button: switch the kitchen lamps on and off."
  };

  if (coarse) {
    var cs = $("[data-couch-sub]");
    if (cs) cs.textContent = "Slide the sofa by its move handle, turn it, or try another.";
  }
  var HINT_LOOK = coarse ? "Drag sideways to look around. Pinch to zoom." : "Drag to look around. " + (mac ? "Cmd" : "Ctrl") + " + scroll to zoom.";
  var HINT_ZOOM = coarse ? "Pinch to zoom" : mac ? "Pinch or Cmd + scroll to zoom" : "Pinch or Ctrl + scroll to zoom";
  var HINT_KEYS = "Arrow keys turn. Plus and minus zoom. Home goes back.";
  hint.textContent = HINT_LOOK;

  /* ---------- small helpers ---------- */
  function T() {
    var S = window.OrbitStage, t = S && S.tour;
    return t && typeof t.state === "function" && typeof t.anchor === "function" ? t : null;
  }
  function call(fn, d) { try { var r = fn(); return r === undefined ? d : r; } catch (e) { return d; } }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  /* "Sofa" -> "sofa", but "TV cabinet" stays (a short word in capitals is a name) */
  function lower(s) { s = String(s || ""); return /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1); }
  var sayT = 0;
  function say(t) {
    clearTimeout(sayT);
    statusEl.textContent = "";
    sayT = setTimeout(function () { statusEl.textContent = t; }, 40);
  }
  function view() { var t = T(); return t && t.view ? t.view : null; }

  /* ---------- where the page is: the beat across the screen centre ---------- */
  function where() {
    var c = innerHeight / 2;
    for (var i = 0; i < beats.length; i++) {
      var r = beats[i].getBoundingClientRect();
      if (c >= r.top && c < r.bottom) {
        return { station: beats[i].getAttribute("data-station"), phase: beats[i].getAttribute("data-phase"), p: (c - r.top) / Math.max(1, r.height) };
      }
    }
    var ar = sec.getBoundingClientRect();
    return ar.top > c ? { station: "overview", phase: "before", p: 0 } : { station: "kitchen", phase: "after", p: 1 };
  }
  /* the stop the words and the step bar name: in a flight it changes half way */
  function stepOf(w) {
    if (w.phase !== "travel") return w.station;
    return w.p >= 0.5 ? w.station : ORDER[Math.max(0, ORDER.indexOf(w.station) - 1)];
  }

  /* ---------- state ---------- */
  var running = false, raf = 0, isLive = false, isIn = false, hookedT = null, lastIntro = -1, lastLift = -1;
  var cur = { station: null, phase: null }, curStep = null;
  var open = false, openStation = null, hideT = 0;
  var sel = null, lastSel = {}, chosen = {}, paintNow = null, moveMode = false, busy = false;
  var used = false, hintT = 0, hintShown = false, wheelHinted = false, movedT = 0;

  function showHint(text, ms) {
    hint.textContent = text;
    hint.classList.add("is-on");
    clearTimeout(hintT);
    hintT = setTimeout(function () { hint.classList.remove("is-on"); }, ms || 3200);
  }
  function interacted() {
    used = true;
    clearTimeout(hintT);
    hintT = setTimeout(function () { hint.classList.remove("is-on"); }, 2500);
  }

  /* ---------- the words + the step bar ---------- */
  /* the words card: at a stop (hold) its own; in a flight none at first, the next stop's card only in
     the last 40 % (round 9, review C design 4: no old card while flying); none while leaving the act */
  var curLine = undefined;
  function lineOf(w, leaving) {
    if (leaving || w.phase === "after") return null;
    if (w.phase === "travel") return w.p >= 0.6 ? w.station : null;
    return w.station;
  }
  function setLine(s) {
    curLine = s;
    lines.forEach(function (l) { l.classList.toggle("is-on", l.getAttribute("data-line") === s); });
  }
  function setStep(s) {
    curStep = s;
    stepBtns.forEach(function (b) {
      if (b.getAttribute("data-go") === s) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
    placeThumb();
  }
  function placeThumb() {
    var b = null;
    stepBtns.forEach(function (x) { if (x.getAttribute("aria-current") === "step") b = x; });
    if (!b) { thumb.style.width = "0px"; return; }
    thumb.style.width = b.offsetWidth + "px";
    thumb.style.translate = b.offsetLeft + "px 0";
  }
  function beatFor(s) {
    if (s === "all") return document.querySelector('#floor .beat[data-phase="explore"]') || document.getElementById("floor");
    return sec.querySelector('.beat[data-station="' + s + '"][data-phase="hold"]');
  }
  steps.addEventListener("click", function (e) {
    var b = e.target.closest("[data-go]");
    if (!b) return;
    var el = beatFor(b.getAttribute("data-go"));
    if (!el) return;
    var r = el.getBoundingClientRect();
    var top = scrollY + r.top + Math.min(r.height, innerHeight) / 2 - innerHeight / 2;
    if (el.id === "floor") top = scrollY + r.top;
    window.scrollTo({ top: Math.max(0, Math.round(top)), behavior: RM ? "auto" : "smooth" });
  });

  /* ---------- the panel ---------- */
  function piecesOf(s) {
    var t = T();
    if (!t || s === "kitchen" || s === "overview") return [];
    return arr(call(function () { return t.pieces(s); }, [])).filter(function (p) { return p && p.key; });
  }
  function nameOf(key) {
    var n = null;
    piecesOf(openStation).forEach(function (p) { if (p.key === key) n = p.name; });
    return n || "The piece";
  }
  function openPanel(s) {
    var t = T();
    open = true; openStation = s;
    var ps = piecesOf(s);
    var keep = lastSel[s] && ps.some(function (p) { return p.key === lastSel[s]; });
    sel = keep ? lastSel[s] : ps.length ? ps[0].key : null;
    if (sel) { lastSel[s] = sel; call(function () { t.select(sel); }); }
    // the stop's words move into the sheet (the line keeps them for screen readers)
    var line = sec.querySelector('[data-line="' + s + '"]');
    pwords.textContent = "";
    if (line) $$(".design__kicker, .design__head, .design__lead, .design__sub", line).forEach(function (n) {
      var c = document.createElement("p");
      c.className = n.className.replace(/design__(kicker|head|lead|sub)/, "design__pw-$1");
      // Retain keyed copy and line breaks so an open panel switches language too.
      Array.from(n.childNodes).forEach(function (child) { c.appendChild(child.cloneNode(true)); });
      pwords.appendChild(c);
    });
    fill();
    panel.inert = false;
    panel.removeAttribute("aria-hidden");
    panel.classList.add("is-open");
    sec.classList.add("is-panel");
    say(TELL[s] || "");
  }
  function closePanel() {
    hideT = 0;
    if (!open) return;
    var t = T();
    var hadFocus = panel.contains(document.activeElement);
    open = false;
    setMove(false);
    if (realOn) setReal(false, true);
    sec.classList.remove("is-real");
    if (sel && t) call(function () { t.select(null); });
    sel = null; openStation = null;
    panel.classList.remove("is-open", "is-sheet", "is-lost");
    panel.inert = true;
    panel.setAttribute("aria-hidden", "true");
    sec.classList.remove("is-panel", "is-sheet", "is-under");
    leader.classList.remove("is-on"); ring.classList.remove("is-on"); grab.classList.remove("is-on");
    var lampFocus = lampsEl.contains(document.activeElement);
    hideLamps();
    if (hadFocus || lampFocus) {
      // keyboard focus must not get lost with the panel: back to the step bar
      var to = steps.querySelector('[aria-current="step"]') || stepBtns[0];
      if (to) to.focus({ preventScroll: true });
    }
  }

  function focusKey() {
    var a = document.activeElement;
    if (!a || !panel.contains(a)) return null;
    var k = ["data-id", "data-key", "data-hex", "data-tool", "data-move"];
    for (var i = 0; i < k.length; i++) if (a.hasAttribute(k[i])) return "[" + k[i] + '="' + a.getAttribute(k[i]) + '"]';
    return null;
  }
  function fill() {
    var t = T(), s = openStation;
    if (!t || !s) return;
    var fk = focusKey();
    var ps = piecesOf(s), name = sel ? nameOf(sel) : null;
    ptitle.textContent = s === "kitchen" ? "Kitchen" : name || NAMES[s];

    // pick a piece (only when the stop has more than one): the picker stands in for the title
    picks.textContent = "";
    picks.hidden = ps.length < 2;
    ptitle.classList.toggle("sr-only", ps.length > 1);
    phead.hidden = s === "kitchen";
    if (ps.length > 1) ps.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "design__pick";
      b.setAttribute("data-key", p.key);
      b.setAttribute("aria-pressed", String(p.key === sel));
      b.setAttribute("aria-label", "Pick: " + p.name);
      b.textContent = p.name;
      picks.appendChild(b);
    });

    // picture choices for the chosen piece
    var list = sel ? arr(call(function () { return t.options(sel); }, [])) : [];
    opts.textContent = "";
    rows.options.hidden = list.length < 2;
    // phones: short row labels ("TV", "Walls"), the strip stays one glance
    optLabel.textContent = small() ? name || "Pick" : name ? "Try another " + lower(name) : "Try another";
    list.forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "design__opt";
      b.setAttribute("data-id", o.id);
      b.setAttribute("aria-label", o.id === "original" ? "Original " + lower(name || "piece") : o.name);
      var pic;
      if (o.thumb) {
        pic = document.createElement("img");
        pic.alt = ""; pic.width = 64; pic.height = 64; pic.decoding = "async"; pic.src = o.thumb;
      } else pic = document.createElement("span");
      pic.className = "design__opt-pic";
      b.appendChild(pic);
      var n = document.createElement("span");
      n.className = "design__opt-name"; n.textContent = o.id === "original" ? "Original" : o.name;
      n.setAttribute("aria-hidden", "true");
      b.appendChild(n);
      opts.appendChild(b);
    });

    // wall colours (the TV stop)
    swatches.textContent = "";
    var pl = s === "tv" ? arr(call(function () { return t.paints(); }, [])) : [];
    rows.paints.hidden = !pl.length;
    if (pl.length) {
      [{ hex: "", name: "Original" }].concat(pl).forEach(function (p) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "design__swatch is-round" + (p.hex ? "" : " design__swatch--original");
        b.setAttribute("data-hex", p.hex || "");
        b.setAttribute("data-name", p.name);
        b.setAttribute("aria-label", p.hex ? p.name : "Original wall colour");
        b.title = p.name;
        if (p.hex) b.style.setProperty("--c", p.hex);
        swatches.appendChild(b);
      });
    }

    // tools: Move / Turn at the couch, Restore at the TV and the couch
    rows.tools.hidden = !(s === "couch" && sel);
    tool("restore").hidden = !((s === "tv" || s === "couch") && sel);
    if (sel) tool("restore").setAttribute("aria-label", "Restore the " + lower(name || "piece"));
    moveNote.textContent = coarse ? "Use the arrows, or slide the move handle." : "Arrow keys move it. [ and ] turn it.";
    rows.lights.hidden = s !== "kitchen";

    sync();
    if (fk) { var again = panel.querySelector(fk); if (again && !again.closest("[hidden]")) again.focus({ preventScroll: true }); }
  }
  function sync() {
    var t = T();
    var now = sel ? chosen[sel] || "original" : null;
    $$(".design__opt", opts).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-id") === now)); });
    var pname = "Original";
    $$(".design__swatch", swatches).forEach(function (b) {
      var on = (b.getAttribute("data-hex") || null) === (paintNow || null);
      b.setAttribute("aria-pressed", String(on));
      if (on) pname = b.getAttribute("data-name");
    });
    paintLabel.textContent = small() ? "Walls" : "Wall colour: " + pname;
    syncLamps();
  }
  function setMove(on) {
    moveMode = !!on;
    tool("move").setAttribute("aria-pressed", String(moveMode));
    pad.hidden = !moveMode;
  }

  /* ---------- Real scan | 3D Model (3 Nov, James): this exact view as the real scan ---------- */
  var realOn = false, realAsked = 0;
  function setReal(on, quiet) {
    var t = T(), can = !!t && typeof t.real === "function";
    realOn = can ? !!call(function () { return t.real(!!on); }, false) : false;
    realAsked = on ? performance.now() : 0;
    syncReal();
    if (!quiet) say(on ? "Real scan of this view." : "3D model of this view.");
  }
  function syncReal() {
    var t = T(), rs = t && typeof t.realState === "function" ? call(function () { return t.realState(); }, null) : null;
    var ok = !!(rs && rs.ok);
    if (modesEl.hidden === ok) modesEl.hidden = !ok;
    if (rs && !rs.on && realOn) realOn = false;   // the stage went back to the model (left the stop)
    modeBtns.forEach(function (b) { var p = String((b.getAttribute("data-design-mode") === "scan") === realOn); if (b.getAttribute("aria-pressed") !== p) b.setAttribute("aria-pressed", p); });
    var k = rs ? rs.k : 0;
    sec.classList.toggle("is-real", realOn && k > 0.5);
    // the scan is still opening: say so once (it streams in the background)
    if (realOn && k < 0.05 && realAsked && performance.now() - realAsked > 600) { realAsked = 0; showHint("Opening the real scan...", 2400); }
  }
  modesEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-design-mode]");
    if (!b) return;
    setReal(b.getAttribute("data-design-mode") === "scan");
    interacted();
  });
  // any choice in the sheet, or a lamp, works on the 3D model: show the model again first
  function toModel(e) {
    if (!realOn || e.target.closest("[data-modes]")) return;
    if (e.target.closest("button")) setReal(false, true);
  }
  panel.addEventListener("click", toModel, true);
  lampsEl.addEventListener("click", toModel, true);

  picks.addEventListener("click", function (e) {
    var b = e.target.closest("[data-key]"), t = T();
    if (!b || !t) return;
    sel = b.getAttribute("data-key");
    lastSel[openStation] = sel;
    call(function () { t.select(sel); });
    setMove(false);
    fill();
    interacted();
  });
  opts.addEventListener("click", function (e) {
    var b = e.target.closest(".design__opt"), t = T();
    if (!b || !t || !sel || busy) return;
    var id = b.getAttribute("data-id"), key = sel, label = b.getAttribute("aria-label");
    if ((chosen[key] || "original") === id) return;
    busy = true;
    b.setAttribute("aria-busy", "true");
    Promise.resolve(call(function () { return t.swap(key, id); })).then(function () {
      busy = false; b.removeAttribute("aria-busy");
      chosen[key] = id;
      sync();
      say(id === "original" ? "The original " + lower(nameOf(key)) + " is back." : label + " is in.");
    }, function () {
      busy = false; b.removeAttribute("aria-busy");
      say("That piece could not load. Nothing changed.");
    });
    interacted();
  });
  swatches.addEventListener("click", function (e) {
    var b = e.target.closest(".design__swatch"), t = T();
    if (!b || !t) return;
    var hex = b.getAttribute("data-hex") || null;
    call(function () { t.paint(hex); });
    paintNow = hex;
    sync();
    say(hex ? "Walls painted " + b.getAttribute("data-name") + "." : "Walls back to the original colour.");
    interacted();
  });
  panel.addEventListener("click", function (e) {
    var b = e.target.closest("[data-tool]"), t = T();
    if (!b || !t || !sel) return;
    var a = b.getAttribute("data-tool"), key = sel;
    if (a === "move") { setMove(!moveMode); if (moveMode) say("Moving the " + lower(nameOf(key)) + ". " + moveNote.textContent); }
    else if (a === "turn") { call(function () { t.turn(key, 45); }); say(nameOf(key) + " turned."); }
    else if (a === "restore") {
      call(function () { t.restore(key); });
      chosen[key] = "original";
      sync();
      say("The " + lower(nameOf(key)) + " is back as it was.");
    }
    interacted();
  });
  function moved(word) {
    clearTimeout(movedT);
    var n = nameOf(sel);
    movedT = setTimeout(function () { say(n + " " + (word || "moved") + "."); }, 450);
  }
  $$("[data-move]", pad).forEach(function (b) {
    b.addEventListener("click", function () {
      var t = T(), v = b.getAttribute("data-move").split(",").map(Number);
      if (!t || !sel) return;
      call(function () { t.move(sel, v[0] * 0.1, v[1] * 0.1); });
      moved();
      interacted();
    });
  });
  /* the Move button (and the pad) is the keyboard handle of the piece */
  function moveKeys(e) {
    var t = T();
    if (!t || !sel || e.ctrlKey || e.metaKey || e.altKey) return;
    var step = e.shiftKey ? 0.5 : 0.1;
    var m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (m) {
      e.preventDefault();
      if (!moveMode) setMove(true);
      call(function () { t.move(sel, m[0] * step, m[1] * step); });
      moved(); interacted();
    } else if (e.key === "[" || e.key === "]") {
      e.preventDefault();
      call(function () { t.turn(sel, e.key === "]" ? 15 : -15); });
      moved("turned"); interacted();
    } else if (e.key === "Escape" && moveMode) {
      e.preventDefault(); e.stopPropagation();
      clearTimeout(movedT);
      setMove(false);
      tool("move").focus({ preventScroll: true });
      say("Done moving.");
    }
  }
  tool("move").addEventListener("keydown", moveKeys);
  pad.addEventListener("keydown", moveKeys);
  /* ---------- the kitchen lamps: the lamp itself is the switch (29 Oct, James) ---------- */
  var lampBtns = {}, lampTapped = false, toldT = {}, lampsMixed = false;
  // (3 Nov, James) the kitchen starts with 2 of 3 lamps on (the shelf lights off), so the lamps read as
  // switches at a glance; once per visit, before the camera arrives, and never after the visitor touched one
  var START_OFF = "Shelf lights";
  function mixLamps() {
    if (lampsMixed || lampTapped) return;
    var t = T(), list = lampList();
    if (!t || list.length < 2) return;
    lampsMixed = true;
    var off = null;
    list.forEach(function (l) { if (l.name === START_OFF) off = l; });
    if (!off) off = list[1];
    if (off.on) call(function () { t.lamp(off.key, false); });
    syncLamps();
  }
  function lampList() { var t = T(); return t && t.lamps ? arr(call(function () { return t.lamps(); }, [])) : []; }
  function buildLamps() {
    var list = lampList();
    if (!list.length || Object.keys(lampBtns).length === list.length) return;
    lampsEl.textContent = ""; lampBtns = {};
    list.forEach(function (l) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "design__lamp";
      b.setAttribute("data-lamp", l.key);
      b.setAttribute("aria-label", l.name);
      b.innerHTML = '<span class="design__lamp-dot is-round" aria-hidden="true"></span>' +
        '<span class="design__lamp-tag" aria-hidden="true"><span class="design__lamp-name"></span> <span class="design__lamp-state"></span></span>';
      b.querySelector(".design__lamp-name").textContent = l.name;
      lampsEl.appendChild(b);
      lampBtns[l.key] = b;
    });
    syncLamps();
  }
  function syncLamps() {
    var list = lampList(), n = 0;
    list.forEach(function (l) {
      if (l.on) n++;
      var b = lampBtns[l.key]; if (!b) return;
      b.setAttribute("aria-pressed", String(!!l.on));
      b.querySelector(".design__lamp-state").textContent = l.on ? "On" : "Off";
    });
    lampCount.textContent = !list.length ? "" : n === list.length ? "All lamps on" : n === 0 ? "All lamps off" : n + " of " + list.length + " lamps on";
    rows.lights.classList.toggle("is-dark", list.length > 0 && n === 0);
  }
  function hideLamps() {
    lampsEl.hidden = true;
    tapdemo.classList.remove("is-on");
  }
  // every frame at the kitchen: each dot on its lamp; off screen or under the sheet = hidden
  function placeLamps(pr, topY, bottomY, sheet) {
    var list = lampList(), W = innerWidth, demoAt = null, best = -Infinity;
    if (!list.length) { hideLamps(); return; }
    buildLamps();
    lampsEl.hidden = false;
    list.forEach(function (l) {
      var b = lampBtns[l.key]; if (!b) return;
      var x = l.x, y = l.y, ok = isFinite(x) && isFinite(y);
      // a few px past the edge: pulled in; further out: not shown (it would sit on the wrong thing)
      if (ok && (x < -16 || x > W + 16 || y < topY - 16 || y > bottomY + 16)) ok = false;
      if (ok) { x = clamp(x, 22, W - 22); y = clamp(y, topY + 4, bottomY - 4); }
      if (ok && sheet && x > sheet.left - 18 && x < sheet.right + 18 && y > sheet.top - 18 && y < sheet.bottom + 18) ok = false;
      b.classList.toggle("is-away", !ok);
      b.tabIndex = ok ? 0 : -1;
      if (!ok) return;
      // the tag opens toward the middle of the screen, so it never runs off the edge
      b.classList.toggle("is-left", x > W * 0.62);
      b.style.transform = "translate3d(" + Math.round(x - pr.left) + "px," + Math.round(y - pr.top) + "px,0)";
      // the demo taps the brightest lamp in view (the pendant), away from the nav at the top
      var score = (+l.lumen || 0) - (y < topY + 70 ? 1e5 : 0);
      if (score > best) { best = score; demoAt = { x: x, y: y }; }
    });
    // (3 Nov, James) the "Tap here" sign points at a lamp that is OFF (a dark lamp invites the tap)
    var offAt = null;
    list.forEach(function (l) {
      var b = lampBtns[l.key];
      if (!offAt && !l.on && b && !b.classList.contains("is-away")) {
        var bx = clamp(l.x, 22, W - 22), by = clamp(l.y, topY + 4, bottomY - 4);
        if (by > topY + 70) offAt = { x: bx, y: by };
      }
    });
    if (offAt) demoAt = offAt;
    var demo = !lampTapped && demoAt;
    tapdemo.classList.toggle("is-on", !!demo);
    if (demo) {
      tapdemo.classList.toggle("is-left", demoAt.x > W * 0.62);
      // (3 Nov) the sign stands centred above its lamp, shifted only right at a screen edge
      tapdemo.classList.toggle("is-edge-r", demoAt.x > W - 70);
      tapdemo.classList.toggle("is-edge-l", demoAt.x < 70);
      tapdemo.style.transform = "translate3d(" + Math.round(demoAt.x - pr.left) + "px," + Math.round(demoAt.y - pr.top) + "px,0)";
    }
  }
  lampsEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-lamp]"), t = T();
    if (!b || !t) return;
    var key = b.getAttribute("data-lamp"), on = b.getAttribute("aria-pressed") !== "true";
    call(function () { t.lamp(key, on); });
    // the tap demo has done its job
    lampTapped = true;
    tapdemo.classList.remove("is-on");
    // the name tag stays a moment, so the visitor sees what they switched
    b.classList.add("is-told");
    clearTimeout(toldT[key]);
    toldT[key] = setTimeout(function () { b.classList.remove("is-told"); }, 2500);
    syncLamps();
    say(b.getAttribute("aria-label") + (on ? " on." : " off."));
    interacted();
  });

  /* ---------- the sheet: where it sits, and the free part of the screen for the camera ---------- */
  // tablets / computers: lined up with the nav island's edge on the stop's side
  function sheetBox(stop) {
    var W = innerWidth, nr = navIsland ? navIsland.getBoundingClientRect() : null;
    var s = stop || curStep, w = W >= 1024 ? 400 : 340, side = W < 1024 ? "bottom" : sideFor[s] || SIDE[s] || "right";
    // tablets: "bottom" = a wide sheet under the piece, when the piece fills the width
    if (side === "bottom") { w = Math.min(560, W - 2 * M); return { x: Math.round((W - w) / 2), y: null, w: w, side: side }; }
    // right: out at the screen's right edge, as far from the piece as it goes (James, 29 Oct)
    var x = side === "left" ? (nr ? nr.left : M) : W - GAP - w;
    return { x: clamp(x, M, W - M - w), y: NAV + 16, w: w, side: side };
  }
  // the side where the sheet covers the least of the piece (its screen box; a point when there is none)
  function bestSide(a, floorY) {
    // smaller screens (tablets): always under the piece, never on a side
    if (innerWidth < 1024) return "bottom";
    if (FIXED[openStation]) return FIXED[openStation];
    var rc = a.rect && isFinite(a.rect.left) && isFinite(a.rect.right) ? a.rect : { left: a.x - 60, right: a.x + 60, top: a.y - 60, bottom: a.y + 60 };
    var best = null, bestCover = Infinity;
    var sides = ["right", "left"];
    sides.forEach(function (sd) {
      var saved = sideFor[openStation]; sideFor[openStation] = sd;
      var q = sheetBox(openStation);
      sideFor[openStation] = saved;
      var top = sd === "bottom" ? floorY - 300 : q.y;   // the wide sheet is about 300 px tall
      var ox = Math.max(0, Math.min(rc.right, q.x + q.w) - Math.max(rc.left, q.x));
      var oy = Math.max(0, Math.min(rc.bottom, floorY) - Math.max(rc.top, top));
      var cover = ox * oy;
      // even with no overlap: keep the sheet away from the piece (more air on the near side)
      var gap = sd === "right" ? q.x - rc.right : sd === "left" ? rc.left - (q.x + q.w) : top - rc.bottom;
      var score = cover - Math.min(gap, 400) * 0.01;
      if (score < bestCover) { bestCover = score; best = sd; }
    });
    return best || "right";
  }
  var sheetH = {};         // measured height of the sheet under the piece, per stop (smaller screens)
  var clearFor = {};       // computers: stops whose piece was under the sheet (they get their own free rect)
  var posFor = {}, steady = {};   // computers: the sheet's spot per stop, locked once the piece holds still
  addEventListener("resize", function () { sideFor = {}; sheetH = {}; clearFor = {}; posFor = {}; steady = {}; });
  var lastLay = "";
  function layout(t) {
    var W = innerWidth, H = innerHeight, area, lay;
    var dr = dock.getBoundingClientRect(), floorY = (dr.height ? dr.top : H - 70) - 10;
    // only the overview gets a free rect (the room fits beside its card); the stops keep their piece
    // in the middle and the sheet moves instead
    // the overview (round 9, review D3: the sub-line crossed the pale floor): the room sits in the lower
    // part of the screen, the words above it on the dark background (css .design__intro); no veils
    var ovTop = Math.round(H * (small() ? 0.47 : 0.45));
    if (small()) {
      area = { overview: { left: 0, top: ovTop, right: W, bottom: floorY } };
      lay = "s";
    } else {
      var q = sheetBox("tv");
      area = { overview: { left: 0, top: ovTop, right: W, bottom: floorY } };
      // smaller screens: the sheet sits under the piece, so each stop's piece is lifted into the room above it
      ["tv", "couch", "kitchen"].forEach(function (k) {
        if (q.side === "bottom") area[k] = { left: 0, top: NAV, right: W, bottom: Math.max(NAV + 160, floorY - (sheetH[k] || 470) - 16) };
        else if (clearFor[k] || FIXED[k]) {
          // computers: the sheet would cover this stop's piece, so it gets the free part beside the sheet.
          // The stops with a fixed side (TV, couch) get it from the start (round 9, review A9): the
          // flight ends on the final framing and the camera never moves again during the stop
          var s = sheetBox(k);
          area[k] = s.side === "left" ? { left: s.x + s.w + 16, top: NAV, right: W, bottom: floorY } : { left: 0, top: NAV, right: s.x - 16, bottom: floorY };
        }
      });
      var b = sheetBox();
      // a sheet under the piece: the words card sits on the step bar, where the sheet will grow from
      if (b.side === "bottom") { var ln = sec.querySelector(".design__line.is-on"); b.y = Math.round(floorY - (ln ? ln.offsetHeight : 200)); }
      lay = b.side + "|" + b.x + "|" + b.y + "|" + b.w;
      // the words card (before the sheet opens) sits exactly where the sheet will be
      if (lay !== lastLay) { sec.style.setProperty("--sheet-x", b.x + "px"); sec.style.setProperty("--sheet-y", b.y + "px"); sec.style.setProperty("--sheet-w", b.w + "px"); }
    }
    lastLay = lay;
    var o = area.overview;
    o.left = Math.round(o.left); o.right = Math.round(o.right); o.bottom = Math.round(o.bottom);
    if (t && typeof t.area === "function") call(function () { t.area(area); });
  }
  function place(t) {
    var a = call(function () { return t.anchor(openStation); }, null);
    var pr = pin.getBoundingClientRect();
    if (!a || a.visible === false || !isFinite(a.x) || !isFinite(a.y)) {
      panel.classList.add("is-lost"); panel.inert = true;
      leader.classList.remove("is-on"); ring.classList.remove("is-on"); grab.classList.remove("is-on");
      hideLamps();
      return;
    }
    if (panel.classList.contains("is-lost")) { panel.classList.remove("is-lost"); panel.inert = false; }
    var W = innerWidth, H = innerHeight;
    var dr = dock.getBoundingClientRect();
    var floorY = Math.min(H - M, (dr.height ? dr.top : H) - 10), topY = NAV + M;
    var x, y, w, h, side = null;
    if (small()) {
      // phones: the compact strip right above the step bar; the model keeps the whole screen above it
      panel.classList.add("is-sheet");
      panel.style.width = ""; panel.style.height = ""; panel.style.maxHeight = "";
      w = panel.offsetWidth; h = panel.offsetHeight;
      x = (W - w) / 2;
      y = Math.max(topY, floorY - h);
    } else {
      // tablets / computers: the side sheet (tall on computers: from under the nav to above the step bar)
      panel.classList.remove("is-sheet");
      if (!sideFor[openStation]) sideFor[openStation] = bestSide(a, floorY);
      var b = sheetBox();
      side = b.side; w = b.w; x = b.x; y = b.y;
      // the sheet still over the piece: the piece moves into the free part beside the sheet (kept per stop)
      var rp = a.rect && isFinite(a.rect.left) && isFinite(a.rect.right) ? a.rect : null;
      if (rp && side !== "bottom" && !clearFor[openStation] &&
          (side === "right" ? rp.right > x - 16 : rp.left < x + w + 16)) { clearFor[openStation] = true; layout(T()); }
      panel.style.width = w + "px";
      // only as tall as its content (James, 29 Oct); scrolls inside if the screen is too short
      panel.style.height = "";
      panel.style.maxHeight = Math.max(160, floorY - y) + "px";
      h = panel.offsetHeight;
      if (side !== "bottom" && rp) {
        // computers: the sheet sits NEXT TO the piece, not in a screen corner: centred in the free gap
        // between the piece and the screen edge, and at the piece's height (short hairline, James 29 Oct).
        // Locked once the piece holds still, so dragging the view does not drag the sheet around.
        var lk = posFor[openStation];
        if (lk && lk.w === w && lk.h === h) { x = lk.x; y = lk.y; }
        else {
          var g0 = side === "right" ? rp.right + GAP : M, g1 = side === "right" ? W - GAP : rp.left - GAP;
          if (g1 - g0 >= w) x = Math.round(g0 + (g1 - g0 - w) / 2);
          y = Math.round(clamp((rp.top + rp.bottom) / 2 - h / 2, NAV + 16, floorY - h));
          var st = steady[openStation], key = Math.round(rp.left) + "," + Math.round(rp.right) + "," + Math.round(rp.top) + "," + Math.round(rp.bottom);
          if (st && st.key === key) { if (++st.n >= 8) posFor[openStation] = { x: x, y: y, w: w, h: h }; }
          else steady[openStation] = { key: key, n: 0 };
        }
      }
      if (side === "bottom") {
        y = Math.max(topY, floorY - h);
        // remember the real sheet height, so the piece is lifted just above it (layout uses it)
        if (h > 60 && Math.abs((sheetH[openStation] || 0) - h) > 8) { sheetH[openStation] = h; layout(T()); }
      }
    }
    sec.classList.toggle("is-sheet", small());
    panel.style.transform = "translate3d(" + Math.round(x - pr.left) + "px," + Math.round(y - pr.top) + "px,0)";

    // the callout: a ring on the MIDDLE of the piece (its screen box), a hairline from the sheet to it
    var rc = a.rect && isFinite(a.rect.left) && isFinite(a.rect.right) && isFinite(a.rect.top) && isFinite(a.rect.bottom) ? a.rect : null;
    var px = rc ? (rc.left + rc.right) / 2 : a.x, py = rc ? (rc.top + rc.bottom) / 2 : a.y;
    px = clamp(px, M + 10, W - M - 10); py = clamp(py, topY + 10, (small() ? y : floorY) - 18);
    // the kitchen: the lamp dots are the markers (no ring, no hairline)
    if (openStation === "kitchen") {
      ring.classList.remove("is-on"); leader.classList.remove("is-on"); grab.classList.remove("is-on");
      placeLamps(pr, topY, (small() ? y : floorY) - 8, { left: x, top: y, right: x + w, bottom: y + h });
      return;
    }
    hideLamps();
    ring.style.transform = "translate3d(" + Math.round(px - pr.left) + "px," + Math.round(py - pr.top) + "px,0)";
    ring.classList.add("is-on");
    var sx, sy;
    if (side === "bottom" || !side) { sx = clamp(px, x + 24, x + w - 24); sy = y; }
    else { sx = side === "right" ? x : x + w; sy = clamp(py, y + 40, y + h - 40); }
    var len = Math.hypot(px - sx, py - sy) - 9;
    // phones: the dot alone (a line up the narrow screen would cut the room in two)
    var clear = side === "bottom" ? py < y : side === "right" ? px < x : px > x + w;
    if (side && len > 6 && clear) {
      leader.style.width = Math.round(len) + "px";
      leader.style.transform = "translate3d(" + (sx - pr.left) + "px," + (sy - pr.top) + "px,0) rotate(" + Math.atan2(py - sy, px - sx) + "rad)";
      leader.classList.add("is-on");
    } else leader.classList.remove("is-on");

    // touch: the round handle on the chosen sofa (F1 may give a floor point as anchor.grab / anchor.floor)
    if (coarse && openStation === "couch" && sel) {
      var g = a.grab || a.floor || { x: a.x, y: a.y + 44 };
      grab.style.transform = "translate3d(" + Math.round(clamp(g.x, 30, W - 30) - pr.left) + "px," + Math.round(clamp(g.y, topY + 30, floorY - 30) - pr.top) + "px,0)";
      grab.classList.add("is-on");
    } else grab.classList.remove("is-on");
  }

  /* ---------- the frame ---------- */
  function onSelect(e) {
    if (!open || !e || !e.key) return;
    if (!piecesOf(openStation).some(function (p) { return p.key === e.key; })) return;
    if (e.key === sel) return;
    sel = e.key; lastSel[openStation] = sel;
    setMove(false);
    fill();
    interacted();
  }
  function hook(t) {
    hookedT = t;
    if (typeof t.on !== "function") return;
    call(function () { t.on("select", onSelect); });
    call(function () { t.on("change", function () { if (open) sync(); }); });
  }

  function frame() {
    raf = running ? requestAnimationFrame(frame) : 0;
    var t = T();
    if (t && t !== hookedT) hook(t);
    var st = t ? call(function () { return t.state(); }, null) : null;
    var ready = !!(st && st.ready);
    if (ready !== isLive) {
      isLive = ready;
      sec.classList.toggle("is-live", ready);
      hit.tabIndex = ready ? 0 : -1;
      if (!ready) closePanel();
    }

    var ar = sec.getBoundingClientRect(), H = innerHeight;
    var inNow = ar.top <= H * 0.3 && ar.bottom >= H * 0.7;
    if (inNow !== isIn) {
      isIn = inNow;
      sec.classList.toggle("is-in", inNow);
      if (inNow) requestAnimationFrame(placeThumb);
      else if (window.OrbitEngage) OrbitEngage.release("tour");
    }

    var w = where();
    if (w.station !== cur.station || w.phase !== cur.phase) {
      cur = { station: w.station, phase: w.phase };
      sec.setAttribute("data-station", w.station);
      sec.setAttribute("data-phase", w.phase);
    }
    var s = stepOf(w);
    if (s !== curStep) setStep(s);
    if (ready && w.station === "kitchen" && !lampsMixed) mixLamps();
    // leaving the act (round 9, review A4 + A5): after the kitchen stop. The kitchen beat ends 8vh before
    // the pin starts to move, and the camera's flight to the whole floor starts at that same moment
    // (stage-tour.js), so the sheet, the words and the step bar go exactly as the camera rises, before
    // anything could float up the screen, and there is never a kitchen frame without its UI
    var leaving = w.phase === "after";
    if (leaving !== sec.classList.contains("is-leaving")) sec.classList.toggle("is-leaving", leaving);
    var ln = lineOf(w, leaving);
    if (ln !== curLine) setLine(ln);
    // the overview words (round 9, handoff compare -> design + review C design 1): they come only once
    // the model is in (the stage fades it in while #design's top goes from 28 % to -5 % of the screen),
    // and at the end of the overview they fade quickly while lifting up, before the flight to the TV
    var d = (H / 2 - ar.top) / H;
    var ivIn = clamp((d - 0.56) / 0.16, 0, 1), ivOut = clamp((d - 1.12) / 0.18, 0, 1);
    // ... and only once the #compare viewer is fully above the nav (the stage waits for it too)
    if (compView) { var vb = compView.getBoundingClientRect().bottom; ivIn = Math.min(ivIn, clamp(((NAV - vb) / H - 0.2) / 0.14, 0, 1)); }
    var iv = Math.round(ivIn * (1 - ivOut) * 100) / 100, lift = Math.round(ivOut * 100) / 100;
    if (iv !== lastIntro) { lastIntro = iv; sec.style.setProperty("--intro", String(iv)); }
    if (lift !== lastLift) { lastLift = lift; sec.style.setProperty("--intro-lift", String(lift)); }

    // arrival: the stage's own k when it reports this stop, else the scroll position
    var k = w.phase === "hold" ? 1 : 0;
    if (w.phase === "hold" && st && st.station) k = st.station === w.station && typeof st.k === "number" ? st.k : 0;
    // the sheet stays open for the whole hold (review A9) and closes as the flight starts
    var want = ready && !leaving && w.phase === "hold" && w.station !== "overview" && k >= 0.9;
    if (want && open && openStation !== w.station) closePanel();
    if (want) {
      if (hideT) { clearTimeout(hideT); hideT = 0; }
      if (!open) openPanel(w.station);
    } else if (open && leaving) closePanel();
    else if (open && !hideT) hideT = setTimeout(closePanel, 150);
    if (t) layout(t);
    if (open && t) place(t);
    if (open) syncReal();

    // the one hint: once, at the first stop the visitor reaches with the 3D view ready
    // (round 9) not before the model and the overview words are fully in
    if (ready && !hintShown && !used && w.phase === "hold" && !leaving && (w.station !== "overview" || ivIn >= 1)) { hintShown = true; showHint(HINT_LOOK, 3600); }
  }

  function start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    closePanel();
    if (isIn) { isIn = false; sec.classList.remove("is-in"); }
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { if (en[0].isIntersecting) start(); else stop(); }, { rootMargin: "50% 0px 50% 0px" }).observe(sec);
  } else start();
  addEventListener("resize", placeThumb);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeThumb);

  /* ---------- the 3D view: keys, Ctrl + wheel / pinch zoom, buttons ---------- */
  function engage() { if (window.OrbitEngage) OrbitEngage.claim("scene", "tour", function () {}); }
  function zoomBy(k) {
    var v = view();
    if (!v || typeof v.zoom !== "function") return;
    var z = call(function () { return v.zoom(k); }, null);
    if (z && typeof z === "object") {
      viewEl.querySelector('[data-view-act="in"]').disabled = !!z.max;
      viewEl.querySelector('[data-view-act="out"]').disabled = !!z.min;
    }
  }
  hit.addEventListener("keydown", function (e) {
    var v = view();
    if (!isLive || !v || e.ctrlKey || e.metaKey || e.altKey) return;
    var big = e.shiftKey ? 2 : 1, key = e.key;
    if (key === "ArrowLeft") call(function () { v.orbit(-9 * big, 0); });
    else if (key === "ArrowRight") call(function () { v.orbit(9 * big, 0); });
    else if (key === "ArrowUp") call(function () { v.orbit(0, 4.5 * big); });
    else if (key === "ArrowDown") call(function () { v.orbit(0, -4.5 * big); });
    else if (key === "+" || key === "=") zoomBy(1.15);
    else if (key === "-" || key === "_") zoomBy(1 / 1.15);
    else if (key === "Home" || key === "0") call(function () { v.reset(); });
    else return;
    e.preventDefault();
    engage(); interacted();
  });
  hit.addEventListener("focus", function () { if (isLive && hit.matches(":focus-visible")) showHint(HINT_KEYS, 3000); });
  hit.addEventListener("pointerdown", function () { if (isLive) interacted(); }, { passive: true });
  hit.addEventListener("wheel", function (e) {
    if (!isLive) return;
    if (!(e.ctrlKey || e.metaKey)) {
      // a plain wheel scrolls the page; the first one tells how to zoom
      if (!wheelHinted && (cur.station !== "overview" || lastIntro >= 1)) { wheelHinted = true; showHint(HINT_ZOOM, 2500); }
      return;
    }
    e.preventDefault();
    zoomBy(clamp(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.06 : 0.0025)), 0.6, 1.6));
    interacted();
  }, { passive: false });
  var gScale = 1;   // Safari on a Mac: pinch comes as gesture events
  hit.addEventListener("gesturestart", function (e) { if (!isLive) return; e.preventDefault(); gScale = e.scale || 1; });
  hit.addEventListener("gesturechange", function (e) {
    if (!isLive) return;
    e.preventDefault();
    var s = e.scale || 1;
    zoomBy(clamp(s / gScale, 0.6, 1.6));
    gScale = s;
  });
  viewEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-view-act]"), v = view();
    if (!b || !v) return;
    var a = b.getAttribute("data-view-act");
    if (a === "in") zoomBy(1.2);
    else if (a === "out") zoomBy(1 / 1.2);
    else if (a === "reset") {
      call(function () { v.reset(); });
      viewEl.querySelectorAll("button").forEach(function (x) { x.disabled = false; });
      say("Back to the view of this stop.");
    }
    interacted();
  });

  // before the first frame: the panel is closed and out of the Tab order
  panel.inert = true;
  panel.setAttribute("aria-hidden", "true");
  setStep("overview");
})();
