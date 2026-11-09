/* Orbit story site (5 Nov 2026): the scroll story's brain (no 3D in here).
   - P = where you are in the story: chapter number + how far into it (0.00 .. 9.99), from the track blocks.
   - shows the words of the chapter, the rail (computers) and bar (phones), the pin, the drag line,
     and plays the design demo (cursor, furniture panel, light switch, paint, floors) from P, so scrolling
     back plays it backwards. "Try it yourself" hands the demo to the visitor.
   - js/story-3d.js reads window.OrbitStory (P, state) every frame and gives back screen spots
     (OrbitStory.spot(name) -> {x, y, w, h} in CSS px, or null).
   Chapters: 0 welcome, 1 outside, 2 3D model, 3 garden (drag line), 4 walk in, 5 furniture, 6 light, 7 paint,
   8 upstairs, 9 end. */
(function () {
  "use strict";
  var doc = document, win = window;
  var root = doc.querySelector("[data-story]");
  if (!root) return;
  var $ = function (s, r) { return (r || root).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); };
  var RM = win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)");
  var phone = function () { return win.innerWidth < 768; };
  // js/language.js translates text nodes by their English words (also ones made later), so English goes in
  var tr = function (en) { return en; };

  var chaps = $$("[data-chap]");
  var words = $$("[data-words]");
  var N = chaps.length;
  var NAMES = ["Welcome", "Outside", "3D model", "Garden", "Inside", "Design", "Light", "Paint", "Upstairs", "Explore"];

  /* ---------- state shared with the 3D ---------- */
  var S = {
    P: 0, at: 0, t: 0,
    wipe: 0.5,          // drag line: 0 = all scan, 1 = all model (part left of the line = model)
    wipeUser: false,
    table: "orig",      // "orig" | a piece id from STORY.pieces (slot "table")
    sofa: "orig",       // "orig" | a piece id from STORY.pieces (slot "sofa")
    slot: "table",      // the piece the panel is about (its box shows in the room): "table" | "sofa"
    light: true,        // true = all three lamps on (the "All lights" switch)
    lamps: [true, true, true],   // front ceiling lamp, back ceiling lamp, dining lamp (STORY.lamps)
    paint: null,        // null = the original wall, else "#rrggbb"
    floor: 0,           // 0 ground, 1 first (chapter 8)
    tryIt: false        // the visitor took over the design demo
  };
  var listeners = [];
  var api = win.OrbitStory = {
    state: S,
    onChange: function (fn) { listeners.push(fn); },
    spot: function () { return null; },        // replaced by js/story-3d.js
    phone: phone,
    reduced: function () { return !!(RM && RM.matches); }
  };
  function changed(what) { listeners.forEach(function (fn) { try { fn(what, S); } catch (e) { console.warn(e); } }); }
  function set(k, v) { if (S[k] === v) return; S[k] = v; changed(k); }

  /* ---------- rail + bar ---------- */
  var rail = $("[data-rail]"), bar = $("[data-bar]");
  var railLinks = [], barBits = [];
  for (var i = 1; i < N - 1; i++) {
    var a = doc.createElement("a");
    a.href = "#c" + i; a.setAttribute("data-jump", String(i));
    a.innerHTML = "<em></em><b></b>";
    a.querySelector("em").textContent = tr(NAMES[i]);
    a.setAttribute("aria-label", tr(NAMES[i]));
    rail.appendChild(a); railLinks.push(a);
    var b = doc.createElement("b"); b.innerHTML = "<i></i>"; bar.appendChild(b); barBits.push(b);
  }

  /* ---------- where are we ---------- */
  var tops = [], lens = [];
  function measure() {
    var y = win.scrollY || win.pageYOffset || 0;
    tops = chaps.map(function (c) { return c.getBoundingClientRect().top + y; });
    lens = chaps.map(function (c) { return Math.max(1, c.offsetHeight); });
    // the last block is 100svh longer: the stage scrolls away during that part (story.css)
    lens[N - 1] = Math.max(1, lens[N - 1] - win.innerHeight);
  }
  // chapter k plays while the top of the screen goes from the top of its block to the top of the next one
  function progress() {
    var y = win.scrollY || win.pageYOffset || 0, P = 0;
    for (var k = 0; k < N; k++) if (y >= tops[k] - 1 || k === 0) P = k + Math.min(0.9999, Math.max(0, (y - tops[k]) / lens[k]));
    return Math.max(0, Math.min(N - 0.0001, P));
  }

  var lastAt = -1, raf = 0;
  function frame() {
    raf = 0;
    var P = progress();
    S.P = P; S.at = Math.floor(P); S.t = P - S.at;
    if (S.at !== lastAt) {
      lastAt = S.at;
      root.setAttribute("data-at", String(S.at));
      // .is-past = a chapter already read: its words leave upward (story.css), the next ones rise in from below
      words.forEach(function (w) { var k = +w.getAttribute("data-words"); w.classList.toggle("is-on", k === S.at); w.classList.toggle("is-past", k < S.at); });
      root.setAttribute("data-low", S.at === 3 || S.at === 8 ? "1" : "0");   // phones: the drag line handle / the house need the middle
      railLinks.forEach(function (a, k) { a.classList.toggle("is-on", k + 1 === S.at); a.classList.toggle("is-done", k + 1 < S.at); if (k + 1 === S.at) a.setAttribute("aria-current", "step"); else a.removeAttribute("aria-current"); });
      barBits.forEach(function (b, k) { b.classList.toggle("is-done", k + 1 < S.at); });
      if (S.at !== 5) S.tryIt = false;
      changed("at");
    }
    barBits.forEach(function (b, k) { b.style.setProperty("--k", k + 1 === S.at ? S.t.toFixed(3) : "0"); });
    demo(S.at, S.t);
    if (api.onFrame) api.onFrame(S);
  }
  function ask() { if (!raf) raf = requestAnimationFrame(frame); }
  api.ask = ask;
  win.addEventListener("scroll", ask, { passive: true });
  win.addEventListener("resize", function () { measure(); ask(); });
  win.addEventListener("load", function () { measure(); ask(); });

  // jump links: scroll to the start of a chapter (a little into it, so its words are up)
  root.addEventListener("click", function (e) {
    var j = e.target.closest && e.target.closest("[data-jump]");
    if (!j) return;
    var k = +j.getAttribute("data-jump");
    if (!(k >= 0 && k < N)) return;
    e.preventDefault();
    measure();
    var y = k === 0 ? 0 : tops[k] + lens[k] * 0.06;
    win.scrollTo({ top: y, behavior: api.reduced() ? "auto" : "smooth" });
  });

  /* ---------- the pin over the house ---------- */
  var pin = $("[data-pin]");

  /* ---------- drag line ---------- */
  var wipe = $("[data-wipe]"), line = $("[data-wipe-line]");
  function wipeTo(x) {
    x = Math.max(0.04, Math.min(0.96, x));
    S.wipe = x;
    wipe.style.setProperty("--x", x.toFixed(4));
    line.setAttribute("aria-valuenow", String(Math.round(x * 100)));
    changed("wipe");
  }
  (function () {
    var drag = false;
    line.addEventListener("pointerdown", function (e) { drag = true; S.wipeUser = true; line.classList.add("is-drag"); line.setPointerCapture(e.pointerId); wipeTo(e.clientX / win.innerWidth); e.preventDefault(); });
    line.addEventListener("pointermove", function (e) { if (drag) wipeTo(e.clientX / win.innerWidth); });
    var up = function () { drag = false; line.classList.remove("is-drag"); };
    line.addEventListener("pointerup", up); line.addEventListener("pointercancel", up);
    line.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowLeft" ? -0.05 : e.key === "ArrowRight" ? 0.05 : 0;
      if (!d) return; e.preventDefault(); S.wipeUser = true; wipeTo(S.wipe + d);
    });
  })();

  /* ---------- the design demo ---------- */
  var cursor = $("[data-cursor]"), box = $("[data-box]"), boxTag = $("[data-box-tag]");
  var pFurn = $('[data-panel="furniture"]'), pPaint = $('[data-panel="paint"]');
  var tiles = $("[data-tiles]"), swatches = $("[data-swatches]"), toast = $("[data-toast]");
  var sw = $("[data-switch]"), floors = $("[data-floors]"), look = $("[data-look]");
  var D = win.STORY || {};
  var PIECES = D.pieces || [];
  var COLOURS = D.colours || [];
  var DEMO_PIECE = D.demoPiece || (PIECES[0] && PIECES[0].id);
  var DEMO_COLOURS = D.demoColours || [];

  var SLOTS = D.slots || {};
  var slotName = $("[data-slot-name]"), slotRoom = $("[data-slot-room]"), chips = $$("[data-cat]");
  var cat = "all";
  PIECES.forEach(function (p) {
    var t = doc.createElement("button");
    t.type = "button"; t.className = "sd-tile"; t.setAttribute("data-piece", p.id); t.setAttribute("data-slot", p.slot);
    t.innerHTML = '<img alt="" loading="lazy" decoding="async"><b></b><small></small>';
    t.querySelector("img").src = p.thumb;
    t.querySelector("b").textContent = tr(p.name);
    var s = t.querySelector("small");
    // two text parts, so js/language.js can translate "fits" on its own
    if (p.fits === false) s.textContent = tr(p.note);
    else { s.appendChild(doc.createTextNode(p.size + " · ")); s.appendChild(doc.createElement("span")).textContent = tr("fits"); }
    if (p.fits === false) s.classList.add("is-big");
    t.addEventListener("click", function () {
      S.tryIt = true; hideCursor();
      setSlot(p.slot);
      if (p.fits === false) { showToast(tr("Too big for this spot"), false); return; }
      pick(p.id, true);
    });
    tiles.appendChild(t);
  });
  // the tabs: All / Sofas / Tables. A tab shows its pieces and points the box at that piece in the room
  chips.forEach(function (c) {
    var k = c.getAttribute("data-cat");
    c.querySelector("i").textContent = PIECES.filter(function (p) { return k === "all" || p.slot === k; }).length;
    c.addEventListener("click", function () {
      S.tryIt = true; hideCursor();
      cat = k; if (k !== "all") setSlot(k);
      showCat();
    });
  });
  function showCat() {
    chips.forEach(function (c) { c.setAttribute("aria-selected", c.getAttribute("data-cat") === cat ? "true" : "false"); });
    $$(".sd-tile", tiles).forEach(function (t) { t.hidden = !(cat === "all" || t.getAttribute("data-slot") === cat); });
  }
  function setSlot(k) {
    if (!SLOTS[k]) return;
    if (S.slot !== k) { S.slot = k; changed("slot"); }
    // only rewritten when it changes, so js/language.js keeps its translation
    if (slotName._k !== k) { slotName._k = k; slotName.textContent = tr(SLOTS[k].name); slotRoom.textContent = tr(SLOTS[k].room); }
  }
  setSlot("table"); showCat();
  COLOURS.forEach(function (c) {
    var b = doc.createElement("button");
    b.type = "button"; b.className = "sd-sw"; b.setAttribute("data-colour", c.hex || "orig");
    b.innerHTML = "<i></i><b></b>";
    b.querySelector("i").style.setProperty("--c", c.hex || "repeating-linear-gradient(45deg,#2b2e34 0 6px,#1b1d21 6px 12px)");
    b.querySelector("b").textContent = tr(c.name);
    b.addEventListener("click", function () { userAt7 = true; hideCursor(); set("paint", c.hex || null); mark(); });
    swatches.appendChild(b);
  });
  // phones: the paint sheet shows one row of colours; swipe its grab bar up (or tap "More colours") to see all,
  // swipe down to make it small again (James, 5 Nov)
  // 7 Nov (James: "can I not adjust this?"): the furniture sheet works the same way (one row, swipe up for all)
  function sheet(panel, labels) {
    var grab = $("[data-grab]", panel), more = $("[data-more]", panel);
    function open(on) {
      panel.classList.toggle("is-open", on);
      grab.setAttribute("aria-expanded", on ? "true" : "false"); more.setAttribute("aria-expanded", on ? "true" : "false");
      grab.setAttribute("aria-label", on ? labels[1] : labels[0]);
    }
    more.addEventListener("click", function () { open(!panel.classList.contains("is-open")); });
    var y0 = null, moved = false;
    grab.addEventListener("pointerdown", function (e) { y0 = e.clientY; moved = false; try { grab.setPointerCapture(e.pointerId); } catch (_) {} });
    grab.addEventListener("pointermove", function (e) {
      if (y0 === null) return;
      var dy = e.clientY - y0;
      if (dy < -18) { open(true); moved = true; y0 = e.clientY; }
      else if (dy > 18) { open(false); moved = true; y0 = e.clientY; }
    });
    function end() { y0 = null; }
    grab.addEventListener("pointerup", end); grab.addEventListener("pointercancel", end);
    grab.addEventListener("click", function () { if (!moved) open(!panel.classList.contains("is-open")); moved = false; });
    return open;
  }
  var paintOpen = sheet(pPaint, ["Show all colours", "Show fewer colours"]);
  var furnOpen = sheet(pFurn, ["Show all pieces", "Show fewer pieces"]);
  var undoBtn = null;
  // pick a piece (or "orig" = the real one back) for a slot (default: the piece's own slot, else the panel's)
  function pick(id, user, slot) {
    var p = PIECES.filter(function (x) { return x.id === id; })[0];
    var k = slot || (p ? p.slot : S.slot);
    var was = S[k];
    set(k, id);
    mark();
    if (id !== "orig" && id !== was) {
      showToast(tr(SLOTS[k].name + " swapped for") + " " + (p ? tr(p.name) : ""), true, k);
    } else if (id === "orig") hideToast();
  }
  function mark() {
    $$(".sd-tile", tiles).forEach(function (t) { var id = t.getAttribute("data-piece"); t.classList.toggle("is-on", id === S.table || id === S.sofa); });
    $$(".sd-sw", swatches).forEach(function (b) { b.classList.toggle("is-on", (b.getAttribute("data-colour") === "orig" ? null : b.getAttribute("data-colour")) === S.paint); });
    sw.setAttribute("aria-pressed", S.lamps.some(Boolean) ? "true" : "false");
    lampBtns.forEach(function (b) { b.setAttribute("aria-pressed", S.lamps[+b.getAttribute("data-lamp")] ? "true" : "false"); });
    $$("[data-fl]", floors).forEach(function (f) { f.classList.toggle("is-on", +f.getAttribute("data-fl") === S.floor); });
  }
  // a small pop-up at the bottom of the screen, gone after 2 seconds (James 5 Nov night: "reduce the time of the undo
  // button, a small pop up at the bottom")
  function showToast(text, withUndo, slot) {
    toast.innerHTML = "";
    toast.appendChild(doc.createElement("span")).textContent = text;
    if (withUndo) {
      undoBtn = doc.createElement("button"); undoBtn.type = "button"; undoBtn.textContent = tr("Undo");
      undoBtn.addEventListener("click", function () { S.tryIt = true; hideCursor(); pick("orig", true, slot); });
      toast.appendChild(undoBtn);
    }
    toast.hidden = false; toast.classList.add("is-on");
    clearTimeout(showToast.t); showToast.t = setTimeout(hideToast, 2000);
  }
  function hideToast() { toast.classList.remove("is-on"); }
  function vis(el, on) { if (on) { el.hidden = false; el.classList.add("is-on"); } else el.classList.remove("is-on"); }

  // the cursor glides to a point; taps once when `tap` changes
  var cur = { x: 0, y: 0, on: false, tapKey: "" };
  function moveCursor(x, y) { cur.x = x; cur.y = y; cursor.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)"; if (!cur.on) { cur.on = true; cursor.classList.add("is-on"); } }
  function hideCursor() { if (cur.on) { cur.on = false; cursor.classList.remove("is-on"); } }
  function tap(key) { if (cur.tapKey === key) return; cur.tapKey = key; cursor.classList.remove("is-tap"); void cursor.offsetWidth; cursor.classList.add("is-tap"); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function ease(k) { k = Math.max(0, Math.min(1, k)); return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function seg(t, a, b) { return Math.max(0, Math.min(1, (t - a) / (b - a))); }
  function centre(el) { var r = el.getBoundingClientRect(), s = root.querySelector("[data-stage]").getBoundingClientRect(); return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 }; }
  function path(from, to, k) { k = ease(k); return { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) - Math.sin(k * Math.PI) * 40 }; }
  var userAt6 = false, userAt7 = false;
  api.hideCursor = hideCursor;
  // lamps: tap a lamp (its ring) to switch it; the switch switches all three
  var lampBtns = $$("[data-lamp]");
  function setLamps(list) {
    var same = list.every(function (v, i) { return v === S.lamps[i]; });
    if (same) return;
    S.lamps = list.slice(); S.light = list.every(Boolean); changed("lamps"); mark();
  }
  lampBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      userAt6 = true; hideCursor();
      var i = +b.getAttribute("data-lamp"), l = S.lamps.slice(); l[i] = !l[i]; setLamps(l);
    });
  });
  sw.addEventListener("click", function () { userAt6 = true; hideCursor(); var on = !S.lamps.some(Boolean); setLamps([on, on, on]); });
  $("[data-try]").addEventListener("click", function () {
    S.tryIt = true; hideCursor();
    var first = tiles.querySelector(".sd-tile"); if (first) first.focus({ preventScroll: true });
  });

  function rest() { var w = win.innerWidth, h = win.innerHeight; return { x: w * (phone() ? 0.78 : 0.62), y: h * (phone() ? 0.42 : 0.7) }; }

  function demo(at, t) {
    var W = win.innerWidth, H = win.innerHeight;
    // pin over the house: chapter 1, second half
    var ps = api.spot("house");
    var pinOn = at === 1 && t > 0.55 && ps;
    if (pinOn) { pin.style.transform = "translate(" + Math.round(ps.x) + "px," + Math.round(ps.y) + "px) translate(-50%,-100%)"; }
    pin.classList.toggle("is-on", !!pinOn);

    // drag line: chapter 3; it sweeps by itself from the right to the middle unless the visitor took it
    // 5 Nov late (James: "appear from the right, go to the middle, then when the user scrolls further just disappear"):
    // it follows the gliding camera (S.Pcam), not the raw scroll, so a mouse wheel does not make it jump. Once the
    // camera stands on the patio the line comes in from the right edge and glides to the middle; scrolling on, the
    // line fades away and the 3D side melts into the real scan (S.cutFade, story-3d.js), on into "Walk in".
    var tc = at === 3 ? clamp01((S.Pcam != null ? S.Pcam : S.P) - 3) : t;
    var wOn = at === 3 && tc > 0.34 && tc < 0.78;
    vis(wipe, wOn);
    if (at === 3 && !S.wipeUser) wipeTo(lerp(0.97, 0.5, ease(seg(tc, 0.36, 0.6))));
    var cf = at === 3 ? ease(seg(tc, 0.76, 0.94)) : at > 3 ? 1 : 0;
    if (S.cutFade !== cf) { S.cutFade = cf; changed("cutFade"); }
    if (at !== 3) S.wipeUser = false;
    if (at !== 3 && S.wipe !== 0.5 && at > 3) { /* past the garden: the 3D chooses by itself */ }

    // chapter 5: furniture
    var furn = at === 5;
    root.setAttribute("data-demo", furn || at === 6 || at === 7 ? "1" : "0");
    // (5 Nov evening) the camera arrives at the sofa later (5.26) and the scan melts to 3D after it: the demo starts later
    var showPanel = furn && (S.tryIt || t > 0.48);
    vis(pFurn, showPanel);
    if (!showPanel && pFurn.classList.contains("is-open")) furnOpen(false);   // small again next time
    if (showPanel) {   // one row when small: the height of the first piece shown
      var ft = tiles.querySelector(".sd-tile:not([hidden])"), rh = ft ? ft.offsetHeight : 0;
      if (rh && rh !== furnOpen.row) { furnOpen.row = rh; tiles.style.setProperty("--row", rh + "px"); }
    }
    var bs = furn && (S.tryIt || t > 0.48) ? api.spot(S.slot) : null;
    if (bs) {
      box.style.transform = "translate(" + Math.round(bs.x - bs.w / 2) + "px," + Math.round(bs.y - bs.h / 2) + "px)";
      box.style.width = Math.round(bs.w) + "px"; box.style.height = Math.round(bs.h) + "px";
      var p = PIECES.filter(function (x) { return x.id === S[S.slot]; })[0], sl = SLOTS[S.slot];
      // only rebuilt when the piece changes; the name sits in its own node so language.js can translate it
      var tagKey = S.slot + ":" + (p ? p.id : "-");
      if (boxTag._k !== tagKey) {
        boxTag._k = tagKey; boxTag.textContent = "";
        boxTag.appendChild(doc.createElement("span")).textContent = p ? tr(p.name) : tr(sl.name);
        boxTag.appendChild(doc.createTextNode(" · " + (p ? p.size : sl.size)));
        box.classList.toggle("is-fixed", !sl.drag);   // only the table can be dragged: no "Drag to move" on the sofa
      }
      // keep the label on the screen: inside the left / right edge, and inside the box when the box reaches the top bar
      var tagEl = boxTag.parentNode, tw = tagEl.offsetWidth, th = tagEl.offsetHeight, bl = bs.x - bs.w / 2, bt = bs.y - bs.h / 2;
      var cx = Math.max(8 + tw / 2, Math.min(W - 8 - tw / 2, bl + bs.w / 2)) - bl;
      var navH = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue("--nav-h")) || 70;
      tagEl.style.left = Math.round(cx) + "px";
      // above the box, unless that hits the top bar or the chapter words: then at the bottom, inside the box
      var wordsEl = root.querySelector(".chap.is-on"), wb = 0;
      if (wordsEl && phone()) { var wr = wordsEl.getBoundingClientRect(), sr = root.querySelector("[data-stage]").getBoundingClientRect(); wb = wr.bottom - sr.top; }
      var tagTop = bt - th - 10;
      tagEl.style.top = tagTop < Math.max(navH + 26, wb + 6) ? Math.round(Math.max(10, bs.h - th - 10)) + "px" : "";
    }
    box.classList.toggle("is-on", !!bs);
    if (furn && !S.tryIt) {
      if (S.slot !== "table") setSlot("table");
      var tableAt = api.spot("table") || { x: W * 0.55, y: H * 0.65 };
      var tile = tiles.querySelector('[data-piece="' + DEMO_PIECE + '"]');
      var tileAt = tile && showPanel ? centre(tile) : { x: W * 0.85, y: H * 0.5 };
      if (t < 0.3) hideCursor();
      else if (t < 0.46) { var q = path(rest(), tableAt, seg(t, 0.3, 0.46)); moveCursor(q.x, q.y); }
      else if (t < 0.58) { moveCursor(tableAt.x, tableAt.y); if (t > 0.48) tap("table"); }
      else if (t < 0.72) { var q2 = path(tableAt, tileAt, seg(t, 0.58, 0.72)); moveCursor(q2.x, q2.y); }
      else { moveCursor(tileAt.x, tileAt.y); }
      var want = t >= 0.74 ? DEMO_PIECE : "orig";
      if (t >= 0.74) tap("tile");
      if (S.table !== want) pick(want, false, "table");
      if (t < 0.46) cur.tapKey = "";
      if (want === "orig") hideToast();
    } else if (!furn && at !== 5) {
      if (at < 5) {   // back before the furniture: the real pieces again, panel back to the start
        if (S.table !== "orig") pick("orig", false, "table");
        if (S.sofa !== "orig") pick("orig", false, "sofa");
        if (cat !== "all" || S.slot !== "table") { cat = "all"; setSlot("table"); showCat(); }
      }
    }

    // chapter 6: the lamps. Tap rings sit on the three lamps; the cursor switches the ceiling lamp off, then the
    // dining lamp, then all on again with the switch (5 Nov evening, James: "click the light to turn on or off")
    var lampsOn = at === 6 && t > 0.28;
    vis(sw, at === 6 && t > 0.12);
    var lampAt = [];
    lampBtns.forEach(function (b, i) {
      var s = lampsOn ? api.spot("lamp" + i) : null;
      var onScreen = s && s.x > 8 && s.x < W - 8 && s.y > 8 && s.y < H - 8;
      if (onScreen) { b.style.transform = "translate(" + Math.round(s.x) + "px," + Math.round(s.y) + "px) translate(-50%,-50%)"; lampAt[i] = s; }
      vis(b, !!onScreen);
    });
    if (at === 6 && !userAt6) {
      var swAt = centre(sw), l0 = lampAt[0] || rest(), l2 = lampAt[2] || l0;
      if (t < 0.3) hideCursor();
      else if (t < 0.46) { var q3 = path(rest(), l0, seg(t, 0.3, 0.46)); moveCursor(q3.x, q3.y); }
      else if (t < 0.54) moveCursor(l0.x, l0.y);
      else if (t < 0.64) { var q6 = path(l0, l2, seg(t, 0.54, 0.64)); moveCursor(q6.x, q6.y); }
      else if (t < 0.72) moveCursor(l2.x, l2.y);
      else if (t < 0.82) { var q7 = path(l2, swAt, seg(t, 0.72, 0.82)); moveCursor(q7.x, q7.y); }
      else moveCursor(swAt.x, swAt.y);
      if (t >= 0.48) tap(t >= 0.84 ? "sw" : t >= 0.66 ? "l2" : "l0");
      var allOn = t >= 0.84 || t < 0.48;
      setLamps([allOn, true, allOn || t < 0.66]);
    }
    if (at !== 6) { userAt6 = false; if (!S.lamps.every(Boolean)) setLamps([true, true, true]); }

    // chapter 7: paint
    var paintOn = at === 7 && t > 0.2;
    vis(pPaint, paintOn);
    if (!paintOn && pPaint.classList.contains("is-open")) paintOpen(false);   // small again next time
    if (at === 7 && !userAt7) {
      var c1 = swatches.querySelector('[data-colour="' + (DEMO_COLOURS[0] || "") + '"]'), c2 = swatches.querySelector('[data-colour="' + (DEMO_COLOURS[1] || "") + '"]');
      var a1 = c1 && paintOn ? centre(c1) : rest(), a2 = c2 && paintOn ? centre(c2) : rest();
      if (t < 0.3) hideCursor();
      else if (t < 0.44) { var q4 = path(rest(), a1, seg(t, 0.3, 0.44)); moveCursor(q4.x, q4.y); }
      else if (t < 0.6) moveCursor(a1.x, a1.y);
      else if (t < 0.72) { var q5 = path(a1, a2, seg(t, 0.6, 0.72)); moveCursor(q5.x, q5.y); }
      else moveCursor(a2.x, a2.y);
      var col = t >= 0.74 ? DEMO_COLOURS[1] : t >= 0.46 ? DEMO_COLOURS[0] : null;
      if (t >= 0.46) tap(t >= 0.74 ? "c2" : "c1");
      if (S.paint !== (col || null)) { set("paint", col || null); mark(); }
    }
    if (at < 7 && S.paint) { userAt7 = false; set("paint", null); mark(); }
    if (at !== 7) userAt7 = false;

    // chapter 8: floors. (7 Nov, James) the Ground / 1st / 2nd pill is no longer shown: it looked like buttons that did
    // nothing. The floors still drop in by themselves. To bring it back: vis(floors, at === 8 && t > 0.1);
    vis(floors, false);
    // all three floors (5 Nov evening): the 1st lands at 8.4, the 2nd at 8.62
    var fl = at > 8 ? 2 : at === 8 ? (t > 0.7 ? 2 : t > 0.45 ? 1 : 0) : 0;
    if (S.floor !== fl) { set("floor", fl); mark(); }

    // "drag to look around": shown once a chapter while the picture stands still, on computers and phones
    look.classList.toggle("is-on", (at === 1 || at === 4) && t > 0.35 && t < 0.8 && !api.looked);

    if (!(at === 5 && !S.tryIt && t >= 0.3) && !(at === 6 && !userAt6 && t >= 0.3) && !(at === 7 && !userAt7 && t >= 0.3)) hideCursor();
    if (at !== 5 && toast.classList.contains("is-on")) hideToast();   // the toast belongs to its own chapter
  }
  mark();
  measure(); frame();

})();
