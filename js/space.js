/* Orbit 3D - the living background: "the website is a scan".
   One fixed WebGL2 canvas (#space) draws real scan points (assets/space/*.js).
   Scrolling blends between scenes (data-scene on sections); the pointer is a
   scanner that reveals true colour; a click sends a ripple.
   Every point lives in ONE set of GPU buffers; the vertex shader blends the
   formations (galaxy, exterior, interior, clay model, planet, orbit stream)
   with uniforms, so a frame is only uniform changes and one draw call.
   API: window.OrbitSpace = { ready, paint(hex|null), ripple(x, y),
        setScene(id|null), quality, pointsInView,
        frame, camera(), dim(k), onFrame(fn) }  + event "orbit:space-ready".
   Round 4 (28 Oct): interior points may come in the 3D house's MODEL frame
   (`frame:{center}`), scenes room / eye / top, beats inside tall acts.
   Round 5 (28 Oct): hero film (12 s time loop: ring -> house outline from assets/space/outline.js
   -> hold -> sparse cloud -> ring), walk beat gathers the room from a loose cloud, form beat snaps
   the points onto the walls (exact wall planes from the outline) and lifts the roof off, and the
   subject of condense / room / top / orbit sits right on desktop, low on phones (lens shift).
   Round 6 (28 Oct): calm hero film (about 50 s, time driven only while the visitor has not clicked,
   tapped or scrolled): ring -> the building from the air (exterior points) -> the house outline ->
   a furniture piece (ORBIT_POINTS.forms, skipped when missing) -> loose drifting points -> ring.
   No automatic sweep line any more. Exterior points may carry a model frame (same frame as the
   aerial splat); `condense` then lands exactly on ORBIT_FILM.poses.aerial and camera() is valid there.
   Desktop subjects sit on the centre of the visible [data-subject] of the active section.
   Pauses while the tab is hidden or the canvas is off screen; OrbitSpace.pause(true) stops it on request.
   Round 8 (29 Oct): the hero film is ONE short sequence that plays once (about 8.6 s): ring -> house
   outline -> the building from the air, which lands exactly on a real render still of the streamed aerial
   splat (assets/stage/still-hero.webp, -phone.webp; HERO_STILL below = its camera). The still sits in the
   hero ([data-hero-solid], object-fit cover) and this file fades it in; the points follow its on-screen box
   (cover maths), so they line up at every aspect ratio, then fade out. First click / tap / scroll: the film
   jumps smoothly to that end state. dim(k) below 0.003 = really hidden: no drawing, no frames (sleeps) until
   dim rises again. A section with class seg1 and no [data-subject] keeps its subject centred.
   Round 9 (29 Oct, the review fixes): every point scene comes from the house's own points. calm = a very sparse
   dust (no ghost of the floor behind #examples); orbit (#who) = the real building (exterior points cropped to
   the house) slowly turning; planet (the ending, #contact) = the building again with an orbit ring made of its
   own points (the logo, made of the house). orbit and planet are fitted into the section's [data-subject-fit]
   box and move with the page (TRACK), gather from a loose cloud as their section arrives (uGP), and the points
   go dark while such a scene is only half on (seamK), so no cloud sweeps over the words. */
(function () {
  "use strict";

  var win = window, doc = document, root = doc.documentElement;
  var canvas = doc.getElementById("space");
  var params = new URLSearchParams(location.search);

  /* ---------- Public API (exists even when we fall back to the still) ---------- */
  var st = { ready: false, quality: "high", drawn: 0, dimT: 1, cam: null, hooks: [] };
  /* Parts of the page without points (29 Oct, James: no points once the walk reaches the garden,
     through #compare): elements with [data-points-off]. While the screen centre is inside one the
     points are hidden whatever the stage asks; they fade over a quarter screen before it and half a
     screen after it. The real brightness = the stage's dim(k) x this gate. */
  var dimReq = 1, gate = 1, gateEls = null;
  function gateNow() {
    if (!gateEls) gateEls = doc.querySelectorAll("[data-points-off]");
    var c = win.innerHeight / 2, F = win.innerHeight * 0.25, g = 1;
    for (var i = 0; i < gateEls.length; i++) {
      var r = gateEls[i].getBoundingClientRect();
      var d = c < r.top ? (r.top - c) / F : c > r.bottom ? (c - r.bottom) / (2 * F) : 0;
      g = Math.min(g, d);
    }
    return clamp(g, 0, 1);
  }
  function applyDim() {
    var v = dimReq * gate;
    st.dimT = v < DIM_OFF ? 0 : v;
    if (typeof kick === "function") kick();
    if (st.dimT >= DIM_OFF && typeof wake === "function") wake();
  }
  function onGate() { var g = gateNow(); if (g !== gate) { gate = g; applyDim(); } }
  win.addEventListener("scroll", onGate, { passive: true });
  win.addEventListener("resize", onGate);
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", onGate); else onGate();
  var DIM_OFF = 0.003; // dim below this = points really hidden (no drawing, engine asleep)
  var api = {
    paint: function (c) { setPaint(c); },
    ripple: function (x, y) { addRipple(x, y, 1); },
    setScene: function (id) { forced = (id && SCENES.indexOf(id) > -1) ? id : null; },
    /* dim(k): 0..1 multiplies the brightness of every point (eased over ~0.4 s).
       The stage dims the points while the solid house is on screen. Round 8: below 0.003 the points
       are really hidden: once the eased value gets there the canvas is cleared to the page colour and
       the engine sleeps (no frames, camera() and onFrame stay at the last frame) until dim rises again;
       it then wakes on the CURRENT scene (no replay of a stale one) and fades in from 0. */
    dim: function (k) {
      var v = clamp(+k, 0, 1); if (!(v >= 0)) v = 1;
      dimReq = v;
      applyDim();
    },
    /* (3 Nov 2026) the brightness the points really have now (dim() eases in over ~0.4 s): the stacked house
       fades its own points with this, so the hand-over never dips dark or flashes (js/stage-stack.js) */
    level: function () { return dimC; },
    /* test bed only: put the hero film at time t (s); hold = true keeps it there */
    setHeroT: function (t, hold) { if (typeof heroSet === "function") heroSet(t, hold); },
    /* camera(): the camera of the frame just drawn, in the house's MODEL metres
       (glTF frame, Y up, the frame of walls.glb), or null before the first frame:
         { eye:[x,y,z], target:[x,y,z], up:[0,1,0],
           fov,      vertical field of view in RADIANS (already widened on tall screens)
           near, far, (metres)
           shift:[sx,sy],  lens shift = projection matrix elements m[8], m[9]
           aspect,   width / height of #space (same full-window size as #stage)
           valid,    true when the points of the current scene carry a model frame (interior:
                     OrbitSpace.frame; in condense: the exterior file's frame, round 6)
           time }    performance.now() of that frame (ms)
       To put a solid model exactly on the points, build the view and projection like this
       (column-major, OpenGL clip space, what PlayCanvas uses):
         view = lookAt(eye, target, up)          (camera looks down -Z, like pc.Entity.lookAt)
         proj = perspective(fov, aspect, near, far)   (standard GL: f = 1/tan(fov/2),
                m[0] = f/aspect, m[5] = f, m[10] = (far+near)/(near-far), m[11] = -1,
                m[14] = 2*far*near/(near-far))
         proj[8] = shift[0]; proj[9] = shift[1];     (the lens shift; NDC moves by -shift)
       PlayCanvas: entity.setPosition(eye); entity.lookAt(target, up);
         camera.fov = fov * 180/Math.PI (vertical); camera.nearClip = near; camera.farClip = far;
         camera.calculateProjection = function (m) { m.setPerspective(camera.fov, aspect, near, far);
           m.data[8] = shift[0]; m.data[9] = shift[1]; };
       Read it in your own requestAnimationFrame (space.js registers first, so it has drawn
       already) or inside onFrame(fn), which is called right after every drawn frame.
       Without a model frame (old point files) the numbers are the engine's world / scale:
       right shape, but NOT the house's coordinates (valid = false). */
    camera: function () {
      var c = st.cam; if (!c) return null;
      return { eye: c.eye.slice(), target: c.target.slice(), up: [0, 1, 0], fov: c.fov, near: c.near, far: c.far,
        shift: c.shift.slice(), aspect: c.aspect, valid: c.valid, time: c.time };
    },
    onFrame: function (fn) { if (typeof fn === "function") st.hooks.push(fn); },
    /* lead(view, k) (30 Oct night, James: the points form where card A will show the splat): the camera
       eases onto view (MODEL metres, { eye, target, fov (radians, final), shift (= m[8], m[9]) }) by k 0..1.
       The stage calls it every frame; a lead older than 0.25 s is dropped, lead(null) drops it at once. */
    lead: function (v, k) {
      st.lead = v && ok3L(v.eye) && ok3L(v.target) && isFinite(v.fov) ? { v: v, k: clamp(+k || 0, 0, 1), at: performance.now() } : null;
    },
    /* pause(true): stop all motion (the last frame stays on screen); pause(false): go on.
       For a visible "pause motion" control. Hidden tabs and an off-screen canvas pause by themselves. */
    pause: function (on) { st.userPause = !!on; if (typeof wake === "function") wake(); }
  };
  Object.defineProperty(api, "paused", { enumerable: true, get: function () { return !!st.userPause; } });
  Object.defineProperty(api, "ready", { enumerable: true, get: function () { return st.ready; } });
  Object.defineProperty(api, "quality", { enumerable: true, get: function () { return st.quality; } });
  Object.defineProperty(api, "pointsInView", { enumerable: true, get: function () { return st.drawn; } });
  // frame: the model point [x,y,z] the stored interior points are relative to (model = stored + center), or null
  Object.defineProperty(api, "frame", { enumerable: true, get: function () { return DATA && DATA.inn.frame ? DATA.inn.frame.slice() : null; } });
  win.OrbitSpace = api;
  function ok3L(a) { return Array.isArray(a) && a.length >= 3 && isFinite(a[0]) && isFinite(a[1]) && isFinite(a[2]); }

  function still() { root.classList.add("space-still"); st.quality = "low"; }

  // (30 Oct: "orbit" sits right after "condense": the shader blends formations by walking this list (uFilm),
  // so the house -> building change of the scan act no longer passes through the room / model / paint forms,
  // and calm -> planet at the ending are neighbours too)
  var SCENES = ["space", "condense", "orbit", "inside", "room", "eye", "top", "model", "paint", "calm", "planet"];
  var forced = null, DBG = params.has("spacedbg");
  var qp = params.get("scene");
  if (qp && SCENES.indexOf(qp) > -1) forced = qp;

  if (!canvas) return;
  var reduced = win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var GLOPTS = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: "high-performance" };
  var gl = null;
  try { gl = canvas.getContext("webgl2", GLOPTS); } catch (e) { gl = null; }
  if (!gl) { still(); return; }

  var isPhone = (win.matchMedia && win.matchMedia("(pointer: coarse)").matches) || win.innerWidth < 768;
  var CAP = isPhone ? 70000 : 160000;
  var MIN_COUNT = isPhone ? 22000 : 40000;
  var dprCap = isPhone ? 1.5 : 1.75;
  var lockQ = params.get("quality");           // ?quality=high|low for testing
  if (lockQ === "low") { CAP = Math.min(CAP, 60000); dprCap = 1; st.quality = "low"; }

  /* ---------- Small maths ---------- */
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }
  // Critically damped follow (frame-rate independent). v = velocity store, i = index.
  function damp(cur, target, v, i, smooth, dt) {
    var om = 2 / smooth, x = om * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    var ch = cur - target, tmp = (v[i] + om * ch) * dt;
    v[i] = (v[i] - om * tmp) * e;
    return target + (ch + tmp) * e;
  }
  function rng(seed) { // mulberry32
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(a, b) { var h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c]; }
  function rotZ(a) { var c = Math.cos(a), s = Math.sin(a); return [c, s, 0, -s, c, 0, 0, 0, 1]; }
  function mul3(A, B) {
    var o = new Array(9);
    for (var c = 0; c < 3; c++) for (var r = 0; r < 3; r++) {
      o[c * 3 + r] = A[r] * B[c * 3] + A[3 + r] * B[c * 3 + 1] + A[6 + r] * B[c * 3 + 2];
    }
    return o;
  }
  function pct(sorted, q) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))] : 0; }
  function num(a, b) { return a - b; }

  /* ---------- Point data ---------- */
  function decode(set, cap) {
    if (!set || !set.b64 || !set.count) return null;
    try {
      var bin = atob(set.b64);
      var n = Math.min(set.count, Math.floor(bin.length / 10), cap);
      if (n < 1000) return null;
      var u8 = new Uint8Array(n * 10);
      for (var i = 0; i < u8.length; i++) u8[i] = bin.charCodeAt(i);
      var dv = new DataView(u8.buffer), ex = set.extent || [1, 1, 1];
      var pos = new Float32Array(n * 3), col = new Uint8Array(n * 4);
      for (i = 0; i < n; i++) {
        var o = i * 10;
        pos[i * 3] = dv.getInt16(o, true) / 32767 * ex[0];
        pos[i * 3 + 1] = dv.getInt16(o + 2, true) / 32767 * ex[1];
        pos[i * 3 + 2] = dv.getInt16(o + 4, true) / 32767 * ex[2];
        col[i * 4] = u8[o + 6]; col[i * 4 + 1] = u8[o + 7]; col[i * 4 + 2] = u8[o + 8]; col[i * 4 + 3] = u8[o + 9];
      }
      var fr = set.frame && set.frame.center && set.frame.center.length === 3 ? set.frame.center.map(Number) : null;
      if (fr && !(isFinite(fr[0]) && isFinite(fr[1]) && isFinite(fr[2]))) fr = null;
      // Round 4: model frame (model = stored + center). Framing then comes from the film poses.
      if (fr) return { n: n, pos: pos, col: col, real: true, extent: ex, frame: fr, hints: set.hints || {} };
      return { n: n, pos: pos, col: col, real: true, extent: ex, hints: set.hints || builtInHints(ex) };
    } catch (e) { return null; }
  }
  // Framing hints in the data's own units. A point file may carry its own
  // `hints` object; these are the defaults for the two scans shipped on 27 Oct.
  function builtInHints(ex) {
    function is(a, b) { return Math.abs(a[0] - b[0]) < 0.02 && Math.abs(a[1] - b[1]) < 0.02 && Math.abs(a[2] - b[2]) < 0.02; }
    if (is(ex, [7.6994, 1.5163, 7.9921])) return { target: [-1.9, -0.75, 1.6], front: [0.35, 0, 1] };
    if (is(ex, [5.892, 1.334, 3.0239])) return { eye: [1.0, 0.3, 0.3], look: [4, 0, -0.8], cut: 0.6 };
    return null;
  }

  // Centre on xz, ground at y = 0, scale so 95 % of the points sit within targetR.
  function normalise(s, targetR) {
    var n = s.n, p = s.pos, step = Math.max(1, Math.floor(n / 24000)), xs = [], ys = [], zs = [], i;
    for (i = 0; i < n; i += step) { xs.push(p[i * 3]); ys.push(p[i * 3 + 1]); zs.push(p[i * 3 + 2]); }
    xs.sort(num); ys.sort(num); zs.sort(num);
    var cx = (pct(xs, 0.02) + pct(xs, 0.98)) / 2, cz = (pct(zs, 0.02) + pct(zs, 0.98)) / 2, y0 = pct(ys, 0.004);
    if (s.hints && s.hints.target) { cx = s.hints.target[0]; cz = s.hints.target[2]; }
    // Model frame: world = (model - [center.x, 0, center.z]) * k, so the model floor (y = 0)
    // is world y = 0 and the whole mapping is one uniform scale + shift (no tilt, no re-centring).
    if (s.frame) { cx = 0; cz = 0; y0 = -s.frame[1]; s.hints.floor = typeof s.hints.floor === "number" ? s.hints.floor : -s.frame[1]; }
    var ax = [], az = [];
    for (i = 0; i < xs.length; i++) { ax.push(Math.abs(xs[i] - cx)); az.push(Math.abs(zs[i] - cz)); }
    ax.sort(num); az.sort(num);
    var hx = pct(ax, 0.97), hz = pct(az, 0.97);
    var k = targetR / Math.max(hx, hz, 1e-3);
    for (i = 0; i < n; i++) {
      p[i * 3] = (p[i * 3] - cx) * k; p[i * 3 + 1] = (p[i * 3 + 1] - y0) * k; p[i * 3 + 2] = (p[i * 3 + 2] - cz) * k;
    }
    s.k = k; s.hx = hx * k; s.hz = hz * k; s.h = (pct(ys, 0.99) - y0) * k;
    s.toW = function (v) { return [(v[0] - cx) * k, (v[1] - y0) * k, (v[2] - cz) * k]; };
    var F = s.frame;
    // model metres <-> engine world (only meaningful with a frame; else world / k around the scan centre)
    s.fromM = F ? function (m) { return [(m[0] - F[0]) * k, m[1] * k, (m[2] - F[2]) * k]; } : function (m) { return [m[0] * k, m[1] * k, m[2] * k]; };
    s.toM = F ? function (w) { return [w[0] / k + F[0], w[1] / k, w[2] / k + F[2]]; } : function (w) { return [w[0] / k, w[1] / k, w[2] / k]; };
    // surface area estimate from occupied voxels (for the point size)
    var v = 0.14 * targetR / 5, set = new Set();
    for (i = 0; i < n; i++) {
      set.add((Math.floor(p[i * 3] / v) + 1024) + (Math.floor(p[i * 3 + 1] / v) + 512) * 2048 + (Math.floor(p[i * 3 + 2] / v) + 1024) * 2097152);
    }
    s.area = set.size * v * v * 1.15;
    return s;
  }

  // Round 6: put a model-frame point set (model = stored + center) into another set's world
  // (the interior's: world = (model - [F.x, 0, F.z]) * k).
  function placeIn(s, ref) {
    var p = s.pos, C = s.frame, F = ref.frame, k = ref.k, i;
    for (i = 0; i < s.n; i++) {
      p[i * 3] = (p[i * 3] + C[0] - F[0]) * k; p[i * 3 + 1] = (p[i * 3 + 1] + C[1]) * k; p[i * 3 + 2] = (p[i * 3 + 2] + C[2] - F[2]) * k;
    }
    s.k = k; s.toW = function (v) { return ref.fromM(v); }; s.fromM = ref.fromM; s.toM = ref.toM; s.inModel = true;
  }
  // Robust centre, size and surface area of the exterior (in whatever world it now lives).
  function extStats(s) {
    var n = s.n, p = s.pos, step = Math.max(1, Math.floor(n / 24000)), xs = [], ys = [], zs = [], i;
    for (i = 0; i < n; i += step) { xs.push(p[i * 3]); ys.push(p[i * 3 + 1]); zs.push(p[i * 3 + 2]); }
    xs.sort(num); ys.sort(num); zs.sort(num);
    var c = s.inModel ? [pct(xs, 0.5), 0, pct(zs, 0.5)] : [0, 0, 0], ax = [], az = [], ds = [];
    for (i = 0; i < xs.length; i++) { ax.push(Math.abs(xs[i] - c[0])); az.push(Math.abs(zs[i] - c[2])); }
    ax.sort(num); az.sort(num);
    for (i = 0; i < n; i += step) ds.push(Math.hypot(p[i * 3] - c[0], p[i * 3 + 2] - c[2]));
    ds.sort(num);
    if (s.inModel) { s.hx = pct(ax, 0.97); s.hz = pct(az, 0.97); s.y0 = pct(ys, 0.004); s.h = pct(ys, 0.99) - s.y0; }
    s.c = c; s.crop = pct(ds, 0.66);
    var v = 0.168 * (s.inModel ? Math.max(1, Math.max(s.hx, s.hz) / 6) : 1), set = new Set();
    for (i = 0; i < n; i++) {
      var ix = clamp(Math.floor(p[i * 3] / v), -1023, 1023), iy = clamp(Math.floor(p[i * 3 + 1] / v), -511, 511), iz = clamp(Math.floor(p[i * 3 + 2] / v), -1023, 1023);
      set.add((ix + 1024) + (iy + 512) * 2048 + (iz + 1024) * 2097152);
    }
    s.area = set.size * v * v * 1.15;
  }

  // Clay model: find floor, ceiling and axis-aligned wall planes, snap points to them.
  // Level a tilted scan: fit a plane to the lowest points per 0.6 m cell and subtract its slope.
  function level(s) {
    var n = s.n, p = s.pos, k = s.k, cs = 0.6 * k, R = Math.max(s.hx, s.hz) * 1.3, g = Math.ceil(2 * R / cs), cells = {}, i;
    for (i = 0; i < n; i++) {
      var ix = Math.floor((p[i * 3] + R) / cs), iz = Math.floor((p[i * 3 + 2] + R) / cs);
      if (ix < 0 || iz < 0 || ix >= g || iz >= g) continue;
      var key = iz * g + ix; (cells[key] || (cells[key] = [])).push(p[i * 3 + 1]);
    }
    var pts = [], lows = [];
    Object.keys(cells).forEach(function (key) {
      var a = cells[key]; if (a.length < 25) return;
      a.sort(num); var y = pct(a, 0.03), kk = +key;
      pts.push([((kk % g) + 0.5) * cs - R, y, (Math.floor(kk / g) + 0.5) * cs - R]); lows.push(y);
    });
    if (pts.length < 8) return;
    lows.sort(num);
    var med = pct(lows, 0.3), use = pts.filter(function (q) { return Math.abs(q[1] - med) < 0.3 * k; });
    if (use.length < 8) return;
    // least squares y = a + b x + c z
    var Sx = 0, Sz = 0, Sy = 0, Sxx = 0, Szz = 0, Sxz = 0, Sxy = 0, Szy = 0, m = use.length;
    use.forEach(function (q) { Sx += q[0]; Sz += q[2]; Sy += q[1]; Sxx += q[0] * q[0]; Szz += q[2] * q[2]; Sxz += q[0] * q[2]; Sxy += q[0] * q[1]; Szy += q[2] * q[1]; });
    var mx = Sx / m, mz = Sz / m, my = Sy / m;
    var a11 = Sxx / m - mx * mx, a22 = Szz / m - mz * mz, a12 = Sxz / m - mx * mz, b1 = Sxy / m - mx * my, b2 = Szy / m - mz * my;
    var det = a11 * a22 - a12 * a12; if (Math.abs(det) < 1e-9) return;
    var bx = (b1 * a22 - b2 * a12) / det, bz = (a11 * b2 - a12 * b1) / det;
    if (Math.abs(bx) > 0.08 || Math.abs(bz) > 0.08) return; // more than ~4.5 degrees: not a tilt, leave it
    for (i = 0; i < n; i++) p[i * 3 + 1] -= bx * p[i * 3] + bz * p[i * 3 + 2];
    s.tilt = [bx, bz];
  }

  // Round 5: the house outline (edges of walls.glb, model metres) knows exactly where every wall
  // face is. Move each wall plane found in the scan onto the nearest strong outline plane within
  // 10 cm, so snapped points land exactly on the solid model's walls. coords = world x (or z) values.
  function refinePeaks(peaks, coords, k) {
    if (!coords || coords.length < 2000 || !peaks.length) return peaks;
    var bin = 0.01 * k, lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < coords.length; i++) { if (coords[i] < lo) lo = coords[i]; if (coords[i] > hi) hi = coords[i]; }
    var nb = Math.min(20000, Math.ceil((hi - lo) / bin) + 3), h = new Float32Array(nb);
    for (i = 0; i < coords.length; i++) { var b = Math.floor((coords[i] - lo) / bin) + 1; if (b > 0 && b < nb - 1) h[b]++; }
    var sm = new Float32Array(nb), nz = [];
    for (i = 1; i < nb - 1; i++) { sm[i] = (h[i - 1] + 2 * h[i] + h[i + 1]) / 4; if (sm[i] > 0) nz.push(sm[i]); }
    nz.sort(num); var thr = Math.max(8, pct(nz, 0.5) * 4);
    return peaks.map(function (pk) {
      var c = Math.floor((pk - lo) / bin) + 1, best = -1, bd = 1e9, win = Math.ceil(0.1 * k / bin);
      for (var j = Math.max(2, c - win); j <= Math.min(nb - 3, c + win); j++) {
        if (sm[j] < thr || sm[j] < sm[j - 1] || sm[j] < sm[j + 1]) continue;
        var d = Math.abs(j - c); if (d < bd) { bd = d; best = j; }
      }
      if (best < 0) return pk;
      var w0 = h[best - 1], w1 = h[best], w2 = h[best + 1], ws = w0 + w1 + w2 || 1;
      return lo + (best - 1 + 0.5 + (w2 - w0) / ws) * bin;
    });
  }

  // The house's floor plan from the outline: cells (10 cm) with outline points near the floor are
  // the plan's lines; a flood fill from the border finds the outside. Returns inside(x, z) or null.
  function footMask(o, k) {
    var cs = 0.1 * k, n = o.x.length, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, i;
    for (i = 0; i < n; i++) { if (o.x[i] < x0) x0 = o.x[i]; if (o.x[i] > x1) x1 = o.x[i]; if (o.z[i] < z0) z0 = o.z[i]; if (o.z[i] > z1) z1 = o.z[i]; }
    x0 -= 3 * cs; z0 -= 3 * cs;
    var gx = Math.ceil((x1 - x0) / cs) + 4, gz = Math.ceil((z1 - z0) / cs) + 4;
    if (gx * gz > 400000 || gx < 8 || gz < 8) return null;
    var line = new Uint8Array(gx * gz), out = new Uint8Array(gx * gz), cnt = 0;
    for (i = 0; i < n; i++) {
      if (o.y[i] > 0.12 * k) continue;
      var ix = Math.floor((o.x[i] - x0) / cs), iz = Math.floor((o.z[i] - z0) / cs);
      for (var dz = -1; dz <= 1; dz++) for (var dx = -1; dx <= 1; dx++) { var jx = ix + dx, jz = iz + dz; if (jx >= 0 && jz >= 0 && jx < gx && jz < gz) line[jz * gx + jx] = 1; }
      cnt++;
    }
    if (cnt < 500) return null;
    var st2 = [0]; out[0] = 1;
    while (st2.length) {
      var c = st2.pop(), cx = c % gx, cz = (c - cx) / gx;
      if (cx > 0 && !out[c - 1] && !line[c - 1]) { out[c - 1] = 1; st2.push(c - 1); }
      if (cx < gx - 1 && !out[c + 1] && !line[c + 1]) { out[c + 1] = 1; st2.push(c + 1); }
      if (cz > 0 && !out[c - gx] && !line[c - gx]) { out[c - gx] = 1; st2.push(c - gx); }
      if (cz < gz - 1 && !out[c + gx] && !line[c + gx]) { out[c + gx] = 1; st2.push(c + gx); }
    }
    var ins = 0; for (i = 0; i < out.length; i++) if (!out[i]) ins++;
    var box = ((x1 - x0) / cs - 1) * ((z1 - z0) / cs - 1);
    if (ins < 0.25 * box || ins > 0.98 * box) return null; // plan not closed (leak) or nothing found: no mask
    function cell(x, z) { var ix2 = Math.floor((x - x0) / cs), iz2 = Math.floor((z - z0) / cs); return ix2 >= 0 && iz2 >= 0 && ix2 < gx && iz2 < gz ? iz2 * gx + ix2 : -1; }
    return {
      inside: function (x, z) { var c2 = cell(x, z); return c2 >= 0 && !out[c2]; },
      wall: function (x, z) { var c2 = cell(x, z); return c2 >= 0 && line[c2] === 1; } // on (within ~10 cm of) a wall's foot line
    };
  }
  // every strong plane of the outline along one axis (wall faces), world units
  function outlinePlanes(coords, k) {
    var bin = 0.01 * k, lo = Infinity, hi = -Infinity, i, out = [];
    for (i = 0; i < coords.length; i++) { if (coords[i] < lo) lo = coords[i]; if (coords[i] > hi) hi = coords[i]; }
    var nb = Math.min(20000, Math.ceil((hi - lo) / bin) + 3), h = new Float32Array(nb), sm = new Float32Array(nb), nz = [];
    for (i = 0; i < coords.length; i++) { var b = Math.floor((coords[i] - lo) / bin) + 1; if (b > 0 && b < nb - 1) h[b]++; }
    for (i = 1; i < nb - 1; i++) { sm[i] = (h[i - 1] + 2 * h[i] + h[i + 1]) / 4; if (sm[i] > 0) nz.push(sm[i]); }
    nz.sort(num); var thr = Math.max(8, pct(nz, 0.5) * 4);
    for (i = 3; i < nb - 3; i++) {
      if (sm[i] < thr || sm[i] < sm[i - 1] || sm[i] <= sm[i + 1] || sm[i] < sm[i - 2] || sm[i] < sm[i + 2]) continue;
      var ws = h[i - 1] + h[i] + h[i + 1] || 1;
      out.push(lo + (i - 1 + 0.5 + (h[i + 1] - h[i - 1]) / ws) * bin);
    }
    return out;
  }

  function buildModel(s, outW) {
    if (!s.frame) level(s); // a model-frame file is level already (and must stay 1:1 with the house)
    var n = s.n, p = s.pos, k = s.k, H = Math.max(s.h, 0.5), i;
    var bin = 0.025 * k, nb = Math.ceil(H * 1.05 / bin) + 2, hy = new Float32Array(nb);
    for (i = 0; i < n; i++) { var b = Math.floor(p[i * 3 + 1] / bin); if (b >= 0 && b < nb) hy[b]++; }
    // floor: the LOWEST clear peak (not the densest band, which is often furniture)
    var lowMax = 0, j0;
    for (j0 = 0; j0 < Math.floor(nb * 0.45); j0++) lowMax = Math.max(lowMax, hy[j0]);
    var floorY = 0;
    for (j0 = 1; j0 < Math.floor(nb * 0.45); j0++) {
      if (hy[j0] >= lowMax * 0.4 && hy[j0] >= hy[j0 - 1] && hy[j0] >= hy[j0 + 1] && hy[j0] >= (hy[j0 + 2] || 0)) { floorY = (j0 + 0.5) * bin; break; }
    }
    // ceiling: scans often miss it, so use the robust top of the points
    var ys = [], stp = Math.max(1, Math.floor(n / 20000));
    for (i = 0; i < n; i += stp) ys.push(p[i * 3 + 1]);
    ys.sort(num);
    var ceilY = pct(ys, 0.994);
    if (ceilY - floorY < 1.8 * k) ceilY = Math.min(H, floorY + 2.6 * k);
    if (ceilY - floorY > 3.4 * k) ceilY = floorY + 2.7 * k;
    var hint = s.hints || {};
    if (typeof hint.floor === "number") floorY = s.toW([0, hint.floor, 0])[1];
    var lo = floorY + 0.35 * k, hi = Math.min(ceilY - 0.3 * k, floorY + 2.1 * k);
    var wb = 0.04 * k, R = Math.max(s.hx, s.hz) * 1.6, nw = Math.ceil(2 * R / wb), hx = new Float32Array(nw), hz = new Float32Array(nw), cnt = 0;
    for (i = 0; i < n; i++) {
      var y = p[i * 3 + 1]; if (y < lo || y > hi) continue;
      var bx = Math.floor((p[i * 3] + R) / wb), bz = Math.floor((p[i * 3 + 2] + R) / wb);
      if (bx >= 0 && bx < nw) hx[bx]++; if (bz >= 0 && bz < nw) hz[bz]++; cnt++;
    }
    function smooth(h) { var o = new Float32Array(h.length); for (var j = 2; j < h.length - 2; j++) o[j] = (h[j - 2] + 2 * h[j - 1] + 3 * h[j] + 2 * h[j + 1] + h[j + 2]) / 9; return o; }
    function peaks(h) {
      var sm = smooth(h), m = 0, j, out = [];
      for (j = 0; j < sm.length; j++) m += sm[j]; m /= sm.length;
      var sep = 6;
      for (j = sep; j < sm.length - sep; j++) {
        if (sm[j] < m * 3.2) continue;
        var ok = true;
        for (var q = j - sep; q <= j + sep; q++) if (sm[q] > sm[j] || (sm[q] === sm[j] && q < j)) { ok = false; break; }
        if (ok) out.push([(j + 0.5) * wb - R, sm[j]]);
      }
      out.sort(function (a, b2) { return b2[1] - a[1]; });
      return out.slice(0, 14).map(function (e) { return e[0]; });
    }
    var px = cnt > 500 ? peaks(hx) : [], pz = cnt > 500 ? peaks(hz) : [];
    // Round 5: with the outline the wall planes are the real model's wall faces, and a point only
    // snaps where the plan really has a wall (near a wall's foot line), not anywhere along the plane.
    var fm = outW ? footMask(outW, k) : null, opx = fm ? outlinePlanes(outW.x, k) : [], opz = fm ? outlinePlanes(outW.z, k) : [];
    var exact = !!(fm && opx.length && opz.length);
    if (exact) { px = opx; pz = opz; s.refined = "outline"; }
    else if (outW) { px = refinePeaks(px, outW.x, k); pz = refinePeaks(pz, outW.z, k); s.refined = true; }
    var classes = [0, 0, 0, 0, 0];
    var mod = new Float32Array(n * 4), snapW = 0.11 * k, fl = 0.09 * k, cl = 0.1 * k, wallMin = floorY + 0.12 * k;
    for (i = 0; i < n; i++) {
      var x = p[i * 3], yy = p[i * 3 + 1], z = p[i * 3 + 2], cls = 0;
      if (yy - floorY < fl) { yy = floorY; cls = 3; }
      else if (ceilY - yy < cl) { yy = ceilY; cls = 4; }
      else if (yy > wallMin && (!exact || fm.wall(x, z))) {
        var dx = 1e9, dz = 1e9, sx = x, sz = z, j2, d;
        for (j2 = 0; j2 < px.length; j2++) { d = Math.abs(x - px[j2]); if (d < dx) { dx = d; sx = px[j2]; } }
        for (j2 = 0; j2 < pz.length; j2++) { d = Math.abs(z - pz[j2]); if (d < dz) { dz = d; sz = pz[j2]; } }
        if (Math.min(dx, dz) < snapW) { if (dx < dz) { x = sx; cls = 1; } else { z = sz; cls = 2; } }
      }
      mod[i * 4] = x; mod[i * 4 + 1] = yy; mod[i * 4 + 2] = z; mod[i * 4 + 3] = cls;
      classes[cls]++;
    }
    // Clean floor slab for the model: scans rarely capture the whole floor, so a share of the
    // loose points (class 0) moves onto the room's footprint in the model formation.
    var fc = 0.3 * k, fg = Math.ceil(2 * Math.max(s.hx, s.hz) * 1.2 / fc), off = fg * fc / 2, foot = new Uint8Array(fg * fg), q2;
    for (i = 0; i < n; i++) {
      var ix3 = Math.floor((p[i * 3] + off) / fc), iz3 = Math.floor((p[i * 3 + 2] + off) / fc);
      if (ix3 >= 0 && iz3 >= 0 && ix3 < fg && iz3 < fg && foot[iz3 * fg + ix3] < 250) foot[iz3 * fg + ix3]++;
    }
    for (q2 = 0; q2 < foot.length; q2++) foot[q2] = foot[q2] >= 14 ? 1 : 0;
    for (var pass = 0; pass < 2; pass++) {
      var nf = foot.slice();
      for (var zz = 1; zz < fg - 1; zz++) for (var xx = 1; xx < fg - 1; xx++) {
        if (foot[zz * fg + xx]) continue;
        var nb2 = 0; for (var oz = -1; oz <= 1; oz++) for (var ox = -1; ox <= 1; ox++) nb2 += foot[(zz + oz) * fg + xx + ox];
        if (nb2 >= 5) nf[zz * fg + xx] = 1;
      }
      foot = nf;
    }
    var cellsF = []; for (q2 = 0; q2 < foot.length; q2++) if (foot[q2]) cellsF.push(q2);
    // loose points outside the footprint are scan noise: class 5, hidden in the clean model
    var dens = new Uint16Array(fg * fg);
    for (i = 0; i < n; i++) {
      var ix4 = Math.floor((p[i * 3] + off) / fc), iz4 = Math.floor((p[i * 3 + 2] + off) / fc);
      if (ix4 >= 0 && iz4 >= 0 && ix4 < fg && iz4 < fg && dens[iz4 * fg + ix4] < 60000) dens[iz4 * fg + ix4]++;
    }
    for (i = 0; i < n; i++) {
      if (mod[i * 4 + 3] !== 0) continue;
      var ix5 = Math.floor((mod[i * 4] + off) / fc), iz5 = Math.floor((mod[i * 4 + 2] + off) / fc);
      var inside = ix5 >= 0 && iz5 >= 0 && ix5 < fg && iz5 < fg && foot[iz5 * fg + ix5] && dens[iz5 * fg + ix5] > 30;
      if (!inside) { mod[i * 4 + 3] = 5; classes[0]--; classes.push && (classes[5] = (classes[5] || 0) + 1); }
    }
    if (cellsF.length > 20) {
      var RR = rng(4242);
      for (i = 0; i < n; i++) {
        if (mod[i * 4 + 3] !== 0 || RR() > 0.4) continue;
        var c2 = cellsF[Math.floor(RR() * cellsF.length)];
        mod[i * 4] = ((c2 % fg) + RR()) * fc - off; mod[i * 4 + 1] = floorY; mod[i * 4 + 2] = (Math.floor(c2 / fg) + RR()) * fc - off; mod[i * 4 + 3] = 3;
        classes[0]--; classes[3]++;
      }
    }
    // Round 5: with the outline, everything outside the house's real floor plan is scan noise for the
    // clean model (class 5: lifts away with the roof), so no snapped point peeks out past the solid walls.
    if (fm) {
      for (i = 0; i < n; i++) {
        var c5 = mod[i * 4 + 3]; if (c5 === 5) continue;
        if (!fm.inside(mod[i * 4], mod[i * 4 + 2])) { classes[c5]--; classes[5] = (classes[5] || 0) + 1; mod[i * 4 + 3] = 5; }
      }
      s.footMasked = true;
    }
    s.classes = classes; s.planes = [px.length, pz.length];
    s.mod = mod; s.floorY = floorY; s.ceilY = ceilY;
    s.cut = typeof hint.cut === "number" ? s.toW([0, hint.cut, 0])[1] : floorY + Math.min(0.78 * (ceilY - floorY), 2.15 * k);
    s.grid = 0.07 * k;
    // inside camera: from the hints, else the most open spot at eye height
    var eye = floorY + 1.55 * k;
    if (hint.eye && hint.look) { s.eye = s.toW(hint.eye); s.look = s.toW(hint.look); }
    else {
      var cs = 0.25 * k, gx = Math.ceil(s.hx * 2 / cs) + 1, gz = Math.ceil(s.hz * 2 / cs) + 1, occ = new Uint8Array(gx * gz);
      for (i = 0; i < n; i++) {
        var y3 = p[i * 3 + 1]; if (y3 < floorY + 0.8 * k || y3 > floorY + 2.0 * k) continue;
        var ix = Math.floor((p[i * 3] + s.hx) / cs), iz = Math.floor((p[i * 3 + 2] + s.hz) / cs);
        if (ix >= 0 && iz >= 0 && ix < gx && iz < gz && occ[iz * gx + ix] < 255) occ[iz * gx + ix]++;
      }
      function blocked(ix2, iz2) { return ix2 < 0 || iz2 < 0 || ix2 >= gx || iz2 >= gz || occ[iz2 * gx + ix2] > 2; }
      var best = -1, bx2 = 0, bz2 = 0, bdx = 1, bdz = 0;
      for (var cz2 = 2; cz2 < gz - 2; cz2++) for (var cx2 = 2; cx2 < gx - 2; cx2++) {
        if (blocked(cx2, cz2)) continue;
        var clear = 9; for (var r2 = 1; r2 < 6 && clear === 9; r2++) for (var a5 = 0; a5 < 8; a5++) if (blocked(Math.round(cx2 + Math.cos(a5 * 0.785) * r2), Math.round(cz2 + Math.sin(a5 * 0.785) * r2))) { clear = r2; break; }
        for (var a6 = 0; a6 < 16; a6++) {
          var dx6 = Math.cos(a6 * 0.3927), dz6 = Math.sin(a6 * 0.3927), L6 = 0;
          while (L6 < 60 && !blocked(Math.round(cx2 + dx6 * L6), Math.round(cz2 + dz6 * L6))) L6++;
          var sc = Math.min(clear, 4) * 2 + Math.min(L6, 40) * 0.25;
          if (sc > best) { best = sc; bx2 = cx2; bz2 = cz2; bdx = dx6; bdz = dz6; }
        }
      }
      var ex2 = (bx2 + 0.5) * cs - s.hx, ez2 = (bz2 + 0.5) * cs - s.hz;
      s.eye = [ex2, eye, ez2]; s.look = [ex2 + bdx * 3 * k, eye - 0.15 * k, ez2 + bdz * 3 * k];
    }
  }

  /* ---------- Procedural stand-ins (used only when the real point files are missing) ---------- */
  function Cloud(n) { this.n = n; this.pos = new Float32Array(n * 3); this.col = new Uint8Array(n * 4); this.i = 0; }
  Cloud.prototype.add = function (x, y, z, r, g, b) {
    if (this.i >= this.n) return;
    var j = this.i++;
    this.pos[j * 3] = x; this.pos[j * 3 + 1] = y; this.pos[j * 3 + 2] = z;
    this.col[j * 4] = clamp(r * 255, 0, 255); this.col[j * 4 + 1] = clamp(g * 255, 0, 255); this.col[j * 4 + 2] = clamp(b * 255, 0, 255); this.col[j * 4 + 3] = 235;
  };
  function fillCloud(n, parts, seed) {
    var R = rng(seed), cl = new Cloud(n), tot = 0, i, j;
    for (i = 0; i < parts.length; i++) tot += parts[i].a;
    var o = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0 };
    for (i = 0; i < parts.length; i++) {
      var m = i === parts.length - 1 ? n - cl.i : Math.round(n * parts[i].a / tot);
      for (j = 0; j < m; j++) { parts[i].f(R, o); cl.add(o.x, o.y, o.z, o.r, o.g, o.b); }
    }
    while (cl.i < n) { parts[0].f(R, o); cl.add(o.x, o.y, o.z, o.r, o.g, o.b); }
    // shuffle so any prefix is an even sample
    for (i = n - 1; i > 0; i--) {
      j = Math.floor(R() * (i + 1));
      for (var q = 0; q < 3; q++) { var t = cl.pos[i * 3 + q]; cl.pos[i * 3 + q] = cl.pos[j * 3 + q]; cl.pos[j * 3 + q] = t; }
      for (q = 0; q < 4; q++) { var t2 = cl.col[i * 4 + q]; cl.col[i * 4 + q] = cl.col[j * 4 + q]; cl.col[j * 4 + q] = t2; }
    }
    return { n: n, pos: cl.pos, col: cl.col, real: false };
  }
  function setc(o, r, g, b, v) { v = v === undefined ? 1 : v; o.r = r * v; o.g = g * v; o.b = b * v; }
  function inRects(u, y, rs) { for (var i = 0; i < rs.length; i++) { var q = rs[i]; if (u >= q[0] && u <= q[1] && y >= q[2] && y <= q[3]) return q; } return null; }
  function boxPart(x0, x1, y0, y1, z0, z1, colFn, dens) {
    var ax = x1 - x0, ay = y1 - y0, az = z1 - z0;
    var faces = [ax * az, ax * ay, ax * ay, az * ay, az * ay], tot = faces[0] + faces[1] + faces[2] + faces[3] + faces[4];
    return { a: tot * (dens || 1), f: function (R, o) {
      var r = R() * tot, u = R(), v = R(), face = 0;
      for (var i = 0; i < 5; i++) { if (r < faces[i]) { face = i; break; } r -= faces[i]; face = i; }
      if (face === 0) { o.x = x0 + u * ax; o.y = y1; o.z = z0 + v * az; }
      else if (face === 1) { o.x = x0 + u * ax; o.y = y0 + v * ay; o.z = z0; }
      else if (face === 2) { o.x = x0 + u * ax; o.y = y0 + v * ay; o.z = z1; }
      else if (face === 3) { o.x = x0; o.y = y0 + v * ay; o.z = z0 + u * az; }
      else { o.x = x1; o.y = y0 + v * ay; o.z = z0 + u * az; }
      colFn(o, face, R);
    } };
  }

  function exteriorStandIn(n) {
    var W = 5, D = 4, WH = 6, RH = 9.3;
    function brick(o, u, y, R) {
      var row = Math.floor(y / 0.077), off = (row & 1) * 0.11, bx = Math.floor((u + off) / 0.22);
      var t = hash2(bx, row), fy = y / 0.077 - row, fx = (u + off) / 0.22 - bx;
      if (fy < 0.14 || fx < 0.05) setc(o, 0.70, 0.67, 0.61, 0.9 + 0.1 * R());
      else setc(o, 0.55 + 0.06 * t, 0.30 + 0.03 * hash2(row, bx), 0.22, 0.82 + 0.3 * t);
    }
    function glazing(o, u, y, q, R, fx) {
      var e = 0.07, mid = (q[0] + q[1]) / 2;
      if (u - q[0] < e || q[1] - u < e || y - q[2] < e || q[3] - y < e || Math.abs(u - mid) < 0.035) { setc(o, 0.93, 0.93, 0.9); return false; }
      var g = sstep(q[2], q[3], y);
      setc(o, 0.09 + 0.22 * g, 0.12 + 0.28 * g, 0.16 + 0.34 * g, 0.9 + 0.2 * R()); if (fx) fx(); return true;
    }
    var frontW = [[-4.2, -3.0, 0.9, 2.4], [-2.0, -0.8, 0.9, 2.4], [3.0, 4.2, 0.9, 2.4], [-4.2, -3.0, 3.7, 5.2], [-2.0, -0.8, 3.7, 5.2], [0.6, 1.8, 3.7, 5.2], [3.0, 4.2, 3.7, 5.2]];
    var door = [0.65, 1.75, 0, 2.35];
    var backW = [[-4.0, -1.6, 0, 2.4], [1.0, 3.6, 0.9, 2.4], [-3.6, -2.4, 3.7, 5.2], [-0.6, 0.6, 3.7, 5.2], [2.4, 3.6, 3.7, 5.2]];
    var sideW = [[-2.4, -1.4, 0.9, 2.4], [1.4, 2.4, 0.9, 2.4], [-2.4, -1.4, 3.7, 5.2], [1.4, 2.4, 3.7, 5.2], [-0.5, 0.5, 6.4, 7.6]];
    function wallPart(axis, sign, area, wins) {
      return { a: area, f: function (R, o) {
        var u, y;
        if (axis === "z") { u = -W + R() * 2 * W; y = R() * WH; } else {
          u = -D + R() * 2 * D; y = R() * RH;
          var lim = y > WH ? D * (1 - (y - WH) / (RH - WH)) : D;
          while (Math.abs(u) > lim) { u = -D + R() * 2 * D; y = R() * RH; lim = y > WH ? D * (1 - (y - WH) / (RH - WH)) : D; }
        }
        var depth = 0, q = inRects(u, y, wins);
        if (q) { if (glazing(o, u, y, q, R)) depth = 0.12; }
        else if (axis === "z" && sign > 0 && inRects(u, y, [door])) {
          if (door[1] - u < 0.08 || u - door[0] < 0.08 || door[3] - y < 0.08) setc(o, 0.93, 0.93, 0.9); else { setc(o, 0.10, 0.22, 0.19, 0.85 + 0.25 * R()); depth = 0.1; }
        } else brick(o, u, y, R);
        if (y < 0.35 && !q) setc(o, 0.32, 0.30, 0.29, 0.8 + 0.3 * R());
        if (axis === "z") { o.x = u; o.y = y; o.z = sign * (D - depth); } else { o.x = sign * (W - depth); o.y = y; o.z = u; }
      } };
    }
    var slope = Math.sqrt(4.3 * 4.3 + (RH - WH + 0.2) * (RH - WH + 0.2));
    function roofPart(sign) {
      return { a: 10.6 * slope, f: function (R, o) {
        var x = -5.3 + R() * 10.6, s = R();
        o.x = x; o.z = sign * 4.3 * (1 - s); o.y = WH - 0.2 + s * (RH - WH + 0.2) + 0.03;
        var row = Math.floor(s * slope / 0.32), fr = s * slope / 0.32 - row, t = 0.19 + 0.05 * hash2(row, Math.floor(x / 0.24));
        if (fr < 0.16) t *= 0.62;
        setc(o, t, t * 0.98, t * 1.06, 0.9 + 0.2 * R());
      } };
    }
    function tree(cx, cz, h, r) {
      return { a: 4 * Math.PI * r * r * 0.9, f: function (R, o) {
        var u = R() * 2 - 1, a = R() * 6.2831853, s = Math.sqrt(1 - u * u), rr = r * (0.75 + 0.25 * Math.cbrt(R()));
        o.x = cx + Math.cos(a) * s * rr; o.y = h + u * rr * 0.9; o.z = cz + Math.sin(a) * s * rr;
        var g = 0.7 + 0.5 * R() * (0.6 + 0.4 * (u * 0.5 + 0.5));
        setc(o, 0.20, 0.31, 0.15, g);
      } };
    }
    var parts = [
      wallPart("z", 1, 60, frontW), wallPart("z", -1, 60, backW),
      wallPart("x", 1, 60.8, sideW), wallPart("x", -1, 60.8, sideW),
      roofPart(1), roofPart(-1),
      boxPart(2.6, 3.25, 7.6, 10.3, -1.7, -1.05, function (o, f, R) { var t = hash2(Math.floor(o.y / 0.077), Math.floor((o.x + o.z) / 0.22)); setc(o, 0.5, 0.27, 0.2, 0.8 + 0.3 * t); }),
      { a: 70, f: function (R, o) { // ground
        var r = 13 * Math.sqrt(R()), a = R() * 6.2831853, x = Math.cos(a) * r, z = Math.sin(a) * r;
        o.x = x; o.y = 0.0; o.z = z;
        var near = Math.abs(x) < W + 1.4 && Math.abs(z) < D + 1.4;
        if (near || (Math.abs(x - 1.2) < 0.75 && z > 0)) setc(o, 0.50, 0.49, 0.46, 0.85 + 0.25 * R());
        else setc(o, 0.23, 0.31, 0.19, 0.7 + 0.5 * R());
      } },
      tree(-9, 4.5, 3.6, 2.2), tree(8.6, -5.5, 4.2, 2.6),
      boxPart(-9.15, -8.85, 0, 2.2, 4.35, 4.65, function (o) { setc(o, 0.3, 0.22, 0.16); }, 0.5),
      boxPart(8.45, 8.75, 0, 2.4, -5.65, -5.35, function (o) { setc(o, 0.3, 0.22, 0.16); }, 0.5)
    ];
    return fillCloud(n, parts, 20261027);
  }

  function interiorStandIn(n) {
    var X = 4.5, Z = 3.5, H = 2.7;
    var white = [0.87, 0.85, 0.81];
    function wall(axis, coord, a0, a1, wins, colFn) {
      return { a: (a1 - a0) * H, f: function (R, o) {
        var u = a0 + R() * (a1 - a0), y = R() * H, q = inRects(u, y, wins || []);
        if (q) {
          var e = 0.06;
          if (u - q[0] < e || q[1] - u < e || y - q[2] < e || q[3] - y < e) setc(o, 0.95, 0.95, 0.93);
          else { var g = sstep(q[2], q[3], y); setc(o, 0.86 + 0.08 * g, 0.90 + 0.06 * g, 0.97, 1.05); }
        } else if (y < 0.08) setc(o, 0.74, 0.72, 0.69);
        else if (colFn) colFn(o, u, y, R);
        else setc(o, white[0], white[1], white[2], 0.95 + 0.08 * R());
        if (axis === "z") { o.x = u; o.z = coord; } else { o.x = coord; o.z = u; }
        o.y = y;
      } };
    }
    function shade(rgb) { return function (o, f, R) { var v = f === 0 ? 1.0 : (f < 3 ? 0.82 : 0.9); setc(o, rgb[0], rgb[1], rgb[2], v * (0.92 + 0.12 * R())); }; }
    var parts = [
      { a: 63, f: function (R, o) { // floor: oak planks + rug
        var x = -X + R() * 2 * X, z = -Z + R() * 2 * Z; o.x = x; o.y = 0; o.z = z;
        if (x > -3.9 && x < -1.1 && z > 0.2 && z < 3.0) { setc(o, 0.80, 0.74, 0.64, 0.9 + 0.12 * R()); return; }
        var pl = Math.floor(z / 0.19), t = hash2(pl, Math.floor((x + hash2(pl, 3) * 3) / 1.6)), fz = z / 0.19 - pl;
        setc(o, 0.60, 0.44, 0.29, (fz < 0.07 ? 0.6 : 0.82 + 0.3 * t));
      } },
      { a: 63, f: function (R, o) { o.x = -X + R() * 2 * X; o.y = H; o.z = -Z + R() * 2 * Z; setc(o, 0.93, 0.93, 0.91, 0.95); } },
      wall("z", Z, -X, X, [[-3.3, -1.7, 0.8, 2.35], [1.9, 3.5, 0.8, 2.35]]),
      wall("z", -Z, -X, X, [], function (o, u, y, R) { if (u < 1.4) setc(o, 0.55, 0.61, 0.53, 0.92 + 0.1 * R()); else setc(o, white[0], white[1], white[2], 0.95 + 0.08 * R()); }),
      wall("x", -X, -Z, Z, [[-1.1, 0.5, 0.8, 2.35]]),
      wall("x", X, -Z, Z, [[0.4, 1.6, 0.8, 2.35]]),
      wall("x", 1.42, -Z, 0.9, []), wall("x", 1.58, -Z, 0.9, []),
      boxPart(1.42, 1.58, 0, H, 0.9, 0.93, shade(white), 0.4),
      // living room
      boxPart(-3.6, -1.4, 0, 0.45, 2.35, 3.2, shade([0.30, 0.36, 0.45])),
      boxPart(-3.6, -1.4, 0, 0.85, 3.0, 3.28, shade([0.28, 0.34, 0.43])),
      boxPart(-3.8, -3.55, 0, 0.62, 2.3, 3.28, shade([0.28, 0.34, 0.43])),
      boxPart(-1.45, -1.2, 0, 0.62, 2.3, 3.28, shade([0.28, 0.34, 0.43])),
      boxPart(-3.0, -2.0, 0.34, 0.42, 1.1, 1.7, shade([0.33, 0.23, 0.16])),
      boxPart(-3.9, -3.1, 0, 0.42, -0.7, 0.1, shade([0.74, 0.56, 0.22])),
      boxPart(-3.9, -3.75, 0, 0.9, -0.7, 0.1, shade([0.70, 0.53, 0.2])),
      boxPart(-4.48, -4.15, 0, 2.0, -3.2, -1.6, function (o, f, R) {
        if (f === 4 && o.y > 0.1 && (o.y % 0.4) > 0.04) { var c = [[0.62, 0.2, 0.16], [0.18, 0.3, 0.5], [0.8, 0.72, 0.55], [0.2, 0.42, 0.33], [0.85, 0.85, 0.8]][Math.floor(hash2(Math.floor(o.z / 0.05), Math.floor(o.y / 0.4)) * 5)]; setc(o, c[0], c[1], c[2], 0.85 + 0.2 * R()); }
        else setc(o, 0.36, 0.27, 0.2, 0.9);
      }),
      { a: 3.5, f: function (R, o) { var u = R() * 2 - 1, a = R() * 6.2831853, s = Math.sqrt(1 - u * u), r = 0.45 * Math.cbrt(R()); o.x = -3.95 + Math.cos(a) * s * r; o.y = 1.05 + u * r * 1.3; o.z = 2.9 + Math.sin(a) * s * r; setc(o, 0.18, 0.36, 0.17, 0.7 + 0.5 * R()); } },
      boxPart(-4.15, -3.75, 0, 0.55, 2.7, 3.1, shade([0.82, 0.8, 0.76]), 0.6),
      // kitchen / dining
      boxPart(2.4, 4.0, 0.71, 0.77, 0.6, 1.6, shade([0.68, 0.52, 0.35])),
      boxPart(2.2, 2.6, 0, 0.9, 0.3, 0.7, shade([0.13, 0.13, 0.14])), boxPart(3.8, 4.2, 0, 0.9, 0.3, 0.7, shade([0.13, 0.13, 0.14])),
      boxPart(2.2, 2.6, 0, 0.9, 1.5, 1.9, shade([0.13, 0.13, 0.14])), boxPart(3.8, 4.2, 0, 0.9, 1.5, 1.9, shade([0.13, 0.13, 0.14])),
      boxPart(1.8, 4.45, 0, 0.88, -3.48, -2.88, function (o, f, R) { if (f === 0) setc(o, 0.92, 0.92, 0.9); else setc(o, 0.20, 0.25, 0.26, 0.9 + 0.12 * R()); }),
      boxPart(1.8, 4.45, 1.5, 2.25, -3.48, -3.12, shade([0.20, 0.25, 0.26])),
      { a: 1.2, f: function (R, o) { var i = R() < 0.5 ? 0 : 1, u = R() * 2 - 1, a = R() * 6.2831853, s = Math.sqrt(1 - u * u), r = 0.17; o.x = i ? 3.2 : -2.5; o.y = 2.05 + u * r; o.z = i ? 1.1 : 1.4; o.x += Math.cos(a) * s * r; o.z += Math.sin(a) * s * r; setc(o, 1.0, 0.86, 0.62, 1.1); } }
    ];
    return fillCloud(n, parts, 1027);
  }

  // Stand-in outline while assets/space/outline.js is missing: the clay model's wall points,
  // drawn as the plan's lines at floor height and at the top of the walls.
  function outlineFromModel(s) {
    if (!s.mod || !s.frame) return null;
    var n = s.n, m = s.mod, F = s.frame, top = s.toM([0, s.ceilY, 0])[1], pts = [], R = rng(99), i;
    for (i = 0; i < n && pts.length < CAP * 3; i++) {
      var c = m[i * 4 + 3]; if (c !== 1 && c !== 2) continue;
      var mm = s.toM([m[i * 4], m[i * 4 + 1], m[i * 4 + 2]]);
      pts.push(mm[0] - F[0], (R() < 0.5 ? 0 : top) - F[1], mm[2] - F[2]);
    }
    if (pts.length < 3000) return null;
    return { n: pts.length / 3, pos: new Float32Array(pts), frame: F.slice(), fallback: true };
  }

  /* ---------- Build the combined point arrays ---------- */
  var DATA = null;
  function buildData() {
    var P = win.ORBIT_POINTS || {};
    var ext = decode(P.exterior, CAP), inn = decode(P.interior, CAP);
    if (!ext || !inn) console.info("[space] real point files missing" + (ext || inn ? " (one of them)" : "") + ": using a procedural stand-in.");
    if (!ext) ext = exteriorStandIn(CAP);
    if (!inn) inn = interiorStandIn(CAP);
    normalise(inn, 5.0);
    // Round 6: exterior points in the model frame (same frame as the aerial splat) share the
    // interior's world, so one camera fits both and camera() is valid in condense too.
    var extM = !!ext.frame;
    if (extM && inn.frame) placeIn(ext, inn); else normalise(ext, 6.0);
    var MW = inn.frame ? { toM: inn.toM, fromM: inn.fromM, k: inn.k } : extM ? { toM: ext.toM, fromM: ext.fromM, k: ext.k } : { toM: inn.toM, fromM: inn.fromM, k: inn.k };
    extStats(ext);
    // Round 5 hero: the house OUTLINE (assets/space/outline.js, model metres, model = stored + center)
    var out = inn.frame ? decode(P.outline, CAP) : null, outW = null, j;
    if (out && !out.frame) out = null;
    if (out) { // its x / z in the interior's world, to put the scan's wall planes exactly on the model's
      var ox = new Float32Array(out.n), oy = new Float32Array(out.n), oz = new Float32Array(out.n);
      for (j = 0; j < out.n; j++) {
        ox[j] = (out.pos[j * 3] + out.frame[0] - inn.frame[0]) * inn.k; oy[j] = (out.pos[j * 3 + 1] + out.frame[1]) * inn.k;
        oz[j] = (out.pos[j * 3 + 2] + out.frame[2] - inn.frame[2]) * inn.k;
      }
      outW = { x: ox, y: oy, z: oz };
    }
    buildModel(inn, outW);
    if (!out && inn.frame) out = outlineFromModel(inn);
    var N = Math.min(CAP, Math.max(ext.n, inn.n)), R = rng(77), i;
    var aExt = new Float32Array(N * 3), cExt = new Uint8Array(N * 4), aInt = new Float32Array(N * 3), cInt = new Uint8Array(N * 4);
    var aGal = new Float32Array(N * 4), aMod = new Float32Array(N * 4);
    function gauss() { return (R() + R() + R() + R() - 2) * 0.866; }
    for (i = 0; i < N; i++) {
      var e = i % ext.n, m = i % inn.n, je = i >= ext.n ? 0.012 : 0, ji = i >= inn.n ? 0.012 : 0;
      aExt[i * 3] = ext.pos[e * 3] + (R() - 0.5) * je; aExt[i * 3 + 1] = ext.pos[e * 3 + 1]; aExt[i * 3 + 2] = ext.pos[e * 3 + 2] + (R() - 0.5) * je;
      aInt[i * 3] = inn.pos[m * 3] + (R() - 0.5) * ji; aInt[i * 3 + 1] = inn.pos[m * 3 + 1]; aInt[i * 3 + 2] = inn.pos[m * 3 + 2] + (R() - 0.5) * ji;
      for (var q = 0; q < 4; q++) { cExt[i * 4 + q] = ext.col[e * 4 + q]; cInt[i * 4 + q] = inn.col[m * 4 + q]; aMod[i * 4 + q] = inn.mod[m * 4 + q]; }
      // galaxy (untilted frame, ring in the xz plane): ring, soft core, faint dust
      var r = R(), x, y, z;
      if (r < 0.64) { // the ring: a sharp lane plus a softer haze
        var a = R() * 6.2831853, wide = R() < 0.35, rad = 8.2 + gauss() * (wide ? 1.05 : 0.3);
        x = Math.cos(a) * rad; z = Math.sin(a) * rad; y = gauss() * (wide ? 0.32 : 0.1);
      } else if (r < 0.72) { // soft core
        var u = R() * 2 - 1, a2 = R() * 6.2831853, s = Math.sqrt(1 - u * u), rr = 1.25 * Math.pow(R(), 0.9);
        x = Math.cos(a2) * s * rr; y = u * rr * 0.85; z = Math.sin(a2) * s * rr;
      } else { // faint dust
        var a3 = R() * 6.2831853, rd = 2.2 + Math.pow(R(), 0.8) * 17;
        x = Math.cos(a3) * rd; z = Math.sin(a3) * rd; y = gauss() * (0.5 + rd * 0.09);
      }
      aGal[i * 4] = x; aGal[i * 4 + 1] = y; aGal[i * 4 + 2] = z; aGal[i * 4 + 3] = R();
    }
    // hero outline formation: 35-50 % of the points sit on the outline's edges (w = 1), the rest is
    // faint dust around the house (w = 0). Positions are the outline's stored frame (metres).
    var aOut = new Float32Array(N * 4), oInfo = null;
    if (out) {
      var Ro = rng(515), share = clamp(out.n / N, 0.35, 0.5), jo = 0, bx = [Infinity, Infinity, Infinity], bX = [-Infinity, -Infinity, -Infinity], q2;
      for (j = 0; j < out.n; j += 7) for (q2 = 0; q2 < 3; q2++) { var v2 = out.pos[j * 3 + q2]; if (v2 < bx[q2]) bx[q2] = v2; if (v2 > bX[q2]) bX[q2] = v2; }
      for (i = 0; i < N; i++) {
        if (Ro() < share) {
          var o3 = jo % out.n, dup = jo >= out.n ? 0.012 : 0; jo++;
          aOut[i * 4] = out.pos[o3 * 3] + (Ro() - 0.5) * dup; aOut[i * 4 + 1] = out.pos[o3 * 3 + 1] + (Ro() - 0.5) * dup;
          aOut[i * 4 + 2] = out.pos[o3 * 3 + 2] + (Ro() - 0.5) * dup; aOut[i * 4 + 3] = 1;
        } else {
          aOut[i * 4] = mix(bx[0] - 2.5, bX[0] + 2.5, Ro()); aOut[i * 4 + 1] = mix(bx[1] - 0.8, bX[1] + 2.5, Ro());
          aOut[i * 4 + 2] = mix(bx[2] - 2.5, bX[2] + 2.5, Ro()); aOut[i * 4 + 3] = 0;
        }
      }
      oInfo = { center: out.frame.slice(), n: out.n, lines: jo, fallback: !!out.fallback, mid: [(bx[0] + bX[0]) / 2, (bx[1] + bX[1]) / 2, (bx[2] + bX[2]) / 2] };
      var stS = Math.max(1, Math.floor(out.n / 1500)), outS = [];
      for (j = 0; j < out.n; j += stS) outS.push(out.pos[j * 3], out.pos[j * 3 + 1], out.pos[j * 3 + 2]);
      // round 6: the outline's dust points drift with the hero's loose cloud (w = 0), only lines form
    }
    // Round 6 hero: one furniture silhouette (ORBIT_POINTS.forms, stored metres around its own centre).
    // About 40 % of the points draw it (w = 1), the rest stays loose dust. Missing: the film skips it.
    var aFrm = new Float32Array(N * 4), cFrm = new Uint8Array(N * 4), fInfo = null, frmS = null, FS0 = P.forms || null, fKey = null;
    if (FS0 && typeof FS0 === "object") {
      ["sofa", "armchair", "chair", "table"].concat(Object.keys(FS0)).some(function (key) { if (FS0[key] && FS0[key].b64) { fKey = key; return true; } return false; });
    }
    var frm = fKey ? decode(FS0[fKey], CAP) : null;
    if (frm) {
      var Rf = rng(616), shareF = clamp(frm.n / N, 0.3, 0.45), jf = 0, fb = [Infinity, Infinity, Infinity], fB = [-Infinity, -Infinity, -Infinity];
      for (i = 0; i < N; i++) {
        if (Rf() < shareF) {
          var f3 = jf % frm.n, dupF = jf >= frm.n ? 0.006 : 0; jf++;
          aFrm[i * 4] = frm.pos[f3 * 3] + (Rf() - 0.5) * dupF; aFrm[i * 4 + 1] = frm.pos[f3 * 3 + 1] + (Rf() - 0.5) * dupF; aFrm[i * 4 + 2] = frm.pos[f3 * 3 + 2] + (Rf() - 0.5) * dupF; aFrm[i * 4 + 3] = 1;
          for (q = 0; q < 4; q++) cFrm[i * 4 + q] = frm.col[f3 * 4 + q];
        }
      }
      for (j = 0; j < frm.n; j++) for (q = 0; q < 3; q++) { var v3 = frm.pos[j * 3 + q]; if (v3 < fb[q]) fb[q] = v3; if (v3 > fB[q]) fB[q] = v3; }
      var stF = Math.max(1, Math.floor(frm.n / 1500)), fS = [];
      for (j = 0; j < frm.n; j += stF) fS.push(frm.pos[j * 3], frm.pos[j * 3 + 1], frm.pos[j * 3 + 2]);
      frmS = new Float32Array(fS);
      var fr0 = FS0[fKey];
      fInfo = { key: fKey, n: frm.n, lines: jf, mid: [(fb[0] + fB[0]) / 2, (fb[1] + fB[1]) / 2, (fb[2] + fB[2]) / 2], size: [fB[0] - fb[0], fB[1] - fb[1], fB[2] - fb[2]],
        front: fr0.front && fr0.front.length === 3 ? fr0.front.map(Number) : isFinite(+fr0.yaw) ? [Math.sin(+fr0.yaw * Math.PI / 180), 0, Math.cos(+fr0.yaw * Math.PI / 180)] : null };
    }
    // Round 6 hero: the building from the air uses the exterior points inside a crop circle (the house,
    // not all of the garden); samples (world) for fitting it under the title.
    // With a model-frame exterior and poses.aerial: centre the crop on the house (the pose target), 15 m round.
    var AP = win.ORBIT_FILM && win.ORBIT_FILM.poses && win.ORBIT_FILM.poses.aerial;
    if ((ext.inModel || (extM && !inn.frame)) && AP && AP.target) { var ac = MW.fromM(AP.target); ext.c = [ac[0], 0, ac[2]]; ext.crop = 15 * MW.k; }
    var bS = [], stB = Math.max(1, Math.floor(ext.n / 2400)), cr2 = ext.crop * ext.crop;
    for (j = 0; j < ext.n; j += stB) {
      var bx0 = ext.pos[j * 3] - ext.c[0], bz0 = ext.pos[j * 3 + 2] - ext.c[2];
      if (bx0 * bx0 + bz0 * bz0 < cr2) bS.push(ext.pos[j * 3], ext.pos[j * 3 + 1], ext.pos[j * 3 + 2]);
    }
    // Round 9: the house itself, for #who and the ending: the exterior points within bR of the crop centre.
    // c = its middle (world), R = the radius that holds almost all of it (for fitting it into a box).
    var bR = (ext.inModel || (extM && !inn.frame)) && AP ? (+params.get("bldr") || 11) * MW.k : ext.crop * 0.75, bR2 = bR * bR;
    var bxs = [], bys = [], bzs = [], stH = Math.max(1, Math.floor(ext.n / 20000));
    for (j = 0; j < ext.n; j += stH) {
      var hx0 = ext.pos[j * 3] - ext.c[0], hz0 = ext.pos[j * 3 + 2] - ext.c[2];
      if (hx0 * hx0 + hz0 * hz0 < bR2) { bxs.push(ext.pos[j * 3]); bys.push(ext.pos[j * 3 + 1]); bzs.push(ext.pos[j * 3 + 2]); }
    }
    var bld = null;
    if (bxs.length > 200) {
      var sx2 = bxs.slice().sort(num), sy2 = bys.slice().sort(num), sz2 = bzs.slice().sort(num);
      var bc = [(pct(sx2, 0.02) + pct(sx2, 0.98)) / 2, (pct(sy2, 0.02) + pct(sy2, 0.98)) / 2, (pct(sz2, 0.02) + pct(sz2, 0.98)) / 2], dd = [];
      for (j = 0; j < bxs.length; j++) dd.push(Math.hypot(bxs[j] - bc[0], bys[j] - bc[1], bzs[j] - bc[2]));
      dd.sort(num);
      bld = { c: bc, R: pct(dd, 0.97), crop: bR, cx: ext.c[0], cz: ext.c[2], y0: pct(sy2, 0.01) };
    }
    DATA = {
      bld: bld,
      N: N, aExt: aExt, cExt: cExt, aInt: aInt, cInt: cInt, aGal: aGal, aMod: aMod, aOut: aOut, aFrm: aFrm, cFrm: cFrm,
      out: oInfo, outS: out ? new Float32Array(outS) : null, frm: fInfo, frmS: frmS, bldS: bS.length > 300 ? new Float32Array(bS) : null,
      real: ext.real && inn.real, MW: MW,
      ext: { hx: ext.hx, hz: ext.hz, h: ext.h, area: ext.area, c: ext.c, crop: ext.crop, inModel: !!ext.inModel || (extM && !inn.frame),
        ty: ext.inModel ? ext.y0 + ext.h * 0.36 : ext.hints && ext.hints.target ? ext.toW(ext.hints.target)[1] : ext.h * 0.36,
        front: Math.atan2((ext.hints && ext.hints.front || [0, 0, 1])[0], (ext.hints && ext.hints.front || [0, 0, 1])[2]) },
      inn: { refined: !!inn.refined, footMasked: !!inn.footMasked,hx: inn.hx, hz: inn.hz, h: inn.h, area: inn.area, k: inn.k, floorY: inn.floorY, ceilY: inn.ceilY, cut: inn.cut, grid: inn.grid, eye: inn.eye, look: inn.look, classes: inn.classes, planes: inn.planes,
        frame: inn.frame || null, toM: inn.toM, fromM: inn.fromM }
    };
  }

  /* ---------- Shaders ---------- */
  var VS = [
    "#version 300 es",
    "precision highp float;",
    "layout(location=0) in vec3 aExt; layout(location=1) in vec4 aExtC;",
    "layout(location=2) in vec3 aInt; layout(location=3) in vec4 aIntC;",
    "layout(location=4) in vec4 aGal; layout(location=5) in vec4 aMod; layout(location=6) in vec4 aOut;",
    "layout(location=7) in vec4 aFrm; layout(location=8) in vec4 aFrmC;",
    // round 6: hero film. uHF = (form A, form B, progress A->B, swirl), forms: 0 ring, 1 building,
    // 2 outline, 3 furniture, 4 loose drift. uHA / uHR = alpha / radius of (dust, building, outline,
    // furniture). Placements (stored -> galaxy world): uBldM/T, uOutM/T, uFrmM/T. uBldC = building crop
    // (centre x, z, radius^2, share of points), uDrC = drift cloud centre + scale.
    // Also: galaxy spin time, walk-beat gather and form-beat snap progress.
    // round 8: uHFade = how much of the hero film still shows (1 = all, 0 = faded out under the still)
    "uniform vec4 uHF, uHA, uHR, uBldC, uDrC; uniform float uGalT, uInP, uRoomP, uK, uHFade; uniform mat3 uOutM, uBldM, uFrmM; uniform vec3 uOutT, uBldT, uFrmT;",
    "uniform mat4 uVP; uniform vec3 uCam;",
    "uniform float uTime, uNow, uPix, uAspect, uDpr, uCount, uMaxPx, uSizeK, uBright, uOver, uLight, uNear;",
    "uniform float uFilm; uniform vec4 uFA[NSC]; uniform vec4 uFB[NSC]; uniform vec4 uFC[NSC];",
    // round 4: room / eye / top (progress of their beats, ceiling cut, focus spheres)
    "uniform float uTopP, uEyeP, uCutY, uRoomCut, uCalmTop; uniform vec4 uFocR, uFocE; uniform vec3 uTopC;",
    "uniform mat3 uGalM, uOrbM, uPlaM; uniform vec3 uCtr;",
    "uniform vec4 uRad; uniform float uExtH;",
    // round 9: uBld2 = the house crop (centre x, z, crop radius, ring radius), uEndC = its middle, uEndO = the
    // squared radius that hides the ring behind it, uCropK = how much the exterior is cropped to the house (who),
    // uDust = the calm dust cloud (centre, size)
    "uniform vec4 uBld2, uDust; uniform vec3 uEndC; uniform float uCropK, uEndO; uniform vec2 uGP;",
    "uniform vec4 uRoom; uniform vec2 uRoomX;",
    "uniform vec3 uClay, uPaintA, uPaintB; uniform float uPaintT;",
    "uniform vec3 uPtr; uniform float uScanR; uniform vec4 uRip[12];",
    "uniform vec3 uAccent, uInk; uniform vec2 uFog; uniform float uDbg;",
    "out vec4 vCol; out float vHard;",
    "float lum(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }",
    "vec3 rotY(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(c*p.x+s*p.z, p.y, -s*p.x+c*p.z); }",
    "vec3 curl(vec3 p){ return vec3(sin(p.y*1.7+1.3*cos(p.z*1.1)), sin(p.z*1.5+1.1*cos(p.x*1.3)), sin(p.x*1.3+1.7*cos(p.y*0.9))); }",
    "uint pcg(uint v){ uint s=v*747796405u+2891336453u; uint w=((s>>((s>>28u)+4u))^s)*277803737u; return (w>>22u)^w; }",
    "float hf(uint v){ return float(pcg(v))*(1.0/4294967295.0); }",
    // one hero form for this point: position, colour, alpha, radius (dust points drift in the loose cloud dp)
    "void heroForm(int id, vec3 g, vec3 gc, float ga, float gr, vec3 dp, float h3, out vec3 p, out vec3 c, out float a, out float r){",
    "  p=dp; c=vec3(0.80,0.84,0.92); a=uHA.x; r=uHR.x;",
    "  if(id==0){ p=g; c=gc; a=ga; r=gr; }",
    "  else if(id==1){ vec2 dq=aExt.xz-uBldC.xy; if(dot(dq,dq)<uBldC.z && h3<uBldC.w){ p=uBldM*aExt+uBldT; c=mix(aExtC.rgb,vec3(lum(aExtC.rgb)),0.25)*1.15+0.04; a=uHA.y; r=uHR.y; } }",
    "  else if(id==2){ if(aOut.w>0.5){ p=uOutM*aOut.xyz+uOutT; c=vec3(0.93,0.92,0.88); a=uHA.z; r=uHR.z; } }",
    "  else if(id==3){ if(aFrm.w>0.5){ p=uFrmM*aFrm.xyz+uFrmT; c=mix(vec3(0.94,0.92,0.88),aFrmC.rgb,0.45); a=uHA.w; r=uHR.w; } }",
    "  else { a=h3<0.1?0.42:(h3<0.35?uHA.x*3.0:uHA.x*0.5); r=uHR.x*(h3<0.1?1.7:1.1); }",
    "}",
    "void main(){",
    "  uint vid=uint(gl_VertexID);",
    "  float seed=aGal.w; float h1=hf(vid*4u+1u); float h2=hf(vid*4u+2u); float h3=hf(vid*4u+3u); float h4=hf(vid*4u+4u);",
    "  float star=pow(h3,14.0);",
    "  float hn=clamp(aExt.y/max(uExtH,0.001),0.0,1.0);",
    "  float lag=clamp(0.62*seed+0.38*hn,0.0,1.0);",
    // each point has its own place on the film timeline: morphs dissolve through the points
    // (round 6: mostly random timing, so no visible front or line runs across the screen)
    "  float lagF=clamp(0.9*seed+0.1*hn,0.0,1.0);",
    "  float fi=clamp(uFilm+(lagF-0.5)*0.8,0.0,float(NSC-1)); float i0=min(floor(fi),float(NSC-2)); float tt=smoothstep(0.41,0.59,fi-i0); int k0=int(i0);",
    "  vec4 A=mix(uFA[k0],uFA[k0+1],tt); vec4 B=mix(uFB[k0],uFB[k0+1],tt); vec4 C=mix(uFC[k0],uFC[k0+1],tt);",
    "  float rmK=C.x, tpK=C.y, eyK=C.z, inK=C.w, tru=max(max(rmK,tpK),eyK);",
    "  vec4 dA=abs(uFA[k0]-uFA[k0+1]); float posDiff=clamp(dA.x+dA.y+dA.z+dA.w+abs(uFB[k0].x-uFB[k0+1].x),0.0,1.0);",
    "  float trans=4.0*tt*(1.0-tt)*posDiff;",
    "  float wG=A.x, wE=A.y, wI=A.z, wP=A.w, wO=B.x; float ws=max(wG+wE+wI+wP+wO,0.0001);",
    "  wG/=ws; wE/=ws; wI/=ws; wP/=ws; wO/=ws;",
    "  float mdl=smoothstep(0.0,1.0,B.y); float roof=smoothstep(0.4,1.0,B.z); float calm=B.w;",
    // galaxy: differential rotation, then the logo tilt
    "  vec3 rd=normalize(vec3(h1-0.5,(h2-0.5)*0.6,h3-0.5)+vec3(0.0001));",
    "  vec3 g=aGal.xyz; float gr=length(g.xz); float om=0.05*min(pow(8.0/max(gr,0.5),1.5),3.0);",
    "  g=uGalM*rotY(g,uGalT*om)+uCtr;",
    // the ring's own look
    "  float ringK=exp(-pow((gr-8.2)/0.8,2.0)); float coreK=1.0-smoothstep(0.0,1.4,gr);",
    "  vec3 tint=vec3(0.80,0.86,1.0); vec3 cE=aExtC.rgb, cI=aIntC.rgb;",
    "  vec3 colG=mix(vec3(0.55+0.45*lum(cE))*tint, vec3(1.0,0.93,0.85), coreK*0.5)*(0.55+0.45*ringK)+star*0.6;",
    "  float aGx=0.02+0.05*ringK+0.09*coreK+0.75*star; float rGx=uRad.x*(0.6+1.8*star+0.3*ringK);",
    // hero film (round 6, time driven): form A -> form B, every point on its own slightly later time
    "  vec3 dp=uDrC.xyz+vec3(rd.x*10.0,rd.y*6.5,rd.z*6.5)*(0.2+0.8*sqrt(h4))*uDrC.w;",
    "  dp+=curl(dp*0.1+vec3(0.0,uTime*0.03,uTime*0.02))*0.9*uDrC.w;",
    "  vec3 pA, cA, pB, cB; float aA, rA, aB, rB;",
    "  heroForm(int(uHF.x+0.5), g, colG, aGx, rGx, dp, h3, pA, cA, aA, rA);",
    "  heroForm(int(uHF.y+0.5), g, colG, aGx, rGx, dp, h3, pB, cB, aB, rB);",
    "  float lo=fract(h1*3.17+seed*0.53); float lp=smoothstep(0.0,1.0,clamp((uHF.z-lo*0.45)/0.55,0.0,1.0));",
    "  float fly=mix(uHF.x>0.5?1.0:0.0,uHF.y>0.5?1.0:0.0,lp);",
    "  g=mix(pA,pB,lp)+curl(pA*0.15+vec3(0.0,uTime*0.06,0.0))*sin(3.14159*lp)*uHF.w*(0.3+0.5*h2);",
    "  colG=mix(cA,cB,lp); aGx=mix(aA,aB,lp); rGx=mix(rA,rB,lp);",
    // round 9 ending ("planet" slot): the house once more (exterior points inside the crop) and an orbit ring
    // made of its other points around it: the Orbit logo, made of the real building. The rest stays hidden.
    "  vec3 pp; float lit=1.0; float inB=1.0-smoothstep(uBld2.z*0.85,uBld2.z,length(aExt.xz-uBld2.xy));",
    // (30 Oct night, James: "JUST THE RING") the house points are hidden here, only the slowly turning ring shows
    "  bool isRing=inB<0.5&&h4<0.55; float endA=isRing?1.0:0.0;",
    "  if(isRing){ float u=pow(h2,0.8); float rr=uBld2.w*(0.965+0.07*u); float a=h1*6.2831853+uTime*0.05;",
    "    pp=uEndC+uPlaM*vec3(cos(a)*rr,(h3-0.5)*0.012*uBld2.w,sin(a)*rr); lit=0.5+0.3*h3+0.5*exp(-pow((u-0.5)/0.12,2.0)); }",
    // (30 Oct night, James: the hidden points that show under the pointer should cover the whole screen evenly)
    // the other points spread in an even layer facing the camera, a bit wider than the screen, with some depth
    "  else { vec3 fV=uEndC-uCam; float Lc=length(fV); fV/=max(Lc,0.001); vec3 rV=normalize(cross(fV,vec3(0.0,1.0,0.0))); vec3 uV=cross(rV,fV);",
    "    pp=uEndC+rV*(h1*2.0-1.0)*Lc*0.42*uAspect+uV*(h3*2.0-1.0)*Lc*0.42+fV*(h2-0.5)*Lc*0.5; }",
    // orbit stream: three lanes + a small core
    "  vec3 op; float lane=h2<0.3?0.0:(h2<0.75?1.0:2.0); float wave=0.0;",
    "  if(h4<0.08){ float u=h1*2.0-1.0, a0=h2*6.2831853, s0=sqrt(1.0-u*u); op=vec3(cos(a0)*s0,u,sin(a0)*s0)*pow(seed,0.5)*0.9; }",
    "  else { float g=(h3+seed+fract(h2*7.31)-1.5)*0.9; float R=5.0+lane*1.9+g*0.5; float sp=0.16/(1.0+lane*0.55);",
    "    float a=h1*6.2831853+uTime*sp; float hd=a-uTime*sp*2.6-lane*2.1;",
    "    wave=pow(0.5+0.5*cos(hd),10.0)+0.35*pow(0.5+0.5*cos(hd*2.0+1.7),16.0);",
    "    op=vec3(cos(a)*R,g*0.12+0.05*sin(a*3.0+lane),sin(a)*R*0.93); }",
    "  op=uOrbM*op+uCtr;",
    // interior -> clay model -> roof lift
    // room form beat: the points snap to the clean walls / floor, then the roof lifts off (own timing per point)
    "  float qR=uRoomP+(lag-0.5)*0.4; mdl=max(mdl,rmK*smoothstep(-0.6,-0.05,qR)); roof=max(roof,rmK*smoothstep(0.05,0.8,qR));",
    // snapped axes stay exact (walls at their plane, floor / ceiling at their height), the rest on the grid
    "  float cls=aMod.w; vec3 ip=aInt; vec3 mp=floor(aMod.xyz/uRoom.w+0.5)*uRoom.w;",
    "  mp=mix(mp,aMod.xyz,vec3(abs(cls-1.0)<0.5?1.0:0.0,(cls>2.5&&cls<4.5)?1.0:0.0,abs(cls-2.0)<0.5?1.0:0.0)); ip=mix(ip,mp,mdl);",
    "  float above=max(step(uRoom.z,aInt.y), cls>4.5?1.0:0.0); float lift=above*roof;",
    "  ip.y+=lift*lift*(2.0+3.5*h2); ip.xz*=1.0+0.08*lift;",
    // top: every point (on its own beat time) flies out into a sparse cloud, then lands again
    // round 5: spread and land within the first quarter of the top beat (floor assembled by pr ~ -0.5)
    "  float qT=uTopP+(lag-0.5)*0.16; float spread=tpK*smoothstep(-1.02,-0.88,qT)*(1.0-smoothstep(-0.84,-0.6,qT));",
    "  vec3 cl=uTopC+rotY((aInt-uTopC)*(1.1+0.55*h2),(h1-0.5)*1.0+uTime*0.04)+rd*(0.4+1.8*fract(h4*7.31)); cl.y+=0.8*h3;",
    "  ip=mix(ip,cl,spread*spread*(3.0-2.0*spread));",
    // eye: points start loose around their place and converge as the camera arrives
    "  float qE=uEyeP+(lag-0.5)*0.6; float loose=eyK*(1.0-smoothstep(-0.95,0.3,qE)); ip+=rd*(0.2+1.1*h4)*loose;",
    // walk beat (inside): a loose scattered cloud gathers into the room (pr -1..0), then drifts gently
    "  float qI=uInP+(lag-0.5)*0.5; float gat=smoothstep(-1.0,-0.05,qI); float scat=inK*(1.0-gat)*(1.0-mdl);",
    "  ip+=(rd*(0.5+2.6*h4)+curl(aInt*0.35+vec3(0.0,uTime*0.06,0.0))*0.6)*uK*scat;",
    "  ip+=curl(aInt*0.8+vec3(uTime*0.05))*0.02*uK*inK*gat*(1.0-mdl);",
    // round 9 calm: a few of the house's points (about 4 %) drift as a wide, faint dust; the rest is hidden
    "  float dsel=step(h4,0.04); vec3 dust=uDust.xyz+vec3((h1-0.5)*2.6,(h2-0.5)*1.1,(fract(h3*7.13)-0.5)*2.6)*uDust.w;",
    "  dust+=curl(dust*(0.6/max(uDust.w,0.001))+vec3(0.0,uTime*0.03,uTime*0.02))*0.06*uDust.w; ip=mix(ip,dust,calm);",
    "  vec3 pos=wG*g+wE*aExt+wI*ip+wP*pp+wO*op;",
    // round 9: the house of #who and of the ending gathers from a loose cloud around it as its section arrives
    // (uGP = progress of orbit, planet; every point on its own slightly later time), and loosens again backwards
    "  float gO=1.0-smoothstep(-0.95,-0.42,uGP.x+(lag-0.5)*0.45), gP=1.0-smoothstep(-0.95,-0.42,uGP.y+(lag-0.5)*0.45);",
    "  vec3 gsc=(rd*(0.3+1.5*h4)+curl(aExt*0.08+vec3(0.0,uTime*0.05,0.0))*0.35)*uBld2.z;",
    "  pos+=gsc*(wE*uCropK*gO*gO+wP*gP*gP);",
    // swirl while between formations
    "  float sw=trans;",
    "  pos=rotY(pos,sw*(0.6+1.5*h2)); pos+=sw*curl(pos*0.2+vec3(0.0,uTime*0.07,0.0))*(0.5+0.7*h3);",
    // colours per formation
    "  vec3 colE=mix(cE,vec3(lum(cE)),0.16);",
    "  vec3 colI=mix(cI,vec3(lum(cI)),0.16*(1.0-tru));",
    "  float hf=clamp((aInt.y-uRoom.x)/max(uRoom.y-uRoom.x,0.001),0.0,1.0);",
    "  float ao=mix(0.6,1.0,smoothstep(0.0,0.42,hf));",
    "  float pd=clamp(0.5+0.5*aInt.x/max(uRoomX.x,0.001),0.0,1.0)*0.72+seed*0.28;",
    "  vec3 wallC=mix(uPaintA,uPaintB,smoothstep(pd,pd+0.12,uPaintT*1.14));",
    "  vec3 clay;",
    "  if(cls<0.5) clay=vec3(0.66,0.63,0.59)*ao; else if(cls<1.5) clay=wallC*0.84*ao; else if(cls<2.5) clay=wallC*ao;",
    "  else if(cls<3.5) clay=vec3(0.80,0.74,0.66)*(0.93+0.07*h1); else clay=wallC*0.95;",
    "  clay*=0.95+0.1*h4;",
    "  if(uDbg>0.5){ clay=cls<0.5?vec3(0.5):cls<1.5?vec3(1,0.2,0.2):cls<2.5?vec3(0.2,1,0.2):cls<3.5?vec3(0.2,0.4,1):vec3(1,1,0); }",
    "  colI=mix(colI,clay,mdl);",
    "  vec3 colP=isRing?mix(vec3(0.86,0.89,0.95),cE*1.3+0.05,0.3)*lit:mix(cE,vec3(lum(cE)),0.16);",
    "  vec3 colO=mix(vec3(0.5+0.5*lum(cI))*tint,cI,0.35)*(0.7+0.6*wave)+star*0.5;",
    "  vec3 col=wG*colG+wE*colE+wI*colI+wP*colP+wO*colO;",
    "  vec3 trueC=wG*mix(cE,mix(colG*1.1,uAccent,0.3),fly)+(wE+wP)*cE+(wI+wO)*cI;",
    "  float mono=wG+wP+wO+wI*mdl*0.6;",
    "  float aOx=0.03+0.36*wave+0.7*star+(h4<0.08?0.05:0.0);",
    "  float alpha=wG*aGx+wE*mix(0.55,1.0,aExtC.a)+wI*mix(mix(0.55,1.0,aIntC.a),1.0,mdl)+wP*(isRing?0.62:mix(0.55,1.0,aExtC.a)*endA)+wO*aOx;",
    // round 9: #who shows only the house (the exterior cropped to it); calm keeps only its dust points
    "  alpha*=mix(1.0,1.0-smoothstep(uBld2.z*0.85,uBld2.z,length(aExt.xz-uBld2.xy)),wE*uCropK);",
    "  alpha*=mix(1.0,dsel*1.6,calm*wI);",
    // room / eye / top: the subject reads (points far from it fade a bit), no ceiling seen from above
    "  float fR=smoothstep(uFocR.w,uFocR.w*1.7,length(aInt.xz-uFocR.xz)); float fE=smoothstep(uFocE.w,uFocE.w*1.9,distance(aInt,uFocE.xyz));",
    "  float cutA=max(tpK,rmK*uRoomCut)*smoothstep(uCutY-0.05,uCutY+0.05,aInt.y);",
    "  float keep=(1.0-0.55*fR*rmK)*(1.0-0.5*fE*eyK)*(1.0-cutA)*mix(1.0,h4<0.22?0.85:0.0,spread)*mix(1.0,0.75,loose)*mix(1.0,0.7,scat);",
    "  alpha*=mix(1.0,keep,wI);",
    "  float rI=mix(uRad.z*1.2,max(uRad.z*1.2,uRoom.w*0.54),mdl)*(1.0-0.36*tru*(1.0-mdl))*(1.0-0.3*spread);",
    "  float rad=wG*rGx+wE*uRad.y+wI*rI+wP*(isRing?uRad.w:uRad.y)+wO*uRad.x*(0.7+0.5*wave+star);",
    // projection + screen effects
    "  vec4 clip=uVP*vec4(pos,1.0); float w=max(clip.w,0.001); vec2 ndc=clip.xy/w; vec2 sp=vec2(ndc.x*uAspect,ndc.y);",
    // hero: the galaxy stays calm behind the top-centre text
    // (round 6: from a bit lower, so the ring is softer behind the hero buttons too)
    "  alpha*=1.0-0.5*wG*uCalmTop*smoothstep(-0.08,0.45,ndc.y)*(1.0-smoothstep(0.35,0.9,abs(ndc.x)));",
    "  float dd=length(sp-vec2(uPtr.x*uAspect,uPtr.y));",
    "  float scan=(1.0-smoothstep(uScanR*0.2,uScanR,dd))*uPtr.z;",
    // round 6: no automatic sweep line; the pointer's ripples stay, subtle
    "  float rip=0.0; vec2 rdir=vec2(0.0);",
    "  for(int i=0;i<12;i++){ vec4 R=uRip[i]; if(R.w>0.0){ float age=uNow-R.z; vec2 dv=sp-vec2(R.x*uAspect,R.y); float d=length(dv);",
    "    float b=exp(-pow((d-age*0.9)/0.07,2.0))*R.w*exp(-age*1.2)*step(0.0,age); rip+=b; rdir+=dv/max(d,0.0001)*b; } }",
    "  rip=min(rip,1.2); clip.xy+=vec2(rdir.x/uAspect,rdir.y)*0.012*w;",
    "  float rev=clamp(scan+rip*0.45,0.0,1.0);",
    "  col=mix(col,trueC*1.12,rev); mono*=1.0-rev;",
    "  float boost=1.0+scan*0.9+rip*0.5;",
    // faint formations (galaxy, orbit dust) still light up clearly under the scanner
    "  alpha+=(1.0-min(alpha,1.0))*clamp(scan*0.16+rip*0.14,0.0,1.0)*(wG+wO+wP*(isRing?0.5:1.0));",
    "  if(uLight>0.5){ vec3 inkC=mix(uInk,vec3(0.6,0.61,0.63),smoothstep(0.25,0.95,lum(col))); col=mix(col*mix(0.62,0.8,mdl*wI),inkC,mono*0.85); }",
    "  col=col*boost+uAccent*(rip*0.22)*(uLight>0.5?0.7:1.0);",
    // (30 Oct night) the ring no longer fades behind the house: there is no house in the ending any more
    "  float vd=distance(pos,uCam); float fog=smoothstep(uFog.x,uFog.y,vd);",
    "  alpha*=(1.0-0.9*fog)*smoothstep(uNear*0.35,uNear,vd)*(1.0-lift)*uBright*mix(1.0,uLight>0.5?0.3:0.8,calm)*mix(1.0,uHFade,wG); col*=mix(1.0,0.3,calm*(1.0-uLight));",
    "  float px=2.0*rad*uSizeK*uPix/w*(1.0+scan*0.45+rip*0.5)*(1.0-0.1*calm);",
    "  float mn=1.5*uDpr; if(px<mn){ alpha*=(px/mn)*(px/mn); px=mn; }",
    "  alpha*=1.0-0.8*smoothstep(9.0*uDpr,32.0*uDpr,px); px=min(px,uMaxPx);",
    "  if(clip.w<0.03||alpha<0.002){ gl_Position=vec4(2.0,2.0,2.0,1.0); gl_PointSize=0.0; vCol=vec4(0.0); vHard=0.0; return; }",
    "  gl_Position=clip; gl_PointSize=px;",
    "  vCol=vec4(col*alpha,alpha*uOver); vHard=max(mdl*0.85,tru*0.92*(1.0-spread))*(1.0-0.6*calm);",
    "}"
  ].join("\n").replace(/NSC/g, String(SCENES.length));

  var FS = [
    "#version 300 es",
    "precision mediump float;",
    "in vec4 vCol; in float vHard; out vec4 o;",
    "void main(){ vec2 q=gl_PointCoord*2.0-1.0; float r2=dot(q,q); if(r2>1.0) discard;",
    "  float soft=exp(-r2*3.0)*(1.0-r2); float hard=1.0-smoothstep(0.5,1.0,r2);",
    "  o=vCol*mix(soft,hard,vHard); }"
  ].join("\n");

  // The scanner's own soft ring glow: one small quad around the pointer.
  var GVS = [
    "#version 300 es",
    "precision highp float;",
    "uniform vec2 uP; uniform float uR, uAspect; out vec2 vUv;",
    "void main(){ vec2 c=vec2(gl_VertexID&1, gl_VertexID>>1)*2.0-1.0; vUv=c*1.6;",
    "  gl_Position=vec4(uP+vec2(c.x*1.6*uR/uAspect, c.y*1.6*uR),0.0,1.0); }"
  ].join("\n");
  var GFS = [
    "#version 300 es",
    "precision mediump float;",
    "in vec2 vUv; uniform vec3 uCol; uniform float uAmt, uLightG; out vec4 o;",
    "void main(){ float d=length(vUv);",
    "  float g=exp(-pow((d-1.0)/0.022,2.0))*0.3+exp(-pow((d-1.0)/0.2,2.0))*0.08+(1.0-smoothstep(0.0,1.0,d))*0.03;",
    "  g*=uAmt*(1.0-smoothstep(1.3,1.6,d)); o=uLightG>0.5?vec4(uCol*g,g):vec4(uCol*g,0.0); }"
  ].join("\n");

  /* ---------- GL setup ---------- */
  var prog, vao, U = {}, bufs = [], maxPx = 64, gprog, gvao, GU = {};
  // (31 Oct) no status check here (it would wait for the compile): a failed compile shows up as a failed link
  function compile(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    return s;
  }
  // (31 Oct, phone speed) the two programs are compiled first; with KHR_parallel_shader_compile the browser
  // compiles them in the background and boot() waits for them without freezing the page (~0.4 s on a
  // computer, more on a phone, right when a visitor first touches the hero)
  function makeProgs() {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    var gp = gl.createProgram();
    gl.attachShader(gp, compile(gl.VERTEX_SHADER, GVS)); gl.attachShader(gp, compile(gl.FRAGMENT_SHADER, GFS)); gl.linkProgram(gp);
    return [p, gp];
  }
  function initGL(pp) {
    pp = pp || makeProgs();
    var p = pp[0];
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    prog = p; gl.useProgram(p);
    ["uVP", "uCam", "uTime", "uNow", "uPix", "uAspect", "uDpr", "uCount", "uMaxPx", "uSizeK", "uBright", "uOver", "uLight", "uNear",
      "uFilm", "uFA", "uFB", "uGalM", "uOrbM", "uPlaM", "uCtr", "uRad", "uExtH", "uRoom", "uRoomX", "uClay", "uPaintA", "uPaintB", "uPaintT",
      "uPtr", "uScanR", "uRip", "uAccent", "uInk", "uFog", "uDbg",
      "uFC", "uTopP", "uEyeP", "uCutY", "uRoomCut", "uCalmTop", "uFocR", "uFocE", "uTopC",
      "uHF", "uHA", "uHR", "uBldC", "uDrC", "uBldM", "uBldT", "uFrmM", "uFrmT",
      "uGalT", "uInP", "uRoomP", "uK", "uOutM", "uOutT", "uHFade", "uBld2", "uDust", "uEndC", "uCropK", "uEndO", "uGP"].forEach(function (n) { U[n] = gl.getUniformLocation(p, n); });
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    bufs = [];
    function attr(loc, data, size, type, norm) {
      var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, norm, 0, 0); bufs.push(b);
    }
    attr(0, DATA.aExt, 3, gl.FLOAT, false); attr(1, DATA.cExt, 4, gl.UNSIGNED_BYTE, true);
    attr(2, DATA.aInt, 3, gl.FLOAT, false); attr(3, DATA.cInt, 4, gl.UNSIGNED_BYTE, true);
    attr(4, DATA.aGal, 4, gl.FLOAT, false); attr(5, DATA.aMod, 4, gl.FLOAT, false); attr(6, DATA.aOut, 4, gl.FLOAT, false);
    attr(7, DATA.aFrm, 4, gl.FLOAT, false); attr(8, DATA.cFrm, 4, gl.UNSIGNED_BYTE, true);
    var gp = pp[1];
    if (!gl.getProgramParameter(gp, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(gp));
    gprog = gp; GU = {};
    ["uP", "uR", "uAspect", "uCol", "uAmt", "uLightG"].forEach(function (n) { GU[n] = gl.getUniformLocation(gp, n); });
    gvao = gl.createVertexArray();
    var rng2 = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE); maxPx = Math.min(rng2 ? rng2[1] : 64, 96);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  /* ---------- Colours from CSS ---------- */
  var BG = [0.04, 0.043, 0.05], ACC = [1, 0.35, 0.16], INK = [0.05, 0.055, 0.06], LIGHT = 0;
  var probe = null;
  function cssColour(str, fb) {
    if (!str) return fb;
    if (!probe) probe = doc.createElement("canvas").getContext("2d");
    probe.fillStyle = "#000"; probe.fillStyle = str.trim();
    var v = probe.fillStyle;
    if (v.charAt(0) === "#") return [parseInt(v.substr(1, 2), 16) / 255, parseInt(v.substr(3, 2), 16) / 255, parseInt(v.substr(5, 2), 16) / 255];
    var m = v.match(/[\d.]+/g); return m ? [m[0] / 255, m[1] / 255, m[2] / 255] : fb;
  }
  function readPalette() {
    var cs = getComputedStyle(root);
    BG = cssColour(cs.getPropertyValue("--bg"), BG);
    ACC = cssColour(cs.getPropertyValue("--accent"), ACC);
    INK = cssColour(cs.getPropertyValue("--ink"), INK);
    LIGHT = (0.2126 * BG[0] + 0.7152 * BG[1] + 0.0722 * BG[2]) > 0.5 ? 1 : 0;
    kick();
  }

  /* ---------- Paint ---------- */
  var CLAY = [0.90, 0.88, 0.84];
  var paint = { a: CLAY.slice(), b: CLAY.slice(), t0: -10 };
  function paintT(now) { var t = clamp((now - paint.t0) / 1.7, 0, 1); return t; }
  function setPaint(c) {
    var to = c ? cssColour(String(c), null) : CLAY;
    if (!to) return;
    var now = performance.now() / 1000, t = paintT(now);
    // the new wave starts from where the old one roughly is
    paint.a = [mix(paint.a[0], paint.b[0], t), mix(paint.a[1], paint.b[1], t), mix(paint.a[2], paint.b[2], t)];
    paint.b = to.slice(); paint.t0 = now; kick();
  }

  /* ---------- Scenes: formation, look, camera ---------- */
  // formation weights: [galaxy, exterior, interior, planet | orbit, model, roof, calm | room, top, eye, inside-gather]
  // room / top / eye all use the interior points: true colour, hard dots, and their own motion.
  var FORM = {
    space: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], condense: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], inside: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    room: [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0], eye: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0], top: [0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0],
    // round 9: calm = a very sparse dust of the house's own points (no ghost of the floor), orbit = the real
    // building (exterior points, cropped to the house) slowly turning, planet = the ending: the building again
    // with an orbit ring made of its own points (the logo, made of the house). No galaxy, no stock planet.
    model: [0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0], paint: [0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0], calm: [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    orbit: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], planet: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]
  };
  // look: bright, size, over (dark palettes: 0 = additive, 1 = opaque-ish), near fade
  var LOOK = {
    space: [1.0, 1.0, 0.0, 0.2], condense: [1.05, 1.0, 0.85, 0.2], inside: [1.05, 1.0, 0.8, 0.9],
    room: [1.08, 1.0, 0.94, 0.9], eye: [1.08, 1.0, 0.92, 0.9], top: [1.08, 1.0, 0.94, 0.2],
    model: [1.0, 1.0, 0.96, 0.2], paint: [1.0, 1.0, 0.96, 0.2], calm: [0.6, 0.75, 0.94, 0.2],
    orbit: [1.05, 1.0, 0.85, 0.2], planet: [1.05, 1.0, 0.85, 0.2]
  };
  // scenes framed as an object: on a tall phone screen the camera steps back
  // (value = how strongly; the ring needs the most room)
  var OBJ = { space: 0.85, condense: 0.42, inside: 0, room: 0.75, eye: 0, top: 0.6, model: 0.42, paint: 0.42, calm: 0.42, orbit: 0.6, planet: 0.42 };
  // lens shift per scene [wide x, wide y, tall x, tall y] in screen units (NDC, + = right / up):
  // frames the subject beside, above or below the section's text without turning the camera.
  // "wide" = landscape (x only from 1024 px wide), "tall" = portrait or narrower than 768 px.
  // Hero: the ring centre / the house outline sits at ~58 % of the screen height on desktop, ~60 % on a phone.
  // Round 5 (contract 5.5, the "2" layouts): condense, room, top and orbit put their subject at
  // x = 0.66 of the screen on desktop (text left) and at y = 0.62 on phones (text on top).
  // camera().shift carries this, so the stage's solid model follows.
  // Round 6 (6.5): on desktop the x (and y) of these shifts comes from the centre of the visible
  // [data-subject] element of the active section (subjectShift below); SX is the fallback (x = 0.66).
  var SX = 0.32, SY = -0.24, SUBJ = { condense: 0.8, room: 1.05, top: 0.8 }; // desktop step-back strength (room a bit more so the floor fits)
  // Round 9: scenes whose subject is FITTED into the section's [data-subject-fit] box and moves with the page
  // (like a picture in the layout; every width): camera distance from the box size, lens shift = box centre.
  var TRACK = { orbit: 1, planet: 1 };
  var SHIFT = { space: [0, -0.25, 0, -0.205], /* round 6: ring a bit lower on desktop, clear of the hero buttons */ condense: [SX, 0, 0, SY], inside: [0, 0, 0, 0], room: [SX, 0, 0, SY], eye: [0, 0, 0, 0], top: [SX, 0, 0, SY],
    model: [0.18, 0, 0, 0.1], paint: [0, 0, 0, 0], calm: [0, 0, 0, 0], orbit: [SX, 0, 0, SY], planet: [0, 0, 0, 0] };
  var CTR = [0, 3.0, 0];
  // Film poses (js/film.js, model metres) in engine world units. Read every frame: other
  // builders update them (realEye from real.json). Without a model frame the film's numbers
  // do not fit the points, so each pose has a stand-in made from the interior itself.
  function pose(name) {
    var I = DATA.inn, rm = Math.max(I.hx, I.hz), F = win.ORBIT_FILM && win.ORBIT_FILM.poses && win.ORBIT_FILM.poses[name];
    if (name === "aerial") return aerialPose();
    if (I.frame && F && F.eye && F.target) return { p: I.fromM(F.eye), t: I.fromM(F.target), f: +F.fov || 45 };
    var fl = I.floorY;
    if (name === "roomView") return { p: [-Math.sin(0.7) * rm * 1.2, fl + rm * 1.25, -Math.cos(0.7) * rm * 1.2], t: [0, fl + 0.6 * I.k, 0], f: 45 };
    if (name === "realEye") { var e = I.eye || [0, fl + 1.55 * I.k, 0], l = I.look || [0, fl + 1.5 * I.k, -1]; return { p: e.slice(), t: l.slice(), f: 70 }; }
    return { p: [Math.sin(0.9) * rm * 1.9, fl + rm * 2.1, Math.cos(0.9) * rm * 1.9], t: [0, fl, 0], f: 40 }; // top
  }
  // Round 6: the aerial pose (film.js poses.aerial, MODEL metres, the aerial splat's frame) in world
  // units. It is only meaningful when the exterior points live in the model frame; otherwise (old
  // exterior file, or no pose yet) a stand-in 3/4 view from above made from the exterior points.
  function aerialPose() {
    var E = DATA.ext, F = win.ORBIT_FILM && win.ORBIT_FILM.poses && win.ORBIT_FILM.poses.aerial;
    if (E.inModel && F && F.eye && F.target) return { p: DATA.MW.fromM(F.eye), t: DATA.MW.fromM(F.target), f: +F.fov || 40, real: true };
    var a = E.front + 0.15, R = Math.max(E.hx, E.hz) * 2.15, c = E.c;
    return { p: [c[0] + Math.sin(a) * R, E.ty + R * 0.42 - 0.9 * (E.inModel ? R / 13 : 1), c[2] + Math.cos(a) * R], t: [c[0], E.ty, c[2]], f: 40, real: false };
  }
  // Hero form placement (round 6, for the building, the outline and the furniture piece): a point set
  // is put in front of the hero (galaxy) camera so that it looks exactly as seen from its own view
  // V = { E, T, fh, C } (same view direction, same apparent size), turned by `turn` around the view's
  // target. Returns mat3 (column-major) + offset: world = M * stored + T3, where the view's own
  // coordinates are stored + V.C (the set's frame centre; 0 for world-space sets).
  var outM = new Float32Array(9), outT = new Float32Array(3), bldM = new Float32Array(9), bldT = new Float32Array(3), frmM = new Float32Array(9), frmT = new Float32Array(3);
  // fit = size and world offsets along the hero camera's right / up (worked out by fitForms from the page)
  var heroFit = { s: 0.7, dx: 0, dy: -2.0, at: -1, key: "", drift: [0, 1.4, 0] };
  function viewOutline() {
    // the pose gives the view DIRECTION and distance; the view is centred on the outline itself (round 6),
    // so an old pose (other floor) still frames the house
    var O = DATA.out, F = win.ORBIT_FILM && win.ORBIT_FILM.poses && win.ORBIT_FILM.poses.heroOutline, C = O.center, m = O.mid || [0, 0, 0];
    var E0 = F && F.eye ? F.eye : [C[0] + 8.5, 10.4, C[2] + 11], T0 = F && F.target ? F.target : [C[0], 0.6, C[2]];
    var T = [C[0] + m[0], C[1] + m[1], C[2] + m[2]], dv = [E0[0] - T0[0], E0[1] - T0[1], E0[2] - T0[2]];
    return { E: [T[0] + dv[0], T[1] + dv[1], T[2] + dv[2]], T: T, fh: (F && +F.fov || 40) * Math.PI / 180, C: C };
  }
  // the building as seen from the air: the aerial pose's direction when it fits the points, else 3/4 from above
  function viewBuilding() {
    var E = DATA.ext, A = aerialPose(), T = [E.c[0], E.ty, E.c[2]], d;
    if (A.real) d = norm3([A.p[0] - A.t[0], A.p[1] - A.t[1], A.p[2] - A.t[2]]);
    else { var a = E.front + 0.55; d = norm3([Math.sin(a) * 0.8, 0.62, Math.cos(a) * 0.8]); }
    if (d[1] < 0.35) d = norm3([d[0], 0.35, d[2]]); // always a bit from above
    var D = Math.max(E.hx, E.hz) * 2.2;
    return { E: [T[0] + d[0] * D, T[1] + d[1] * D, T[2] + d[2] * D], T: T, fh: 40 * Math.PI / 180, C: [0, 0, 0] };
  }
  // the furniture piece 3/4 from the front and a little above (form.front = its front direction, else +z)
  function viewFurniture() {
    var F = DATA.frm, f = F.front || [0, 0, 1], a = Math.atan2(f[0], f[2]) + 0.6, d = norm3([Math.sin(a) * 0.8, 0.5, Math.cos(a) * 0.8]);
    var D = 3.2 * Math.max(F.size[0], F.size[1], F.size[2], 0.3), T = F.mid;
    return { E: [T[0] + d[0] * D, T[1] + d[1] * D, T[2] + d[2] * D], T: T, fh: 40 * Math.PI / 180, C: [0, 0, 0] };
  }
  function placeForm(V, turn, fit, M9, T3) {
    var E = V.E, T = V.T, fh = V.fh, C = V.C;
    var Pg = [0, CTR[1] + 3.0, 21.5], Tg = [0, CTR[1] - 0.2, 0], fg = 42 * Math.PI / 180;
    var z = norm3([E[0] - T[0], E[1] - T[1], E[2] - T[2]]), x = norm3(cross([0, 1, 0], z)), y = cross(z, x);
    var zg = norm3([Pg[0] - Tg[0], Pg[1] - Tg[1], Pg[2] - Tg[2]]), xg = norm3(cross([0, 1, 0], zg)), yg = cross(zg, xg);
    var D = Math.hypot(E[0] - T[0], E[1] - T[1], E[2] - T[2]) || 1, Dg = Math.hypot(Pg[0] - Tg[0], Pg[1] - Tg[1], Pg[2] - Tg[2]);
    var s = Dg / D * fit.s, r = Math.tan(fg / 2) / Math.tan(fh / 2);
    Tg = [Tg[0] + xg[0] * fit.dx + yg[0] * fit.dy, Tg[1] + xg[1] * fit.dx + yg[1] * fit.dy, Tg[2] + xg[2] * fit.dx + yg[2] * fit.dy];
    var A = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];          // world -> pose view
    var B = [xg[0] * s * r, xg[1] * s * r, xg[2] * s * r, yg[0] * s * r, yg[1] * s * r, yg[2] * s * r, zg[0] * s, zg[1] * s, zg[2] * s];
    var M = mul3(mul3(B, A), rotY(turn));
    for (var q = 0; q < 9; q++) M9[q] = M[q];
    var d = [C[0] - T[0], C[1] - T[1], C[2] - T[2]];
    for (q = 0; q < 3; q++) T3[q] = M[q] * d[0] + M[3 + q] * d[1] + M[6 + q] * d[2] + Tg[q];
  }
  /* Hero film schedule (round 8): ONE short sequence that plays once, no loop. A few quick, clearly
     different forms, then the building from the air, held for good:
       0.0  ring (spins fast)          1.4  -> house outline (turns, a few views)   4.3 -> building
       6.0  building landed             6.2 - 8.0 the real still fades in over it   7.2 - 8.6 points fade out
     Forms: 0 ring, 1 building, 2 outline, 3 furniture, 4 loose drift. A missing form is replaced by the
     next one in the list (outline -> furniture -> drift); no building = it ends on the middle form. */
  var H_HOLD = { 0: 1.4, 1: 0, 2: 1.5, 3: 1.5, 4: 1.2 }, H_TR = [1.4, 1.7], HSEQ = [0, 2, 1];
  var HT = { b0: 4.3, b1: 6.0, s0: 6.2, s1: 8.0, p0: 7.2, p1: 8.6, end: 8.6 }; // building transition, still, points fade
  var H_SKIP = 0.8, H_FAST = 3; // first click / tap / scroll: straight into the building in 0.8 s, the rest at 4x
  var HF = {}; // id -> { view, S, fit, M, T, maxW, q, t0, rate, exact }
  function buildSeq() {
    HF = {};
    // the building is placed EXACTLY (it must land on the still), only with a model-frame exterior
    if (DATA.bldS) HF[1] = { view: viewBuilding, S: DATA.bldS, fit: { s: 1, dx: 0, dy: 0 }, M: bldM, T: bldT, maxW: [1.25, 1.75], hk: 0.88, q: 0.003, t0: -0.22, rate: 0.026, exact: !!DATA.ext.inModel };
    if (DATA.out && DATA.outS) HF[2] = { view: viewOutline, S: DATA.outS, fit: heroFit, M: outM, T: outT, maxW: [1.3, 1.8], hk: 1, q: 0.005, t0: -0.55, rate: 0.26 };
    if (DATA.frm && DATA.frmS) HF[3] = { view: viewFurniture, S: DATA.frmS, fit: { s: 1, dx: 0, dy: 0 }, M: frmM, T: frmT, maxW: [0.9, 1.4], hk: 0.74, q: 0.005, t0: -0.6, rate: 0.3 };
    var mid = HF[2] ? 2 : HF[3] ? 3 : 4;
    HSEQ = HF[1] ? [0, mid, 1] : [0, mid];
  }
  // the film at time t (s, clamped: it plays once): forms a -> b, progress u (0 = holding a),
  // local times la / lb of a and b since they began forming (for their slow turn)
  function heroAt(t) {
    t = Math.max(0, t);
    var r = H_HOLD[0], m = HSEQ[1], last = HSEQ[HSEQ.length - 1];
    if (t < r) return { a: 0, b: 0, u: 0, la: t, lb: t };
    if (t < r + H_TR[0]) return { a: 0, b: m, u: (t - r) / H_TR[0], la: t, lb: t - r };
    if (HSEQ.length < 3 || t < HT.b0) return { a: m, b: m, u: 0, la: t - r, lb: t - r };
    if (t < HT.b1) return { a: m, b: last, u: (t - HT.b0) / (HT.b1 - HT.b0), la: t - r, lb: t - HT.b0 };
    return { a: last, b: last, u: 0, la: t - HT.b0, lb: t - HT.b0 };
  }
  function heroTurn(id, local) { var f = HF[id]; return f ? f.t0 + f.rate * local : 0; }
  function heroPlace(id, local) { var f = HF[id]; if (f && !f.exact) placeForm(f.view(), heroTurn(id, local), f.fit, f.M, f.T); }

  /* Round 8: the still the film resolves into. Cameras in MODEL metres (the aerial splat's frame, which the
     exterior points share), fov = vertical degrees, shift = lens shift (projection m[8], m[9]) at the
     picture's own aspect. Rendered by work/H8/still.py with the site's stage (streamed aerial, full detail);
     change a camera here = render that picture again (work/H8/NOTES.md). */
  var HERO_STILL = {
    desk: { aspect: 1920 / 1080, eye: [50.462, 38.267, 31.042], target: [10.7, 3.0, 3.2], fov: 34, shift: [0, 0.36] },
    phone: { aspect: 780 / 1690, eye: [38.88, 46.841, 36.784], target: [10.7, 3.0, 3.2], fov: 52, shift: [0, 0.42] }
  };
  var heroBox = null, heroImg = null, heroPic = { key: "", still: HERO_STILL.desk, fov: 0, shift: [0, 0], ok: false };
  /* The projection that puts the points exactly on the still as the page shows it: the picture covers its box
     (object-fit: cover, centred), so a picture NDC (xi, yi) lands at viewport NDC (xi * sx + ox, yi * sy + oy).
     With xi = f_i / a_i * X - s_ix (X = x / -z of the still's camera), the viewport projection with the same
     camera is f_v = sy * f_i, shift_v = (sx * s_ix - ox, sy * s_iy - oy). Read from the box every frame, so
     the points follow the picture when it scrolls or the screen changes. */
  function heroProj() {
    var o = heroPic, cw = canvas.clientWidth || win.innerWidth, ch = canvas.clientHeight || win.innerHeight;
    var r = heroBox ? heroBox.getBoundingClientRect() : null;
    if (!r || r.width < 2 || r.height < 2) r = { left: 0, top: 0, width: cw, height: ch }; // no still on the page: as if it filled the screen
    var src = heroImg && heroImg.currentSrc || "", phone = src ? /phone/.test(src) : r.width / r.height <= 2 / 3; // (same rule as the <picture> media query)
    var S = phone ? HERO_STILL.phone : HERO_STILL.desk, A = S.aspect, Wd, Hd;
    if (r.width / r.height > A) { Wd = r.width; Hd = r.width / A; } else { Hd = r.height; Wd = r.height * A; }
    var left = r.left + (r.width - Wd) * 0.5, top = r.top + (r.height - Hd) * 0.5;
    var sx = Wd / cw, sy = Hd / ch, ox = (2 * left + Wd) / cw - 1, oy = 1 - (2 * top + Hd) / ch;
    var fi = 1 / Math.tan(S.fov * Math.PI / 360), fv = sy * fi;
    // (shift clamped: far off screen it only matters at a tiny scene weight)
    o.still = S; o.fov = 2 * Math.atan(1 / fv); o.shift = [clamp(sx * S.shift[0] - ox, -4, 4), clamp(sy * S.shift[1] - oy, -4, 4)]; o.ok = true;
    return o;
  }
  // Exact placement of the building (hero world = M * exterior world + T): the hero camera (eye cp, target ct)
  // sees it exactly as the still's camera sees the real exterior points (same view axes, uniform scale).
  function placeExact(cp, ct, la) {
    var S = heroPic.still, MW = DATA.MW, e = MW.fromM(S.eye), t = MW.fromM(S.target), L = lookAt(e, t);
    var zs = norm3([e[0] - t[0], e[1] - t[1], e[2] - t[2]]), zg = norm3([cp[0] - ct[0], cp[1] - ct[1], cp[2] - ct[2]]);
    var s = Math.hypot(cp[0] - ct[0], cp[1] - ct[1], cp[2] - ct[2]) / (Math.hypot(e[0] - t[0], e[1] - t[1], e[2] - t[2]) || 1);
    var xg = la.x, yg = la.y, xs = L.x, ys = L.y, c, r;
    for (c = 0; c < 3; c++) for (r = 0; r < 3; r++) bldM[c * 3 + r] = s * (xg[r] * xs[c] + yg[r] * ys[c] + zg[r] * zs[c]);
    for (r = 0; r < 3; r++) bldT[r] = cp[r] - (bldM[r] * e[0] + bldM[3 + r] * e[1] + bldM[6 + r] * e[2]);
  }

  // Fit every form into the free part of the hero (the manager's rule): fully BELOW the hero buttons,
  // above the bottom readout, horizontally centred on its real on-screen box (not on the view target),
  // seen through the hero camera at rest (same step-back, widening and lens shift as the frame uses).
  // The loose drift cloud is centred in the same band.
  var fitM = new Float32Array(9), fitT = new Float32Array(3);
  function fitForms() {
    var vw = win.innerWidth || 1, vh = win.innerHeight || 1, sy = win.scrollY || 0, tall = !(W >= H && vw >= 768);
    var asp = W / H, fov = 42 * Math.PI / 180;
    if (asp < 1) fov = 2 * Math.atan(Math.tan(fov / 2) * Math.pow(1 / asp, 0.3));
    var Tc = [0, CTR[1] - 0.2, 0], Pc = [0, CTR[1] + 3.0, 21.5], sb = Math.pow(Math.max(1, H / W), OBJ.space);
    var cp = [Tc[0] + (Pc[0] - Tc[0]) * sb, Tc[1] + (Pc[1] - Tc[1]) * sb, Tc[2] + (Pc[2] - Tc[2]) * sb];
    var dist = Math.hypot(cp[0] - Tc[0], cp[1] - Tc[1], cp[2] - Tc[2]), PM = perspective(fov, asp, Math.max(0.03, dist * 0.004), dist * 8 + 60);
    var sh = SHIFT.space; PM[8] = -(tall ? sh[2] : (vw >= 1024 ? sh[0] : 0)); PM[9] = -(tall ? sh[3] : sh[1]);
    var VP = mul4(PM, lookAt(cp, Tc).m);
    // free band (CSS px from the top of the page, hero at rest)
    var topPx = vh * 0.45, botPx = vh * (tall ? 0.9 : 0.955), el = doc.querySelector("#top .hero__actions") || doc.querySelector("#top [data-magnetic]") || doc.querySelector("#top h1"), r;
    if (el) { r = el.getBoundingClientRect(); if (r.height > 0) topPx = r.bottom + sy + (tall ? 22 : 30); }
    Array.prototype.forEach.call(doc.querySelectorAll("#top [data-hero-readout], #top [data-hero-hint]"), function (e) {
      var q = e.getBoundingClientRect(); if (q.height > 0 && q.left < vw * 0.62 && q.right > vw * 0.38) botPx = Math.min(botPx, q.top + sy - 14);
    });
    if (botPx - topPx < vh * 0.22) topPx = botPx - vh * 0.22; // tiny landscape screens: overlap rather than vanish
    var yT = 1 - 2 * topPx / vh, yB = 1 - 2 * botPx / vh, unit = dist * Math.tan(fov / 2);
    // the drift cloud: centred in the band (world offset along the camera's up at the target)
    var w0 = VP[3] * Tc[0] + VP[7] * Tc[1] + VP[11] * Tc[2] + VP[15], ny0 = (VP[1] * Tc[0] + VP[5] * Tc[1] + VP[9] * Tc[2] + VP[13]) / w0;
    var upg = lookAt(Pc, Tc).y, ddy = ((yT + yB) / 2 - ny0) * unit;
    heroFit.drift = [Tc[0] + upg[0] * ddy, Tc[1] + upg[1] * ddy, Tc[2] + upg[2] * ddy];
    heroFit.band = [yT, yB];
    // (at most ~500 samples per form and turn, typed-array sorts: a few ms for all forms)
    var nxB = new Float64Array(2600), nyB = new Float64Array(2600);
    Object.keys(HF).forEach(function (id) {
      var F = HF[id]; if (F.exact) return; // the building lands on the still, not in the band
      var S = F.S, V = F.view(), maxW = F.maxW[tall ? 1 : 0], fit = { s: 1, dx: 0, dy: 0 }, b = [0, 0, 0, 0];
      var span = H_TR[0] + H_TR[1] + (H_HOLD[id] || 1), stp = Math.max(1, Math.floor(S.length / 3 / 500)) * 3;
      function box() {
        var c = 0;
        for (var t = 0; t < 3; t++) {
          placeForm(V, heroTurn(id, span * t / 2), fit, fitM, fitT);
          for (var i = 0; i + 2 < S.length && c < 2600; i += stp) {
            var x = fitM[0] * S[i] + fitM[3] * S[i + 1] + fitM[6] * S[i + 2] + fitT[0], y = fitM[1] * S[i] + fitM[4] * S[i + 1] + fitM[7] * S[i + 2] + fitT[1], z = fitM[2] * S[i] + fitM[5] * S[i + 1] + fitM[8] * S[i + 2] + fitT[2];
            var w = VP[3] * x + VP[7] * y + VP[11] * z + VP[15]; if (w < 0.01) continue;
            nxB[c] = (VP[0] * x + VP[4] * y + VP[8] * z + VP[12]) / w; nyB[c] = (VP[1] * x + VP[5] * y + VP[9] * z + VP[13]) / w; c++;
          }
        }
        var xs = nxB.subarray(0, c).sort(), ys = nyB.subarray(0, c).sort();
        b[0] = pct(xs, F.q); b[1] = pct(xs, 1 - F.q); b[2] = pct(ys, F.q); b[3] = pct(ys, 1 - F.q);
      }
      for (var it = 0; it < 6; it++) {
        box(); if (!(b[1] > b[0] && b[3] > b[2])) return;
        fit.s *= Math.min(it ? 1.3 : 1.8, (yT - yB) * F.hk / (b[3] - b[2]), maxW / (b[1] - b[0]));
        box();
        fit.dx -= (b[0] + b[1]) / 2 * unit * asp; fit.dy += ((yT + yB) / 2 - (b[2] + b[3]) / 2) * unit;
      }
      F.fit.s = fit.s; F.fit.dx = fit.dx; F.fit.dy = fit.dy;
      box(); F.fit.box = b.slice();
    });
  }
  // How far (factor on eye - target) the camera must step back so every outline point fits in
  // |x| <= 0.86 and |y - subject| <= 0.44 (NDC) on this (portrait) screen. 0 = no outline.
  function fitTall(p, t, fDeg) {
    var S = DATA.outS, O = DATA.out, I = DATA.inn; if (!S || !O || !I.frame) return 0;
    var asp = W / H, fov = fDeg * Math.PI / 180;
    if (asp < 1) fov = 2 * Math.atan(Math.tan(fov / 2) * Math.pow(1 / asp, 0.3));
    var tv = Math.tan(fov / 2), th = tv * asp, L = lookAt(p, t), x = L.x, y = L.y;
    var dx = p[0] - t[0], dy = p[1] - t[1], dz = p[2] - t[2], dist = Math.hypot(dx, dy, dz) || 1, fw = [-dx / dist, -dy / dist, -dz / dist], need = 1;
    for (var i = 0; i < S.length; i += 3) {
      var w = I.fromM([S[i] + O.center[0], S[i + 1] + O.center[1], S[i + 2] + O.center[2]]);
      var r0 = w[0] - t[0], r1 = w[1] - t[1], r2 = w[2] - t[2];
      var a = r0 * fw[0] + r1 * fw[1] + r2 * fw[2], rx = Math.abs(r0 * x[0] + r1 * x[1] + r2 * x[2]), uy = Math.abs(r0 * y[0] + r1 * y[1] + r2 * y[2]);
      need = Math.max(need, (rx / (0.86 * th) + a) / dist, (uy / (0.44 * tv) + a) / dist);
    }
    return Math.min(need, 4);
  }
  var roomCut = 0, condE = 0;
  function camFor(id, t, pr, out) {
    var I = DATA.inn, E = DATA.ext, a, R, rm = Math.max(I.hx, I.hz), eye = I.floorY + 1.55 * I.k, V, e2, q;
    switch (id) {
      case "space":
        out.p = [Math.sin(t * 0.045) * 1.4, CTR[1] + 3.0 + pr * 0.6, 21.5 - pr * 1.5]; out.t = [0, CTR[1] - 0.2, 0]; out.f = 42; break;
      case "room": {
        // from eye height inside the chosen room (on the side roomView looks from), up and out to roomView, then hold
        V = pose("roomView");
        var dx = V.p[0] - V.t[0], dz = V.p[2] - V.t[2], dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl, k = I.k;
        var s0 = [V.t[0] + ux * 1.7 * k, eye, V.t[2] + uz * 1.7 * k], t0 = [V.t[0] - ux * 1.3 * k, I.floorY + 1.2 * k, V.t[2] - uz * 1.3 * k];
        // round 5: the camera is up at roomView by pr 0.3 (the points snap from -0.6, the roof lifts 0.05..0.8)
        e2 = sstep(-0.95, 0.3, pr); var ey = sstep(-0.95, 0.05, pr), sway = Math.sin(t * 0.05) * 0.05 * k * e2;
        out.p = [mix(s0[0], V.p[0], e2) + uz * sway, mix(s0[1], V.p[1], ey), mix(s0[2], V.p[2], e2) - ux * sway];
        out.t = [mix(t0[0], V.t[0], e2), mix(t0[1], V.t[1], e2), mix(t0[2], V.t[2], e2)]; out.f = mix(62, V.f, e2);
        roomCut = sstep(I.floorY + 1.85 * k, I.floorY + 2.45 * k, out.p[1]);
        out.o = OBJ.room * e2; break; // phones step back only once the camera is out of the room
      }
      case "eye": {
        // fly in along the view direction to the 360 spot (eye height), then hold
        V = pose("realEye");
        var vx = V.t[0] - V.p[0], vy = V.t[1] - V.p[1], vz = V.t[2] - V.p[2], vl = Math.hypot(vx, vy, vz) || 1;
        e2 = sstep(-1, 0.3, pr); q = (1 - e2) * 2.4 * I.k;
        out.p = [V.p[0] - vx / vl * q, V.p[1] + (1 - e2) * (1 - e2) * 0.35 * I.k, V.p[2] - vz / vl * q];
        out.t = V.t.slice(); out.f = V.f; break;
      }
      case "top": {
        // the whole floor, 3/4 from above; turns a little through the beat
        V = pose("top");
        var yaw = (pr - 1) * 0.1 + Math.sin(t * 0.03) * 0.03, cy = Math.cos(yaw), sy = Math.sin(yaw);
        var ox = V.p[0] - V.t[0], oz = V.p[2] - V.t[2];
        out.p = [V.t[0] + cy * ox + sy * oz, V.p[1], V.t[2] - sy * ox + cy * oz]; out.t = V.t.slice(); out.f = V.f;
        // round 6: portrait screens: step back exactly as far as the whole floor (its outline) needs to fit
        // the width (and the lower part), centred; replaces the fixed phone step-back for this scene
        if (H > W || win.innerWidth < 768) { var fT = fitTall(out.p, out.t, out.f); if (fT > 0) { out.o = 0; for (q = 0; q < 3; q++) out.p[q] = out.t[q] + (out.p[q] - out.t[q]) * fT; } }
        break;
      }
      case "condense": {
        // round 6: the gather beat (pr -1..0.5) swings in from wider, higher and turned, and lands
        // EXACTLY on the aerial pose (film.js poses.aerial = the aerial splat's camera), then holds
        // (pr 0.5..1 and the reveal beat): no sway, no parallax, so the stage's splat lines up 1:1.
        V = aerialPose(); e2 = sstep(-1, 0.5, pr); condE = e2;
        var ox = V.p[0] - V.t[0], oy = V.p[1] - V.t[1], oz = V.p[2] - V.t[2], ie = 1 - e2;
        var yw = -0.55 * ie + Math.sin(t * 0.035) * 0.2 * ie, cy2 = Math.cos(yw), sy2 = Math.sin(yw), gr2 = 1 + 0.3 * ie * ie;
        out.p = [V.t[0] + (cy2 * ox + sy2 * oz) * gr2, V.t[1] + oy * gr2 * (1 + 0.25 * ie), V.t[2] + (-sy2 * ox + cy2 * oz) * gr2];
        out.t = V.t.slice(); out.f = V.f; out.subj = V.real ? ie : 1; // stand-in pose: keep the step-back
        // phones (portrait) keep a gentler step-back so the block has air: camera() then reports that eye
        if (V.real) out.o = OBJ.condense * (0.55 + 0.45 * ie);
        break;
      }
      case "inside":
        var ey = I.eye || [0, eye, 0], lk = I.look || [0, eye, -1];
        var dx = lk[0] - ey[0], dz = lk[2] - ey[2], dl = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, dz) + Math.sin(t * 0.05) * 0.2 - pr * 0.25;
        var fw = pr * 0.5 * I.k;
        out.p = [ey[0] + dx / dl * fw + Math.sin(t * 0.07) * 0.08, ey[1] + Math.sin(t * 0.11) * 0.02, ey[2] + dz / dl * fw];
        out.t = [out.p[0] + Math.sin(yaw) * dl, lk[1] + (ey[1] - lk[1]) * 0.3, out.p[2] + Math.cos(yaw) * dl]; out.f = 62; break;
      case "model":
        a = 0.42 + Math.sin(t * 0.04) * 0.18 + pr * 0.35; R = rm * 2.25;
        out.p = [Math.sin(a) * R, I.floorY + R * 0.78, Math.cos(a) * R]; out.t = [0, I.floorY + (I.ceilY - I.floorY) * 0.12, 0]; out.f = 40; break;
      case "paint":
        a = -0.38 + Math.sin(t * 0.04) * 0.15 + pr * 0.3; R = rm * 2.0;
        out.p = [Math.sin(a) * R, I.floorY + R * 0.85, Math.cos(a) * R]; out.t = [0, I.floorY + (I.ceilY - I.floorY) * 0.15, 0]; out.f = 40; break;
      case "calm":
        a = 0.2 + t * 0.02;
        out.p = [Math.sin(a) * rm * 2.6, I.floorY + rm * 2.3, Math.cos(a) * rm * 2.6]; out.t = [0, I.floorY, 0]; out.f = 34; break;
      case "orbit":   // round 9 #who: the real house, slowly turning, fitted into the section's box
      default: {      // round 9 ending (planet slot): the house with its ring of points, fitted the same way
        var B = DATA.bld, ap = aerialPose(), end = id !== "orbit";
        // half-sizes to fit: across (the ring is wide and flat) and up (the house)
        var C = B ? B.c : ap.t, R0 = B ? B.R : 6, Rw = end ? R0 * RING_K * 1.03 : R0, Rh = end ? Math.max(R0 * 0.62, R0 * RING_K * 0.4) : R0 * 0.72;
        var ddx = ap.p[0] - ap.t[0], ddz = ap.p[2] - ap.t[2], hl = Math.hypot(ddx, ddz) || 1;
        var yw0 = Math.atan2(ddx / hl, ddz / hl) + (end ? 0.25 + 0.22 * Math.sin(t * 0.04) : -0.35 + 0.45 * Math.sin(t * 0.045));
        var el = end ? 0.58 : 0.66, ce = Math.cos(el), se = Math.sin(el); // from the air, like the drone saw it

        var bx2 = trackBox(id), D = fitDist(Rw, Rh, bx2, 34);
        out.p = [C[0] + Math.sin(yw0) * ce * D, C[1] + se * D, C[2] + Math.cos(yw0) * ce * D];
        out.t = C.slice(); out.f = 34; out.o = 0;
      }
    }
    return out;
  }
  // Round 9: the ring of the ending, as a factor on the house's radius
  var RING_K = 1.28;
  // the [data-subject-fit] box of the section that runs a TRACK scene: { cx, cy (NDC, + = right / up, not
  // clamped: the subject scrolls with the page), fw, fh (share of the screen) }, or a centred fallback
  var trackEls = new Map();
  function trackBox(id) {
    var i = SCENES.indexOf(id), m = i >= 0 && bestEl[i] >= 0 ? marks[bestEl[i]] : null, sec = m && m.sec, el = null;
    if (sec) {
      if (!trackEls.has(sec)) trackEls.set(sec, sec.querySelector("[data-subject-fit]"));
      el = trackEls.get(sec);
    }
    var vw = win.innerWidth || 1, vh = win.innerHeight || 1;
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.width > 8 && r.height > 8) return { cx: clamp((r.left + r.width / 2) / vw * 2 - 1, -3, 3), cy: clamp(1 - (r.top + r.height / 2) / vh * 2, -3, 3), fw: r.width / vw, fh: r.height / vh, el: true };
    }
    return { cx: 0, cy: 0, fw: 0.6, fh: 0.5, el: false };
  }
  // camera distance so that a subject of half-size Rw across and Rh up fits the box (88 %), with the same
  // tall-screen widening as the frame uses
  function fitDist(Rw, Rh, b, fDeg) {
    var asp = W / H, fov = fDeg * Math.PI / 180;
    if (asp < 1) fov = 2 * Math.atan(Math.tan(fov / 2) * Math.pow(1 / asp, 0.3));
    var tv = Math.tan(fov / 2), th = tv * asp;
    return Math.max(Rh / (tv * b.fh * 0.88), Rw / (th * b.fw * 0.88), Math.max(Rw, Rh) * 1.6);
  }

  /* ---------- Section reading (no scroll listener: read rects every frame) ---------- */
  // Two kinds of [data-scene] elements:
  //  - sections (not inside another [data-scene]): a scene runs from the section's top to the
  //    next section's top, so a section without data-scene keeps the previous scene;
  //  - beats (inside a [data-scene] act, e.g. <div class="beat" data-scene="room"> in a tall
  //    sticky section): weighted by how much of the BEAT itself is around the screen centre;
  //    they take that share from their act (between beats the act's own scene shows).
  //    A top-level element with class "beat" keeps the section rule for its weight.
  // Progress (-1..1) runs over the element's own box for beats, over [top, next top] for sections.
  var sections = [], marks = [], secT = 0;
  function collect() {
    sections = Array.prototype.slice.call(doc.querySelectorAll("[data-scene]"));
    marks = sections.map(function (el) {
      var top = null, p = el.parentElement;
      while (p && p.closest && (p = p.closest("[data-scene]"))) { top = p; p = p.parentElement; }
      return { nested: !!top, beat: !!top || el.classList.contains("beat"), parent: top ? sections.indexOf(top) : -1, same: [] };
    });
    // an act whose own scene also has beats inside it (room act: act "room", form beat "room") takes its
    // progress from those beats: -1 before the first, the beat's own progress while in one, +1 after.
    // So in the play / end beats the room scene holds its end state (camera at roomView, snapped, roof off).
    marks.forEach(function (m, i) {
      if (m.parent >= 0 && sections[i].getAttribute("data-scene") === sections[m.parent].getAttribute("data-scene")) marks[m.parent].same.push(i);
    });
    // Round 6: a beat whose scene already ran in an earlier beat of the same section (scan: gather
    // "condense", then reveal "condense") holds that scene's END state (+1) instead of starting over,
    // so the camera stays where the first beat put it (the aerial pose).
    marks.forEach(function (m, i) {
      var el = sections[i], sec = el.closest("section") || el.parentElement, id = el.getAttribute("data-scene");
      m.sec = sec; m.hold = false;
      if (!m.beat) return;
      for (var j = 0; j < i; j++) if (marks[j].beat && marks[j].sec === sec && sections[j].getAttribute("data-scene") === id) { m.hold = true; break; }
    });
    subjCache = new Map();
    heroBox = doc.querySelector("#top [data-hero-solid]");
    heroImg = heroBox ? heroBox.querySelector("img") : null;
  }
  // Round 6 (6.5): the centre of the visible [data-subject] element of a section, as NDC [x, y], or null.
  var subjCache = new Map(), subjAt = 0;
  function subjectOf(sec) {
    if (!sec) return null;
    var list = subjCache.get(sec);
    if (!list) { list = Array.prototype.slice.call(sec.querySelectorAll("[data-subject]")); subjCache.set(sec, list); }
    if (!list.length) return null;
    var vw = win.innerWidth || 1, vh = win.innerHeight || 1, best = null, bd = Infinity;
    for (var i = 0; i < list.length; i++) {
      var el = list[i], r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.right < 0 || r.left > vw || r.bottom < 0 || r.top > vh) continue;
      if (el._ovis === undefined || subjAt % 20 === 0) { var cs = getComputedStyle(el); el._ovis = cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.05; }
      if (!el._ovis) continue;
      var t = Math.max(r.top, 0), b = Math.min(r.bottom, vh), cx = (Math.max(r.left, 0) + Math.min(r.right, vw)) / 2, cy = (t + b) / 2, d = Math.abs(cy - vh / 2);
      if (d < bd) { bd = d; best = [clamp(cx / vw * 2 - 1, -0.7, 0.7), clamp(1 - cy / vh * 2, -0.5, 0.5)]; }
    }
    return best;
  }
  var NS = SCENES.length;
  var wT = new Float32Array(NS), prT = new Float32Array(NS), bestEl = new Int32Array(NS).fill(-1);
  var rd = { tops: [], bots: [], w: [], p: [], claim: [] };
  function readScenes() {
    var i, j, li;
    for (i = 0; i < NS; i++) { wT[i] = 0; prT[i] = 0; bestEl[i] = -1; }
    if (forced) { wT[SCENES.indexOf(forced)] = 1; return; }
    var vh = win.innerHeight || 800, vc = vh * 0.5, band = vh * 0.3, n = sections.length;
    var tops = rd.tops, bots = rd.bots, W8 = rd.w, P8 = rd.p, claim = rd.claim, L = [];
    tops.length = bots.length = W8.length = P8.length = claim.length = n;
    if (!n) { wT[0] = 1; return; }
    for (i = 0; i < n; i++) {
      var r = sections[i].getBoundingClientRect(); tops[i] = r.top; bots[i] = r.bottom; W8[i] = 0; P8[i] = 0; claim[i] = 0;
      if (!marks[i] || !marks[i].nested) L.push(i);
    }
    if (!L.length) L.push(0);
    for (li = 0; li < L.length; li++) {
      i = L[li];
      var s0 = tops[i], s1 = li < L.length - 1 ? Math.max(tops[L[li + 1]], s0 + 1) : bots[i];
      W8[i] = (li === 0 ? 1 : sstep(s0 - band, s0 + band, vc)) * (li === L.length - 1 ? 1 : 1 - sstep(s1 - band, s1 + band, vc));
      var e0 = s0, e1 = s1;
      if (marks[i] && marks[i].beat) e1 = Math.max(bots[i], s0 + 1);
      P8[i] = clamp((vc - e0) / Math.max(e1 - e0, 1), 0, 1) * 2 - 1;
    }
    for (i = 0; i < n; i++) {
      var m = marks[i]; if (!m || !m.nested || m.parent < 0) continue;
      var a = tops[i], b = Math.max(bots[i], a + 1), bb = Math.min(band, (b - a) * 0.3);
      W8[i] = sstep(a - bb, a + bb, vc) * (1 - sstep(b - bb, b + bb, vc));
      P8[i] = clamp((vc - a) / (b - a), 0, 1) * 2 - 1;
      claim[m.parent] += W8[i];
    }
    for (i = 0; i < n; i++) if (marks[i] && marks[i].hold) P8[i] = 1;
    for (li = 0; li < L.length; li++) {
      m = marks[L[li]]; if (!m || !m.same.length) continue;
      var pS = -1;
      for (j = 0; j < m.same.length; j++) if (vc >= tops[m.same[j]]) pS = P8[m.same[j]];
      P8[L[li]] = pS;
    }
    for (i = 0; i < n; i++) { // a beat's share comes out of its act's weight
      m = marks[i]; if (!m || !m.nested || m.parent < 0) continue;
      var pw = W8[m.parent], c = claim[m.parent];
      W8[i] = W8[i] * pw / Math.max(1, c);
    }
    for (li = 0; li < L.length; li++) { i = L[li]; if (claim[i] > 0) W8[i] *= Math.max(0, 1 - claim[i]); }
    var best = new Float32Array(NS), sum = 0;
    for (i = 0; i < n; i++) {
      var w = W8[i];
      j = SCENES.indexOf(sections[i].getAttribute("data-scene"));
      if (j < 0 || w <= 0) continue;
      wT[j] += w; sum += w;
      if (w > best[j]) { best[j] = w; prT[j] = P8[i]; bestEl[j] = i; }
    }
    if (sum < 1e-4) { var f0 = L[0], f1 = L[L.length - 1]; j = SCENES.indexOf(sections[vc < tops[f0] ? f0 : f1].getAttribute("data-scene")); wT[j < 0 ? 0 : j] = 1; sum = 1; }
    for (i = 0; i < NS; i++) wT[i] /= sum;
  }

  /* ---------- Pointer, ripples, sweep ---------- */
  var scanR = isPhone ? 0.3 : 0.22;
  var ptr = { x: 0, y: 0, on: 0, onT: 0, last: -10, sx: 0, sy: 0, touch: false, upAt: 0 };
  var NRIP = 12, rips = [], ripI = 0;
  for (var ri = 0; ri < NRIP; ri++) rips.push([0, 0, -10, 0]);
  function nowS() { return performance.now() / 1000; }
  // Moving the pointer leaves a trail of soft ripples (strongest in the hero):
  // one every ~0.07 of the screen travelled, at most ~11 a second, stronger when faster.
  var trail = { x: 0, y: 0, t: 0, has: false }, heroW = 1;
  function setPtr(cx, cy) {
    ptr.x = cx / Math.max(1, win.innerWidth) * 2 - 1; ptr.y = 1 - cy / Math.max(1, win.innerHeight) * 2;
    ptr.onT = 1; ptr.last = nowS();
    var n = ptr.last;
    if (!trail.has) { trail.x = ptr.x; trail.y = ptr.y; trail.t = n; trail.has = true; return; }
    var d = Math.hypot((ptr.x - trail.x) * win.innerWidth / Math.max(1, win.innerHeight), ptr.y - trail.y);
    if (d > 0.14 && n - trail.t > 0.09) {
      var speed = d / Math.max(n - trail.t, 0.016);
      addRipple(cx, cy, clamp(0.25 + speed * 0.06, 0.3, 0.75) * (0.3 + 0.7 * heroW));
      trail.x = ptr.x; trail.y = ptr.y; trail.t = n;
    }
  }
  function addRipple(cx, cy, s) {
    if (cx === undefined) { cx = win.innerWidth / 2; cy = win.innerHeight / 2; }
    rips[ripI] = [cx / win.innerWidth * 2 - 1, 1 - cy / win.innerHeight * 2, nowS(), s || 1];
    ripI = (ripI + 1) % NRIP; kick();
  }
  // Round 6: the hero film yields at the visitor's first click / tap or scroll (hover does not count).
  // Round 8: it then jumps smoothly to its end state (frame(): heroSkip, H_FAST).
  var touched = false, touchY = null;
  function touch() { if (!touched) { touched = true; kick(); } }

  /* ---------- Camera matrices ---------- */
  function perspective(fovy, asp, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function norm3(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function lookAt(e, t) {
    var z = norm3([e[0] - t[0], e[1] - t[1], e[2] - t[2]]), x = norm3(cross([0, 1, 0], z)), y = cross(z, x);
    return { m: [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1], x: x, y: y };
  }
  function mul4(A, B) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = A[r] * B[c * 4] + A[4 + r] * B[c * 4 + 1] + A[8 + r] * B[c * 4 + 2] + A[12 + r] * B[c * 4 + 3];
    }
    return o;
  }

  /* ---------- Size ---------- */
  var dpr = 1, W = 1, H = 1;
  function resize() {
    dpr = Math.min(win.devicePixelRatio || 1, dprCap);
    var cw = canvas.clientWidth || win.innerWidth, ch = canvas.clientHeight || win.innerHeight;
    W = Math.max(1, Math.round(cw * dpr)); H = Math.max(1, Math.round(ch * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    kick();
  }

  /* ---------- State + frame ---------- */
  var wC = new Float32Array(NS), pr = new Float32Array(NS), vC = new Float32Array(NS), vP = new Float32Array(NS);
  var film = 0, vFilm = new Float32Array(1);
  var FA = new Float32Array(NS * 4), FB = new Float32Array(NS * 4), FC = new Float32Array(NS * 4);
  SCENES.forEach(function (id, s) { for (var q = 0; q < 4; q++) { FA[s * 4 + q] = FORM[id][q]; FB[s * 4 + q] = FORM[id][4 + q]; FC[s * 4 + q] = FORM[id][8 + q]; } });
  var iRoom = SCENES.indexOf("room"), iEye = SCENES.indexOf("eye"), iTop = SCENES.indexOf("top"), iIn = SCENES.indexOf("inside");
  // hero film clock (seconds; runs while the hero is on screen, pauses with the tab) and the galaxy's own spin time
  // heroSkip: after the first click / tap / scroll, the film goes straight into its end form (then the rest at H_FAST x)
  var heroT = 0, galT = 8, heroSkip = null, heroHold = false, hNow = null;
  var iCond = SCENES.indexOf("condense"), subjS = new Float32Array(NS * 2), vSub = new Float32Array(NS * 2), subjOn = false;
  if (params.has("herot")) heroT = Math.max(0, +params.get("herot") || 0); // test bed: start the film at this time
  if (params.get("herohold") === "1") heroHold = true;                     // test bed: and keep it there
  function heroSet(t, hold) { heroT = Math.max(0, +t || 0); touched = false; heroSkip = null; heroHold = !!hold; kick(); }
  var sleeping = false, offscreen = false, dimSleep = false, dimSnap = false;
  var dimC = 1, vDim = new Float32Array(1);
  var cam = { p: [0, 0, 0], t: [0, 0, 0], f: 40 }, camTmp = { p: null, t: null, f: 0 };
  var pv = new Float32Array(4), simT = 8, lastT = 0, running = false, lost = false, needFrame = true, snapped = false;
  var drawCount = 0, fpsWin = { t: 0, n: 0, skip: 1.5 }, lastScene = -1, frameN = 0;
  var ripBuf = new Float32Array(48), lastVP = null;

  // Reduced motion: no loop. A frame is drawn only when something changed
  // (a section edge crossed the screen centre, resize, paint, palette, tab back).
  var kicked = false;
  function kick() {
    needFrame = true;
    if (reduced && running && !kicked) { kicked = true; win.requestAnimationFrame(frame); }
  }

  // Hidden tab, canvas off screen, pause(true) or dim below DIM_OFF (round 8): no frames at all until wake().
  function asleep() { return lost || doc.hidden || offscreen || !!st.userPause || (dimSleep && st.dimT < DIM_OFF); }
  function wake() {
    if (!running || !sleeping || asleep()) return;
    sleeping = false; lastT = 0;
    if (reduced) { kicked = false; kick(); } else win.requestAnimationFrame(frame);
  }
  // dim reached ~0: clear to the page colour once (nothing of the points stays on screen), then sleep
  function dimOff() {
    gl.viewport(0, 0, W, H); gl.clearColor(BG[0], BG[1], BG[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
    st.drawn = 0; dimSleep = true; sleeping = true; lastT = 0;
  }
  function frame(ms) {
    if (!running) return;
    if (reduced) kicked = false;
    if (asleep()) { lastT = 0; sleeping = true; return; }
    if (dimSleep) { dimSleep = false; dimSnap = true; dimC = 0; vDim[0] = 0; } // woken by dim(k >= DIM_OFF): start on the current scene
    if (!reduced) win.requestAnimationFrame(frame);
    // (4 Nov 2026) also nothing while a result plays full screen on a phone (html.ex-full, js/sections/examples.js)
    if (doc.documentElement.classList.contains("ex-full")) { lastT = 0; return; }
    var t = ms / 1000, dt = lastT ? Math.min(t - lastT, 0.1) : 0.016;
    var hiccup = lastT && (t - lastT) > 0.25;
    lastT = t;
    if (++secT > 90) { secT = 0; collect(); }
    readScenes();

    var i, dom = 0;
    for (i = 1; i < NS; i++) if (wT[i] > wT[dom]) dom = i;
    var filmT = 0;
    for (i = 0; i < NS; i++) filmT += wT[i] * i;
    if (reduced) {
      // One still frame per scene: snap to the dominant scene, no motion.
      if (dom === lastScene && !needFrame) return;
      lastScene = dom;
      // (room / eye / top show their end state: camera arrived, points landed)
      for (i = 0; i < NS; i++) { wC[i] = i === dom ? 1 : 0; pr[i] = (i === iRoom || i === iEye || i === iTop || i === iIn) ? 1 : 0; }
      film = dom; dt = 0; dimC = st.dimT;
    } else if (!snapped) {
      for (i = 0; i < NS; i++) { wC[i] = wT[i]; pr[i] = prT[i]; }
      film = filmT; snapped = true; dimC = st.dimT;
    } else {
      dimC = damp(dimC, st.dimT, vDim, 0, 0.3, dt); // ~90 % there after 0.4 s
      dimC = clamp(dimC, 0, 1);
      if (Math.abs(dimC - st.dimT) < 0.002) dimC = st.dimT;
      if (dimSnap) { // woken from a dim(0) sleep: the scenes jump to now (hidden anyway), only the brightness eases in
        dimSnap = false; film = filmT; vFilm[0] = 0;
        for (i = 0; i < NS; i++) { wC[i] = wT[i]; pr[i] = prT[i]; vC[i] = 0; vP[i] = 0; }
      } else {
        film = damp(film, filmT, vFilm, 0, 0.55, dt);
        for (i = 0; i < NS; i++) {
          wC[i] = damp(wC[i], wT[i], vC, i, 0.6, dt);
          pr[i] = damp(pr[i], prT[i], vP, i, 0.5, dt);
        }
      }
    }
    // round 8: dim(0) = really hidden. Once the eased value is there: clear, no draw call, sleep until dim rises.
    if (dimC < DIM_OFF && st.dimT < DIM_OFF) { dimOff(); return; }
    needFrame = false;
    var calmW = 0, spaceW = wC[0];
    heroW = spaceW;
    for (i = 0; i < NS; i++) if (SCENES[i] === "calm") calmW = wC[i];
    simT += dt * (1 - 0.65 * calmW);
    var now = nowS();
    // hero film (round 8): plays once while the hero is on screen (about 8.6 s), then holds its end state:
    // the building, the real still over it, the points faded out. After the first click / tap / scroll it
    // goes straight into the building (H_SKIP s, from the form it shows now) and runs the rest at H_FAST x.
    // Reduced motion: the end state only (the still).
    var lastF = HSEQ[HSEQ.length - 1];
    if (reduced) { heroT = HT.end; heroSkip = null; hNow = heroAt(HT.end); }
    else {
      if (touched && !heroSkip && heroT < HT.b0 && HSEQ.length > 2 && !heroHold) {
        var h0 = heroAt(heroT), fromB = h0.u >= 0.5;
        heroSkip = { from: fromB ? h0.b : h0.a, la: fromB ? h0.lb : h0.la, s: 0 };
      }
      if (spaceW > 0.02 && !heroHold) {
        if (heroSkip) { heroSkip.s += dt / H_SKIP; if (heroSkip.s >= 1) { heroSkip = null; heroT = Math.max(heroT, HT.b1); } }
        else heroT = Math.min(HT.end, heroT + dt * (touched ? H_FAST : 1));
      }
      hNow = heroSkip ? { a: heroSkip.from, b: lastF, u: heroSkip.s, la: heroSkip.la, lb: heroSkip.s * H_SKIP } : heroAt(heroT);
    }
    // hP: the hero camera's projection becomes the still's (while the building forms); hSolid: the still's
    // opacity; hFade: what is left of the points (they fade out under the still)
    var exactB = !!(HF[1] && HF[1].exact), bldOn = exactB && (hNow.a === 1 || hNow.b === 1);
    var hP = !bldOn ? 0 : hNow.a === 1 ? 1 : sstep(0, 1, hNow.u);
    var hSolid = reduced ? 1 : sstep(HT.s0, HT.s1, heroT), hFade = reduced ? 0 : 1 - sstep(HT.p0, HT.p1, heroT);
    if (spaceW > 0.0005 && bldOn) heroProj(); else heroPic.ok = false;
    if (!heroPic.ok) hP = 0;
    if (heroBox) {
      var so = Math.round(hSolid * 500) / 500;
      if (so !== heroBox._so) { heroBox._so = so; heroBox.style.opacity = String(clamp(so * 1.8, 0, 1)); heroBox.style.setProperty("--hero-r", String(so)); }
    }
    // the ring spins faster at the start of the film
    galT += dt * (1 - 0.65 * calmW) * 1.25 * (1 + 1.6 * spaceW * (1 - sstep(1.0, 2.6, heroT)));

    // pointer (scanner) smoothing
    if (ptr.touch && ptr.upAt && now - ptr.upAt > 0.9) ptr.onT = 0;
    if (!reduced) {
      ptr.on = damp(ptr.on, ptr.onT, pv, 0, 0.18, dt);
      ptr.sx = damp(ptr.sx, ptr.onT ? ptr.x : 0, pv, 1, 0.9, dt);
      ptr.sy = damp(ptr.sy, ptr.onT ? ptr.y : 0, pv, 2, 0.9, dt);
    }

    // camera: blend each scene's keyframe by the camera weights
    var cp = [0, 0, 0], ct = [0, 0, 0], cf = 0, look = [0, 0, 0, 0], sw = 0, swL = 0, shX = 0, shY = 0;
    var wide = W >= H && win.innerWidth >= 1024;
    // round 6 (6.5): desktop subjects sit on the centre of the visible [data-subject] of the active
    // section (smoothed); without one the fixed fallback (x = 0.66) is used.
    subjAt++;
    for (i = 0; i < NS; i++) {
      var sh0 = SHIFT[SCENES[i]], tx = sh0[0], ty = sh0[1];
      if (wide && sh0[0] !== 0 && wC[i] > 0.0005 && bestEl[i] >= 0 && marks[bestEl[i]]) {
        var secI = marks[bestEl[i]].sec, sj = subjectOf(secI); if (sj) { tx = sj[0]; ty = sj[1]; }
        else if (secI && secI.classList && secI.classList.contains("seg1")) tx = 0; // round 8: a centred section keeps its subject centred
      }
      if (!subjOn || reduced) { subjS[i * 2] = tx; subjS[i * 2 + 1] = ty; }
      else { subjS[i * 2] = damp(subjS[i * 2], tx, vSub, i * 2, 0.35, dt); subjS[i * 2 + 1] = damp(subjS[i * 2 + 1], ty, vSub, i * 2 + 1, 0.35, dt); }
    }
    subjOn = true;
    for (i = 0; i < NS; i++) {
      var w = wC[i]; if (w < 0.0005) continue;
      camTmp.o = -1; camTmp.subj = 1; camFor(SCENES[i], simT, pr[i], camTmp);
      // round 8: the hero ends on the still's projection (fov given before the tall-screen widening below)
      if (i === 0 && hP > 0) {
        var fvh = heroPic.fov, aspH = W / H;
        if (aspH < 1) fvh = 2 * Math.atan(Math.tan(fvh / 2) / Math.pow(1 / aspH, 0.3));
        camTmp.f = mix(camTmp.f, fvh * 180 / Math.PI, hP);
      }
      var stepBack = Math.pow(Math.max(1, H / W), camTmp.o >= 0 ? camTmp.o : OBJ[SCENES[i]]);
      // a subject moved aside (5.5) has less screen: step back a little so it still fits
      // (condense: not once it has landed on the aerial pose on desktop, so that pose is exact)
      if (SUBJ[SCENES[i]]) {
        var shS = SHIFT[SCENES[i]], tallS = !(W >= H && win.innerWidth >= 768);
        stepBack *= 1 + (tallS ? 0.8 : SUBJ[SCENES[i]] * camTmp.subj) * (tallS ? Math.abs(shS[3]) : (wide ? Math.abs(subjS[i * 2]) : 0)) * (camTmp.o >= 0 ? Math.min(1, camTmp.o / Math.max(OBJ[SCENES[i]], 0.01)) : 1);
      }
      // round 9: the calm dust has no subject, so its camera hardly counts in a blend: when the dust gathers
      // into the house (#who, the ending) the camera is already the house's, so the points fly into its box
      // instead of a big cloud sweeping the screen. (look below keeps the real weights)
      var lw = w; w = SCENES[i] === "calm" ? w * 0.1 : w;
      for (var q = 0; q < 3; q++) { cp[q] += (camTmp.t[q] + (camTmp.p[q] - camTmp.t[q]) * stepBack) * w; ct[q] += camTmp.t[q] * w; }
      cf += camTmp.f * w; sw += w; swL += lw;
      // lens shift (screen-space framing): the subject sits beside / below the text
      var sh = SHIFT[SCENES[i]], lx, ly;
      if (W >= H && win.innerWidth >= 768) { if (wide) { lx = subjS[i * 2]; ly = subjS[i * 2 + 1]; } else { lx = 0; ly = sh[1]; } } else { lx = sh[2]; ly = sh[3]; }
      if (i === 0 && hP > 0) { lx = mix(lx, -heroPic.shift[0], hP); ly = mix(ly, -heroPic.shift[1], hP); } // (PM[8] = -shX)
      if (TRACK[SCENES[i]]) { var tb = trackBox(SCENES[i]); if (tb.el) { lx = tb.cx; ly = tb.cy; } } // round 9: in its box, moving with the page
      shX += lx * w; shY += ly * w;
      var L = LOOK[SCENES[i]]; for (q = 0; q < 4; q++) look[q] += L[q] * lw;
    }
    sw = sw || 1; swL = swL || 1;
    for (q = 0; q < 3; q++) { cp[q] /= sw; ct[q] /= sw; } cf /= sw; for (q = 0; q < 4; q++) look[q] /= swL;
    var asp = W / H, fov = cf * Math.PI / 180;
    if (asp < 1) fov = 2 * Math.atan(Math.tan(fov / 2) * Math.pow(1 / asp, 0.3));
    // (30 Oct night) the stage's lead camera (OrbitSpace.lead): the points form inside card A
    var LD = st.lead && performance.now() - st.lead.at < 250 && st.lead.k > 0 ? st.lead : null, ldK = LD ? LD.k : 0;
    var shXo = -shX / sw, shYo = -shY / sw;
    if (LD) {
      var le = DATA.MW.fromM(LD.v.eye), lt = DATA.MW.fromM(LD.v.target);
      for (q = 0; q < 3; q++) { cp[q] = mix(cp[q], le[q], ldK); ct[q] = mix(ct[q], lt[q], ldK); }
      fov = mix(fov, LD.v.fov, ldK);
      if (LD.v.shift) { shXo = mix(shXo, LD.v.shift[0], ldK); shYo = mix(shYo, LD.v.shift[1], ldK); }
    }
    var dist = Math.hypot(cp[0] - ct[0], cp[1] - ct[1], cp[2] - ct[2]);
    // pointer parallax and a tiny bob; none once condense has landed on the aerial pose (exact for the splat)
    // (round 8: none either once the hero sits on its still)
    var holdK = clamp(Math.max(wC[iCond] * condE, wC[0] * hP, ldK), 0, 1), still0 = 1 - holdK * holdK * (3 - 2 * holdK);
    if (holdK > 0.999) still0 = 0;
    var la0 = lookAt(cp, ct), par = dist * 0.035 * still0;
    for (q = 0; q < 3; q++) cp[q] += (la0.x[q] * ptr.sx * 0.9 + la0.y[q] * ptr.sy * 0.5) * par + (q === 1 ? Math.sin(simT * 0.21) * 0.05 * dist * 0.03 * still0 : 0);
    var la = lookAt(cp, ct);
    var zN = Math.max(0.03, dist * 0.004), zF = dist * 8 + 60;
    var PM = perspective(fov, asp, zN, zF);
    PM[8] = shXo; PM[9] = shYo;
    var VP = mul4(PM, la.m);
    lastVP = VP;
    // camera() in MODEL metres: the interior's frame (the exterior shares it when it carries a frame).
    // Valid when the scene's points are in the model frame: condense needs a model-frame exterior.
    var MWm = DATA.MW, kM = MWm.k || 1, condDom = dom === iCond;
    var camValid = condDom ? DATA.ext.inModel : !!DATA.inn.frame;
    st.cam = { eye: MWm.toM(cp), target: MWm.toM(ct), fov: fov, near: zN / kM, far: zF / kM, shift: [PM[8], PM[9]], aspect: asp, valid: camValid, time: performance.now() };

    // point count / sizes
    var cnt = Math.min(drawCount, DATA.N);
    var I = DATA.inn, E = DATA.ext;
    var rG = 0.032 * Math.sqrt(CAP / cnt) * (isPhone ? 0.8 : 1);
    // (round 6: the aerial set is mostly roofs and trees: the voxel area over-counts, so smaller dots)
    var rE = 0.62 * Math.sqrt(E.area / cnt) * (E.inModel ? 0.6 : 1), rI = 0.62 * Math.sqrt(I.area / cnt), rP = 1.15 * Math.sqrt(113 / (0.75 * cnt));

    // planet: slow spin, pointer tilts it
    // round 9: the ending's ring lies almost edge-on to the camera (phi) and leans up to the right (psi), like the
    // logo's orbit; the pointer tilts it a little. Columns: ring x, ring normal, ring z (into the screen + up).
    var rPhi = 0.24 - ptr.sy * 0.06, rPsi = 0.3 + ptr.sx * 0.06, cPs = Math.cos(rPsi), sPs = Math.sin(rPsi);
    var rX = [la.x[0] * cPs + la.y[0] * sPs, la.x[1] * cPs + la.y[1] * sPs, la.x[2] * cPs + la.y[2] * sPs];
    var rY = [-la.x[0] * sPs + la.y[0] * cPs, -la.x[1] * sPs + la.y[1] * cPs, -la.x[2] * sPs + la.y[2] * cPs], zc = cross(la.x, la.y);
    var rQ = norm3([-zc[0] * Math.cos(rPhi) + rY[0] * Math.sin(rPhi), -zc[1] * Math.cos(rPhi) + rY[1] * Math.sin(rPhi), -zc[2] * Math.cos(rPhi) + rY[2] * Math.sin(rPhi)]);
    var rN = norm3(cross(rQ, rX));
    var plaM = [rX[0], rX[1], rX[2], rN[0], rN[1], rN[2], rQ[0], rQ[1], rQ[2]];
    var galM = mul3(rotZ(-0.2), rotX(0.4)), orbM = mul3(rotZ(0.16), rotX(0.48));

    gl.viewport(0, 0, W, H);
    gl.clearColor(BG[0], BG[1], BG[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog); gl.bindVertexArray(vao);
    gl.uniformMatrix4fv(U.uVP, false, VP);
    gl.uniform3fv(U.uCam, cp);
    gl.uniform1f(U.uTime, simT); gl.uniform1f(U.uNow, now);
    gl.uniform1f(U.uPix, H / (2 * Math.tan(fov / 2))); gl.uniform1f(U.uAspect, asp); gl.uniform1f(U.uDpr, dpr);
    gl.uniform1f(U.uCount, cnt); gl.uniform1f(U.uMaxPx, Math.min(maxPx, 48 * dpr));
    // round 9 seams into and out of the boxed scenes (#who, the ending): their house sits in a box that moves
    // with the page, so the points go dark while such a scene is only partly on (a camera between two framings
    // would sweep a big cloud over the words) and come back once one framing holds (handoff rule 9.1); the
    // house then gathers in its box (uGP).
    // (30 Oct, option C: the house of #who now sits in the scan act's pinned frame, so its box holds still;
    // from the house into the building (orbit -> condense) the points stay lit and simply fly, so that share
    // does not count as a seam. The other seams of the boxed scenes still go dark.)
    var iOrb = SCENES.indexOf("orbit"), iPla = SCENES.indexOf("planet");
    var seamO = 4 * wC[iOrb] * Math.max(0, 1 - wC[iOrb] - wC[iCond]), seamP = 4 * wC[iPla] * (1 - wC[iPla]);
    var seamK = reduced ? 1 : 1 - sstep(0.12, 0.8, Math.max(seamO, seamP));
    gl.uniform2f(U.uGP, reduced ? 1 : pr[iOrb], reduced ? 1 : pr[iPla]);
    gl.uniform1f(U.uSizeK, look[1]); gl.uniform1f(U.uBright, look[0] * (LIGHT ? 1.1 : 1) * dimC * seamK);
    var Bd = DATA.bld;
    if (Bd) { gl.uniform4f(U.uBld2, Bd.cx, Bd.cz, Bd.crop, Bd.R * RING_K); gl.uniform3fv(U.uEndC, Bd.c); gl.uniform1f(U.uEndO, Math.pow(Bd.R * 0.72, 2)); }
    else { gl.uniform4f(U.uBld2, 0, 0, 1e5, 6); gl.uniform3fv(U.uEndC, CTR); gl.uniform1f(U.uEndO, 9); }
    gl.uniform1f(U.uCropK, Bd ? wC[iOrb] : 0);
    gl.uniform4f(U.uDust, 0, I.floorY + 1.1 * (I.k || 1), 0, Math.max(I.hx, I.hz) * 2.2);
    gl.uniform1f(U.uOver, LIGHT ? 1 : look[2]); gl.uniform1f(U.uLight, LIGHT); gl.uniform1f(U.uNear, look[3]);
    gl.uniform1f(U.uFilm, film); gl.uniform4fv(U.uFA, FA); gl.uniform4fv(U.uFB, FB); gl.uniform4fv(U.uFC, FC);
    // room / eye / top
    var pR = pose("roomView"), pE = pose("realEye"), pT = pose("top");
    gl.uniform4f(U.uFocR, pR.t[0], pR.t[1], pR.t[2], 2.7 * I.k);
    gl.uniform4f(U.uFocE, pE.p[0], pE.p[1], pE.p[2], 2.4 * I.k);
    gl.uniform3fv(U.uTopC, pT.t);
    gl.uniform1f(U.uTopP, reduced ? 1 : pr[iTop]); gl.uniform1f(U.uEyeP, reduced ? 1 : pr[iEye]);
    gl.uniform1f(U.uCutY, I.frame ? 2.3 * I.k : I.floorY + Math.min(2.3 * I.k, 0.9 * (I.ceilY - I.floorY)));
    // round 5: the ceiling is no longer cut away by camera height; it lifts off (roof) in the form beat
    gl.uniform1f(U.uRoomCut, 0);
    gl.uniform1f(U.uCalmTop, spaceW);
    // round 6: hero film (forms a -> b), walk gather, form snap
    if (spaceW > 0.0005) {
      // re-fit when the screen changes and now and then (fonts / layout settle after load)
      var fk = W + "x" + H + "x" + win.innerWidth;
      // (fitting costs a few ms: on a new screen size, then a few times while the layout settles, then every ~10 s)
      var fa = ++heroFit.at;
      if (fk !== heroFit.key || fa === 20 || fa === 90 || fa === 240 || fa % 1800 === 0) { if (fk !== heroFit.key) heroFit.at = 0; heroFit.key = fk; try { fitForms(); } catch (eF) { /* keep the last fit */ } }
      heroPlace(hNow.a, hNow.la); if (hNow.b !== hNow.a) heroPlace(hNow.b, hNow.lb); // slow turn while a form holds
      if (bldOn && heroPic.ok) placeExact(cp, ct, la); // round 8: the building exactly where the still shows it
    }
    gl.uniform1f(U.uHFade, hFade);
    gl.uniform4f(U.uHF, hNow.a, hNow.b, hNow.u, hNow.a === hNow.b ? 0 : 1);
    // alpha / radius of (dust, building, outline, furniture)
    gl.uniform4f(U.uHA, isPhone ? 0.016 : 0.012, isPhone ? 0.7 : 0.62, isPhone ? 0.5 : 0.42, isPhone ? 0.55 : 0.45);
    gl.uniform4f(U.uHR, isPhone ? 0.026 : 0.018, isPhone ? 0.032 : 0.022, isPhone ? 0.03 : 0.02, isPhone ? 0.03 : 0.02);
    var cr = DATA.ext.crop; gl.uniform4f(U.uBldC, DATA.ext.c[0], DATA.ext.c[2], cr * cr, 0.6);
    gl.uniform4f(U.uDrC, heroFit.drift[0], heroFit.drift[1], heroFit.drift[2], 1);
    gl.uniformMatrix3fv(U.uOutM, false, outM); gl.uniform3fv(U.uOutT, outT);
    gl.uniformMatrix3fv(U.uBldM, false, bldM); gl.uniform3fv(U.uBldT, bldT);
    gl.uniformMatrix3fv(U.uFrmM, false, frmM); gl.uniform3fv(U.uFrmT, frmT);
    gl.uniform1f(U.uGalT, galT); gl.uniform1f(U.uK, I.k || 1);
    gl.uniform1f(U.uInP, reduced ? 1 : pr[iIn]); gl.uniform1f(U.uRoomP, reduced ? 1 : pr[iRoom]);
    gl.uniformMatrix3fv(U.uGalM, false, galM); gl.uniformMatrix3fv(U.uOrbM, false, orbM); gl.uniformMatrix3fv(U.uPlaM, false, plaM);
    gl.uniform3fv(U.uCtr, CTR);
    gl.uniform4f(U.uRad, rG, rE, rI, rP); gl.uniform1f(U.uExtH, E.h);
    gl.uniform4f(U.uRoom, I.floorY, I.ceilY, I.cut, I.grid); gl.uniform2f(U.uRoomX, I.hx, I.hz);
    gl.uniform3fv(U.uClay, CLAY); gl.uniform3fv(U.uPaintA, paint.a); gl.uniform3fv(U.uPaintB, paint.b);
    gl.uniform1f(U.uPaintT, reduced ? 1 : paintT(now));
    gl.uniform3f(U.uPtr, ptr.x, ptr.y, reduced ? 0 : ptr.on); gl.uniform1f(U.uScanR, scanR);
    for (i = 0; i < NRIP; i++) { ripBuf[i * 4] = rips[i][0]; ripBuf[i * 4 + 1] = rips[i][1]; ripBuf[i * 4 + 2] = rips[i][2]; ripBuf[i * 4 + 3] = (reduced || now - rips[i][2] > 3) ? 0 : rips[i][3]; }
    gl.uniform4fv(U.uRip, ripBuf);
    gl.uniform3fv(U.uAccent, ACC); gl.uniform3fv(U.uInk, INK);
    gl.uniform2f(U.uFog, dist * 0.8, dist * 2.4);
    gl.uniform1f(U.uDbg, DBG ? 1 : 0);
    gl.drawArrays(gl.POINTS, 0, cnt);
    st.drawn = cnt; frameN++;
    if (st.hooks.length) { var camNow = api.camera(); for (i = 0; i < st.hooks.length; i++) { try { st.hooks[i](camNow); } catch (eH) { /* a listener's bug must not stop the film */ } } }
    // (round 4: the ring glow around the pointer is gone, James's wish; the points themselves react)

    // adapt when slow: fewer points first, then a lower pixel ratio
    if (!reduced && lockQ !== "high") {
      if (hiccup) { fpsWin.t = 0; fpsWin.n = 0; }
      else if ((fpsWin.skip -= dt) <= 0) {
        fpsWin.t += dt; fpsWin.n++;
        if (fpsWin.t >= 2) {
          var fps = fpsWin.n / fpsWin.t; fpsWin.t = 0; fpsWin.n = 0; st.fps = fps;
          if (fps < 45) {
            if (drawCount > MIN_COUNT) { drawCount = Math.max(MIN_COUNT, Math.round(drawCount * 0.72)); st.quality = "low"; fpsWin.skip = 0.5; }
            else if (dprCap > 1) { dprCap = Math.max(1, dprCap - 0.25); resize(); st.quality = "low"; fpsWin.skip = 0.5; }
          }
        }
      }
    }
  }

  function start() {
    if (running) return;
    running = true; lastT = 0;
    win.requestAnimationFrame(frame);
    if (reduced) watchStill();
  }

  // Reduced motion: wake one frame when a section edge crosses the screen centre
  // (that is exactly when the dominant scene can change), or when a full-screen slot closes.
  function watchStill() {
    if (win.IntersectionObserver) {
      var io = new IntersectionObserver(function () { kick(); }, { rootMargin: "-49% 0px -49% 0px", threshold: 0 });
      sections.forEach(function (s) { io.observe(s); });
      doc.addEventListener("orbit:feed", function () { io.disconnect(); sections.forEach(function (s) { io.observe(s); }); });
    }
    if (win.MutationObserver && doc.body) new MutationObserver(kick).observe(doc.body, { attributes: true, attributeFilter: ["class"] });
  }

  // (31 Oct, phone speed) boot in three short steps instead of one ~0.7 s freeze: shaders start compiling
  // in the background, the point data is built in the next task, then the GL setup once the shaders are done
  function boot() {
    var tb = performance.now(), pp, par = gl.getExtension("KHR_parallel_shader_compile");
    try { pp = makeProgs(); } catch (e) { console.warn("[space] WebGL setup failed, showing the still:", e && e.message); still(); return; }
    // (3 Nov, phone speed) the point data step (~0.2 s on a phone) waits for a quiet moment (max 1.5 s),
    // so it does not land in the middle of the visitor's first swipe
    var later = win.requestIdleCallback ? function (f) { win.requestIdleCallback(f, { timeout: 1500 }); } : function (f) { setTimeout(f, 0); };
    later(function () {
      var tb2 = performance.now();
      try { buildData(); buildSeq(); drawCount = DATA.N; } catch (e) { console.warn("[space] point data failed, showing the still:", e && e.message); still(); return; }
      var t3 = performance.now(), tries = 0;
      (function linked() {
        // wait (up to ~2 s) while the browser still compiles, then finish
        if (par && tries++ < 120 && !(gl.getProgramParameter(pp[0], par.COMPLETION_STATUS_KHR) && gl.getProgramParameter(pp[1], par.COMPLETION_STATUS_KHR))) { win.requestAnimationFrame(linked); return; }
        var t4 = performance.now();
        try { initGL(pp); } catch (e) { console.warn("[space] WebGL setup failed, showing the still:", e && e.message); still(); return; }
        if (DBG) console.log("[space] boot: data", Math.round(t3 - tb2), "ms, waited", Math.round(t4 - t3), "ms, gl", Math.round(performance.now() - t4), "ms, total", Math.round(performance.now() - tb), "ms");
        bootRest();
      })();
    });
  }
  function bootRest() {
    readPalette(); resize(); collect();
    if (win.MutationObserver) new MutationObserver(readPalette).observe(root, { attributes: true, attributeFilter: ["data-palette"] });
    win.addEventListener("resize", resize);
    doc.addEventListener("orbit:feed", collect);
    doc.addEventListener("visibilitychange", function () { lastT = 0; fpsWin.t = 0; fpsWin.n = 0; fpsWin.skip = 1; kick(); wake(); });
    // the canvas off screen (hidden by a layout, display none): sleep too
    if (win.IntersectionObserver) {
      new IntersectionObserver(function (es) { var e = es[es.length - 1]; offscreen = !e.isIntersecting; wake(); }, { threshold: 0 }).observe(canvas);
    }
    // the hero film yields at the first click / tap or scroll (not hover)
    var po = { passive: true, capture: true };
    touchY = win.scrollY || 0;
    win.addEventListener("pointerdown", touch, po);
    win.addEventListener("wheel", touch, po);
    win.addEventListener("keydown", function (e) { if (/^(PageDown|PageUp|ArrowDown|ArrowUp|Space| |End|Home)$/.test(e.key || "")) touch(); }, po);
    win.addEventListener("scroll", function () { if (Math.abs((win.scrollY || 0) - touchY) > 12) touch(); }, po);
    if (!reduced) {
      var o = { passive: true };
      win.addEventListener("pointermove", function (e) { if (e.pointerType !== "touch") { ptr.touch = false; setPtr(e.clientX, e.clientY); } }, o);
      win.addEventListener("touchstart", function (e) { var t = e.touches[0]; if (t) { ptr.touch = true; ptr.upAt = 0; setPtr(t.clientX, t.clientY); } }, o);
      win.addEventListener("touchmove", function (e) { var t = e.touches[0]; if (t) { ptr.touch = true; ptr.upAt = 0; setPtr(t.clientX, t.clientY); } }, o);
      win.addEventListener("touchend", function () { ptr.upAt = nowS(); }, o);
      doc.addEventListener("pointerleave", function () { if (!ptr.touch) ptr.onT = 0; }, o);
      doc.documentElement.addEventListener("mouseleave", function () { ptr.onT = 0; }, o);
      win.addEventListener("blur", function () { if (!ptr.touch) ptr.onT = 0; }, o);
      win.addEventListener("click", function (e) {
        if (e.target && e.target.closest && e.target.closest("a,button,input,select,textarea,label,summary,iframe,[role=button],[contenteditable]")) return;
        addRipple(e.clientX, e.clientY, 1);
      }, o);
    }
    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); lost = true; }, false);
    canvas.addEventListener("webglcontextrestored", function () {
      try { initGL(); lost = false; kick(); lastT = 0; } catch (err) { still(); running = false; }
    }, false);
    st.ready = true;
    start();
    var ev; try { ev = new CustomEvent("orbit:space-ready", { detail: { points: DATA.N, real: DATA.real } }); } catch (e2) { ev = doc.createEvent("Event"); ev.initEvent("orbit:space-ready", true, true); }
    doc.dispatchEvent(ev);
    // If the point files arrive late (loaded without defer), rebuild once with the real points.
    if (!DATA.real) win.addEventListener("load", function () {
      var P = win.ORBIT_POINTS || {};
      if (P.exterior && P.interior && !DATA.real) {
        try { buildData(); buildSeq(); heroFit.key = ""; drawCount = DATA.N; bufs.forEach(function (b) { gl.deleteBuffer(b); }); initGL(); kick(); } catch (e3) {}
      }
    });
  }

  // Debug hook for the test bed (not part of the contract).
  api._debug = function () {
    return { fps: st.fps, drawCount: drawCount, N: DATA && DATA.N, dpr: dpr, real: DATA && DATA.real, weights: Array.prototype.slice.call(wC),
      scenes: SCENES.slice(), progress: Array.prototype.slice.call(pr), dim: dimC, room: DATA && DATA.inn,
      // project a WORLD point with the last frame's matrix -> NDC [x, y] (test bed only)
      project: function (p) { var M = lastVP; if (!M) return null; var x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], w = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15]; return [x / w, y / w]; },
      ctr: CTR.slice(), heroT: heroT, heroFit: JSON.parse(JSON.stringify(heroFit)), outline: DATA && DATA.out, refined: !!(DATA && DATA.inn && DATA.inn.refined),
      // project an outline point (stored metres) with the current hero placement -> world (test bed only)
      outW: function (s) { return [outM[0] * s[0] + outM[3] * s[1] + outM[6] * s[2] + outT[0], outM[1] * s[0] + outM[4] * s[1] + outM[7] * s[2] + outT[1], outM[2] * s[0] + outM[5] * s[1] + outM[8] * s[2] + outT[2]]; },
      setHeroT: function (t, hold) { heroSet(t, hold); },
      refitMs: function () { var t0 = performance.now(); fitForms(); return performance.now() - t0; },
      // round 8: the film right now (forms a -> b, progress u), the sequence, its timeline, its clock, skip, still
      hero: { now: hNow, seq: HSEQ.slice(), times: HT, t: heroT, touched: touched, skip: heroSkip, hold: heroHold,
        still: { ok: heroPic.ok, fov: heroPic.fov, shift: heroPic.shift.slice(), phone: heroPic.still === HERO_STILL.phone, opacity: heroBox ? heroBox.style.opacity : null },
        forms: Object.keys(HF).map(function (k) { return { id: +k, fit: HF[k].fit, exact: !!HF[k].exact }; }), furniture: DATA && DATA.frm },
      // project a MODEL-frame point through the last frame (CSS px), to check the points against the still
      // (bld = true: as the hero's building form places it)
      projectM: function (m, bld) { var M = lastVP, p = DATA.MW.fromM(m); if (!M) return null;
        if (bld) p = [bldM[0] * p[0] + bldM[3] * p[1] + bldM[6] * p[2] + bldT[0], bldM[1] * p[0] + bldM[4] * p[1] + bldM[7] * p[2] + bldT[1], bldM[2] * p[0] + bldM[5] * p[1] + bldM[8] * p[2] + bldT[2]]; var x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], w = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15]; return [(x / w + 1) / 2 * (canvas.clientWidth || 1), (1 - y / w) / 2 * (canvas.clientHeight || 1)]; },
      camera: api.camera(), ext: DATA && DATA.ext, subj: Array.prototype.slice.call(subjS), sleeping: sleeping, dimSleep: dimSleep, frames: frameN };
  };

  boot();
})();
