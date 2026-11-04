/* Orbit 3D - the station tour (#design) and the whole floor (#floor). CONTRACT 8.3, owner F1.
   Runs on the shared stage of js/stage.js (OrbitStage._core): the ONE house and the ONE
   in-memory design (core.design), so every change shows in card B of #scan, the tour and
   the floor alike. The points behind are fully hidden through both acts (OrbitSpace.dim
   toward 0 as the model fades in, back to 1 only after the floor's exit).

   Beats (F2 writes them, any numbers):
     #design  [data-stage="tour" data-station="overview|tv|couch|kitchen" data-phase="travel|hold"]
     #floor   [data-stage="floor" data-phase="arrive|explore|return|exit"]
   The camera is a function of the scroll position (+ one visitor offset):
     path slots  0 overview hold | 1 travel, 2 hold TV | 3 travel, 4 hold couch | 5 travel, 6 hold kitchen
                 7 floor arrive (kitchen -> floorRef) | 8 explore | 9 return | 10 exit
   Travel = a flight scrubbed by scroll (smoothstep; a rise over long flights, never through
   the walls). Hold = parked at the station pose; drag = a wide cone (stops: yaw TV +-40, couch +-75, kitchen +-50 deg, pitch
   -12..+22 deg, dolly 0.7..1.4; overview: yaw +-35, pitch +-10, 0.8..1.25), Ctrl/Cmd + wheel,
   pinch, +/-. Walls and pieces that get between the camera and the stop go low / invisible
   (H.cutaway "all", design.clear). The plain wheel always
   scrolls the page (no wheel handler unless Ctrl/Cmd is held). Scrolling >= 24 px after the
   last input eases the view back to the station (~0.7 s); leaving a hold always starts the
   flight from the station pose (envelope). Floor: wider cone (yaw 360, pitch 20..70 deg,
   0.7..1.4); scrolling down returns the view to floorRef FIRST (time ease + the fixed
   return band), the exit only plays once it is back (exit gate), forward and back alike.
   Reduced motion: no flights (cuts with a 200 ms dip), no inertia, no drift.
   Furniture: tap a piece to choose it; mouse / pen: press ON the chosen piece to move it,
   touch: only from a .stage-hit[data-grab] handle (F2 draws it at tour.handle()).

   window.OrbitStage.tour  (exists at once, no-op until ready)
     stations() -> [{id, label}]
     state() -> {station, phase, k, ready}
     anchor(id) -> {x, y, visible} | null     CSS px, top of the station's main (or chosen) piece
     pieces(stationId) -> [{key, name, movable}]
     select(key|null), selected() -> key|null
     options(key) -> [{id, name, thumb, w}]   curated swaps, "original" first (thumb null until library.js is in)
     swap(key, id) -> Promise                 "original" restores the real piece
     move(key, dx, dz)   metres on the floor relative to the view: +dx = to the right on screen,
                         +dz = toward the camera (down on screen), -dz = away (F2: ArrowUp); kept in the room
     anchor(id) also carries .rect {left, top, right, bottom} (the piece on screen), .grab {x, y} (floor
                         point of a movable piece: the touch Move handle) and .key (the piece it marks)
     view.zoom(k) returns {zoom, min, max} (min / max = at the limit)
     turn(key, deg)      (+ = counter-clockwise seen from above), restore(key)
     paint(hex|null), paints() -> [{hex, name}]     living room interior walls
     lights(on), lightsOn()                         kitchen lamps (all)
     lamps() -> [{key, name, on, x, y, visible}]    each kitchen lamp + its spot on screen (CSS px)
     lamp(key, on)                                  one lamp
     reset()             starting arrangement + colours + lights on + the station view
     view: { zoom(k) (k > 1 = closer), reset(), orbit(dYaw, dPitch) (DEGREES; |v| < 1 is read as radians) }
     on(evt, fn)         "ready", "arrive" {station}, "leave" {station}, "select" {key}, "change" {what, key?}
     extras (not in 8.3): rect(key) -> [x0, y0, x1, y1] | null, handle() -> {x, y, visible} | null
                          (floor point of the chosen movable piece: the touch Move handle),
                          area(rect|null) the free part of the screen for the overview / floor fit,
                          live() -> bool (the scene takes input now)
   window.OrbitStage.floor = { view: {zoom, reset, orbit}, on("ready"|"returned"|"interact"), live() }
   Debug / tests: OrbitStage.tour._debug(). */
(function () {
  "use strict";
  var win = window, doc = document;
  var api = win.OrbitStage = win.OrbitStage || {};

  function emitter() {
    var h = {};
    return {
      on: function (e, fn) { (h[e] = h[e] || []).push(fn); return function () { h[e] = (h[e] || []).filter(function (f) { return f !== fn; }); }; },
      emit: function (e, d) { (h[e] || []).slice().forEach(function (fn) { try { fn(d); } catch (err) { console.warn("[tour] handler", err); } }); }
    };
  }
  var tEv = emitter(), fEv = emitter();

  /* ---------- the curated stations (no place names; plain words) ---------- */
  var STATIONS = [
    { id: "overview", label: "Overview", pieces: [] },
    { id: "tv", label: "TV", pieces: ["tv", "sideboard"] },
    { id: "couch", label: "Couch", pieces: ["sofa", "ottoman"] },
    { id: "kitchen", label: "Kitchen", pieces: [] }
  ];
  var MAIN = { tv: "tv", couch: "sofa" };
  // pieces hidden (never removed) while the camera is at a stop: they only get in the way there (node index)
  var HIDE_AT = { 1: ["living_room__Arc floor lamp"] };
  // walls that stay full height at a stop (node index), whatever the cutaway would do (3 Nov, James: the wall
  // behind the TV is the one you paint at the TV stop, so it must stay up there)
  var KEEP_AT = { 1: ["wall__W-north-living_0_0"] };
  var PLAY_ROOM = "living_room", LIGHT_ROOM = "kitchen";
  // plain names for the kitchen's lamps (lights.json names, numbers already dropped)
  var LAMP_NAME = { "Linear pendant": "Pendant", "Floating shelf": "Shelf lights", "Ceiling spots": "Ceiling spots" };
  // options: real library pieces at their true size; "original" = the piece of the scan
  var PIECES = {
    tv: { node: "living_room__TV", name: "TV", movable: false, opts: [
      { id: "original", name: "Large TV" },
      { id: "other-bunk-tv-0073", name: "Slim TV" },
      { id: "bed-bedroom-tv-0708", name: "TV on a stand" }] },
    sideboard: { node: "living_room__TV sideboard", name: "TV cabinet", movable: false, opts: [
      { id: "original", name: "Low cabinet" },
      { id: "cabinet-tv-sideboard-2b8b", name: "Wood cabinet" },
      { id: "cabinet-white-cabinet-1027", name: "White drawers" }] },
    sofa: { node: "living_room__Corner sofa", name: "Sofa", movable: true, opts: [
      { id: "original", name: "Corner sofa" },
      { id: "sofa-lounge-sofa-2102", name: "L-shaped sofa" },
      { id: "sofa-sofa-bed-under-the-bunk-3615", name: "Sofa bed" },
      { id: "chair-armchair-00be", name: "Armchair" }] },
    ottoman: { node: "living_room__Ottoman with red throw", name: "Ottoman", movable: true, opts: [
      { id: "original", name: "Ottoman" }] }
  };
  var PAINTS = [
    { hex: "#f1ece2", name: "Warm white" },
    { hex: "#d8c7a6", name: "Sand" },
    { hex: "#a9b89f", name: "Sage" },
    { hex: "#9fb9cf", name: "Sky blue" },
    { hex: "#c8876a", name: "Terracotta" },
    { hex: "#55595f", name: "Charcoal" }
  ];
  // defaults = js/film.js round 8 keys (the film file wins)
  var POSE_DEF = {
    roomView: { eye: [7.06, 10.16, 9.65], target: [3.37, 0.7, 3.25], fov: 40 },
    tourTv: { eye: [3.9, 2.05, 5.2], target: [2.6, 1.0, 0.9], fov: 50 },
    // round 9 (review A10): phones see the TV wall from higher up and further back, so the TV, its
    // cabinet, the floor and the side walls fill the tall screen (no black band over a dark slab)
    tourTvPhone: { eye: [3.5, 2.35, 5.65], target: [2.75, 0.0, 1.4], fov: 50 },
    tourCouch: { eye: [3.4, 4.9, 0.3], target: [2.5, 0.2, 3.8], fov: 52 },
    tourKitchen: { eye: [15.5, 2.0, 5.4], target: [13.6, 1.1, 2.0], fov: 55 },
    // phones (tall and narrow): further back, so the pendant, the shelf and the spots all fit the view
    tourKitchenPhone: { eye: [13.0, 2.0, 5.0], target: [14.0, 1.2, 1.8], fov: 55 },
    floorRef: { eye: [16.5, 22.0, 19.0], target: [10.7, 0.4, 3.25], fov: 40 },
    floorRefPhone: { eye: [23.85, 21.1, 8.03], target: [10.7, 0.4, 3.25], fov: 40 }
  };
  var NODE_POSE = ["roomView", "tourTv", "tourCouch", "tourKitchen", "floorRef"];

  /* ---------- small maths ---------- */
  var D2R = Math.PI / 180;
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function easeIO(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function follow(cur, to, tau, dt) { return tau <= 0 ? to : cur + (to - cur) * (1 - Math.exp(-dt / tau)); }
  function v3(a) { return [a[0], a[1], a[2]]; }
  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function lerp3(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }
  function len3(a) { return Math.hypot(a[0], a[1], a[2]); }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm3(v) { var l = len3(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function ok3(a) { return Array.isArray(a) && a.length >= 3 && isFinite(a[0]) && isFinite(a[1]) && isFinite(a[2]); }
  function sph(eye, tgt) { var d = sub3(eye, tgt), r = len3(d) || 1; return { az: Math.atan2(d[0], d[2]), el: Math.asin(clamp(d[1] / r, -1, 1)), r: r }; }
  function fromSph(tgt, az, el, r) { return [tgt[0] + r * Math.cos(el) * Math.sin(az), tgt[1] + r * Math.sin(el), tgt[2] + r * Math.cos(el) * Math.cos(az)]; }
  function degIn(v) { v = +v || 0; return Math.abs(v) < 1 ? v : v * D2R; }

  /* ---------- the public APIs exist at once ---------- */
  var tour = {}, floor = { view: {} };
  api.tour = tour; api.floor = floor;
  var core = api._core || null;
  function noop() { return null; }
  function stub() {
    tour.stations = function () { return STATIONS.map(function (s) { return { id: s.id, label: s.label }; }); };
    tour.state = function () { return { station: null, phase: null, k: 0, ready: false }; };
    ["anchor", "rect", "handle", "selected", "select", "move", "turn", "restore", "paint", "lights", "lamp", "reset", "area"].forEach(function (k) { tour[k] = noop; });
    tour.lamps = function () { return []; };
    tour.real = function () { return false; };
    tour.realState = function () { return { on: false, k: 0, ok: false }; };
    tour.pieces = function (id) { return piecesOf(id); };
    tour.options = function (key) { return optionsOf(key); };
    tour.swap = function () { return Promise.reject(new Error("stage not ready")); };
    tour.paints = function () { return PAINTS.map(function (p) { return { hex: p.hex, name: p.name }; }); };
    tour.lightsOn = function () { return true; };
    tour.live = function () { return false; };
    tour.view = { zoom: noop, reset: noop, orbit: noop };
    tour.on = tEv.on;
    floor.view = { zoom: noop, reset: noop, orbit: noop };
    floor.on = fEv.on;
    floor.live = function () { return false; };
  }
  function piecesOf(id) {
    var st = null;
    STATIONS.forEach(function (s) { if (s.id === id) st = s; });
    return st ? st.pieces.map(function (k) { return { key: k, name: PIECES[k].name, movable: PIECES[k].movable }; }) : [];
  }
  function design() { return core && core.design; }
  function optionsOf(key) {
    var P = PIECES[key]; if (!P) return [];
    var d = design(), p = d && core.house ? d.piece(P.node) : null;
    return P.opts.map(function (o) {
      var lib = o.id === "original" ? (p && p.lib) : o.id, rec = d && lib ? d.rec(lib) : null;
      return { id: o.id, name: o.name, thumb: d && lib ? d.thumb(lib) : null, w: rec ? Math.round(Math.max(rec.w, rec.d) * 100) / 100 : null };
    });
  }
  stub();
  if (!core || typeof core.scene !== "function") return;
  var isPhone = core.isPhone, reduced = core.reduced;

  /* ---------- state ---------- */
  var C = {
    beats: [], hits: [], collectN: 0, init: false, sT: 0, s: 0, a: 0, aPts: 0, owning: false,
    live: false, node: -1, env: 0, arrived: null, dimReset: false, libAsked: false, pre: {}, area: null,
    cache: null, cacheKey: "", rm: { node: -1 }, dip: null, vvT: -1, ready: false, last: null, firstA: 0
  };
  // the visitor offset around the station (targets yaw/pitch/zoom, shown sy/sp/sz), radians / log dolly
  var O = { st: -1, yaw: 0, pitch: 0, zoom: 0, sy: 0, sp: 0, sz: 0, vy: 0, back: false, y0: null, drag: false };
  var F = { kGo: false, kT: 0, kShown: 0, eShown: 0, rest: true };
  var T = { pdrag: null };

  /* ---------- the real scan at a stop (3 Nov, James: "see how it looks like", same switch as the hero) ----------
     At the TV, couch and kitchen stops the visitor can switch to the real house splat at EXACTLY the
     stop's camera (the splat is registered onto the model's metres, like the hero). It shares the hero's
     stream (core.heroStream, same files and tiles), or opens its own when the hero has none. Leaving the
     stop (the flight starts) always goes back to the 3D model. */
  var R = { want: false, k: 0, h: null, failed: false };
  var REAL_CUT = 2.35;   // m above the floor: the real scan's cut for views from above the ceiling
  function realStream() {
    if (R.h || R.failed) return R.h;
    R.h = core.heroStream || null;
    if (!R.h && core.stream && core.scanCfg) {
      var cfg = core.scanCfg("hero") || core.scanCfg("house");
      if (cfg) R.h = core.stream(cfg, { name: "design-interior", frame: "model" });
    }
    if (!R.h) { R.failed = true; return null; }
    R.h.ready.catch(function () { R.failed = true; R.want = false; });
    R.h.onLost(function () { R.failed = true; R.want = false; });
    return R.h;
  }
  function realOk() { var h = realStream(); return !!h && !R.failed && h.state !== "error" && h.state !== "off"; }
  function realOff() { R.want = false; R.k = 0; if (R.h) { R.h.show(0); R.h.warm(false); if (R.h.clip) R.h.clip(null); } }

  function film() { return (win.ORBIT_FILM && win.ORBIT_FILM.poses) || {}; }
  function pose(name) {
    var p = film()[name];
    if (!p || !ok3(p.eye) || !ok3(p.target)) p = POSE_DEF[name];
    return { eye: v3(p.eye), target: v3(p.target), fov: (+p.fov || 45) * D2R };
  }
  function size() { return core.size ? core.size() : [win.innerWidth, win.innerHeight]; }
  function aspect() { var s = size(); return s[0] / Math.max(1, s[1]); }
  function portraitFov(f) { var asp = aspect(); return asp < 1 ? 2 * Math.atan(Math.tan(f / 2) * Math.pow(1 / asp, 0.3)) : f; }
  // C.area is one rect, or one rect per stop {overview, tv, couch, kitchen} (the design sheet may sit
  // on another side at each stop; per-stop rects keep every flight smooth)
  var NODE_ID = ["overview", "tv", "couch", "kitchen"];
  function region(noArea, node) {
    var a = noArea ? null : C.area, s = size();
    if (a && !("left" in a)) a = a[NODE_ID[node || 0]] || null;
    if (a && a.right - a.left > 60 && a.bottom - a.top > 60) return { cx: (a.left + a.right) / 2 / s[0], cy: (a.top + a.bottom) / 2 / s[1], hx: (a.right - a.left) / 2 / s[0], hy: (a.bottom - a.top) / 2 / s[1] };
    return s[0] < 768 ? { cx: 0.5, cy: 0.6, hx: 0.46, hy: 0.25 } : s[0] < 1024 ? { cx: 0.54, cy: 0.58, hx: 0.4, hy: 0.3 } : { cx: 0.61, cy: 0.56, hx: 0.36, hy: 0.33 };
  }
  // the whole floor (round 9, review C Floor 1): computers keep the model right of the heading column
  // (the heading ends at about 37 % of the width) and above the view buttons; phones / tablets: under
  // the heading at the top, above the buttons at the foot
  function floorRegion() {
    var s = size(), W = s[0], H = s[1], top, bottom, left, right;
    if (W >= 1024 && W / H > 1.1) { left = 0.42 * W; right = W - 28; top = 96; bottom = H - 96; }
    else if (W >= 768) { left = 24; right = W - 24; top = 0.34 * H; bottom = H - 110; }
    else { left = 14; right = W - 14; top = 0.37 * H; bottom = H - 112; }
    return { cx: (left + right) / 2 / W, cy: (top + bottom) / 2 / H, hx: (right - left) / 2 / W, hy: (bottom - top) / 2 / H };
  }
  // direction + lens of P; distance and lens shift so the corners fill the free part of the screen
  function fitView(P, corners, reg) {
    var fov = portraitFov(P.fov), t = P.target, dir = norm3(sub3(P.eye, P.target)), dist = len3(sub3(P.eye, P.target)) || 10;
    var asp = aspect(), f = 1 / Math.tan(fov / 2), wN = Math.max(0.2, 4 * reg.hx), hN = Math.max(0.2, 4 * reg.hy), box = null, eye = null;
    for (var it = 0; it < 14; it++) {
      eye = [t[0] + dir[0] * dist, t[1] + dir[1] * dist, t[2] + dir[2] * dist];
      var z = norm3(sub3(eye, t)), x = norm3(cross3([0, 1, 0], z)), y = cross3(z, x);
      box = [Infinity, Infinity, -Infinity, -Infinity];
      corners.forEach(function (c) {
        var q = sub3(c, eye), d = Math.max(0.1, -dot3(q, z));
        var nx = f / asp * dot3(q, x) / d, ny = f * dot3(q, y) / d;
        box[0] = Math.min(box[0], nx); box[1] = Math.min(box[1], ny); box[2] = Math.max(box[2], nx); box[3] = Math.max(box[3], ny);
      });
      var k = Math.max((box[2] - box[0]) / wN, (box[3] - box[1]) / hN);
      if (Math.abs(k - 1) < 0.003) break;
      dist = clamp(dist * k, 1.5, 150);
    }
    return { eye: eye, target: v3(t), fov: fov, shift: [(box[0] + box[2]) / 2 - (2 * reg.cx - 1), (box[1] + box[3]) / 2 - (1 - 2 * reg.cy)] };
  }
  function boxCorners(x0, y0, z0, x1, y1, z1) {
    var c = [];
    for (var i = 0; i < 8; i++) c.push([i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0]);
    return c;
  }
  // the five camera nodes for this screen: overview, TV, couch, kitchen, whole floor
  function nodes() {
    var s = size(), key = s[0] + "x" + s[1] + "|" + JSON.stringify(C.area) + "|" + (win.ORBIT_FILM ? 1 : 0);
    if (C.cache && C.cacheKey === key) return C.cache;
    var H = core.house, out = [], reg = region(), asp = aspect();
    var rb = H && H.roomBox[PLAY_ROOM];
    out[0] = rb ? fitView(pose("roomView"), boxCorners(rb[0] - 0.1, 0, rb[1] - 0.1, rb[2] + 0.1, 2.4, rb[3] + 0.1), reg) : pose("roomView");
    if (!out[0].shift) out[0].shift = [0, 0];
    for (var i = 1; i <= 3; i++) {
      var tall = s[0] < 768 && asp < 0.8;
      var P = pose(tall && i === 3 ? "tourKitchenPhone" : tall && i === 1 ? "tourTvPhone" : NODE_POSE[i]);
      // phones: a wider lens (no step back: the eye would leave the room through its wall)
      if (asp < 1) P.fov = portraitFov(P.fov);
      P.shift = [0, asp < 1 ? 0.1 : 0.04];
      // 29 Oct: the design sheet tells the free part of the screen (tour.area); the lens shift puts the
      // stop's piece in the middle of it, so the sheet never covers the piece
      // a stop's own free rect (if the page gives one) moves its piece into it; without one the
      // piece stays in the middle of the screen (James, 29 Oct: "the subject in the middle")
      var own = C.area && !("left" in C.area) ? C.area[NODE_ID[i]] : null;
      if (own) { var rg = region(false, i); P.shift = [1 - 2 * rg.cx, 2 * rg.cy - 1]; }
      out[i] = P;
    }
    var b = H && H.bounds;
    // tall screens look along the long house (floorRefPhone), so the whole floor fills the narrow screen
    // (the whole floor ignores the design sheet's area: that sheet is gone by then)
    out[4] = b ? fitView(pose(asp < 0.8 ? "floorRefPhone" : "floorRef"), boxCorners(b.min[0], 0, b.min[2], b.max[0], 2.6, b.max[2]), floorRegion()) : pose("floorRef");
    if (!out[4].shift) out[4].shift = [0, 0];
    C.cache = out; C.cacheKey = key;
    return out;
  }
  // a flight between two nodes: the aim slides, the eye swings round it; long flights rise over the walls
  function flight(A, B, t) {
    var a = sph(A.eye, A.target), b = sph(B.eye, B.target), L = len3(sub3(B.target, A.target));
    var tg = lerp3(A.target, B.target, t), bump = Math.sin(Math.PI * t);
    var az = a.az + wrapPi(b.az - a.az) * t;
    var el = clamp(mix(a.el, b.el, t) + bump * clamp(L * 0.045, 0, 0.62), -0.2, 1.48);
    var r = Math.exp(mix(Math.log(a.r), Math.log(b.r), t)) * (1 + bump * clamp(L / 6, 0, 1.6));
    return { eye: fromSph(tg, az, el, r), target: tg, fov: mix(A.fov, B.fov, t), shift: [mix(A.shift[0], B.shift[0], t), mix(A.shift[1], B.shift[1], t)] };
  }
  /* round 9 (review A4): the kitchen to the whole floor. The camera first rises straight up out of the
     kitchen (the roof is off, so it never passes a wall), still looking at the stop, then glides from
     high above to the whole floor; it arrives at 75 % of the band, so the floor heading (#floor) only
     comes once the floor view is there. */
  function riseFlight(A, B, t) {
    var up = Math.max(A.eye[1] + 2.6, 4.8);
    // while rising it also drifts a third of the way toward the stop, away from the outer wall
    var px = mix(A.eye[0], A.target[0], 0.33), pz = mix(A.eye[2], A.target[2], 0.33);
    var P1 = { eye: [px, up, pz], target: v3(A.target), fov: A.fov, shift: A.shift };
    var u1 = sstep(0, 0.3, t), u2 = sstep(0.2, 0.75, t);
    var E1 = [mix(A.eye[0], px, u1), mix(A.eye[1], up, u1), mix(A.eye[2], pz, u1)];
    var E2 = flight(P1, B, u2);
    return { eye: lerp3(E1, E2.eye, u2), target: lerp3(A.target, E2.target, u2), fov: mix(A.fov, E2.fov, u2),
      shift: [mix(A.shift[0], E2.shift[0], u2), mix(A.shift[1], E2.shift[1], u2)] };
  }
  function withOffset(v, yaw, pitch, zoom, elMin, elMax, exitK) {
    if (!yaw && !pitch && !zoom && !exitK) return v;
    var s = sph(v.eye, v.target), e = exitK || 0;
    var el = clamp(s.el + pitch, elMin, elMax) + e * 3 * D2R;
    // the floor's exit (round 9, review C Floor 3): the model lifts up and away while it fades (lens
    // shift moves it up the screen, a small step back makes it smaller); never sideways
    var lift = e ? 0.75 * sstep(0, 1, e) : 0;
    return { eye: fromSph(v.target, s.az + yaw, el, s.r * Math.exp(-zoom) * (1 + 0.14 * e)), target: v.target, fov: v.fov,
      shift: lift ? [v.shift[0], v.shift[1] - lift] : v.shift };
  }

  /* ---------- beats -> path position ---------- */
  var SLOT = { overview: 0, tv: 1, couch: 2, kitchen: 3 };
  function slotOf(kind, st, ph) {
    if (kind === "tour") {
      var i = SLOT[st]; if (i === undefined) return -1;
      if (i === 0) return 0;
      return ph === "travel" ? 2 * i - 1 : 2 * i;
    }
    if (kind === "floor") return { arrive: 7, explore: 8, "return": 9, exit: 10 }[ph] !== undefined ? { arrive: 7, explore: 8, "return": 9, exit: 10 }[ph] : -1;
    return -1;
  }
  function collect() {
    C.beats = Array.prototype.slice.call(doc.querySelectorAll('[data-stage="tour"],[data-stage="floor"]'));
    Array.prototype.forEach.call(doc.querySelectorAll('.stage-hit[data-hit="tour"],.stage-hit[data-hit="floor"]'), hookHit);
  }
  function layout() {
    var y = win.scrollY || win.pageYOffset || 0, vh = win.innerHeight || 800, vc = y + vh / 2, list = [];
    C.beats.forEach(function (el) {
      var r = el.getBoundingClientRect(); if (!(r.height > 0)) return;
      var kind = el.getAttribute("data-stage"), slot = slotOf(kind, el.getAttribute("data-station") || "", el.getAttribute("data-phase") || "hold");
      if (slot >= 0) list.push({ slot: slot, a: r.top + y, b: r.bottom + y, kind: kind });
    });
    if (!list.length) return null;
    list.sort(function (p, q) { return p.a - q.a; });
    // round 9 (review A4 + A5): the floor's arrive flight starts right where the kitchen stop ends (the
    // short stretch where #design scrolls away is part of the flight, no still frame of the island)
    for (var j = 1; j < list.length; j++) {
      if (list[j].slot === 7 && list[j - 1].slot === 6 && list[j].a > list[j - 1].b && list[j].a - list[j - 1].b < vh * 1.5) list[j].a = list[j - 1].b;
    }
    var s = list[0].slot, band = vh * 0.15;
    for (var i = 0; i < list.length; i++) {
      var B = list[i];
      if (vc >= B.a && vc < B.b) { s = B.slot + (vc - B.a) / (B.b - B.a); break; }
      if (vc >= B.b) s = B.slot + 1;
    }
    var first = list[0], last = list[list.length - 1];
    // round 9 (handoff compare -> design, rule 9.1): the model only comes once the section before has
    // scrolled away (#design's top from 28 % of the screen to 5 % above it); the overview words follow
    var aIn = first.slot === 0 ? sstep(first.a + vh * 0.22, first.a + vh * 0.55, vc) : sstep(first.a - band, first.a + band, vc);
    // ... and never while any strip of the #compare viewer is still on screen: the fade starts only once
    // its bottom has passed the nav pill's bottom edge (top 10 + height 56 = 66 px) and is done 20 % of a screen later
    if (first.slot === 0) {
      var cv = C.compView || (C.compView = doc.querySelector(".compare__view"));
      if (cv) { var cb = cv.getBoundingClientRect().bottom; if (cb > -vh) aIn = Math.min(aIn, sstep(66, 66 - vh * 0.2, cb)); }
    }
    var aOut = 1 - sstep(last.b - band, last.b + band, vc);
    var hasExit = last.slot === 10;
    // (30 Oct, James) the floor leaves with the page: how far its pin has scrolled up off its sticky place
    var pin = C.floorPin || (C.floorPin = doc.querySelector(".floor__pin"));
    var up = hasExit && pin ? Math.max(0, -pin.getBoundingClientRect().top) : 0;
    return { s: s, aPts: aIn * aOut, aIn: aIn, aOut: aOut, exit: hasExit, y: y, vh: vh, up: up };
  }

  /* ---------- engage + scroll intent ---------- */
  function sceneId(n) { return n === 4 ? "floor" : "tour"; }
  function offOn() { return Math.abs(O.yaw) + Math.abs(O.pitch) + Math.abs(O.zoom) + Math.abs(O.sy) + Math.abs(O.sp) + Math.abs(O.sz) > 1e-4; }
  function zeroO() { O.yaw = O.pitch = O.zoom = O.sy = O.sp = O.sz = O.vy = 0; O.back = false; O.st = -1; O.y0 = null; }
  // the visitor touched the view at node n (drag, keys, buttons)
  function input(n) {
    if (n < 0) return false;
    if (O.st !== n) { zeroO(); O.st = n; }
    O.back = false;
    O.y0 = win.scrollY || win.pageYOffset || 0;
    if (n === 4) {
      // input in the explore hold cancels a time return and keeps the view where it is
      if (F.kGo || F.kShown > 0) { var k = 1 - F.kShown; O.yaw *= k; O.pitch *= k; O.zoom *= k; O.sy *= k; O.sp *= k; O.sz *= k; F.kGo = false; F.kT = 0; F.kShown = 0; }
      if (F.rest) { F.rest = false; fEv.emit("interact", {}); }
    }
    var id = sceneId(n);
    if (win.OrbitEngage && !win.OrbitEngage.isEngaged(id)) win.OrbitEngage.claim("scene", id, function () { goBack(); });
    core.render();
    return true;
  }
  // back to the station / reference view (Esc, Reset view, scroll intent)
  function goBack() {
    O.back = true; O.yaw = 0; O.pitch = 0; O.zoom = 0; O.vy = 0; O.y0 = null; O.drag = false;
    if (reduced && offOn()) startDip(0.2, function () { O.sy = O.sp = O.sz = 0; });
    core.render();
  }
  function releaseEngage() {
    if (!win.OrbitEngage) return;
    C.selfRelease = true;
    try { ["tour", "floor"].forEach(function (id) { if (win.OrbitEngage.isEngaged(id)) win.OrbitEngage.release(id); }); }
    finally { C.selfRelease = false; }
  }
  if (win.visualViewport) win.visualViewport.addEventListener("resize", function () { C.vvT = performance.now(); });
  function startDip(dur, mid) { if (C.dip) { if (mid) mid(); return; } C.dip = { t: 0, dur: dur, mid: mid, done: false }; }
  function dipMul(dt) {
    var d = C.dip; if (!d) return 1;
    d.t += dt;
    if (!d.done && d.t >= d.dur / 2) { d.done = true; if (d.mid) d.mid(); }
    if (d.t >= d.dur) { C.dip = null; return 1; }
    return d.t < d.dur / 2 ? 1 - d.t / (d.dur / 2) : (d.t - d.dur / 2) / (d.dur / 2);
  }

  /* ---------- where the visitor is: node + envelope ---------- */
  var HOLD = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 10]];
  function holdNode(s) {
    for (var i = 0; i < 4; i++) if (s >= HOLD[i][0] - 0.1 && s <= HOLD[i][1]) return i;   // the last 10 % of the flight counts
    if (s >= 8 && s < 9) return 4;
    return -1;
  }
  function envOf(n, s) {
    if (n < 0) return 0;
    var h = HOLD[n], d = s < h[0] ? h[0] - s : s > h[1] ? s - h[1] : 0;
    return 1 - sstep(0, 0.35, d);
  }
  function stationAt(s) {
    if (s >= 7) return { station: null, phase: null, k: 0 };
    var k = Math.floor(s), t = s - k;
    if (k <= 0) return { station: "overview", phase: "hold", k: 1 };
    var i = k % 2 ? (k + 1) / 2 : k / 2;
    return { station: STATIONS[i].id, phase: k % 2 ? "travel" : "hold", k: k % 2 ? sstep(0, 1, t) : 1 };
  }

  /* ---------- the scenes ---------- */
  function drive(st, dt, now) {
    var H = core.house, d = design();
    C.owning = true;
    if (!H || !d) { core.wantHouse && core.wantHouse("tour"); core.spaceDim(1); C.a = 0; return 0; }
    if (!C.ready) { C.ready = true; }
    if (!C.libAsked) { C.libAsked = true; d.catalog().catch(function () { /* thumbs stay null */ }); }
    if (++C.collectN > 60 || !C.beats.length) { C.collectN = 0; collect(); }
    var L = layout();
    if (!L) { core.spaceDim(1); return 0; }
    // the path position: a jump (fast scroll, step bar, a late pack) becomes a short glide
    C.sT = L.s;
    if (!C.init || reduced) { C.s = C.sT; C.init = true; }
    else { var gap = Math.abs(C.sT - C.s); C.s = follow(C.s, C.sT, gap > 0.35 ? 0.42 : 0.1, dt); if (Math.abs(C.s - C.sT) < 1e-4) C.s = C.sT; }
    var s = C.s, N = nodes();

    // preload the next station's pieces once its flight starts
    if (s > 0.6 && !C.pre.tv) { C.pre.tv = true; preload(["tv", "sideboard"]); }
    if (s > 2.6 && !C.pre.couch) { C.pre.couch = true; preload(["sofa", "ottoman"]); }

    // scroll intent: >= 24 px (2.5 % of the screen) since the last input = back to the path
    var y = L.y, thr = Math.max(24, 0.025 * L.vh);
    if (O.y0 !== null && Math.abs(y - O.y0) >= thr && performance.now() - C.vvT > 300) {
      var down = y > O.y0;
      if (O.st === 4 && down && s >= 8 && s < 9) { if (!F.kGo) { F.kGo = true; F.kT = 0; } }
      else goBack();
      O.y0 = null; O.drag = false;
      releaseEngage();
      if (T.pdrag) endPieceDrag();
    }

    // which station the visitor can play with; its offset fades out as the flight leaves it
    var n = holdNode(s);
    C.node = n;
    var env = O.st >= 0 ? envOf(O.st, s) : 0;
    if (O.st >= 0 && env <= 0.0005) { zeroO(); env = 0; releaseEngage(); }
    if (O.drag && O.st >= 0 && env < 0.5) O.drag = false;   // a fresh press has no node yet (O.st -1): keep it
    C.env = env;

    // the visitor offset: inertia, limits, the eased return
    if (!O.drag && Math.abs(O.vy) > 1e-3 && !reduced) { O.yaw += O.vy * dt; O.vy *= Math.exp(-dt * 3.2); } else if (!O.drag) O.vy = 0;
    clampO();
    var tau = O.back ? 0.22 : 0.1;
    O.sy = reduced && !O.back ? O.yaw : follow(O.sy, O.yaw, tau, dt);
    O.sp = reduced && !O.back ? O.pitch : follow(O.sp, O.pitch, tau, dt);
    O.sz = reduced && !O.back ? O.zoom : follow(O.sz, O.zoom, tau, dt);
    if (O.back && Math.abs(O.sy) + Math.abs(O.sp) + Math.abs(O.sz) < 2e-4) { var wasFloor = O.st === 4; zeroO(); if (wasFloor) floorReturned(); }

    // the floor: return before the exit (research 10 section 6)
    var kPos = sstep(9, 10, s), kTime = 0;
    if (F.kGo) { F.kT = Math.min(1, F.kT + dt / 0.7); kTime = easeIO(F.kT); }
    var kk = Math.max(kTime, kPos);
    if (O.st === 4 && offOn()) {
      if (reduced) { if (kk > 0) startDip(0.15, function () { zeroO(); floorReturned(); }); }
      else {
        F.kShown = kk < F.kShown ? kk : Math.min(kk, F.kShown + dt / 0.6);
        if (F.kShown >= 0.999) { zeroO(); floorReturned(); }
      }
    } else { F.kShown = 0; F.kGo = false; F.kT = 0; }
    var gateOpen = !(O.st === 4 && offOn());
    var eRaw = clamp(s - 10, 0, 1), eT = gateOpen ? eRaw : 0;
    F.eShown = reduced ? eT : follow(F.eShown, eT, Math.abs(eT - F.eShown) > 0.35 ? 0.42 : 0.1, dt);
    if (Math.abs(F.eShown - eT) < 1e-4) F.eShown = eT;

    // the camera
    var v, a = 0, b = 0, t = 0, kf = Math.floor(s), tf = s - kf;
    if (kf <= 0) { a = b = 0; }
    else if (kf >= 8) { a = b = 4; }
    else if (kf === 7) { a = 3; b = 4; t = tf; }
    else if (kf % 2 === 0) { a = b = kf / 2; }
    else { b = (kf + 1) / 2; a = b - 1; t = tf; }
    var dipK = 1;
    if (reduced) {
      // no flights: the camera holds the last station until half way, then a short dip to the next
      var want = a === b ? a : (t < 0.5 ? a : b);
      if (C.rm.node < 0) C.rm.node = want;
      else if (want !== C.rm.node) startDip(0.2, function () { C.rm.node = want; });
      v = N[C.rm.node];
    } else v = a === b ? N[a] : a === 3 && b === 4 ? riseFlight(N[a], N[b], t) : flight(N[a], N[b], sstep(0, 1, t));
    dipK = dipMul(dt);
    // a stop whose framing changes while the visitor is there (the sheet asked for room on arrival):
    // the lens eases over (~0.3 s) instead of jumping; flights and the floor follow the path as is
    if (a === b && a >= 1 && a <= 3 && C.shS && !reduced) {
      C.shS = [follow(C.shS[0], v.shift[0], 0.14, dt), follow(C.shS[1], v.shift[1], 0.14, dt)];
      v = { eye: v.eye, target: v.target, fov: v.fov, shift: C.shS };
    } else C.shS = v.shift.slice();
    var on = O.st >= 0 ? env : 0, fk = O.st === 4 ? 1 - F.kShown : 1;
    // (30 Oct, James) no lift / fade at the floor's exit any more (exitK 0): the model slides up with the page
    if (O.st === 4) v = withOffset(v, O.sy * on * fk, O.sp * on * fk, O.sz * on * fk, 20 * D2R, 70 * D2R, 0);
    else {
      // auto dolly: the swing never takes the camera out of the stop's rooms
      var zA = O.st >= 1 && O.st <= 3 && on > 0 ? autoZoom(O.st) : 0;
      C.zA = reduced || zA > (C.zA || 0) ? zA : follow(C.zA || 0, zA, 0.12, dt);   // in at once, out eased
      v = withOffset(v, O.sy * on, O.sp * on, (O.sz + C.zA) * on, -0.15, 1.45, 0);
    }
    // lens shift = the pin's scroll (NDC: 2 per screen height), so the model moves exactly with the words
    if (L.up > 0 && a === 4) v = { eye: v.eye, target: v.target, fov: v.fov, shift: [v.shift[0], v.shift[1] - 2 * L.up / L.vh] };
    var gone = L.up >= L.vh * 0.98;
    core.view({ eye: v.eye, target: v.target, up: [0, 1, 0], fov: v.fov, shift: v.shift, near: 0.05, far: 250 });

    // the house: as designed, roof off, cutaway by node (dollhouse room / eye level / whole floor)
    // the model hides once the real scan fully covers it (3 Nov)
    var modelOn = R.k < 0.995;
    if (H.root.enabled !== modelOn) H.root.enabled = modelOn;
    H.pose(null); H.look("outside"); H.shadow.enabled = false;
    if (!C.dimReset) { C.dimReset = true; H.dimRooms(null, 1); }
    // the real scan: only at a stop (TV, couch, kitchen) and only once it really draws; a flight = the model again
    var atStop = a === b && a >= 1 && a <= 3 && C.a > 0.5;
    if (!atStop) R.want = false;
    var rh = atStop || R.k > 0.002 ? realStream() : R.h;
    if (rh) {
      rh.warm(atStop && !R.failed);
      var rT = R.want && rh.drawn ? 1 : 0;
      R.k = reduced ? rT : follow(R.k, rT, 0.22, dt);
      if (Math.abs(R.k - rT) < 0.003) R.k = rT;
      rh.show(R.k * C.a);
      // a stop seen from above the ceiling (the couch): the scan is cut at REAL_CUT m, a dollhouse like the model
      if (rh.clip) rh.clip(R.k > 0.002 && v.eye[1] > REAL_CUT + 0.3 ? REAL_CUT : null);
      if (R.k > 0.002 && R.k < 1) core.render();
    } else R.k = 0;
    var mNode = a === b ? a : (t < 0.5 ? a : b), mode = mNode === 0 ? "room" : mNode === 4 ? "ext" : "all";
    H.cutaway(v.eye, v.target, mode, dt, H.roomBox[PLAY_ROOM], KEEP_AT[mNode] || null);
    // pieces between the camera and the stop go invisible (never the stop's own pieces)
    // (round 9, review A9) plus what only clutters a stop's own view: the arc lamp's shade beside the TV
    // sheet read as a floating brown rock
    if (d.clear) d.clear(mode === "all" ? v.eye : null, v.target, STATIONS[mNode] ? STATIONS[mNode].pieces.map(function (k) { return PIECES[k].node; }) : null, HIDE_AT[mNode] || null);

    // fades: the points go as the model comes, and stay away through the floor's exit
    // with an exit beat, leaving the act only fades through the (gated) exit: a fast flick past the
    // act still plays "return, then exit"; the points come back only once the exit is done
    // (30 Oct, James) the floor stays fully there while it slides out; points / off only once it is above the screen
    var aPtsT = L.exit ? L.aIn * (gone ? L.aOut : 1) : L.aPts;
    var aT = L.exit ? L.aIn * (gone ? 0 : 1) : L.aPts;
    C.aPts = reduced ? aPtsT : follow(C.aPts, aPtsT, 0.22, dt);
    C.a = reduced || L.up > 0 ? aT : follow(C.a, aT, 0.22, dt);
    if (Math.abs(C.a - aT) < 1e-3) C.a = aT;
    core.spaceDim(1 - C.aPts);

    // live input, arrive / leave events, the chosen piece
    C.live = C.a > 0.5 && n >= 0 && (n < 4 || (s >= 8 && s < 9)) && (O.st < 0 || O.st === n || env < 0.01);
    var S = stationAt(s), arrived = C.a > 0.5 && S.station && S.k >= 0.9 ? S.station : null;
    if (arrived !== C.arrived) {
      var was = C.arrived; C.arrived = arrived;
      if (was) { if (T.pdrag) endPieceDrag(); if (d.selected()) { d.select(null); tEv.emit("select", { key: null }); } tEv.emit("leave", { station: was }); }
      if (arrived) tEv.emit("arrive", { station: arrived });
    }
    var sk = keyOf(d.selected());
    // the floor outline only for pieces that move (drawn lines must be drawn again every frame)
    // (4 Nov 2026, phone battery) otherwise no redraw every frame: stage.js draws when the camera, the scroll
    // or a piece / light changes
    if (sk && PIECES[sk].movable && C.a > 0.3) { d.outline(); core.render(); }
    return C.a * dipK;
  }
  function floorReturned() { F.kGo = false; F.kT = 0; F.kShown = 0; F.rest = true; fEv.emit("returned", {}); }
  function clampO() {
    if (O.st === 4) {
      O.zoom = clamp(O.zoom, -Math.log(1.4), -Math.log(0.7));
      var e0 = sph(nodesSafe(4).eye, nodesSafe(4).target).el;
      O.pitch = clamp(O.pitch, 20 * D2R - e0, 70 * D2R - e0);
      O.yaw = wrapPi(O.yaw - O.sy) + O.sy;   // full turns: keep it near the shown value
    } else {
      // (29 Oct, James) the stops swing much further; what gets in the way goes invisible (d.clear)
      // per stop: the TV hangs on a wall (past 40 deg it is seen edge-on), the sofa stands free
      var yl = ([35, 40, 75, 50][O.st] || 35) * D2R;
      O.pitch = clamp(O.pitch, -12 * D2R, (O.st === 0 ? 10 : 22) * D2R);
      O.zoom = clamp(O.zoom, -Math.log(O.st === 0 ? 1.25 : 1.4), -Math.log(O.st === 0 ? 0.8 : 0.7));
      if (O.st > 0) {
        // the camera stays inside the home's rooms (never out in the garden or the dark around it)
        var v0 = nodesSafe(O.st);
        var ids = v0 ? roomsOf(v0) : null;
        if (v0 && indoors(v0.eye, ids)) {
          var lim = yawRoom(v0, ids);
          O.yaw = clamp(O.yaw, Math.max(-yl, lim[0]), Math.min(yl, lim[1]));
          return;
        }
      }
      O.yaw = clamp(O.yaw, -yl, yl);
    }
  }
  function nodesSafe(i) { var N = nodes(); return N[i]; }
  // a point (model frame) inside a room of the home, 25 cm clear of its outline (the patio is outside)
  function inPoly(x, z, poly) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  // ids = the rooms allowed (the stop's own: where its camera and its target are); none = every room
  function indoors(p, ids) {
    var H = core.house; if (!H || !H.rooms || !H.rooms.length) return true;
    var m = 0.25, pts = [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]];
    return pts.every(function (o) {
      return H.rooms.some(function (r) { return r.id !== "patio" && (!ids || ids.indexOf(r.id) > -1) && r.poly && inPoly(p[0] + o[0], p[2] + o[1], r.poly); });
    });
  }
  function roomsOf(v0) {
    var H = core.house; if (!H || !H.rooms) return null;
    return H.rooms.filter(function (r) { return r.poly && (inPoly(v0.eye[0], v0.eye[2], r.poly) || inPoly(v0.target[0], v0.target[2], r.poly)); }).map(function (r) { return r.id; });
  }
  // the dolly a swing needs to keep the camera in the stop's rooms: as the view turns, the camera
  // comes closer to the stop instead of going through a wall (0 = none; -1 = not possible)
  var ZFIT_MAX = Math.log(1 / 0.45);   // never closer than 45 % of the stop's distance
  function fitZoom(v0, ids, yaw, pitch, zoom) {
    for (var z = zoom; z <= ZFIT_MAX; z += 0.04) {
      if (indoors(withOffset(v0, yaw, pitch, z, -0.15, 1.45).eye, ids)) return z - zoom;
    }
    return -1;
  }
  // how far the view may turn each way from the stop (with that dolly) before it cannot stay inside
  function yawRoom(v0, ids) {
    var key = O.st + "|" + win.innerWidth + "x" + win.innerHeight + "|" + O.pitch.toFixed(2) + "|" + O.zoom.toFixed(2);
    if (C.yawKey === key) return C.yawLim;
    var lim = [0, 0];
    [-1, 1].forEach(function (sg, k) {
      var a = 0;
      for (var deg = 2; deg <= 75; deg += 2) {
        if (fitZoom(v0, ids, sg * deg * D2R, O.pitch, O.zoom) < 0) break;
        a = deg;
      }
      lim[k] = sg * a * D2R;
    });
    C.yawKey = key; C.yawLim = lim;
    return lim;
  }
  // the extra dolly for the view as shown now at stop n (smooth: it follows the shown offset)
  function autoZoom(n) {
    if (n < 1 || n > 3) return 0;
    var v0 = nodesSafe(n); if (!v0) return 0;
    var ids = roomsOf(v0);
    if (!indoors(v0.eye, ids)) return 0;
    var z = fitZoom(v0, ids, O.sy, O.sp, O.sz);
    return z > 0 ? z : 0;
  }
  function cleanup() {
    if (T.pdrag) endPieceDrag();
    O.drag = false;
    var d = design();
    if (d && d.clear) d.clear(null);
    if (d && d.selected()) { d.select(null); tEv.emit("select", { key: null }); }
    if (C.arrived) { var was = C.arrived; C.arrived = null; tEv.emit("leave", { station: was }); }
    releaseEngage();
    zeroO(); F.kGo = false; F.kT = 0; F.kShown = 0; F.eShown = 0;
    C.init = false; C.a = 0; C.aPts = 0; C.live = false; C.dimReset = false; C.rm.node = -1; C.dip = null;
    realOff();
    if (core.house && core.house.root && !core.house.root.enabled) core.house.root.enabled = true;
    var own = core.owner && core.owner();
    if (!own) core.spaceDim(1);
  }
  var SCENE = {
    update: function (st, dt, now) { return drive(st, dt, now); },
    interactive: function () { return C.live; },
    down: function (p) {
      T.pdrag = null;
      if (!C.live) return;
      var d = design(), node = d.selected(), key = keyOf(node);
      if (node && key && PIECES[key].movable && C.node >= 1 && C.node <= 3) {
        var b = d.box(node), grab = !!(p.el && p.el.hasAttribute && p.el.hasAttribute("data-grab"));
        if (b && (grab || (p.type !== "touch" && d.rayBox(core.ray(p.x, p.y), b) >= 0))) {
          var lv = [b.y0, (b.y0 + b.y1) / 2, b.y1];
          for (var i = 0; i < lv.length; i++) {
            var P = d.planeHit(p.x, p.y, lv[i]);
            if (P) { T.pdrag = { node: node, key: key, P0: P, py: lv[i], s0: d.spot(node), moved: false }; input(C.node); return; }
          }
        }
      }
      O.drag = true; O.vy = 0;
    },
    move: function (p) {
      var d = design();
      if (T.pdrag) {
        var g = T.pdrag, P = d.planeHit(p.x, p.y, g.py);
        if (P) { d.setSpot(g.node, g.s0.x + P.x - g.P0.x, g.s0.z + P.z - g.P0.z, g.s0.r); g.moved = true; input(C.node); }
        return;
      }
      if (!O.drag || !C.live) return;
      if (!input(C.node)) return;
      var k = (isPhone ? 0.42 : 0.3) * D2R;
      O.yaw -= p.dx * k;
      // phones: one finger up / down scrolls the page (touch-action pan-y), so only mouse / pen tilt
      if (p.type !== "touch") O.pitch += p.dy * k * 0.6;
      clampO();
    },
    up: function (p) {
      if (T.pdrag) { endPieceDrag(); return; }
      if (!O.drag) return;
      O.drag = false;
      if (!reduced && p && p.moved) O.vy = clamp(-(p.vx || 0) * (isPhone ? 0.42 : 0.3) * D2R, -3, 3);
    },
    tap: function (p) {
      if (!C.live || C.node < 1 || C.node > 3) return;
      var d = design(), ray = core.ray(p.x, p.y), best = null, bt = 1e9;
      STATIONS[C.node].pieces.forEach(function (key) { var b = d.box(PIECES[key].node); if (!b) return; var tt = d.rayBox(ray, b); if (tt >= 0 && tt < bt) { bt = tt; best = key; } });
      selectKey(best);
      input(C.node);
    },
    pinch: function (k) { if (C.live && k > 0) zoomBy(k); },
    off: function () { C.owning = false; Promise.resolve().then(function () { if (!C.owning) cleanup(); }); }
  };
  core.scene("tour", SCENE);
  core.scene("floor", SCENE);

  function keyOf(node) { for (var k in PIECES) if (PIECES[k].node === node) return k; return null; }
  function endPieceDrag() {
    var g = T.pdrag; T.pdrag = null;
    if (g && g.moved) { design().changed("move", g.node); tEv.emit("change", { what: "move", key: g.key }); }
  }
  function selectKey(key) {
    var d = design(); if (!d || !core.house) return;
    var node = key && PIECES[key] ? PIECES[key].node : null;
    if ((d.selected() || null) === node) return;
    d.select(node);
    tEv.emit("select", { key: node ? key : null });
  }
  function zoomBy(k) {
    var n = C.live ? C.node : -1;
    if (input(n)) { O.zoom += Math.log(clamp(k, 0.5, 2)); clampO(); }
    var lo = O.st === 4 ? -Math.log(1.4) : -Math.log(1.25), hi = O.st === 4 ? -Math.log(0.7) : -Math.log(0.8);
    return { zoom: Math.exp(O.zoom), min: O.zoom <= lo + 1e-3, max: O.zoom >= hi - 1e-3 };
  }
  function orbitBy(dy, dp) {
    var n = C.live ? C.node : -1; if (!input(n)) return;
    O.vy = 0; O.yaw += degIn(dy); O.pitch += degIn(dp); clampO();
  }
  function preload(keys) {
    var d = design(); if (!d) return;
    d.catalog().then(function () {
      var ids = [];
      keys.forEach(function (k) { PIECES[k].opts.forEach(function (o) { if (o.id !== "original") ids.push(o.id); }); });
      d.preload(ids);
    }).catch(function () { /* no library: swaps say so when used */ });
  }

  /* The wheel: js/sections/design.js and floor.js (F2) own it (Ctrl / Cmd + wheel and Safari pinch
     call view.zoom; the plain wheel scrolls). This file never listens to the wheel. */
  function hookHit() { /* nothing: kept so collect() stays simple */ }
  // the engagement ends from anywhere (Esc, another view claimed, the section's own Done): back to the path
  doc.addEventListener("orbit:engage", function (e) {
    var dd = e && e.detail;
    if (!dd || dd.on || (dd.id !== "tour" && dd.id !== "floor") || C.selfRelease) return;
    if (offOn()) goBack();
  });

  /* ---------- screen helpers ---------- */
  function proj(p) {
    var q = core.project(p); if (!q) return null;
    var s = size();
    return { x: q[0], y: q[1], visible: C.a > 0.5 && q[0] >= 0 && q[0] <= s[0] && q[1] >= 0 && q[1] <= s[1] };
  }
  function kitchenPoint() {
    var H = core.house, best = null;
    ((H && H.lights && H.lights.items) || []).forEach(function (it) { if (it.room === LIGHT_ROOM && ok3(it.pos) && (!best || (+it.lumen || 0) > (+best.lumen || 0))) best = it; });
    return best ? [best.pos[0], best.pos[1] + 0.15, best.pos[2]] : [13.4, 2.1, 3.0];
  }

  /* ---------- the real APIs (replace the stubs) ---------- */
  tour.state = function () {
    var r = C.init ? stationAt(C.s) : { station: null, phase: null, k: 0 };
    if (C.a < 0.5) r = { station: null, phase: null, k: 0 };
    r.ready = !!(core.house && design());
    return r;
  };
  // the real scan at this stop: real(true) = show it, real(false) = the 3D model; only works at a stop
  tour.real = function (on) {
    R.want = !!on && realOk() && C.live && C.node >= 1 && C.node <= 3;
    core.render();
    return R.want;
  };
  tour.realState = function () { return { on: R.want, k: R.k, ok: realOk() }; };
  tour.live = function () { return C.live && C.node < 4; };
  floor.live = function () { return C.live && C.node === 4; };
  tour.anchor = function (id) {
    var d = design(), H = core.house; if (!d || !H || C.a < 0.05) return null;
    if (id === "kitchen") {
      // the box around the lamps on screen: the design sheet keeps clear of every lamp dot
      var kp = proj(kitchenPoint()); if (!kp) return null;
      var bx = [Infinity, Infinity, -Infinity, -Infinity];
      (d.lamps ? d.lamps(LIGHT_ROOM) : []).forEach(function (l) {
        var q = core.project(l.pos); if (!q) return;
        bx[0] = Math.min(bx[0], q[0] - 30); bx[1] = Math.min(bx[1], q[1] - 30); bx[2] = Math.max(bx[2], q[0] + 30); bx[3] = Math.max(bx[3], q[1] + 30);
      });
      if (isFinite(bx[0])) kp.rect = { left: bx[0], top: bx[1], right: bx[2], bottom: bx[3] };
      return kp;
    }
    if (id === "overview") { var rb = H.roomBox[PLAY_ROOM]; return rb ? proj([(rb[0] + rb[2]) / 2, 2.6, (rb[1] + rb[3]) / 2]) : null; }
    if (!MAIN[id]) return null;
    var key = keyOf(d.selected()), st = null;
    STATIONS.forEach(function (s) { if (s.id === id) st = s; });
    if (!key || st.pieces.indexOf(key) < 0) key = MAIN[id];
    var b = d.box(PIECES[key].node); if (!b) return null;
    var out = proj([b.cx, b.y1 + 0.05, b.cz]); if (!out) return null;
    // F2: the piece's screen box (the panel never covers it) and the touch handle's floor point
    var rc = tour.rect(key);
    if (rc) out.rect = { left: rc[0], top: rc[1], right: rc[2], bottom: rc[3] };
    if (PIECES[key].movable) { var g = proj([b.cx, b.y0, b.cz]); if (g) out.grab = { x: g.x, y: g.y }; }
    out.key = key;
    return out;
  };
  tour.rect = function (key) {
    var d = design(), P = PIECES[key]; if (!d || !core.house || !P) return null;
    var b = d.box(P.node); if (!b) return null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, nx = -b.uz, nz = b.ux;
    for (var i = 0; i < 8; i++) {
      var su = i & 1 ? 1 : -1, sn = i & 2 ? 1 : -1, yy = i & 4 ? b.y1 : b.y0;
      var q = core.project([b.cx + b.ux * b.hu * su + nx * b.hn * sn, yy, b.cz + b.uz * b.hu * su + nz * b.hn * sn]);
      if (!q) return null;
      x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
    }
    return [x0, y0, x1, y1];
  };
  tour.handle = function () {
    var d = design(); if (!d || !core.house) return null;
    var key = keyOf(d.selected()); if (!key || !PIECES[key].movable) return null;
    var b = d.box(PIECES[key].node); if (!b) return null;
    return proj([b.cx, b.y0, b.cz]);
  };
  tour.area = function (rect) {
    function one(q) { return q && isFinite(q.left) && isFinite(q.top) && isFinite(q.right) && isFinite(q.bottom) ? { left: +q.left, top: +q.top, right: +q.right, bottom: +q.bottom } : null; }
    var r = null;
    if (rect && !("left" in rect)) { r = {}; NODE_ID.forEach(function (id) { r[id] = one(rect[id]); }); }
    else r = one(rect);
    if (JSON.stringify(r) === JSON.stringify(C.area)) return;
    C.area = r; C.cache = null; core.render();
  };
  tour.select = function (key) { if (key && !PIECES[key]) return; selectKey(key || null); if (key) input(C.live ? C.node : -1); };
  tour.selected = function () { var d = design(); return d && core.house ? keyOf(d.selected()) : null; };
  tour.swap = function (key, id) {
    var d = design(), P = PIECES[key];
    if (!d || !core.house) return Promise.reject(new Error("stage not ready"));
    if (!P) return Promise.reject(new Error("no piece"));
    var o = null; P.opts.forEach(function (q) { if (q.id === id) o = q; });
    if (!o) return Promise.reject(new Error("not an option"));
    var pr = d.swap(P.node, id === "original" ? null : id, o.turn || 0);
    tEv.emit("change", { what: "swap", key: key, id: id });
    return pr.then(function () { return { key: key, id: id }; });
  };
  tour.move = function (key, dx, dz) {
    var d = design(), P = PIECES[key]; if (!d || !core.house || !P || !P.movable) return false;
    // f = toward the camera on the floor, r = screen right (up x toward-camera); -dz = away (F2: ArrowUp)
    var v = core.getView(), f = norm3([v.eye[0] - v.target[0], 0, v.eye[2] - v.target[2]]), r = cross3([0, 1, 0], f);
    var s = d.spot(P.node); if (!s) return false;
    var x = s.x + r[0] * (+dx || 0) + f[0] * (+dz || 0), z = s.z + r[2] * (+dx || 0) + f[2] * (+dz || 0);
    d.setSpot(P.node, x, z, s.r);
    d.changed("move", P.node);
    tEv.emit("change", { what: "move", key: key });
    return true;
  };
  tour.turn = function (key, deg) {
    var d = design(), P = PIECES[key]; if (!d || !core.house || !P || !P.movable) return false;
    var s = d.spot(P.node); if (!s) return false;
    d.setSpot(P.node, s.x, s.z, Math.round((s.r + (isFinite(deg) ? +deg : 15)) / 5) * 5);
    d.changed("turn", P.node);
    tEv.emit("change", { what: "turn", key: key });
    return true;
  };
  tour.restore = function (key) {
    var d = design(), P = PIECES[key]; if (!d || !core.house || !P) return false;
    var ok = d.restore(P.node);
    if (ok) tEv.emit("change", { what: "restore", key: key });
    return ok;
  };
  tour.paint = function (hex) {
    var d = design(); if (!d || !core.house) return false;
    var ok = d.paint(PLAY_ROOM, hex || null);
    if (ok) tEv.emit("change", { what: "paint", hex: hex || null });
    return ok;
  };
  tour.paintNow = function () { var d = design(); return d && core.house ? d.paintNow(PLAY_ROOM) : null; };
  tour.lights = function (on) {
    var d = design(); if (!d || !core.house) return false;
    var ok = d.light(LIGHT_ROOM, !!on);
    if (ok) tEv.emit("change", { what: "lights", on: !!on });
    return ok;
  };
  tour.lightsOn = function () { var d = design(); return !d || !core.house || d.lightOn(LIGHT_ROOM); };
  // the kitchen's own lamps, each with its spot on screen (29 Oct, James: tap the lamp itself)
  tour.lamps = function () {
    var d = design(); if (!d || !core.house || !d.lamps) return [];
    return d.lamps(LIGHT_ROOM).map(function (l) {
      var q = proj(l.pos) || { x: NaN, y: NaN, visible: false };
      return { key: l.key, name: LAMP_NAME[l.name] || l.name, on: d.lampOn(l.key), lumen: l.lumen, x: q.x, y: q.y, visible: q.visible };
    });
  };
  tour.lamp = function (key, on) {
    var d = design(); if (!d || !core.house || !d.lamp) return false;
    var ok = d.lamp(key, !!on);
    if (ok) tEv.emit("change", { what: "lights", key: key, on: !!on });
    return ok;
  };
  tour.reset = function () {
    var d = design(); if (!d || !core.house) return false;
    d.reset(); goBack();
    tEv.emit("change", { what: "reset" });
    return true;
  };
  tour.view = {
    zoom: function (k) { return zoomBy(+k || 1); },
    reset: function () { goBack(); },
    orbit: function (dy, dp) { orbitBy(dy, dp); }
  };
  floor.view = tour.view;
  tour._debug = function () {
    return { s: C.s, sT: C.sT, a: C.a, aPts: C.aPts, node: C.node, live: C.live, env: C.env, arrived: C.arrived,
      off: { st: O.st, yaw: O.sy, pitch: O.sp, zoom: O.sz, back: O.back, y0: O.y0 }, floor: { kGo: F.kGo, kShown: F.kShown, eShown: F.eShown },
      view: core.getView(), design: design() ? design().state() : null, owner: core.owner ? core.owner() : null };
  };
  // the design's own news: a piece finished loading / could not load, the library came in
  core.whenReady(function () {
    var d = design();
    if (d) d.on("change", function (e) {
      if (!e) return;
      if (e.what === "load" || e.what === "error") tEv.emit("change", { what: e.what, key: keyOf(e.node) });
      else if (e.what === "library") tEv.emit("change", { what: "library" });
    });
    tEv.emit("ready", {}); fEv.emit("ready", {});
  });
  collect();
  doc.addEventListener("orbit:feed", collect);
  if (doc.readyState !== "complete") win.addEventListener("load", collect, { once: true });
})();
