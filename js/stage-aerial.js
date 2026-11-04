/* ROUND 9 (CONTRACT 9, the review fixes; builder E, 29 Oct 2026 late). Changes on top of round 8 below:
   - "two" in and out go one step at a time (review A1, A2): in = the full-screen splat shrinks into card A,
     then card A's frame, then card B with its model; out = card B goes first (its camera off), then card A
     grows back to the full-screen aerial. OrbitStage.two.state() hands the same numbers to the section's
     frames and words (js/sections/scan.js). Points fully hidden through the whole two-card part.
   - The card mask draws the page's own squircle corner (CSS corner-shape) so a hairline frame is enough.
   - Card B frames the living room + garden half, a slow swing (+-14 deg) instead of a full turn, and
     the living room walls slowly try a colour and go back (OrbitStage.tour.paint; never over the visitor's
     own colour, always taken back).
   - "aerial-in": a dive into a soft light high above the garden; under the full light the house scan
     takes over at eye height (no double picture, no low pass over the roofs). Reduced motion: cuts.
   - "patio": three stops (ORBIT_FILM.poses.patioViews, with `tall` framings for phones) in the first
     half of the beat; OrbitStage.walk.state() says the stop for its caption; the scene is dark before
     #compare's heading can come (walkFade, handoff rule 9.1).

   ROUND 8 (CONTRACT 8.1 steps 3 + 4, 8.2, 8.7; builder E, 29 Oct 2026). On top of round 7 below:

   "two"   #scan, "One space. Two ways to experience it." After the points gather (space.js condense) and
           the real aerial splat fades in at the points' own camera (scene "aerial", the reveal), the view
           settles into TWO cards that the section provides:
             [data-card="splat"]  card A: the real streamed aerial splat. The full-screen view SHRINKS into
                                  the card (the clip rectangle eases from the whole screen to the card while
                                  the building is fitted into it with a lens shift), then drag = orbit,
                                  zoom, Reset, a slow auto orbit when idle (round 7 interaction).
             [data-card="model"]  card B: the shared house model (core.house, one instance, so the
                                  visitor's design changes show here too) from above, roof off, its own
                                  camera drawn only inside the card (camera.rect + scissor), a slow turn
                                  when idle, drag to turn, zoom.
           Each card is clipped to its own rounded rect (scissor + a crisp rounded mask pass), so nothing of
           the canvas shows outside the cards. Points fully hidden while card B is on screen
           (OrbitSpace.dim(1 - a) reaches 0); they come back smoothly when scrolling back up.
           At the end of the act (the beat data-stage="two" data-phase="out", or the last 22 % of the two
           beats) card A grows back to the whole screen and the camera returns to the aerial pose, card B
           fades out: the walk-in of #walk then flies on from exactly there.
           Input (research/10 sections 1 + 7, OrbitEngage kind "card", ids "two-splat" / "two-model"):
             .stage-hit[data-hit="two-splat"|"two-model"] take drags (own pointer listeners, touch-action
             pan-y: a vertical finger scrolls the page), two-finger pinch, Ctrl/Cmd + wheel (= trackpad
             pinch) and Safari gesture events zoom ALWAYS; a plain wheel zooms only while the card is
             engaged (pointer down on it, Enter / Space on the focused card). Wheel bursts (gaps < 160 ms)
             stay with whoever got the first event; at a zoom limit the rest of the burst is swallowed and
             the NEXT burst in that direction releases the card and scrolls the page. Released on Esc
             (engage.js), a press outside the card's figure, the mouse away from it for 400 ms, 3 s with
             no input, the card < 50 % visible, a page scroll of > 48 px, or the cards leaving.
             Keys on the focused card: Left / Right turn, Up / Down tilt, + - W S zoom, Home / 0 reset,
             Enter / Space engage (never on window, never with Ctrl / Alt / Cmd).
   "aerial-in" + "patio"   #walk, "First, feel like you're there." Full screen, unchanged path: the flight
           from the air into the patio, then the curated viewpoints on the real streamed house scan.
           Request 2 (research/10 section 3, OrbitEngage kind "scene", id "walk"): a drag (> 6 px) or a
           press held 180 ms on .stage-hit[data-hit="walk"] starts EXPLORE (OrbitStage.walk "explore"):
           look around inside a cone at the current viewpoint (yaw +-35 deg, pitch +-15 deg, fov 30..70
           deg by pinch / Ctrl + wheel / + -). It stays after release (inertia, then still). Scroll intent
           (window.scrollY moved >= max(24 px, 2.5 % of the height) since the last input, read per frame,
           ignored 300 ms after a visualViewport resize) or Esc fires "resume": the offset eases back to 0
           (time constant 0.22 s, about 0.7 s) while the path keeps moving with the scroll, so there is no
           snap and no page jump. The offset is also faded out at both ends of the act. Touch: one finger
           sideways looks, up / down scrolls. Keys on the focused scene: Left / Right look (Shift = more),
           Up / Down tilt, + - zoom, Home = back to the path view, Enter = explore. The walk leaves the act
           by fading with the act's pin as it scrolls away.
   Retired here: "patio-model" (the house fade over the patio), the round 7 subject-side mask and the
   #scan explore beat. The second (room) scan is gone (js/stage-real.js is a stub, nothing streams it).
   Streaming (download cap, CONTRACT 8): the aerial scan starts when #scan is ~1.5 screens away, the
   house scan only when #walk is ~1.5 screens away (no desktop idle prefetch any more); the `finest`
   level caps of js/stage-stream.js / ORBIT_SITE.scans stay. The house MODEL pack is asked for when #scan
   is near (card B), through core.wantHouse.

   APIs (exist at once, no-op until ready):
     OrbitStage.two  = { zoom(card, k) (k > 1 closer), reset(card), orbit(card, dYaw, dPitch) (radians),
                         engaged() -> "splat"|"model"|null, on("ready"|"interact", fn) }
                       card = "splat" | "model"; "ready" {card} is sticky (late subscribers hear it),
                       "interact" {card} on every input.
     OrbitStage.walk = { exploring() -> bool, look(dYaw, dPitch), zoom(k), reset(), on("explore"|"resume", fn) }
                       look/zoom start explore like a drag (for buttons); "resume" {why}.
     OrbitStage.aerial = { ready, zoom(k), orbit(dYaw, dPitch), reset(), on("ready"|"interact"|"idle") }
                       (round 6 names, now = card A).
   Debug: ?stagedbg=1 logs; OrbitStage.aerial._debug() -> state numbers (tests).

   ROUND 7 notes (still true): the splats are the REAL full scans streamed with levels of detail by
   js/stage-stream.js (core.stream): "aerial" = ORBIT_SITE.scans.aerial, the patio = ORBIT_SITE.scans.house.
   Coarse level first, then it sharpens. On file://, ?stream=0, a missing scans entry or a load error the
   round 6 base64 packs are used. Without the packs' json the numbers come from AERIAL_DEF / PATIO_DEF.
   Patio: 3 curated viewpoints (ORBIT_FILM.poses.patioViews, work/E7/NOTES.md), holds at each, a small slow
   orbit cone around each. All scenes read ONE scroll position s along their beats (reveal 0..1, two 1..2,
   approach 2..3, patio 3..4), so the hand-over between them is continuous whatever scene owns the stage.
   Never an empty canvas: s is held at the aerial while the house scan is not there yet. Reduced motion:
   no auto orbit, no sway, the moves are cuts. */
(function () {
  "use strict";

  var win = window, doc = document;
  var params = new URLSearchParams(location.search);
  var DBG = params.has("stagedbg");
  function log() { if (DBG) console.log.apply(console, ["[stage-aerial]"].concat([].slice.call(arguments))); }

  /* ---------- small maths ---------- */
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function ease(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function follow(cur, to, tau, dt) { return tau <= 0 ? to : cur + (to - cur) * (1 - Math.exp(-dt / tau)); }
  function v3(a) { return [+a[0], +a[1], +a[2]]; }
  function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul3(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function len3(a) { return Math.hypot(a[0], a[1], a[2]); }
  function lerp3(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }
  function rotY(v, a) { var c = Math.cos(a), s = Math.sin(a); return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]]; }
  function ok3(a) { return Array.isArray(a) && a.length >= 3 && isFinite(a[0]) && isFinite(a[1]) && isFinite(a[2]); }
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function nowS() { return performance.now() / 1000; }
  function scrollYNow() { return win.scrollY || win.pageYOffset || 0; }
  // Catmull-Rom through points P (array of [3]) at t 0..1 (uniform over the segments)
  function spline(P, t) {
    var n = P.length;
    if (n === 1) return P[0].slice();
    var f = clamp(t, 0, 1) * (n - 1), i = Math.min(n - 2, Math.floor(f)), u = f - i;
    var p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    var u2 = u * u, u3 = u2 * u, o = [];
    for (var k = 0; k < 3; k++) {
      o[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
    }
    return o;
  }
  function lin(P, t) { // piecewise linear over the same uniform segments (fov)
    var n = P.length; if (n === 1) return P[0];
    var f = clamp(t, 0, 1) * (n - 1), i = Math.min(n - 2, Math.floor(f));
    return mix(P[i], P[i + 1], f - i);
  }
  var D2R = Math.PI / 180;
  function angR(x, big) { x = +x; return !isFinite(x) ? NaN : Math.abs(x) > big ? x * D2R : x; }

  // "ready" is sticky: a subscriber that comes after it still hears every ready that fired
  function emitter() {
    var h = {}, fired = [];
    return {
      on: function (e, fn) {
        if (typeof fn !== "function") return function () {};
        (h[e] = h[e] || []).push(fn);
        if (e === "ready") fired.forEach(function (d) { try { fn(d); } catch (err) { console.warn("[stage-aerial] handler", err); } });
        return function () { h[e] = (h[e] || []).filter(function (f) { return f !== fn; }); };
      },
      emit: function (e, d) {
        if (e === "ready") fired.push(d);
        (h[e] || []).slice().forEach(function (fn) { try { fn(d); } catch (err) { console.warn("[stage-aerial] handler", err); } });
      }
    };
  }
  var ev = emitter(), evTwo = emitter(), evWalk = emitter();

  /* ---------- public APIs (exist at once; no-op until there) ---------- */
  var stageApi = win.OrbitStage = win.OrbitStage || {};
  var core = stageApi._core || null;
  var A = { ready: false };            // aerial scan state
  var O = {                            // card A orbit state (radians / log zoom)
    auto: 0, uyaw: 0, upitch: 0, uzoom: 0, uyawS: 0, upitchS: 0, uzoomS: 0, vyaw: 0,
    lastInput: -1e9, idleSent: true, drag: false, env: 0
  };
  var Bc = {                           // card B (model) orbit state
    auto: 0, yaw: 0, pitch: 0, zoom: 0, yawS: 0, pitchS: 0, zoomS: 0, vyaw: 0,
    lastInput: -1e9, drag: false, fitD: 0, fitInit: false, posed: false, view: null
  };
  var W = {                            // walk look-around (request 2)
    on: false, yaw: 0, pitch: 0, zoom: 0, yawS: 0, pitchS: 0, zoomS: 0, vyaw: 0, drag: false,
    y0: 0, vvAt: -1e9, env: 0
  };
  var T = { s: -1, init: false, alpha: 0, phase: "", oA: 0, oP: 0, kB: 0, tA: 0, view: null, drives: 0, reset: true };
  // round 9: what the sections' words and frames should show this frame (read by js/sections/scan.js + walk.js)
  var TD = { t: -1e9, u: 0, w: 0, frameA: 0, frameB: 0, title: 0, stop: 0, nStops: 3, cap: 0, flash: 0, fade: 1, words: 1 };
  function render() { if (core && core.render) core.render(); }
  function live() { return !!(core && core.engine); }

  var aerial = {
    zoom: function (k) { zoomA(k); },
    orbit: function (dYaw, dPitch) { orbitA(dYaw, dPitch); },
    reset: function () { resetA(); },
    on: ev.on
  };
  Object.defineProperty(aerial, "ready", { enumerable: true, get: function () { return A.ready; } });
  stageApi.aerial = aerial;
  var two = {
    zoom: function (card, k) { if (card === "model") zoomB(k); else zoomA(k); },
    reset: function (card) { if (card === "model") resetB(); else resetA(); },
    orbit: function (card, dYaw, dPitch) { if (card === "model") orbitB(dYaw, dPitch); else orbitA(dYaw, dPitch); },
    engaged: function () { return engCard; },
    // round 9: live = the stage drew this act in the last 0.3 s; frameA / frameB / title 0..1 = how much
    // of card A's frame + caption, card B's frame + caption and the title show (the canvas uses the same numbers)
    state: function () {
      var live = nowS() - TD.t < 0.3 && T.phase === "two";
      return { live: live, u: TD.u, w: TD.w, frameA: TD.frameA, frameB: TD.frameB, title: TD.title, ready: !!A.ready };
    },
    on: evTwo.on
  };
  stageApi.two = two;
  var walk = {
    // round 9: live = the stage drew the walk in the last 0.3 s; stop = which garden stop (0..nStops-1),
    // cap 0..1 = how much its caption shows, fade 0..1 = the scene (0 = dark before the next section)
    state: function () {
      var live = nowS() - TD.t < 0.3 && (T.phase === "aerial-in" || T.phase === "patio");
      return { live: live, phase: T.phase, stop: TD.stop, nStops: TD.nStops, cap: TD.cap, fade: TD.fade, flash: TD.flash, words: TD.words };
    },
    exploring: function () { return W.on; },
    look: function (dYaw, dPitch) { walkLook(dYaw, dPitch); },
    zoom: function (k) { walkZoom(k); },
    reset: function () { W.yaw = 0; W.pitch = 0; W.zoom = 0; W.vyaw = 0; walkInput(); },
    on: evWalk.on
  };
  stageApi.walk = walk;
  if (!core || typeof core.scene !== "function") { log("no stage core"); return; }

  var isPhone = core.isPhone, reduced = core.reduced;
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
  var AUTO_SPEED = 2 * Math.PI / 110;   // card A: one turn in about 110 s
  var IDLE_S = 8;                        // card A auto orbit comes back after this many seconds without input
  var B_IDLE = 5;
  var B_EL0 = 56 * D2R, B_EL = [26 * D2R, 86 * D2R], B_ZOOM = [Math.log(1 / 1.7), Math.log(1 / 0.42)];
  var W_YAW = 35 * D2R, W_PITCH = 15 * D2R, W_ZOOM = [-0.4, 0.75], W_FOV = [30 * D2R, 70 * D2R];
  void isMac;

  function film() { return win.ORBIT_FILM || {}; }
  function poses() { return film().poses || {}; }
  function cssW() { var c = core.canvas; return (c && c.clientWidth) || win.innerWidth || 1; }
  function cssH() { var c = core.canvas; return (c && c.clientHeight) || win.innerHeight || 1; }
  function aspect() { return cssW() / Math.max(1, cssH()); }
  // tall screens: the same rules as js/stage.js
  function portraitFov(f) { var asp = aspect(); return asp < 1 ? 2 * Math.atan(Math.tan(f / 2) * Math.pow(1 / asp, 0.3)) : f; }
  function stepBack() { var asp = aspect(); return Math.pow(Math.max(1, 1 / Math.max(asp, 1e-3)), 0.42); }
  function poseView(p, back) {
    // round 9: a pose may carry its own framing for tall screens (phones): { ..., tall: {eye, target, fov} }
    if (p && p.tall && aspect() < 0.85 && ok3(p.tall.eye) && ok3(p.tall.target)) p = p.tall;
    if (!p || !ok3(p.eye) || !ok3(p.target)) return null;
    var e = v3(p.eye), t = v3(p.target);
    if (back) { var k = stepBack(); e = add3(t, mul3(sub3(e, t), k)); }
    return { eye: e, target: t, fov: portraitFov(angR(p.fov || 45, 3.2) || 45 * D2R), shift: [0, 0] };
  }
  function copyView(c) { return { eye: v3(c.eye), target: v3(c.target), fov: c.fov, shift: c.shift ? [c.shift[0] || 0, c.shift[1] || 0] : [0, 0] }; }
  function spaceCam() {
    var S = win.OrbitSpace;
    if (!S || typeof S.camera !== "function") return null;
    try {
      var c = S.camera();
      if (c && c.valid === true && ok3(c.eye) && ok3(c.target) && isFinite(c.fov)) return copyView(c);
    } catch (e) { /* none */ }
    return null;
  }
  var leadOn = false;
  function spaceLead(v, k) {
    var S = win.OrbitSpace;
    if (!S || typeof S.lead !== "function" || (!v && !leadOn)) return;
    leadOn = !!v;
    try { S.lead(v, k); } catch (e) { /* ignore */ }
  }
  var lastDim = -1, lastOwner = null;
  function spaceDim(k) {
    k = Math.round(k * 100) / 100;
    // (3 Nov 2026) no "same as last time" skip: another scene (the stacked house's off()) may have set the
    // points to 1 in between, and that 1 then stayed (a flash at the hand-over)
    if (k === lastDim && win.OrbitStage && win.OrbitStage._core && win.OrbitStage._core.owner && lastOwner === win.OrbitStage._core.owner()) return;
    lastOwner = win.OrbitStage && win.OrbitStage._core && win.OrbitStage._core.owner ? win.OrbitStage._core.owner() : null;
    lastDim = k;
    var S = win.OrbitSpace;
    if (S && typeof S.dim === "function") { try { S.dim(k); } catch (e) { /* ignore */ } }
  }

  /* ---------- defaults when the scans stream (the packs' json is not loaded then) ---------- */
  // = assets/stage/aerial.json of P2 (round 6), MODEL frame
  var AERIAL_DEF = {
    frame: "model", reg: { verified: true },
    orbit: { target: [10.7, 2.5, 3.2], dist: 38, minDist: 14, maxDist: 75, pitchMin: 0.26, pitchMax: 1.31, yaw0: 0.7, fov: 40 },
    approach: [
      { eye: [31.177, 23.325, 27.511], target: [10.7, 2.5, 3.2], fov: 40 },
      { eye: [17.5, 21.0, 11.5], target: [9.6, 0.8, 2.9], fov: 44 },
      { eye: [12.6, 11.5, 5.6], target: [8.6, 0.9, 2.7], fov: 50 },
      { eye: [11.6, 5.2, 4.3], target: [7.6, 1.0, 2.5], fov: 56 },
      { eye: [11.1, 1.6, 3.95], target: [6.6, 1.05, 2.3], fov: 60 }
    ],
    house: [0, 0, 0, 21.32, 8.1, 6.44]
  };
  // = assets/stage/patio.json of P1 (round 6)
  var PATIO_DEF = {
    box: [6.1892, 0.0, 0.6735, 12.3213, 2.6061, 4.7599],
    arrive: { eye: [11.1, 1.6, 3.95], target: [6.6, 1.05, 2.3], fov: 60 },
    look: { eye: [10.5, 1.6, 4.05], target: [7.0, 0.95, 1.2], fov: 60 }
  };
  // round 7 curated patio viewpoints (E, work/E7): near the training camera lanes, sharp in the full scan
  var VIEWS_DEF = [
    { eye: [11.1, 1.6, 3.95], target: [6.6, 1.05, 2.3], fov: 60 },
    { eye: [9.5, 1.5, 4.2], target: [9.0, 0.8, 0.7], fov: 60 },
    { eye: [9.2, 1.5, 2.7], target: [6.2, 1.0, 2.7], fov: 60 }
  ];
  function streamCfg(slot) { return typeof core.scanCfg === "function" && typeof core.stream === "function" && !(core.streamOff && core.streamOff()) ? core.scanCfg(slot) : null; }
  // a streamed scan as the scene's splat object ({h} instead of {e, mat})
  function streamSplat(slot, tag) {
    var cfg = streamCfg(slot);
    if (!cfg) return Promise.reject(new Error("no stream for " + slot));
    // (4 Nov 2026, phone memory) the walk shows the same house scan as the hero (same files): share the hero's
    // stream instead of a second copy of every tile in the graphics memory (iPhones close the tab when it is full)
    var hs = core.heroStream, hc = typeof core.scanCfg === "function" ? core.scanCfg("hero") : null;
    var share = slot === "house" && hs && hc && hc.url === cfg.url && hs.state !== "error" && hs.state !== "off";
    var h = share ? hs : core.stream(cfg, { name: tag, frame: "model" });
    if (share) log("stream", tag, "shares the hero's stream");
    return h.ready.then(function () {
      layers();
      lastLayers();
      log("stream", tag, JSON.stringify(h.info()));
      return { h: h, stream: true };
    });
  }

  /* ---------- engine objects ---------- */
  var P = { ready: false, json: null };   // patio (house scan) state
  var pc = null, app = null, splatL = null, maskL = null, maskBL = null, clearL = null, clearE = null;
  var KA = null, KB = null, camB = null, nLayers = -1;
  function readJson(name) {
    var u = core.bytes(name);
    if (!u) return null;
    try { return JSON.parse(new TextDecoder("utf-8").decode(u)); } catch (e) { return null; }
  }
  function layers() {
    if (splatL || !core.engine) return;
    pc = core.pc; app = core.app;
    splatL = new pc.Layer({ name: "OrbitAerialSplat" });
    maskL = new pc.Layer({ name: "OrbitCardMask" });
    maskBL = new pc.Layer({ name: "OrbitModelMask" });
    app.scene.layers.push(splatL);
    app.scene.layers.push(maskL);
    app.scene.layers.push(maskBL);
    var cc = core.camera.camera;
    cc.layers = cc.layers.concat([splatL.id, maskL.id]);
  }
  // the masks must draw AFTER every splat layer (streams add their own layers later)
  function lastLayers() {
    if (!maskL) return;
    var L = app.scene.layers;
    [maskL, maskBL].forEach(function (l) { try { L.remove(l); L.push(l); } catch (e) { /* keep */ } });
    try { nLayers = L.layerList.length; } catch (e) { nLayers = -2; }
  }
  function layersChanged() { try { return app.scene.layers.layerList.length !== nLayers; } catch (e) { return false; } }

  /* the card clip: dst x a crisp rounded rect (1.5 px feather) x gain. Drawn last by the camera of that
     card, so outside the rect nothing stays, and gain < 1 fades the card's picture (premultiplied). */
  var QUAD_VS = "attribute vec3 aPosition;\nvoid main(void) { gl_Position = vec4(aPosition.xy, 0.0, 1.0); }";
  /* round 9: the corner is the page's own squircle (CSS corner-shape: squircle = |x|^4 + |y|^4 = 1 in the
     corner box) where the browser draws squircles, else a plain round corner, so the picture meets the
     card's hairline exactly and no square canvas corner shows (uShape.x = 4 or 2). */
  var MASK_FS = [
    "precision highp float;",
    "uniform vec4 uRect;",   // x0, y0, x1, y1 in device px (GL: y from the bottom)
    "uniform vec4 uFea;",    // feather px, corner radius px, strength 0..1, gain 0..1
    "uniform vec4 uShape;",  // x: corner exponent (2 round, 4 squircle)
    "void main(void) {",
    "  vec2 c = 0.5 * (uRect.xy + uRect.zw), hs = 0.5 * (uRect.zw - uRect.xy);",
    "  vec2 q = abs(gl_FragCoord.xy - c) - hs + vec2(uFea.y);",
    "  vec2 qp = max(q, 0.0);",
    "  float cd = uShape.x > 3.0 ? pow(pow(qp.x, 4.0) + pow(qp.y, 4.0), 0.25) : length(qp);",
    "  float d = cd + min(max(q.x, q.y), 0.0) - uFea.y;",   // < 0 inside
    "  float m = 1.0 - smoothstep(-uFea.x, 0.0, d);",
    "  m = mix(1.0, m, uFea.z) * uFea.w;",
    "  gl_FragColor = vec4(m);",
    "}"
  ].join("\n");
  var SQUIRCLE = (function () { try { return !!(win.CSS && CSS.supports && CSS.supports("corner-shape", "squircle")); } catch (e) { return false; } })();
  /* round 9: a soft light over the whole canvas (premultiplied colour, drawn last): the walk-in dives
     into it high above the garden and comes out of it at eye height, so the two scans never show at once */
  var FLASH_FS = [
    "precision highp float;",
    "uniform vec4 uCol;",
    "void main(void) { gl_FragColor = uCol; }"
  ].join("\n");
  var FL = null;
  function flashSet(k) {
    k = clamp(k, 0, 1);
    if (!FL) {
      if (k < 0.002 || !maskL) return;
      var mat = new pc.ShaderMaterial({ uniqueName: "OrbitWalkFlash", attributes: { aPosition: pc.SEMANTIC_POSITION }, vertexGLSL: QUAD_VS, fragmentGLSL: FLASH_FS });
      mat.depthTest = false; mat.depthWrite = false; mat.cull = pc.CULLFACE_NONE;
      mat.blendState = new pc.BlendState(true, pc.BLENDEQUATION_ADD, pc.BLENDMODE_ONE, pc.BLENDMODE_ONE_MINUS_SRC_ALPHA, pc.BLENDEQUATION_ADD, pc.BLENDMODE_ONE, pc.BLENDMODE_ONE_MINUS_SRC_ALPHA);
      mat.update();
      var mesh = new pc.Mesh(core.device);
      mesh.setPositions([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
      mesh.setIndices([0, 1, 2]);
      mesh.update(pc.PRIMITIVE_TRIANGLES);
      var mi = new pc.MeshInstance(mesh, mat);
      mi.cull = false;
      var e = new pc.Entity("OrbitWalkFlash");
      e.addComponent("render", { meshInstances: [mi], layers: [maskL.id], castShadows: false, receiveShadows: false });
      e.enabled = false;
      app.root.addChild(e);
      FL = { e: e, mat: mat, k: -1 };
    }
    var on = k > 0.002;
    if (FL.e.enabled !== on) FL.e.enabled = on;
    k = Math.round(k * 400) / 400;
    if (on && k !== FL.k) {
      FL.k = k;
      // a warm daylight white, premultiplied
      FL.mat.setParameter("uCol", [0.95 * k, 0.94 * k, 0.91 * k, k]);
    }
  }
  function makeMask(layer, name) {
    var mat = new pc.ShaderMaterial({ uniqueName: name, attributes: { aPosition: pc.SEMANTIC_POSITION }, vertexGLSL: QUAD_VS, fragmentGLSL: MASK_FS });
    mat.depthTest = false; mat.depthWrite = false; mat.cull = pc.CULLFACE_NONE;
    mat.blendState = new pc.BlendState(true, pc.BLENDEQUATION_ADD, pc.BLENDMODE_ZERO, pc.BLENDMODE_SRC_ALPHA, pc.BLENDEQUATION_ADD, pc.BLENDMODE_ZERO, pc.BLENDMODE_SRC_ALPHA);
    mat.setParameter("uShape", [SQUIRCLE ? 4 : 2, 0, 0, 0]);
    mat.update();
    var mesh = new pc.Mesh(core.device);
    mesh.setPositions([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
    mesh.setIndices([0, 1, 2]);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    var mi = new pc.MeshInstance(mesh, mat);
    mi.cull = false;
    var e = new pc.Entity(name);
    e.addComponent("render", { meshInstances: [mi], layers: [layer.id], castShadows: false, receiveShadows: false });
    e.enabled = false;
    app.root.addChild(e);
    return { e: e, mat: mat, on: false };
  }
  function maskSet(K, rect, radius, gain) {
    if (!K) return;
    var on = !!rect;
    if (K.e.enabled !== on) K.e.enabled = on;
    K.on = on;
    if (!on) return;
    var dev = core.device, sx = dev.width / cssW(), sy = dev.height / cssH(), H = dev.height;
    K.mat.setParameter("uRect", [rect.left * sx, H - rect.bottom * sy, rect.right * sx, H - rect.top * sy]);
    K.mat.setParameter("uFea", [1.5 * sx, Math.max(0, radius) * sx, 1, clamp(gain, 0, 1)]);
  }
  // the stage camera clears only inside its scissor: a camera before it clears the WHOLE canvas
  function clearAll(on) {
    if (on && !clearE) {
      clearL = new pc.Layer({ name: "OrbitCardClear" });
      app.scene.layers.insert(clearL, 0);
      clearE = new pc.Entity("OrbitCardClear");
      clearE.addComponent("camera", { clearColor: new pc.Color(0, 0, 0, 0), clearColorBuffer: true, clearDepthBuffer: true, layers: [clearL.id], priority: -20 });
      app.root.addChild(clearE);
      lastLayers();
    }
    if (clearE && clearE.enabled !== on) clearE.enabled = on;
  }
  var V4 = null;
  function vec4s() { if (!V4) V4 = { full: new pc.Vec4(0, 0, 1, 1), s: new pc.Vec4(), r: new pc.Vec4(), bs: new pc.Vec4() }; return V4; }
  function scissorOf(r, out) {
    var Wd = cssW(), Hh = cssH();
    var x0 = clamp(r.left / Wd, 0, 1), x1 = clamp(r.right / Wd, 0, 1), y0 = clamp(1 - r.bottom / Hh, 0, 1), y1 = clamp(1 - r.top / Hh, 0, 1);
    out.set(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
    return out;
  }
  function mainScissor(r) {
    var c = core.camera && core.camera.camera;
    if (!c || !pc) return;
    var Q = vec4s(), s = r ? scissorOf(r, Q.s) : Q.full;
    if (!c.scissorRect.equals(s)) c.scissorRect = s;
    if (!c.rect.equals(Q.full)) c.rect = Q.full;
  }
  /* the card backdrop: the cards are transparent windows in the page (D8), so each card's rect is cleared
     to the page's --space colour (premultiplied: x a while the full screen view shrinks into card A) */
  var SPACE = null, CLR = { main: null, t: null, a: -1 };
  function spaceRGB() {
    if (SPACE) return SPACE;
    var hex = "#0b0c0e";
    try { var v = getComputedStyle(doc.documentElement).getPropertyValue("--space").trim(); if (/^#[0-9a-f]{6}$/i.test(v)) hex = v; } catch (e) { /* default */ }
    SPACE = [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
    return SPACE;
  }
  function mainClear(a) {
    var c = core.camera && core.camera.camera;
    if (!c || !pc) return;
    a = Math.round(clamp(a, 0, 1) * 100) / 100;
    if (a === CLR.a) return;
    CLR.a = a;
    var s = spaceRGB();
    c.clearColor = new pc.Color(s[0] * a, s[1] * a, s[2] * a, a);
  }
  // the main camera never draws the house (card B has its own camera); back on when we hand over
  function mainWorld(on) {
    var cc = core.camera && core.camera.camera;
    if (!cc || !pc) return;
    var has = cc.layers.indexOf(pc.LAYERID_WORLD) >= 0;
    if (on && !has) cc.layers = [pc.LAYERID_WORLD].concat(cc.layers);
    else if (!on && has) cc.layers = cc.layers.filter(function (id) { return id !== pc.LAYERID_WORLD; });
  }

  // one splat entity on our layer (pack fallback), NOT unified, with a fade uniform in its own material
  var FADE_PS = [
    "uniform float uOrbitFade;",
    "void modifySplatColor(vec2 gaussianUV, inout vec4 color) { color.a *= uOrbitFade; }"
  ].join("\n");
  function loadSplat(tag, name) {
    return new Promise(function (ok, no) {
      if (!pc.GSplatHandler) { no(new Error("no gsplat in this engine build")); return; }
      var url = core.file(name);
      if (!url) { no(new Error("no file " + name)); return; }
      var a = new pc.Asset(tag, "gsplat", { url: url, filename: tag + ".ply" });
      a.once("load", function () {
        var e = new pc.Entity("Orbit-" + tag);
        e.addComponent("gsplat", { asset: a, unified: false, layers: [splatL.id] });
        e.enabled = false;
        app.root.addChild(e);
        var S = { e: e, fade: -1, prepped: false, n: a.resource && a.resource.numSplats };
        prepFade(S);
        log("splat", tag, S.n, "splats");
        ok(S);
      });
      a.once("error", function (err) { no(err instanceof Error ? err : new Error(String(err))); });
      app.assets.add(a); app.assets.load(a);
    });
  }
  function prepFade(S) {
    if (S.prepped) return true;
    var m = S.e.gsplat && S.e.gsplat.material;
    if (!m) return false;
    try {
      var ch = m.getShaderChunks ? m.getShaderChunks("glsl") : (m.shaderChunks && m.shaderChunks.glsl);
      if (ch && ch.set) { ch.set("gsplatModifyPS", FADE_PS); m.setParameter("uOrbitFade", 1); m.update(); S.prepped = true; S.mat = m; }
    } catch (e) { console.warn("[stage-aerial] splat fade", e); }
    S.prepped = S.prepped || "failed";
    return S.prepped === true;
  }
  function showSplat(S, k) {
    if (!S) return;
    if (S.h) { S.h.show(k); return; }
    var on = k > 0.002;
    if (S.e.enabled !== on) S.e.enabled = on;
    if (!on) return;
    if (S.prepped !== true) prepFade(S);
    k = Math.round(k * 500) / 500;
    if (S.mat && k !== S.fade) { S.fade = k; S.mat.setParameter("uOrbitFade", k); }
  }

  // aerial: the real drone scan, streamed; the base64 pack only when that is not possible here
  var aerialP = null;
  function loadAerial() {
    if (aerialP) return aerialP;
    aerialP = streamSplat("aerial", "aerial").then(function (S) {
      parseAerial(AERIAL_DEF);
      A.splat = S; A.stream = true; warmApply();
      A.ready = true;
      // the stream broke after it showed: the drone pack takes over
      S.h.onLost(function (e) { log("aerial stream lost:", e && e.message, "-> pack"); A.ready = false; A.splat = null; A.stream = false; aerialP = loadAerialPack(); });
      log("aerial ready (stream)");
      render();
      ev.emit("ready", { verified: A.verified, stream: true });
      evTwo.emit("ready", { card: "splat" });
    }, function (e) {
      log("aerial stream off:", e && e.message, "-> pack");
      return loadAerialPack();
    });
    return aerialP;
  }
  function loadAerialPack() {
    return core.need(core.pack("aerial")).then(function () {
      return new Promise(function (ok) { core.whenEngine(function () { ok(); }); });
    }).then(function () {
      layers();
      var j = readJson("aerial/aerial.json") || {};
      parseAerial(j);
      return loadSplat("aerial", "aerial/aerial.ply");
    }).then(function (S) {
      A.splat = S;
      if (A.world) { var w = A.world; S.e.setLocalPosition(w.t[0], w.t[1], w.t[2]); S.e.setLocalRotation(w.q[0], w.q[1], w.q[2], w.q[3]); S.e.setLocalScale(w.s, w.s, w.s); }
      A.ready = true;
      log("aerial ready", JSON.stringify({ frame: A.frame, verified: A.verified, joined: A.joined, orbit: A.orbit }));
      render();
      ev.emit("ready", { verified: A.verified });
      evTwo.emit("ready", { card: "splat" });
    }).catch(function (e) {
      A.missing = true;
      log("aerial off:", e && e.message);
    });
  }
  // aerial frame -> model frame (when the pack says frame:"aerial" and carries a registration)
  function regPoint(p) {
    var w = A.world; if (!w) return v3(p);
    var q = w.q, u = [q[0], q[1], q[2]], v = [p[0] * w.s, p[1] * w.s, p[2] * w.s];
    function cr(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    var c1 = cr(u, v), c2 = cr(u, c1);
    return [v[0] + 2 * q[3] * c1[0] + 2 * c2[0] + w.t[0], v[1] + 2 * q[3] * c1[1] + 2 * c2[1] + w.t[1], v[2] + 2 * q[3] * c1[2] + 2 * c2[2] + w.t[2]];
  }
  function parseAerial(j) {
    var r = j.reg || {};
    A.frame = j.frame === "aerial" ? "aerial" : "model";
    A.verified = r.verified === true;
    A.world = null;
    var q = Array.isArray(r.quat) && r.quat.length === 4 ? r.quat.map(Number) : null;
    if (A.frame === "aerial" && isFinite(+r.scale) && +r.scale > 0 && q && ok3(r.t)) {
      var ql = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
      A.world = { s: +r.scale, q: [q[0] / ql, q[1] / ql, q[2] / ql, q[3] / ql], t: v3(r.t) };
    }
    A.joined = A.frame === "model" || !!A.world;
    var o = j.orbit || {}, k = A.world ? A.world.s : 1;
    A.orbit = {
      target: ok3(o.target) ? (A.world ? regPoint(o.target) : v3(o.target)) : null,
      dist: +o.dist > 0 ? +o.dist * k : null,
      minDist: +o.minDist > 0 ? +o.minDist * k : null,
      maxDist: +o.maxDist > 0 ? +o.maxDist * k : null,
      pitchMin: isFinite(angR(o.pitchMin, 1.6)) ? angR(o.pitchMin, 1.6) : 8 * D2R,
      pitchMax: isFinite(angR(o.pitchMax, 1.6)) ? angR(o.pitchMax, 1.6) : 80 * D2R,
      yaw0: isFinite(angR(o.yaw0, 6.3)) ? angR(o.yaw0, 6.3) : 0.6,
      fov: isFinite(angR(o.fov, 3.2)) ? angR(o.fov, 3.2) : 40 * D2R
    };
    if (A.orbit.pitchMin > A.orbit.pitchMax) { var t = A.orbit.pitchMin; A.orbit.pitchMin = A.orbit.pitchMax; A.orbit.pitchMax = t; }
    A.house = Array.isArray(j.house) && j.house.length >= 6 ? j.house.map(Number) : AERIAL_DEF.house;
    A.approach = (A.verified && Array.isArray(j.approach) ? j.approach : []).filter(function (p) { return p && ok3(p.eye) && ok3(p.target); })
      .map(function (p) { return { eye: v3(p.eye), target: v3(p.target), fov: angR(p.fov || 50, 3.2) || 50 * D2R }; });
  }

  // house scan (it holds the patio): streamed; the patio pack only when that is not possible here
  var patioP = null;
  function loadPatio() {
    if (patioP) return patioP;
    patioP = streamSplat("house", "house").then(function (S) {
      P.json = PATIO_DEF;
      P.splat = S; P.stream = true; warmApply();
      P.ready = true;
      S.h.onLost(function (e) { log("house stream lost:", e && e.message, "-> patio pack"); P.ready = false; P.splat = null; P.stream = false; patioP = loadPatioPack(); });
      log("patio ready (stream)");
      render();
    }, function (e) {
      log("house stream off:", e && e.message, "-> patio pack");
      return loadPatioPack();
    });
    return patioP;
  }
  function loadPatioPack() {
    return core.need(core.pack("patio")).then(function () {
      return new Promise(function (ok) { core.whenEngine(function () { ok(); }); });
    }).then(function () {
      layers();
      var j = readJson("patio/patio.json");
      if (!j || !j.arrive || !ok3(j.arrive.eye) || !ok3(j.arrive.target)) throw new Error("patio.json has no arrive");
      P.json = j;
      return loadSplat("patio", "patio/patio.ply");
    }).then(function (S) {
      P.splat = S;
      P.ready = true;
      log("patio ready");
      render();
    }).catch(function (e) {
      P.missing = true;
      log("patio off:", e && e.message);
    });
  }
  function watchNear(el, fn) {
    if (!el) return;
    if (!("IntersectionObserver" in win)) { fn(); return; }
    var io = new IntersectionObserver(function (en) {
      if (en.some(function (e) { return e.isIntersecting; })) { io.disconnect(); fn(); }
    }, { rootMargin: "150% 0px 150% 0px" });
    io.observe(el);
  }
  // (31 Oct, phone speed) the download lane (stage.js core.lane): the drone scan after the stacked house, or
  // when its card is 2.5 screens away; the house scan for #walk after the drone scan, or 1.5 screens before #walk.
  // The house MODEL no longer loads here (card B is gone; it waits for #design in the lane).
  function laneEnd(id) { return function () { if (core.laneDone) core.laneDone(id); }; }
  function inLane(id, opt, fn, el) {
    if (!core.lane) { watchNear(el, fn); return; }
    core.lane(id, opt).then(function () { var p = fn(); if (p && p.then) p.then(laneEnd(id), laneEnd(id)); else laneEnd(id)(); });
  }
  var cardEl = doc.querySelector('[data-stage="two"]') || doc.querySelector('[data-stage="aerial"]') || doc.getElementById("scan");
  inLane("aerial", { after: "stack", el: cardEl, near: 2.5, max: 40 }, loadAerial, cardEl);
  var walkEl = doc.getElementById("walk") || doc.querySelector('[data-stage="patio"]');
  inLane("walk", { after: "aerial", el: walkEl, near: 1.5 }, loadPatio, walkEl);
  core.whenReady(function () { if (core.house) evTwo.emit("ready", { card: "model" }); });

  /* ---------- one scroll position along the chain of beats ---------- */
  var chain = [], chainT = 0, TW = { outU: 0.78 };
  function sorted(sel) {
    var a = Array.prototype.slice.call(doc.querySelectorAll(sel));
    a.sort(function (x, y) { return x.getBoundingClientRect().top - y.getBoundingClientRect().top; });
    return a;
  }
  function collect() {
    var list = [], ae = sorted('[data-stage="aerial"]'), tw = sorted('[data-stage="two"]');
    if (tw.length) {
      if (ae.length) list.push({ el: ae[0], a: 0, b: 1 });
      var out = tw.filter(function (e) { return e.getAttribute("data-phase") === "out"; })[0] || null;
      list.push({ el: tw[0], last: tw[tw.length - 1], out: out, a: 1, b: 2, two: true });
    } else if (ae.length === 1) list.push({ el: ae[0], a: 0, b: 2, two: true });
    else if (ae.length > 1) { list.push({ el: ae[0], a: 0, b: 1 }); list.push({ el: ae[1], last: ae[ae.length - 1], a: 1, b: 2, two: true }); }
    [["aerial-in", 2], ["patio", 3]].forEach(function (d) {
      var el = doc.querySelector('[data-stage="' + d[0] + '"]');
      if (el) list.push({ el: el, a: d[1], b: d[1] + 1 });
    });
    chain = list;
    hookHits();
  }
  doc.addEventListener("orbit:feed", collect);
  function span(c) {
    var r = c.el.getBoundingClientRect(), top = r.top, bot = r.bottom;
    if (c.last && c.last !== c.el) bot = Math.max(bot, c.last.getBoundingClientRect().bottom);
    return { top: top, bottom: bot, height: Math.max(1, bot - top) };
  }
  function scrollS() {
    var vh = win.innerHeight || 800, vc = vh * 0.5;
    if (!chain.length) return -1;
    for (var i = 0; i < chain.length; i++) {
      var c = chain[i], r = span(c);
      if (c.two) TW.outU = c.out ? clamp((c.out.getBoundingClientRect().top - r.top) / r.height, 0.3, 0.97) : 0.78;
      if (vc < r.top) return i === 0 ? c.a - (r.top - vc) / vh : c.a;
      if (vc <= r.bottom) return c.a + (c.b - c.a) * clamp((vc - r.top) / r.height, 0, 1);
    }
    var last = chain[chain.length - 1], rb = span(last);
    return last.b + (vc - rb.bottom) / vh;
  }

  /* ---------- the poses ---------- */
  var base = null;   // the aerial pose (the points' own camera at the reveal), frozen in the cards
  // round 9: js/film.js patioArrive wins (it may carry a `tall` framing for phones); the pack's json after
  function arriveView() {
    var F = poses().patioArrive, j = P.json;
    return poseView(F && ok3(F.eye) ? F : j ? j.arrive : null, false);
  }
  /* round 9: the dive of the walk-in (model metres). From the aerial pose over the street side, then
     steeply down to ~20 m above the middle of the garden (12 m above the roofs), looking into it; under the light (DV.up..DV.down)
     the house scan takes over at landView (a little above and behind the arrival) and settles onto it. */
  var DV = { sw: 0.4, land: 0.82, up: [0.16, 0.36], down: [0.44, 0.7] };
  var DIVE = [
    { eye: [18.5, 30.0, 12.5], target: [9.8, 0.8, 2.9], fov: 50 },
    { eye: [13.0, 24.0, 6.2], target: [9.4, 0.6, 2.7], fov: 40 },
    { eye: [12.0, 20.0, 5.0], target: [9.3, 0.5, 2.6], fov: 34 }
  ];
  function diveKeys(B) {
    var K = [B], n = DIVE.length;
    DIVE.forEach(function (p, i) {
      var sh = 1 - (i + 1) / n;
      K.push({ eye: v3(p.eye), target: v3(p.target), fov: portraitFov(p.fov * D2R), shift: [B.shift[0] * sh, B.shift[1] * sh] });
    });
    return K;
  }
  function landView(ar) {
    var d = sub3(ar.target, ar.eye), l = len3(d) || 1, back = mul3(d, -0.45 / l);
    return { eye: add3(add3(ar.eye, back), [0, 0.85, 0]), target: add3(ar.target, [0, -0.6, 0]), fov: ar.fov * 1.1, shift: [0, 0] };
  }
  function lerpView(a, b, t) {
    return { eye: lerp3(a.eye, b.eye, t), target: lerp3(a.target, b.target, t), fov: mix(a.fov, b.fov, t), shift: [mix(a.shift[0], b.shift[0], t), mix(a.shift[1], b.shift[1], t)] };
  }
  // the curated viewpoints (poses.patioViews, else VIEWS_DEF); the first one is always arrive
  function patioViews() {
    var L = poses().patioViews, out = [];
    if (!Array.isArray(L) || L.length < 2) L = VIEWS_DEF;
    L.forEach(function (p) { var v = poseView(p, false); if (v) out.push(v); });
    var ar = arriveView();
    if (ar) { if (out.length && len3(sub3(out[0].eye, ar.eye)) < 0.05) out[0] = ar; else out.unshift(ar); }
    return out;
  }
  // where along the viewpoints the patio beat is (u 0..1): holds at each viewpoint, smooth moves between
  // round 9: VS = which stop the caption names (stop), how much it shows (cap: 1 at a hold, 0 halfway
  // between two stops) and where in the patio beat the stops end (end; the last one holds after)
  // (30 Oct) end = where the walk's fade starts (act bottom 1.4 screens up): 0.64 of the 250vh patio beat
  var VS = { stop: 0, cap: 1, n: 3, end: 0.64 };
  function viewsAt(u) {
    var L = patioViews(), n = L.length;
    VS.n = n;
    if (!n) return null;
    if (n === 1) { VS.stop = 0; VS.cap = 1; return L[0]; }
    // (30 Oct, James: smooth) shorter holds and a soft curve: the steep one turned the camera up to 25 deg in
    // a single frame halfway between two stops
    var seg = n - 1, hold = 0.24;  // share of each segment spent holding (half at each end)
    var f = clamp(u, 0, 1) * seg, i = Math.min(seg - 1, Math.floor(f)), w = f - i;
    var t = reduced ? (w < 0.5 ? 0 : 1) : sstep(hold / 2, 1 - hold / 2, w);
    VS.stop = t < 0.5 ? i : i + 1;
    VS.cap = reduced ? 1 : sstep(0.2, 0.75, Math.abs(2 * t - 1));
    var a = L[i], b = L[i + 1];
    var eye = lerp3(a.eye, b.eye, t);
    var da = sub3(a.target, a.eye), db = sub3(b.target, b.eye);
    var la = len3(da) || 1, lb = len3(db) || 1, dist = mix(la, lb, t);
    var ha = Math.atan2(da[0], da[2]), hb = Math.atan2(db[0], db[2]), dh = wrapPi(hb - ha);
    var pa = Math.asin(clamp(da[1] / la, -1, 1)), pb = Math.asin(clamp(db[1] / lb, -1, 1));
    var hd = ha + dh * t, pt = mix(pa, pb, t);
    var target = add3(eye, [dist * Math.cos(pt) * Math.sin(hd), dist * Math.sin(pt), dist * Math.cos(pt) * Math.cos(hd)]);
    return { eye: eye, target: target, fov: mix(a.fov, b.fov, t), shift: [0, 0] };
  }
  /* the small orbit cone: the camera turns slowly about a vertical axis through a point ~2.2 m in front
     of it (about +-6 deg, never far from where the scan was filmed); amp 0..1 */
  var coneT = 0;   // the sway clock: it stands still while the visitor explores the walk (release keeps the view)
  function cone(v, amp, now) {
    if (reduced || amp <= 0 || !v) return v;
    var d = sub3(v.target, v.eye), l = len3(d) || 1, pv = add3(v.eye, mul3(d, 2.2 / l));
    var a = amp * (0.1 * Math.sin(now * 2 * Math.PI / 28) + 0.02 * Math.sin(now * 0.53));
    var e = add3(pv, rotY(sub3(v.eye, pv), a)), t = add3(pv, rotY(sub3(v.target, pv), a));
    var b = amp * 0.05 * Math.sin(now * 2 * Math.PI / 37);
    e[1] += b; t[1] += b * 0.4;
    return { eye: e, target: t, fov: v.fov, shift: v.shift };
  }

  /* ---------- card A: the building fitted into the card ---------- */
  // wide: the start view stands this much further back than "the flat fills the card", so the building
  // and its street show
  var FIT = { d: 0, sx: 0, sy: 0, init: false, margin: 0.12, wide: 1.45 };
  function houseBox() { return A.house || AERIAL_DEF.house; }
  // distance + lens shift so the house box (pivot P) fills the rect with margin, for camera angles az / el
  function fitOrbit(Pv, az, el, fov, rect, dt) {
    var cW = cssW(), cH = cssH(), asp = cW / Math.max(1, cH);
    var hx = rect.width / cW * (1 - FIT.margin), hy = rect.height / cH * (1 - FIT.margin);
    var rcx = (rect.left + rect.right) / cW - 1, rcy = 1 - (rect.top + rect.bottom) / cH;
    var dir = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];  // pivot -> eye
    var z = dir, x = [z[2], 0, -z[0]], xl = Math.hypot(x[0], x[2]) || 1; x = [x[0] / xl, 0, x[2] / xl];
    var y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    var f = 1 / Math.tan(fov / 2), b = houseBox(), need = 1;
    for (var i = 0; i < 8; i++) {
      var q = [(i & 1 ? b[3] : b[0]) - Pv[0], (i & 2 ? b[4] : b[1]) - Pv[1], (i & 4 ? b[5] : b[2]) - Pv[2]];
      var qx = Math.abs(q[0] * x[0] + q[1] * x[1] + q[2] * x[2]), qy = Math.abs(q[0] * y[0] + q[1] * y[1] + q[2] * y[2]);
      var qz = q[0] * z[0] + q[1] * z[1] + q[2] * z[2];
      need = Math.max(need, qz + f / asp * qx / Math.max(0.05, hx), qz + f * qy / Math.max(0.05, hy));
    }
    var o = A.orbit || {};
    need = clamp(need * FIT.wide, o.minDist || 14, (o.maxDist || 75) * 1.6);
    if (!FIT.init || reduced) { FIT.d = need; FIT.sx = -rcx; FIT.sy = -rcy; FIT.init = true; }
    else { FIT.d = follow(FIT.d, need, 0.6, dt); FIT.sx = follow(FIT.sx, -rcx, 0.12, dt); FIT.sy = follow(FIT.sy, -rcy, 0.12, dt); }
    return FIT;
  }
  // the aerial pose when the points never gave one (page opened further down, or no model frame)
  function fallbackBase() {
    var F = poses().aerial;
    if (F && ok3(F.eye) && ok3(F.target)) return poseView(F, true);
    var o = A.orbit;
    if (A.ready && o && o.target) {
      var d = o.dist || 40, el = mix(o.pitchMin, o.pitchMax, 0.45);
      return { eye: add3(o.target, [d * Math.cos(el) * Math.sin(o.yaw0), d * Math.sin(el), d * Math.cos(el) * Math.cos(o.yaw0)]), target: v3(o.target), fov: portraitFov(o.fov), shift: [0, 0] };
    }
    var ar = arriveView(), j = P.json;
    if (!ar) return null;
    var c = j && Array.isArray(j.box) && j.box.length >= 6 ? [(j.box[0] + j.box[3]) / 2, j.box[1], (j.box[2] + j.box[5]) / 2] : ar.target;
    var h = sub3(ar.eye, ar.target); h[1] = 0; var hl = len3(h) || 1;
    return { eye: add3(c, [h[0] / hl * 20, 26, h[2] / hl * 20]), target: v3(c), fov: ar.fov, shift: [0, 0] };
  }
  function baseView() { return base || (base = fallbackBase()); }
  function pivot() {
    var B = baseView();
    return (A.orbit && A.orbit.target) || (B ? B.target : [0, 0, 0]);
  }
  function geo() {
    var B = baseView(), Pv = pivot(), d0 = sub3(B.eye, Pv), r0 = len3(d0) || 1;
    return { B: B, P: Pv, d0: d0, r0: r0, az0: Math.atan2(d0[0], d0[2]), el0: Math.asin(clamp(d0[1] / r0, -1, 1)) };
  }
  function clampPitch(p) {
    if (!baseView()) return p;
    var g = geo(), o = A.orbit || { pitchMin: 5 * D2R, pitchMax: 85 * D2R };
    var lo = Math.min(0, o.pitchMin - g.el0), hi = Math.max(0, o.pitchMax - g.el0);
    return clamp(p, lo, hi);
  }
  function clampZoom(z) {
    if (!baseView()) return clamp(z, -1.2, 1.6);
    var g = geo(), o = A.orbit || {};
    // relative to the fitted distance: in to 0.4 x (the flat fills the card), out to 1.8 x
    if (FIT.init && FIT.d > 0) {
      var nearD = Math.max(o.minDist || 14, FIT.d * 0.4), farD = Math.min(Math.max((o.maxDist || 75) * 1.6, FIT.d * 1.2), FIT.d * 1.8);
      return clamp(z, Math.min(0, Math.log(FIT.d / farD)), Math.max(0, Math.log(FIT.d / nearD)));
    }
    var mn = Math.max(o.minDist || 0, g.r0 * 0.5), mx = Math.max(o.maxDist || 0, g.r0 * 1.4);
    return clamp(z, Math.min(0, Math.log(g.r0 / mx)), Math.max(0, Math.log(g.r0 / mn)));
  }
  // the orbit camera; env 0 = exactly the aerial pose, 1 = the visitor's / auto orbit fitted into rect
  function orbitView(env, dt, rect) {
    var g = geo(), B = g.B;
    var yaw = env * (O.auto + O.uyawS), el = g.el0 + env * O.upitchS;
    var az = g.az0 + yaw;
    var r = g.r0, sh = B.shift.slice(), look = rotY(sub3(B.target, g.P), yaw), target;
    if (rect && env > 0) {
      var F = fitOrbit(g.P, g.az0 + O.auto + O.uyawS, clamp(g.el0 + O.upitchS, -1.5, 1.5), B.fov, rect, dt || 0.016);
      r = mix(g.r0, F.d * Math.exp(-O.uzoomS), env);
      sh = [mix(B.shift[0], F.sx, env), mix(B.shift[1], F.sy, env)];
      target = add3(g.P, mul3(look, 1 - env));   // the aim moves onto the building itself
    } else {
      r = g.r0 * Math.exp(-env * O.uzoomS);
      target = add3(g.P, mul3(look, r / g.r0));
    }
    var eye = add3(g.P, [r * Math.cos(el) * Math.sin(az), r * Math.sin(el), r * Math.cos(el) * Math.cos(az)]);
    return { eye: eye, target: target, fov: B.fov, shift: sh };
  }
  // the walk-in path from the aerial pose to the patio (key poses, Catmull-Rom)
  function approachKeys() {
    var B = baseView(), ar = arriveView();
    var K = [B];
    if (A.ready && A.verified && A.approach.length) {
      // the pack's first / last key are the aerial pose and arrive themselves: those come from the live poses
      var F = poses().aerial, n = A.approach.length;
      A.approach.forEach(function (p, i) {
        if (i === 0 && ((F && ok3(F.eye) && len3(sub3(p.eye, F.eye)) < 1.5) || len3(sub3(p.eye, B.eye)) < 1.5)) return;
        if (i === n - 1 && len3(sub3(p.eye, ar.eye)) < 0.6) return;
        var sh = 1 - (i + 1) / (n + 1);
        K.push({ eye: p.eye, target: p.target, fov: portraitFov(p.fov), shift: [B.shift[0] * sh, B.shift[1] * sh] });
      });
    } else {
      // above the patio, looking down at where we land: the camera drops through the open sky
      var up = clamp(0.5 * (B.eye[1] - ar.eye[1]), 6, 40);
      var e = lerp3(ar.eye, B.eye, 0.18); e[1] = ar.eye[1] + up;
      K.push({ eye: e, target: lerp3(ar.target, B.target, 0.1), fov: mix(B.fov, ar.fov, 0.5), shift: [B.shift[0] * 0.4, B.shift[1] * 0.4] });
    }
    K.push(ar);
    return K;
  }
  function pathView(K, t) {
    return {
      eye: spline(K.map(function (k) { return k.eye; }), t),
      target: spline(K.map(function (k) { return k.target; }), t),
      fov: lin(K.map(function (k) { return k.fov; }), t),
      shift: [lin(K.map(function (k) { return k.shift[0]; }), t), lin(K.map(function (k) { return k.shift[1]; }), t)]
    };
  }

  /* ---------- the cards' rectangles (the section's [data-card] elements, read per frame) ---------- */
  var cardEls = { splat: null, model: null };
  function findCards() {
    ["splat", "model"].forEach(function (k) {
      var el = doc.querySelector('[data-card="' + k + '"]') || doc.querySelector('.stage-hit[data-hit="two-' + k + '"]');
      if (el !== cardEls[k]) { cardEls[k] = el; if (el) { el._orbitRad = -1; watchVis(k, el); } }
    });
  }
  function radiusOf(el) {
    if (!(el._orbitRad >= 0)) {
      var v = 24;
      try { var cs = getComputedStyle(el).borderTopLeftRadius; if (cs && cs.indexOf("%") < 0) v = parseFloat(cs) || 24; } catch (e) { v = 24; }
      el._orbitRad = v;
    }
    return el._orbitRad;
  }
  function cardBox(k) {
    var el = cardEls[k];
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return null;
    return { r: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }, rad: Math.min(radiusOf(el), r.width / 2, r.height / 2) };
  }
  // from beyond the whole screen (t = 0) to the card (t = 1)
  function clipRect(box, t) {
    var pad = box.rad * 2 + 8, W0 = cssW(), H0 = cssH(), r = box.r;
    var L = mix(-pad, r.left, t), Tp = mix(-pad, r.top, t), R = mix(W0 + pad, r.right, t), Bt = mix(H0 + pad, r.bottom, t);
    return { left: L, top: Tp, right: R, bottom: Bt, width: R - L, height: Bt - Tp };
  }

  /* ---------- card B: the house model from above, its own camera ---------- */
  function modelCam() {
    if (camB) return camB;
    camB = new pc.Entity("OrbitTwoModelCam");
    var bg = spaceRGB();
    camB.addComponent("camera", { clearColor: new pc.Color(bg[0], bg[1], bg[2], 1), clearColorBuffer: true, clearDepthBuffer: true,
      layers: [pc.LAYERID_WORLD, maskBL.id], priority: 4, fov: 32, nearClip: 0.2, farClip: 600 });
    camB.enabled = false;
    app.root.addChild(camB);
    return camB;
  }
  /* round 9 (review C Scan 3): card B frames the living room and the garden (the west half of the long
     house) so the model fills the card instead of a thin strip in a big dark box; the far end runs out of
     the card. B_FOCUS_X = where the framed part ends (model x, metres: the garden's east side). */
  var B_FOCUS_X = 12.6, B_AZ = 25 * D2R, B_SWING = 14 * D2R, B_SWING_T = 34;
  function modelGeo() {
    var H = core.house, b = H.bounds || { min: [0, 0, 0], max: [20, 3, 7] }, fy = H.floorY || 0;
    // fix round (manager): the WHOLE model stays inside the card with a margin through the whole swing
    // (fitModel B_FIT_M); the 3/4 angle is what keeps it bigger than the old full turn. B_FOCUS_X unused now.
    void B_FOCUS_X;
    var x0 = b.min[0], x1 = b.max[0], yTop = Math.min(isFinite(b.max[1]) ? b.max[1] : fy + 3, fy + 3.0);
    var fb = { min: [x0, fy, b.min[2]], max: [x1, yTop, b.max[2]] };
    var Pv = [(x0 + x1) / 2, fy + 0.8, (b.min[2] + b.max[2]) / 2];
    var ref = poses().floorRef || poses().top || { eye: [16.5, 22.0, 19.0], target: [10.7, 0.4, 3.25] };
    var az0 = ok3(ref.eye) && ok3(ref.target) ? Math.atan2(ref.eye[0] - ref.target[0], ref.eye[2] - ref.target[2]) : 0.6;
    return { P: Pv, az0: az0 + B_AZ, b: fb, y0: fy, y1: yTop };
  }
  /* the wall colour try (review C Scan 3: "show, not say"): while card B is fully on screen the living
     room walls slowly take a colour, hold it, and go back. Uses the tour's own paint (OrbitStage.tour, the
     same house as #design). Only when the visitor has not painted the walls themselves; their own colour
     is never touched, and ours is always taken back when the card goes (or the visitor leaves). */
  var PD = { on: false, t0: 0, mine: null, cur: undefined };
  var PD_FROM = "#f1ece2", PD_TO = "#c8876a";
  function hexMix(a, b, t) {
    var A0 = parseInt(a.slice(1), 16), B0 = parseInt(b.slice(1), 16), o = "#";
    for (var k = 16; k >= 0; k -= 8) {
      var x = Math.round(mix((A0 >> k) & 255, (B0 >> k) & 255, t));
      o += (x < 16 ? "0" : "") + x.toString(16);
    }
    return o;
  }
  function tourApi() { var t = stageApi.tour; return t && typeof t.paint === "function" && typeof t.paintNow === "function" ? t : null; }
  function paintDemo(active, now) {
    var tu = tourApi();
    if (!tu) return;
    if (!active) {
      if (PD.on) {
        PD.on = false;
        try { if (tu.paintNow() === PD.mine) tu.paint(null); } catch (e) { /* keep */ }
        PD.mine = null; PD.cur = undefined;
      }
      return;
    }
    if (!PD.on) {
      var cur = null;
      try { cur = tu.paintNow(); } catch (e) { return; }
      if (cur) return;                       // the visitor's own colour stays as it is
      PD.on = true; PD.t0 = now; PD.mine = null; PD.cur = undefined;
    }
    // 15 s loop: 2.5 s as it is, 1.6 s into the colour, 5 s colour, 1.6 s back, rest as it is
    var t = (now - PD.t0) % 15, want;
    if (t < 2.5) want = null;
    else if (t < 4.1) want = hexMix(PD_FROM, PD_TO, Math.round((t - 2.5) / 1.6 * 12) / 12);
    else if (t < 9.1) want = PD_TO;
    else if (t < 10.7) want = hexMix(PD_TO, PD_FROM, Math.round((t - 9.1) / 1.6 * 12) / 12);
    else want = null;
    if (want === PD.cur) return;
    // the visitor changed the colour some other way meanwhile: stop and leave theirs
    try { var nowHex = tu.paintNow(); if (PD.cur !== undefined && nowHex !== (PD.cur || null)) { PD.on = false; PD.mine = null; return; } } catch (e) { return; }
    var ok = false;
    try { ok = tu.paint(want); } catch (e) { ok = false; }
    if (ok !== false) { PD.cur = want; PD.mine = want; }
  }
  function fitModel(g, az, el, fov, asp) {
    var z = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
    var x = [z[2], 0, -z[0]], xl = Math.hypot(x[0], x[2]) || 1; x = [x[0] / xl, 0, x[2] / xl];
    var y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    var f = 1 / Math.tan(fov / 2), need = 1, b = g.b, m = 0.92;   // 4 % margin on every side
    for (var i = 0; i < 8; i++) {
      var q = [(i & 1 ? b.max[0] : b.min[0]) - g.P[0], (i & 2 ? g.y1 : g.y0) - g.P[1], (i & 4 ? b.max[2] : b.min[2]) - g.P[2]];
      var qx = Math.abs(q[0] * x[0] + q[1] * x[1] + q[2] * x[2]), qy = Math.abs(q[0] * y[0] + q[1] * y[1] + q[2] * y[2]);
      var qz = q[0] * z[0] + q[1] * z[1] + q[2] * z[2];
      need = Math.max(need, qz + f / asp * qx / m, qz + f * qy / m);
    }
    return need;
  }
  function camRect(cam, r) {
    var Q = vec4s(), c = cam.camera, Wd = cssW(), Hh = cssH();
    Q.r.set(r.left / Wd, 1 - r.bottom / Hh, r.width / Wd, r.height / Hh);
    scissorOf(r, Q.bs);
    if (!c.rect.equals(Q.r)) c.rect = Q.r;
    if (!c.scissorRect.equals(Q.bs)) c.scissorRect = Q.bs;
  }
  function houseShown(H, on) {
    if (!H || !H.root) return;
    if (H.root.enabled !== on) H.root.enabled = on;
  }
  function modelFrame(gain, box, dt, now) {
    var H = core.house;
    if (!H || !box) { modelOff(); return; }
    modelCam();
    if (!KB) KB = makeMask(maskBL, "OrbitModelMask");
    var g = modelGeo();
    var r = box.r, asp = r.width / Math.max(1, r.height);
    // fix round: a wide card (phones, stacked) shows the long house closer to side-on, so it fills the width;
    // a square card keeps the diagonal 3/4 view
    g.az0 -= sstep(1.05, 1.45, asp) * 17 * D2R;
    // round 9: a slow swing (+-14 deg, 34 s) instead of a full turn, so the whole model stays in the card;
    // Bc.auto is the swing clock (it waits while the visitor turns the model)
    if (!reduced && !Bc.drag) Bc.auto += clamp((now - Bc.lastInput - B_IDLE) / 2, 0, 1) * dt;
    var swing = reduced ? 0 : B_SWING * Math.sin(Bc.auto * 2 * Math.PI / B_SWING_T);
    var az = g.az0 + swing + Bc.yawS, el = clamp(B_EL0 + Bc.pitchS, B_EL[0], B_EL[1]);
    var fov = asp >= 1 ? 32 * D2R : 2 * Math.atan(Math.tan(16 * D2R) / Math.pow(asp, 0.6));
    // fitted for the whole swing around where the visitor turned it (5 headings), so the model never
    // breathes while it swings; after a drag the distance eases to the new fit
    var key = Math.round(asp * 50) + ":" + Math.round(el * 60) + ":" + Math.round(Bc.yaw * 12), need = Bc.fitKey === key ? Bc.fitNeed : 0;
    if (!need) { for (var i = -4; i <= 4; i++) need = Math.max(need, fitModel(g, g.az0 + Bc.yaw + i * B_SWING / 4, el, fov, asp)); Bc.fitKey = key; Bc.fitNeed = need; }
    Bc.fitD = (!Bc.fitInit || reduced) ? need : follow(Bc.fitD, need, 0.7, dt);
    Bc.fitInit = true;
    var d = Bc.fitD * Math.exp(-Bc.zoomS);
    var eye = add3(g.P, [d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az)]);
    camB.setPosition(eye[0], eye[1], eye[2]);
    camB.lookAt(g.P[0], g.P[1], g.P[2], 0, 1, 0);
    var c = camB.camera, fd = fov / D2R;
    if (Math.abs(c.fov - fd) > 1e-3) c.fov = fd;
    var nc = Math.max(0.2, d * 0.2), fc = d * 3 + 60;
    if (Math.abs(c.nearClip - nc) > 0.05) c.nearClip = nc;
    if (Math.abs(c.farClip - fc) > 1) c.farClip = fc;
    camRect(camB, r);
    if (!camB.enabled) camB.enabled = true;
    if (!Bc.posed) { H.pose(null); Bc.posed = true; }
    H.look("outside");
    H.cutaway(eye, g.P, "ext", dt);
    houseShown(H, true);
    maskSet(KB, r, box.rad, gain);
    Bc.view = { eye: eye, target: g.P, fov: fov, dist: d };
  }
  function modelOff() {
    if (camB && camB.enabled) camB.enabled = false;
    if (KB) maskSet(KB, null);
  }

  /* ---------- the walk look-around offset (request 2) ---------- */
  function walkView(v) {
    var e = W.env;
    if (!v || e <= 0) return v;
    var y = W.yawS * e, p = W.pitchS * e, z = W.zoomS * e;
    if (Math.abs(y) < 1e-5 && Math.abs(p) < 1e-5 && Math.abs(z) < 1e-5) return v;
    var d = rotY(sub3(v.target, v.eye), y), l = len3(d) || 1;
    var h = Math.atan2(d[0], d[2]), pt = clamp(Math.asin(clamp(d[1] / l, -1, 1)) + p, -1.3, 1.3);
    var nd = [l * Math.cos(pt) * Math.sin(h), l * Math.sin(pt), l * Math.cos(pt) * Math.cos(h)];
    var fov = clamp(v.fov * Math.exp(-z), Math.min(v.fov, W_FOV[0]), Math.max(v.fov, W_FOV[1]));
    return { eye: v.eye, target: add3(v.eye, nd), fov: fov, shift: v.shift };
  }

  /* ---------- the walk leaves with its act (round 9, handoff rule 9.1) ----------
     The scene is dark BEFORE the next section's heading can reach the screen: it fades while the act's
     end comes from 1.4 screens to 1.02 screens below the top (the pin is still standing, the next section
     not yet in view), opacity only, and comes back the same way when scrolling up. */
  var walkAct = null;
  function walkFade() {
    if (!walkAct || chainT === 0) {
      var pb = doc.querySelector('[data-stage="patio"]');
      walkAct = pb && pb.closest ? (pb.closest(".act") || pb.closest("section")) : null;
    }
    if (!walkAct) return 1;
    var vh = win.innerHeight || 800;
    return sstep(1.02 * vh, 1.4 * vh, walkAct.getBoundingClientRect().bottom);
  }

  /* ---------- the shared frame ---------- */
  function limitS(s) {
    // never an empty canvas: stay on the aerial while the house scan is not there
    if (!P.ready) return Math.min(s, 2);
    return s;
  }
  function resetCards() {
    O.uyaw = O.upitch = O.uzoom = O.uyawS = O.upitchS = O.uzoomS = 0; O.auto = 0; O.vyaw = 0;
    Bc.yaw = Bc.pitch = Bc.zoom = Bc.yawS = Bc.pitchS = Bc.zoomS = 0; Bc.auto = 0; Bc.vyaw = 0; Bc.fitInit = false;
    FIT.init = false;
    T.reset = true;
  }
  var camPrev = null, phasePrev = "", camBlend = null, camAt = 0;
  function drive(dt, now) {
    T.drives++;
    layers();
    if (!splatL) return 0;
    if (framePaused()) { hideAll(); spaceDim(1); T.alpha = 0; return 0; }
    if (++chainT > 60 || !chain.length) { chainT = 0; collect(); findCards(); }
    if (layersChanged()) lastLayers();
    var sRaw = scrollS(), sT = limitS(sRaw);
    if (!T.init || reduced) { T.s = sT; T.init = true; }
    else {
      var gap = Math.abs(sT - T.s);
      // (3 Nov, James: smoother) 0.1 -> 0.15 s: a wheel click glides instead of stepping
      T.s = follow(T.s, sT, gap > 0.35 ? 0.42 : 0.15, dt); // a jump (scan arrived, fast scroll) is a short glide
      if (Math.abs(T.s - sT) < 1e-4) T.s = sT;
    }
    var s = T.s, H = core.house, v = null, oA = 0, oP = 0, kB = 0, boxA = null, tA = 0, fadeW = 1;
    var aOn = A.ready && A.splat, pOn = P.ready && P.splat;

    /* the visitor's offsets, smoothed (card A, card B, walk look) */
    O.uyawS = reduced ? O.uyaw : follow(O.uyawS, O.uyaw, 0.12, dt);
    O.upitchS = reduced ? O.upitch : follow(O.upitchS, O.upitch, 0.12, dt);
    O.uzoomS = reduced ? O.uzoom : follow(O.uzoomS, O.uzoom, 0.14, dt);
    if (!O.drag && Math.abs(O.vyaw) > 1e-3) { O.uyaw += O.vyaw * dt; O.vyaw *= Math.exp(-dt * 3.2); } else if (!O.drag) O.vyaw = 0;
    Bc.yawS = reduced ? Bc.yaw : follow(Bc.yawS, Bc.yaw, 0.12, dt);
    Bc.pitchS = reduced ? Bc.pitch : follow(Bc.pitchS, Bc.pitch, 0.12, dt);
    Bc.zoomS = reduced ? Bc.zoom : follow(Bc.zoomS, Bc.zoom, 0.14, dt);
    if (!Bc.drag && Math.abs(Bc.vyaw) > 1e-3) { Bc.yaw += Bc.vyaw * dt; Bc.vyaw *= Math.exp(-dt * 3.2); } else if (!Bc.drag) Bc.vyaw = 0;
    if (!W.drag && Math.abs(W.vyaw) > 1e-3) { W.yaw = clamp(W.yaw + W.vyaw * dt, -W_YAW, W_YAW); W.vyaw *= Math.exp(-dt * 3.2); } else if (!W.drag) W.vyaw = 0;
    if (!W.on) coneT += Math.min(dt, 0.1);
    var wt = W.on ? 0.08 : 0.22;
    W.yawS = reduced ? W.yaw : follow(W.yawS, W.yaw, wt, dt);
    W.pitchS = reduced ? W.pitch : follow(W.pitchS, W.pitch, wt, dt);
    W.zoomS = reduced ? W.zoom : follow(W.zoomS, W.zoom, wt, dt);

    /* scroll intent ends the walk explore; the engaged card checks its release rules */
    var sy = scrollYNow();
    if (W.on) {
      if (now - W.vvAt < 0.3) W.y0 = sy;
      else if (Math.abs(sy - W.y0) >= Math.max(24, 0.025 * (win.innerHeight || 800))) walkResume("scroll");
    }

    var leadK = 0, leadV = null;
    if (s < 1) {
      /* ---- (30 Oct night, James) no full-screen aerial here any more: the points fly into card A's own
         framing (OrbitSpace.lead), so they form exactly where the splat then appears in the card ---- */
      T.phase = "aerial";
      O.env = 0;
      if (!base) base = fallbackBase();
      if (!T.reset) resetCards();
      oA = 0;
      var boxL = cardBox("splat");
      // (30 Oct, James: "laggy and uneven") the reveal beat now starts where the house beat ends (620vh); before,
      // they overlapped and this move was already 80 % done when it got the stage, a jump into card A
      if (base && boxL) {
        leadV = orbitView(1, dt, boxL.r);
        // (3 Nov 2026, James: still a bit laggy) this scene gets the stage a little after its beat starts (the beat
        // weights cross over ~0.1 later), so the move was already ~5 % along: a 1.5 m jump in one frame. It now
        // starts from wherever it took over (s0), so the first frame is exactly the house flight's last one.
        if (T.revS0 == null || s <= 0.001) T.revS0 = Math.min(Math.max(s, 0), 0.6);
        var kL = reduced ? (s > 0.5 ? 1 : 0) : sstep(T.revS0, 1, s), SK = win.OrbitStage && win.OrbitStage.stack, aimS = SK && SK.aim ? SK.aim() : null;
        // from the very camera the house flight ended on (js/stage-stack.js), so the points never snap back
        if (aimS) { leadV = lerpView(aimS, leadV, kL); leadK = 1; } else leadK = kL;
      }
      v = leadV;
    } else if (s < 2) {
      /* ---- two: card A (the splat) + card B (the model) ---- */
      T.revS0 = null;
      T.phase = "two";
      T.reset = false;
      /* round 9 (review A1, A2): one thing at a time, both ways.
           in : the full-screen splat shrinks into card A (u 0.02..0.22), card A's hairline and caption
                come once it has landed, THEN card B fades in with its model (0.22..0.34);
           out: card B and its model fade out first (w 0..0.22), the words go, THEN card A grows back
                into the full-screen aerial (w 0.24..0.64, done before #walk's words come in), where the
                walk-in starts.
         Card B's camera is off before card A grows, so nothing is ever cut out of the splat. The DOM
         around the cards follows these same numbers (OrbitStage.two.state(), js/sections/scan.js). */
      var u = s - 1, oU = TW.outU, wO = clamp((u - oU) / Math.max(0.05, 1 - oU), 0, 1);
      // (30 Oct night, James) no shrink from full screen any more: the points have formed in card A's
      // framing (the lead above), the splat fades in right there (aIn), then card B comes in. The only
      // full-screen aerial is the way out, into #walk.
      // (3 Nov, James: smoother) the splat fades in over 0.2 of the beat (was 0.1) and the grow to full screen
      // runs over 0.2..0.85 of the out part (was 0.24..0.64); the beats are longer too (03-scan.html)
      var aIn = reduced ? (u < 0.04 ? 0 : 1) : sstep(0.0, 0.2, u), kIn = 1;
      var kOut = reduced ? (wO < 0.3 ? 0 : 1) : sstep(0.2, 0.85, wO);
      var env = kIn * (1 - kOut);
      var kBin = reduced ? (u < 0.04 ? 0 : 1) : sstep(0.08, 0.18, u), kBout = reduced ? (wO < 0.2 ? 0 : 1) : sstep(0.0, 0.22, wO);
      TD.u = u; TD.w = wO;
      TD.frameA = reduced ? (aIn > 0.5 && wO < 0.2 ? 1 : 0) : sstep(0.1, 0.22, u) * (1 - sstep(0.08, 0.22, wO));
      TD.frameB = kBin * (1 - kBout);
      TD.title = reduced ? (aIn > 0.5 && wO < 0.2 ? 1 : 0) : sstep(0.12, 0.26, u) * (1 - sstep(0.0, 0.16, wO));
      if (wO <= 0) { leadV = orbitView(1, dt, (cardBox("splat") || {}).r || null); leadK = 1; }
      O.env = env;
      if (!base) base = fallbackBase();
      oA = aOn ? (kOut > 0 ? 1 : aIn) : 0;
      boxA = cardBox("splat");
      if (base) {
        var idle = now - O.lastInput;
        if (!reduced && env > 0.999 && !O.drag) {
          var ramp = clamp((idle - IDLE_S) / 2.5, 0, 1);
          O.auto += AUTO_SPEED * ramp * dt;
          if (ramp > 0 && !O.idleSent) { O.idleSent = true; ev.emit("idle", {}); }
          var tot = O.auto + O.uyaw;
          if (tot > Math.PI) O.auto -= 2 * Math.PI; else if (tot < -Math.PI) O.auto += 2 * Math.PI;
        }
        v = orbitView(env, dt, boxA ? boxA.r : null);
      }
      tA = env;
      if (H && cardEls.model) kB = kBin * (1 - kBout);   // (30 Oct late night, James) no card B in the page = no model
    } else {
      /* ---- #walk: the flight in (2..3), then the patio viewpoints (3..4) ---- */
      if (!T.reset) resetCards();
      O.env = 0;
      var fl = 0;
      TD.stop = 0; TD.cap = 0; TD.words = 1;
      if (s < 3) {
        T.phase = "aerial-in";
        var ua = s - 2, B = baseView(), ar = arriveView();
        // 30 Oct (James): the dive into a soft light is switched off; the camera flies straight down into
        // the garden again, as before round 9. Set WALK_DIVE to true to bring the light dive back.
        var WALK_DIVE = false;
        if (WALK_DIVE && B && ar && aOn && A.joined && pOn) {
          /* round 9 (review C Walk 1): a short dive into a soft light. The drone scan carries the camera from
             the aerial pose to about 20 m above the garden (never low over the roofs); a warm light rises,
             and under the full light the house scan takes over at eye height and the light clears. The two
             scans are never seen at once (no foggy double picture). Reduced motion: two cuts, no light. */
          if (reduced) { v = ua < 0.5 ? B : ar; oA = ua < 0.5 ? 1 : 0; oP = 1 - oA; }
          else if (ua < DV.sw) {
            var td = clamp(ua / DV.sw, 0, 1);
            v = pathView(diveKeys(B), 0.5 * td * td + 0.5 * td * td * (3 - 2 * td));
            oA = 1; oP = 0;
          } else {
            v = lerpView(landView(ar), ar, ease(clamp((ua - DV.sw) / (DV.land - DV.sw), 0, 1)));
            oA = 0; oP = 1;
          }
          if (!reduced) fl = sstep(DV.up[0], DV.up[1], ua) * (1 - sstep(DV.down[0], DV.down[1], ua));
          // fix round (manager): #walk's words come in only once the garden is there (the light has
          // nearly cleared), never white on the white light
          TD.words = reduced ? (ua < 0.5 ? 0 : 1) : sstep(DV.down[0] + 0.2, DV.down[1] + 0.1, ua);
          v = cone(v, sstep(2.85, 3.0, s), coneT);
          TD.cap = sstep(0.86, 1.0, ua);
        } else if (B && ar) {
          var K = approachKeys();
          if (aOn && !A.joined) {
            // the aerial splat is in its own frame: dolly in there, then drop into the patio (a dissolve)
            if (ua < 0.5) { var g = geo(); v = { eye: lerp3(B.eye, g.P, ease(ua / 0.5) * 0.35), target: B.target.slice(), fov: B.fov, shift: B.shift.slice() }; }
            else v = pathView(K.slice(1), reduced ? 1 : ease((ua - 0.5) / 0.4));
            oA = 1 - sstep(0.08, 0.42, ua); oP = sstep(0.55, 0.85, ua);
          } else {
            var t = reduced ? (ua < 0.5 ? 0 : 1) : ease(clamp(ua / 0.9, 0, 1));
            v = pathView(K, t);
            // verified flight: the drone splat is soft close up, so the house scan takes over while the
            // camera is still a few metres above the patio (ua ~0.5 = about 7 m up)
            if (aOn && A.verified) { oA = 1 - sstep(0.52, 0.68, ua); oP = sstep(0.46, 0.62, ua); }
            else if (aOn) { oA = 1 - sstep(0.28, 0.6, ua); oP = sstep(0.48, 0.84, ua); }
            else oP = sstep(0.42, 0.84, ua);
            if (reduced) { oA = aOn && ua < 0.5 ? 1 : 0; oP = ua >= 0.5 ? 1 : 0; }
          }
          // the words still wait until the garden is there (round 9 rule)
          TD.words = reduced ? (ua < 0.5 ? 0 : 1) : sstep(0.72, 0.9, ua);
          TD.cap = sstep(0.86, 1.0, ua);
          v = cone(v, sstep(2.85, 3.0, s), coneT);
        }
        if (!pOn) oP = 0;
      } else {
        T.phase = "patio";
        // round 9 (review C Walk 2): the stops take the first part of the beat, then the last one holds
        // while the scene goes dark before #compare (walkFade)
        v = cone(viewsAt(clamp((s - 3) / VS.end, 0, 1)), 1, coneT);
        oP = pOn ? 1 : 0;
        TD.stop = VS.stop; TD.cap = VS.cap;
      }
      // the look-around offset, faded out at both ends of the act (a flick past it hands on the path pose)
      var pw = (s - 2) / 2;
      W.env = sstep(0, 0.03, pw) * (1 - sstep(0.9, 1.0, pw));
      v = walkView(v);
      fadeW = walkFade();
      TD.flash = fl; TD.fade = fadeW; TD.nStops = VS.n; TD.t = nowS();
      flashSet(fl * fadeW);
    }
    if (T.phase !== "aerial-in" && T.phase !== "patio") flashSet(0);
    if (T.phase === "two") TD.t = nowS();
    else { TD.frameA = 0; TD.frameB = 0; TD.title = 0; }
    // (3 Nov 2026, James: still a bit laggy) when the full-screen points become card A ("aerial" -> "two") the
    // camera was still on its way and jumped ~3.4 m in one frame. Any change between these two phases now
    // glides from the last camera over 0.45 s (the scroll keeps steering the new one meanwhile).
    // ("aerial" and "two" are two stage scenes sharing this drive: the remembered camera survives the switch
    // between them, it is only forgotten after a real pause of the drive, 0.3 s)
    var tNow = performance.now();
    if (tNow - camAt > 300) { camPrev = null; camBlend = null; }
    camAt = tNow;
    if (v && camPrev && T.phase !== phasePrev && (T.phase === "two" || T.phase === "aerial") && (phasePrev === "two" || phasePrev === "aerial")) camBlend = { from: camPrev, k: 0 };
    if (camBlend && v && !reduced) {
      camBlend.k = Math.min(1, camBlend.k + dt / 0.45);
      var kb = camBlend.k * camBlend.k * (3 - 2 * camBlend.k), vb = lerpView(camBlend.from, v, kb);
      if (leadV) leadV = leadV === v ? vb : lerpView(camBlend.from, leadV, kb);   // the space points glide with it
      v = vb;
      if (camBlend.k >= 1) camBlend = null;
    } else camBlend = null;
    phasePrev = T.phase; camPrev = v ? { eye: v.eye.slice(), target: v.target.slice(), fov: v.fov, shift: (v.shift || [0, 0]).slice() } : camPrev;
    spaceLead(leadK > 0.001 ? leadV : null, leadK);

    /* ---- draw ---- */
    // a streamed scan coming back from parked needs a few frames to sort: keep it warm and invisible
    if (oA > 0.002 && A.splat && A.splat.h && !A.splat.h.drawn) { A.splat.h.warm(true); oA = 0; }
    if (oP > 0.002 && P.splat && P.splat.h && !P.splat.h.drawn) { P.splat.h.warm(true); oP = 0; }
    var a0 = Math.max(oA, oP, kB), alpha = a0 * fadeW;
    var near = T.phase === "aerial" || T.phase === "two" || (T.phase === "aerial-in" && s < 2.6) ? 0.3 : 0.05;
    // the camera is set even while invisible: a warming scan is sorted (and its detail picked) for this view
    if (v) core.view({ eye: v.eye, target: v.target, up: [0, 1, 0], fov: v.fov, shift: v.shift, near: near, far: near > 0.1 ? 3000 : 400 });
    engageTick(now, sy);
    if (!v || alpha < 0.002) {
      hideAll(); houseShown(H, true); mainWorld(true);
      T.alpha = 0; T.oA = 0; T.oP = 0; T.kB = 0; T.tA = 0; T.view = null;
      // (3 Nov 2026, blink) during the reveal only the points show: they come from the house's hand-over at 0.8
      // and reach 1 while the camera pulls back (see the end of drive)
      spaceDim(T.phase === "aerial" && !reduced ? mix(0.8, 1, sstep(0.0, 0.7, s)) : 1);
      return 0;
    }
    showSplat(A.splat, oA / a0);
    showSplat(P.splat, oP / a0);
    mainWorld(false);
    if (T.phase === "two" && boxA && tA > 0.0005) {
      if (!KA) KA = makeMask(maskL, "OrbitCardMask");
      var cr = clipRect(boxA, tA);
      maskSet(KA, cr, boxA.rad * tA, 1);
      mainScissor(cr);
      clearAll(true);
      mainClear(sstep(0.0, 0.6, tA) * (typeof aIn === "number" ? aIn : 1));
    } else {
      maskSet(KA, null);
      mainScissor(null);
      clearAll(false);
      mainClear(0);
    }
    var boxB = kB > 0.002 ? cardBox("model") : null;
    if (boxB && H) modelFrame(kB / a0, boxB, dt, now);
    else { modelOff(); houseShown(H, false); }
    paintDemo(!reduced && T.phase === "two" && !!boxB && kB > 0.9, nowS());
    T.alpha = alpha; T.oA = oA; T.oP = oP; T.kB = boxB ? kB : 0; T.tA = tA; T.view = v;
    // points: dim under the splats; round 9: fully hidden through the whole two-card part (in, hold and
    // out, so no point ever shows around or through a card) and held at ~0.1 under the walk until the
    // walk is dark (then they come back for the next section, never two scenes at once)
    // (30 Oct night) the points stay while the splat fades in inside card A, then go (aIn)
    var dimK = T.phase === "two" ? (typeof aIn === "number" ? aIn : 1) : T.phase === "aerial" ? 0.9 * alpha : 0.9;
    // (3 Nov 2026, James: "the blink") the house hands the points over at 0.8 brightness (js/stage-stack.js
    // SWAP_LV, where both point sets look the same); they reach full brightness while the camera pulls back into
    // card A's framing (which on its own makes them look dimmer), so the picture keeps one brightness
    var lvK = T.phase === "aerial" && !reduced ? mix(0.8, 1, sstep(0.0, 0.7, s)) : 1;
    spaceDim((1 - dimK) * lvK);
    // (4 Nov 2026, phone battery) no redraw every frame any more: stage.js draws when the camera, the scroll or
    // the fade changes (plus a short settle time), and the scans ask for frames themselves while they load
    return alpha;
  }
  function hideAll() {
    flashSet(0);
    paintDemo(false, 0);
    showSplat(A.splat, 0); showSplat(P.splat, 0);
    maskSet(KA, null); modelOff();
    if (pc) { mainScissor(null); clearAll(false); mainClear(0); }
  }
  /* an Orbit viewer iframe is engaged (OrbitEngage kind "frame", CONTRACT 8 download cap): draw nothing
     and park both scans (no sort, no budget) until it lets go */
  var frameOn = false;
  doc.addEventListener("orbit:engage", function (e) {
    var d = e.detail || {};
    if (d.kind !== "frame") return;
    frameOn = !!d.on;
    if (frameOn) { hideAll(); if (A.splat && A.splat.h) A.splat.h.warm(false); if (P.splat && P.splat.h) P.splat.h.warm(false); }
    else warmApply();
    render();
  });
  function framePaused() { return frameOn || doc.documentElement.classList.contains("frame-engaged"); }
  function offAll() {
    T.revS0 = null;     // the next take-over measures its own start again
    hideAll();
    houseShown(core.house, true);
    mainWorld(true);
    spaceDim(1);
    O.drag = false; Bc.drag = false; W.drag = false; Bc.posed = false;
    // back on stage later (any of the four scenes): start from where the page is, not from an old s
    T.init = false;
    // a hand-over between our own scenes runs drive() again in the same frame; if nothing of ours
    // takes the stage, the walk explore and an engaged card end
    var n = T.drives;
    setTimeout(function () { if (T.drives === n) { walkResume("off"); disengage("off"); resetCards(); } }, 150);
  }

  /* ---------- input ---------- */
  function inputA() {
    O.lastInput = nowS(); O.idleSent = false;
    ev.emit("interact", {});
    evTwo.emit("interact", { card: "splat" });
    if (engCard === "splat") ENG.last = nowS();
    render();
  }
  function inputB() {
    Bc.lastInput = nowS();
    evTwo.emit("interact", { card: "model" });
    if (engCard === "model") ENG.last = nowS();
    render();
  }
  // returns true when the zoom was already at its limit (nothing changed)
  function zoomA(k) {
    k = +k; if (!(k > 0) || !isFinite(k) || !live()) return false;
    var z0 = O.uzoom; O.uzoom = clampZoom(O.uzoom + Math.log(k)); inputA();
    return Math.abs(O.uzoom - z0) < 1e-5;
  }
  function orbitA(dYaw, dPitch) {
    var y = +dYaw || 0, p = +dPitch || 0;
    if (!isFinite(y) || !isFinite(p) || !live()) return;
    O.uyaw += y; O.upitch = clampPitch(O.upitch + p); inputA();
  }
  function resetA() { if (!live()) return; O.uyaw = O.uyawS + wrapPi(-O.auto - O.uyawS); O.upitch = 0; O.uzoom = 0; O.vyaw = 0; inputA(); }
  function zoomB(k) {
    k = +k; if (!(k > 0) || !isFinite(k) || !live()) return false;
    var z0 = Bc.zoom; Bc.zoom = clamp(Bc.zoom + Math.log(k), B_ZOOM[0], B_ZOOM[1]); inputB();
    return Math.abs(Bc.zoom - z0) < 1e-5;
  }
  function orbitB(dYaw, dPitch) {
    var y = +dYaw || 0, p = +dPitch || 0;
    if (!isFinite(y) || !isFinite(p) || !live()) return;
    Bc.yaw += y; Bc.pitch = clamp(Bc.pitch + p, B_EL[0] - B_EL0, B_EL[1] - B_EL0); inputB();
  }
  function resetB() { if (!live()) return; var k = Bc.yaw - wrapPi(Bc.yaw); Bc.yaw -= k; Bc.yawS -= k; Bc.yaw = 0; Bc.pitch = 0; Bc.zoom = 0; Bc.vyaw = 0; inputB(); }
  function zoomCard(card, k) { return card === "model" ? zoomB(k) : zoomA(k); }
  function canCard(card) {
    if (T.phase !== "two") return false;
    return card === "model" ? (!!core.house && T.kB > 0.6) : (A.ready && O.env > 0.6 && T.alpha > 0.5);
  }

  /* engage (OrbitEngage kind "card") */
  var engCard = null, ENG = { last: 0, awayAt: 0, y0: 0, vis: { splat: 1, model: 1 } };
  function engage(card) {
    if (engCard === card) { ENG.last = nowS(); return; }
    if (!canCard(card)) return;
    var E = win.OrbitEngage;
    if (E && typeof E.claim === "function") {
      try { E.claim("card", "two-" + card, function () { if (engCard === card) { engCard = null; log("card released (engage)"); } }); } catch (e) { /* none */ }
    }
    engCard = card; ENG.last = nowS(); ENG.awayAt = 0; ENG.y0 = scrollYNow();
    log("card engaged", card);
  }
  function disengage(why) {
    if (!engCard) return;
    var id = "two-" + engCard;
    engCard = null;
    var E = win.OrbitEngage;
    if (E && typeof E.release === "function") { try { E.release(id); } catch (e) { /* none */ } }
    log("card released", why);
  }
  function engageTick(now, sy) {
    if (!engCard) return;
    var c = engCard;
    if (!canCard(c)) disengage("left");
    else if (now - ENG.last > 3) disengage("idle");
    else if (ENG.awayAt && now - ENG.awayAt > 0.4) disengage("away");
    else if (Math.abs(sy - ENG.y0) > 48) disengage("page scroll");
    else if (ENG.vis[c] < 0.5) disengage("hidden");
  }
  var visIO = null;
  function watchVis(card, el) {
    if (!("IntersectionObserver" in win)) return;
    if (!visIO) visIO = new IntersectionObserver(function (en) {
      en.forEach(function (e) { var k = e.target._orbitVisCard; if (k) ENG.vis[k] = e.intersectionRatio; });
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    el._orbitVisCard = card;
    visIO.observe(el);
  }
  function figOf(card) {
    var el = cardEls[card];
    return el ? (el.closest ? (el.closest("figure") || el) : el) : null;
  }
  // a press outside the engaged card's figure (the card + its caption with the buttons) releases it
  doc.addEventListener("pointerdown", function (e) {
    if (!engCard) return;
    var f = figOf(engCard);
    if (f && e.target && f.contains(e.target)) return;
    disengage("outside");
  }, { capture: true, passive: true });

  /* wheel (research/10 section 1): bursts with gaps < 160 ms keep the owner of their first event */
  var WH = { t: -1e9, card: null, owner: null, limitDir: 0 };
  function wheelK(e) { return clamp(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.06 : e.deltaMode === 2 ? 0.6 : 0.0025)), 0.6, 1.6); }
  function onCardWheel(e) {
    var card = e.currentTarget._orbitCard, t = performance.now();
    var fresh = t - WH.t >= 160 || WH.card !== card;
    WH.t = t;
    if (e.ctrlKey || e.metaKey) {
      // trackpad pinch / Ctrl + wheel: always the view (never the browser zoom over a card)
      e.preventDefault();
      if (fresh) { WH.card = card; WH.owner = "view"; WH.limitDir = 0; }
      if (live() && T.phase === "two") zoomCard(card, wheelK(e));
      return;
    }
    if (fresh) {
      WH.card = card;
      var eng = engCard === card && canCard(card), dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
      if (eng && WH.limitDir && dir === WH.limitDir) { disengage("limit"); WH.owner = "page"; WH.limitDir = 0; }
      else { WH.owner = eng ? "view" : "page"; if (eng) WH.limitDir = 0; }
    }
    if (WH.owner !== "view") return;
    e.preventDefault();
    if (zoomCard(card, wheelK(e))) WH.limitDir = e.deltaY > 0 ? 1 : -1;
  }
  function onGesture(e) {
    var el = e.currentTarget, card = el._orbitCard;
    e.preventDefault();
    if (e.type === "gesturestart") { el._orbitG = 1; return; }
    var k = (+e.scale || 1) / (el._orbitG || 1);
    el._orbitG = +e.scale || 1;
    if (card === "walk") walkZoom(k); else if (live() && T.phase === "two") zoomCard(card, k);
  }

  /* drags on one element (own listeners: the core only feeds the scene that owns the stage by name) */
  function bindDrag(el, h) {
    var ptrs = new Map(), g = null;
    function dist() { var a = []; ptrs.forEach(function (p) { a.push(p); }); return a.length < 2 ? 0 : Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
    function start() { if (g && !g.started) { g.started = true; if (h.start) h.start(g); } }
    el.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!g && !h.can()) return;
      if (e.pointerType === "mouse") e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!g) {
        var t = performance.now();
        g = { x0: e.clientX, y0: e.clientY, t0: t, lt: t, moved: false, started: false, pinch: 0, vx: 0, vy: 0, type: e.pointerType };
        if (h.down) h.down(g);
        g.hold = setTimeout(function () { if (g && !g.moved) start(); }, 180);
      }
      if (ptrs.size === 2) { g.pinch = dist(); g.moved = true; start(); }
      render();
    });
    el.addEventListener("pointermove", function (e) {
      if (!g || !ptrs.has(e.pointerId)) return;
      var p = ptrs.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      var t = performance.now(), dtm = Math.max(4, t - g.lt) / 1000; g.lt = t;
      if (ptrs.size >= 2) {
        var d = dist();
        if (g.pinch > 0 && d > 0 && h.pinch) h.pinch(d / g.pinch);
        g.pinch = d;
        return;
      }
      if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 6) { g.moved = true; start(); }
      if (!g.moved) return;
      g.vx = mix(g.vx, dx / dtm, 0.35); g.vy = mix(g.vy, dy / dtm, 0.35);
      if (h.move) h.move({ dx: dx, dy: dy, type: e.pointerType });
      render();
    });
    function end(e) {
      if (!g || !ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size) { g.pinch = 0; return; }
      var G = g; g = null;
      clearTimeout(G.hold);
      var stale = performance.now() - G.lt > 90; // finger stopped before lifting = no fling
      if (h.up) h.up({ vx: stale ? 0 : G.vx, vy: stale ? 0 : G.vy, moved: G.moved, started: G.started, type: e.pointerType });
      render();
    }
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);
  }
  function dragK(card) {
    var el = cardEls[card], w = el ? el.getBoundingClientRect().width : win.innerWidth;
    return 3.6 / Math.max(240, w);
  }
  function cardHandlers(card, el) {
    var M = card === "model" ? Bc : O;
    return {
      can: function () { return canCard(card); },
      down: function () {
        engage(card);
        M.drag = true; M.vyaw = 0;
        try { if (doc.activeElement !== el) el.focus({ preventScroll: true }); } catch (e) { /* old browser */ }
        if (card === "model") inputB(); else inputA();
      },
      move: function (p) {
        var k = dragK(card);
        if (card === "model") { Bc.yaw -= p.dx * k; Bc.pitch = clamp(Bc.pitch + p.dy * k * 0.7, B_EL[0] - B_EL0, B_EL[1] - B_EL0); inputB(); }
        else { O.uyaw -= p.dx * k; O.upitch = clampPitch(O.upitch + p.dy * k * 0.7); inputA(); }
      },
      up: function (p) { M.drag = false; if (!reduced && p.moved) M.vyaw = clamp(-(p.vx || 0) * dragK(card), -2.5, 2.5); },
      pinch: function (k) { if (k > 0) zoomCard(card, k); }
    };
  }
  function onCardKey(e) {
    var el = e.currentTarget, card = el._orbitCard;
    if (e.target !== el || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!canCard(card)) return;
    var k = e.key, st = e.shiftKey ? 0.32 : 0.16;
    if (k === "Enter" || k === " " || k === "Spacebar") engage(card);
    else if (k === "ArrowLeft" || k === "a" || k === "A") two.orbit(card, st, 0);
    else if (k === "ArrowRight" || k === "d" || k === "D") two.orbit(card, -st, 0);
    else if (k === "ArrowUp") two.orbit(card, 0, 0.08);
    else if (k === "ArrowDown") two.orbit(card, 0, -0.08);
    else if (k === "+" || k === "=" || k === "w" || k === "W") zoomCard(card, 1.14);
    else if (k === "-" || k === "_" || k === "s" || k === "S") zoomCard(card, 1 / 1.14);
    else if (k === "Home" || k === "0") two.reset(card);
    else return;
    e.preventDefault();
  }

  /* the walk: explore / resume (OrbitEngage kind "scene", id "walk") */
  function canWalk() { return (T.phase === "aerial-in" || T.phase === "patio") && T.alpha > 0.5 && W.env > 0.5; }
  function walkExplore() {
    if (W.on || !canWalk()) return W.on;
    W.on = true; W.y0 = scrollYNow();
    var E = win.OrbitEngage;
    if (E && typeof E.claim === "function") { try { E.claim("scene", "walk", function () { walkResume("engage", true); }); } catch (e) { /* none */ } }
    log("walk explore");
    evWalk.emit("explore", {});
    render();
    return true;
  }
  function walkResume(why, fromEngage) {
    if (!W.on) return;
    W.on = false;
    W.yaw = 0; W.pitch = 0; W.zoom = 0; W.vyaw = 0;
    if (reduced) { W.yawS = 0; W.pitchS = 0; W.zoomS = 0; }
    var E = win.OrbitEngage;
    if (!fromEngage && E && typeof E.release === "function") { try { E.release("walk"); } catch (e) { /* none */ } }
    log("walk resume", why);
    evWalk.emit("resume", { why: why });
    render();
  }
  function walkInput() { W.y0 = scrollYNow(); render(); }
  function walkLook(dYaw, dPitch) {
    var y = +dYaw || 0, p = +dPitch || 0;
    if (!isFinite(y) || !isFinite(p) || !walkExplore()) return;
    W.yaw = clamp(W.yaw + y, -W_YAW, W_YAW); W.pitch = clamp(W.pitch + p, -W_PITCH, W_PITCH);
    walkInput();
  }
  function walkZoom(k) {
    k = +k; if (!(k > 0) || !isFinite(k) || !walkExplore()) return;
    W.zoom = clamp(W.zoom + Math.log(k), W_ZOOM[0], W_ZOOM[1]);
    walkInput();
  }
  function walkK() { return (isPhone ? 1.6 : 1.4) / Math.max(320, win.innerWidth); }
  var WALK_H = {
    can: function () { return canWalk(); },
    down: function () { W.drag = true; W.vyaw = 0; },
    start: function () { walkExplore(); },
    move: function (p) {
      if (!W.on) return;
      var k = walkK();
      W.yaw = clamp(W.yaw + p.dx * k, -W_YAW, W_YAW);
      W.pitch = clamp(W.pitch + p.dy * k * 0.8, -W_PITCH, W_PITCH);
      walkInput();
    },
    up: function (p) { W.drag = false; if (W.on && !reduced && p.moved) W.vyaw = clamp((p.vx || 0) * walkK(), -1.5, 1.5); },
    pinch: function (k) { walkZoom(k); }
  };
  function onWalkKey(e) {
    var el = e.currentTarget;
    if (e.target !== el || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!canWalk()) return;
    var k = e.key, st = e.shiftKey ? 0.32 : 0.16;
    if (k === "ArrowLeft") walkLook(st, 0);
    else if (k === "ArrowRight") walkLook(-st, 0);
    else if (k === "ArrowUp") walkLook(0, 0.08);
    else if (k === "ArrowDown") walkLook(0, -0.08);
    else if (k === "+" || k === "=") walkZoom(1.12);
    else if (k === "-" || k === "_") walkZoom(1 / 1.12);
    else if (k === "Home" || k === "0") { if (W.on) walk.reset(); }
    else if (k === "Enter") walkExplore();
    else return;   // Space / PageDown / PageUp scroll the page (and so end the explore)
    e.preventDefault();
  }
  function onWalkWheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return;   // a plain wheel is the page (and the "continue" gesture)
    e.preventDefault();
    if (canWalk()) walkZoom(wheelK(e));
  }
  if (win.visualViewport) win.visualViewport.addEventListener("resize", function () { W.vvAt = nowS(); });

  function hookHits() {
    ["splat", "model"].forEach(function (card) {
      Array.prototype.forEach.call(doc.querySelectorAll('.stage-hit[data-hit="two-' + card + '"]'), function (el) {
        if (el._orbitTwo) return;
        el._orbitTwo = true; el._orbitCard = card;
        bindDrag(el, cardHandlers(card, el));
        el.addEventListener("keydown", onCardKey);
        el.addEventListener("wheel", onCardWheel, { passive: false });
        el.addEventListener("gesturestart", onGesture, { passive: false });
        el.addEventListener("gesturechange", onGesture, { passive: false });
        var f = el.closest ? (el.closest("figure") || el.closest("[data-card]") || el) : el;
        f.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse" && engCard === card) ENG.awayAt = nowS(); });
        f.addEventListener("pointerenter", function () { if (engCard === card) ENG.awayAt = 0; });
      });
    });
    Array.prototype.forEach.call(doc.querySelectorAll('.stage-hit[data-hit="walk"]'), function (el) {
      if (el._orbitWalk) return;
      el._orbitWalk = true; el._orbitCard = "walk";
      bindDrag(el, WALK_H);
      el.addEventListener("keydown", onWalkKey);
      el.addEventListener("wheel", onWalkWheel, { passive: false });
      el.addEventListener("gesturestart", onGesture, { passive: false });
      el.addEventListener("gesturechange", onGesture, { passive: false });
    });
    findCards();
  }

  /* ---------- scenes ---------- */
  function scene() { return { update: function (st, dt, now) { return drive(dt, now); }, interactive: function () { return false; }, off: offAll }; }
  ["aerial", "two", "aerial-in", "patio"].forEach(function (id) { core.scene(id, scene()); });

  /* a streamed scan stays warm (enabled, invisible, coarse) while one of its beats is within ~0.6 screens,
     so scrolling back into a scene never starts from an empty frame */
  var WARM = { aerial: ["aerial", "two", "aerial-in"], house: ["aerial-in", "patio"] }, warmVis = { aerial: 0, house: 0 }, warmIO = null, warmSeen = [];
  function warmApply() {
    var f = typeof framePaused === "function" && framePaused();
    if (A.splat && A.splat.h) A.splat.h.warm(!f && warmVis.aerial > 0);
    if (P.splat && P.splat.h) P.splat.h.warm(!f && warmVis.house > 0);
  }
  function warmWatch() {
    if (!("IntersectionObserver" in win)) { warmVis.aerial = warmVis.house = 1; warmApply(); return; }
    if (!warmIO) warmIO = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        var id = e.target.getAttribute("data-stage"), was = !!e.target._orbitWarm;
        if (was === e.isIntersecting) return;
        e.target._orbitWarm = e.isIntersecting;
        for (var g in WARM) if (WARM[g].indexOf(id) >= 0) warmVis[g] += e.isIntersecting ? 1 : -1;
      });
      warmApply();
    }, { rootMargin: "60% 0px 60% 0px" });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-stage="aerial"],[data-stage="two"],[data-stage="aerial-in"],[data-stage="patio"]'), function (el) {
      if (warmSeen.indexOf(el) >= 0) return;
      warmSeen.push(el); warmIO.observe(el);
    });
  }
  warmWatch();
  doc.addEventListener("orbit:feed", warmWatch);
  if (doc.readyState !== "complete") win.addEventListener("load", function () { collect(); }, { once: true });
  collect();

  // test hook: OrbitStage.aerial._debug() -> state numbers
  aerial._debug = function () {
    var cc = core.camera && core.camera.camera;
    return { s: T.s, phase: T.phase, alpha: T.alpha, oA: T.oA, oP: T.oP, kB: T.kB, tA: T.tA, outU: TW.outU,
      fit: FIT.init ? { d: FIT.d, sx: FIT.sx, sy: FIT.sy } : null,
      streams: { aerial: A.splat && A.splat.h ? A.splat.h.info() : (A.ready ? "pack" : null), house: P.splat && P.splat.h ? P.splat.h.info() : (P.ready ? "pack" : null) },
      aerial: A.ready ? { frame: A.frame, verified: A.verified, joined: A.joined } : (A.missing ? "missing" : "loading"),
      patio: P.ready ? "ready" : (P.missing ? "missing" : "loading"), house: !!core.house,
      orbit: { env: O.env, auto: O.auto, yaw: O.uyaw, pitch: O.upitch, zoom: O.uzoom },
      model: { auto: Bc.auto, yaw: Bc.yaw, pitch: Bc.pitch, zoom: Bc.zoom, cam: !!(camB && camB.enabled), view: Bc.view },
      walk: { on: W.on, env: W.env, yaw: W.yaw, yawS: W.yawS, pitch: W.pitch, zoom: W.zoom },
      engaged: engCard, base: base, space: spaceCam(), view: T.view,
      scissor: cc ? [cc.scissorRect.x, cc.scissorRect.y, cc.scissorRect.z, cc.scissorRect.w].map(function (x) { return Math.round(x * 1000) / 1000; }) : null };
  };
  log("scenes registered");
})();
