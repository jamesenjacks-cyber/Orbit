/* Orbit 3D - stage scene "stack" (31 Oct 2026, James): the whole three-floor house in the "We're Orbit 3D."
   frame of the scan act, taken apart by the scroll and then turned into points that fly into the house's own
   scan points, where js/space.js takes over (the existing house -> building change of "One space.").

   The beat [data-stage="stack"] of #scan (src/sections/03-scan.html) runs from the hero's end to the end of
   the gather beat. Moments in screens of the section's scroll (U below; the screen centre, from the section top):
     to 0.3     the whole house, as it stands, words at the top ("We're Orbit 3D.")
     0.3-2.9    it comes apart on all sides at once (floors, walls and furniture together, each piece a little
                after the one before, slow heavy easing) while the camera goes once round the house
     2.9-3.35   the solid house crumbles into points, piece by piece (the same surfaces, the same spots)
     3.35-5.0   while "One space." rolls in, the points fly straight into EVERY point of the outdoor scan (the
                condense formation, not the house-only points), and the camera moves onto OrbitSpace.camera()
     5.0-5.35   the space engine's points fade in exactly under ours, ours fade out; the aerial reveal follows
   Scrolling back up plays it all backwards. Drag (.stage-hit[data-hit="stack"], the who__subject box) turns
   the house at any moment before the points fly; arrow keys too while it has focus; pinch zooms.
   Data: assets/stage/stack.js (tools/pack_stack.py): stack/house.glb (every piece its own node, glTF extras
   {part, floor}; Draco geometry, decoder in vendor/), stack/points.bin + points.json (the house as coloured
   points, each tagged with its piece). Targets: all of ORBIT_POINTS.exterior (the points of "One space.").
   Model frame = this scene's world (root at identity). */
(function () {
  "use strict";
  var win = window, doc = document;
  var S = win.OrbitStage = win.OrbitStage || {}, core = S._core;
  var sec = doc.querySelector(".sec--scan"), beat = sec && sec.querySelector('[data-stage="stack"]');
  if (!core || !sec || !beat) return;
  var SCRIPT = doc.currentScript && doc.currentScript.src, BASE = SCRIPT ? new URL("../", SCRIPT).href : "";
  var boxEl = sec.querySelector(".who__subject"), textEl = sec.querySelector(".who__text");
  var chip = sec.querySelector('[data-chip="stack"]'), chipShown = false, used = false;

  // (30 Oct evening, James) the moments, in screens (vh) of the section's own scroll: where the screen centre is,
  // counted from the section top (the stack beat starts --scan-lead above it). The house comes apart while
  // "We're Orbit 3D." shows; the points fly while "One space." rolls in (the gather beat, 5.4-7.4).
  // (30 Oct late, James: the spin was too fast) coming apart takes 2 screens more, the rest moved down with it
  // (30 Oct night, James: straight from "One space." to the two cards) the flight is shorter: gather is 5.4-6.5
  // (30 Oct, James: transitions smooth) the hand-over ends by 6.2, before the beat's end (6.35) gives the stage
  // to the aerial scene, so the flight is always complete when the cards' part takes over
  // (3 Nov, James: smoother) the flight takes 1.0 screen instead of 0.6 (stack beat 620 -> 660vh)
  var U = { hold: 0.3, apart: 4.9, dots: 5.35, fly: 6.35, out: 6.6 };
  var SWAP = [6.22, 6.5];   // (3 Nov 2026) where the space points take over from ours (see the end of update)
  var SWAP_LV = 0.8;        // their brightness at the hand-over (matches ours); stage-aerial.js REVEAL_LV the same
  // everything at once, on all sides: floors, walls and furniture all start together (each piece a little
  // later than the one before, so it still reads as heavy objects), and the camera goes once round the house
  // (3 Nov 2026, James) ONE fixed angle, the one of his screenshot (the blue living room on the left, the three-floor
  // part on the right): no turn while it comes apart (spin 0) and nothing to drag; it only explodes with the scroll
  var O = { gap: 4.6, wallOut: 2.3, rise: 2.6, out: 0.35, spin: 0, front: 28, yaw0: 112 };   // front: degrees the camera looks down at the start / end
  // (30 Oct night, James's screenshot) start and end at a three-quarter view from above: yaw0 = degrees turned
  // from the front (floor 3 back left, the ground floor reaching out to the front right). Try others: ?stackview=yaw,pitch
  (function () { var m = /[?&]stackview=(-?[\d.]+),(-?[\d.]+)/.exec(location.search); if (m) { O.yaw0 = +m[1]; O.front = +m[2]; } })();

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function mix(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function ease(x) { x = clamp(x, 0, 1); return x < 0.5 ? 16 * Math.pow(x, 5) : 1 - Math.pow(-2 * x + 2, 5) / 2; }
  // (30 Oct, James: one turn, exploding bit by bit with it) a piece moves on the same gentle curve as the turn,
  // a little later than the one before, and every piece is fully out when the turn is complete
  function piece(t, order) { var x = clamp((t - 0.22 * order) / 0.78, 0, 1); return x * x * (3 - 2 * x); }
  // the shared progress of the turn and the explosion: even in the middle, soft at both ends
  function even(t) { t = clamp(t, 0, 1); return 0.5 * t + 0.5 * t * t * (3 - 2 * t); }
  function follow(cur, to, tau, dt) { return tau <= 0 ? to : cur + (to - cur) * (1 - Math.exp(-dt / tau)); }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function lerp3(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }

  var st8 = "idle", root = null, items = [], floors = {}, pts = null, mat = null, uNow = 0, user = { yaw: 0, pitch: 0, zoom: 1 };
  var cam = null, dirNow = null, aimC = null, seenAt = 0, readyAt = 0;
  var APPEAR = 0.7;   // seconds: a house that arrives while on screen builds up piece by piece over this time
  // (3 Nov 2026, James: slow internet) the still picture of the house in the box (src/sections/03-scan.html)
  var posterEl = boxEl && boxEl.querySelector(".who__poster"), posterLv = posterEl ? 1 : 0;
  function setPoster(v) {
    v = Math.round(clamp(v, 0, 1) * 1000) / 1000;
    if (!boxEl || !posterEl || v === posterLv) return;
    posterLv = v;
    boxEl.style.setProperty("--poster", String(v));
  }

  /* ---------- (3 Nov 2026, James: "too slow on slow internet") which house to load ----------
     A speed check that costs nothing: the browser already timed every file the hero downloaded (Resource
     Timing). Bytes / time of the biggest real downloads = this visitor's speed. Fast = the full house
     (assets/stage/stack.js, 10.7 MB); slow = the light house (stack-lite.js, 6.2 MB: smaller pictures,
     simpler furniture, same pieces). The still picture (.who__poster) shows in both cases until the 3D is in.
     Try: ?stacknet=full | lite. */
  var FAST_MBIT = 15;   // the full house in about 5 s or less (the measure reads a bit low: 40 Mbit -> ~22)
  // Files download side by side, so one file's own speed is only a share of the line. Instead: all bytes that
  // came over the network / the time the line was busy (the overlapping download times joined together).
  function speedMbit() {
    var spans = [], bytes = 0, big = false;
    try {
      (performance.getEntriesByType("resource") || []).forEach(function (r) {
        var b = r.transferSize || 0;
        if (b < 20000 || !(r.responseEnd > r.responseStart)) return;   // cached or tiny: says nothing
        if (b > 150000) big = true;
        bytes += b; spans.push([r.responseStart, r.responseEnd]);
      });
    } catch (e) { return null; }
    if (!big || bytes < 400000) return null;   // too little to judge
    spans.sort(function (a, b) { return a[0] - b[0]; });
    var busy = 0, s = spans[0][0], e = spans[0][1];
    for (var i = 1; i < spans.length; i++) {
      if (spans[i][0] > e) { busy += e - s; s = spans[i][0]; e = spans[i][1]; } else if (spans[i][1] > e) e = spans[i][1];
    }
    busy += e - s;
    return bytes * 8 / Math.max(busy, 20) / 1000;
  }
  function pickPack() {
    var m = /[?&]stacknet=(full|lite)/.exec(location.search);
    if (m) return { pack: m[1] === "lite" ? "stack-lite" : "stack", why: "url" };
    if (core.slowNet) return { pack: "stack-lite", why: "slow network / data saver" };
    var mbit = speedMbit(), conn = navigator.connection;
    // nothing big enough to time (cached, or so fast it took no time): Chrome's own guess, which tops out at 10,
    // so 8 or more counts as fast; no guess either = fast
    if (mbit == null && conn && conn.downlink) return { pack: conn.downlink >= 8 ? "stack" : "stack-lite", why: "browser guess", mbit: conn.downlink };
    // (4 Nov 2026) Safari (all iPhones) has no navigator.connection: a phone with nothing to judge by takes the
    // light house (made for phone screens, looks the same there); a computer the full one
    if (mbit == null) return { pack: core.isPhone ? "stack-lite" : "stack", why: "no measure", mbit: null };
    return { pack: mbit >= FAST_MBIT ? "stack" : "stack-lite", why: "measured", mbit: Math.round(mbit * 10) / 10 };
  }
  var choice = null;

  /* ---------- load (once the engine runs and the act is near) ---------- */
  function load() {
    if (st8 !== "idle") return;
    st8 = "loading";
    var pc = core.pc;
    choice = pickPack();
    if (pc.dracoInitialize) pc.dracoInitialize({ jsUrl: BASE + "vendor/draco_wasm_wrapper.js", wasmUrl: BASE + "vendor/draco_decoder.wasm", numWorkers: 1, lazyInit: true });
    core.need(choice.pack).then(function () {
      return core.loadGlb("stack/house.glb", "stack-house");
    }).then(function (asset) {
      build(asset.resource.instantiateRenderEntity(), core.glbJson("stack/house.glb"));
      // (3 Nov) the background points now load after the hero scan; build ours once they are in
      if (win.ORBIT_POINTS && win.ORBIT_POINTS.exterior) buildPoints();
      else if (win.OrbitPointsReady) win.OrbitPointsReady.then(function () { try { buildPoints(); core.render(); } catch (e) { console.warn("[stack] points:", e && e.message); } });
      if (core.prewarm) core.prewarm(root);
      // (30 Oct late night, James saw the stacked house over #floor) when the download ends after the visitor
      // has scrolled on, off() already ran before the house existed: keep it hidden until this scene has the stage
      if (!core.owner || core.owner() !== "stack") root.enabled = false;
      st8 = "ready";
      readyAt = performance.now();
      if (core.laneDone) core.laneDone("stack");
      core.render();
    }).catch(function (e) {
      st8 = "failed";
      if (core.laneDone) core.laneDone("stack");
      console.warn("[stack] off:", e && e.message);
    });
  }

  function worldBox(e) {
    var pc = core.pc, box = null;
    e.findComponents("render").forEach(function (r) {
      r.meshInstances.forEach(function (mi) { if (!box) { box = new pc.BoundingBox(); box.copy(mi.aabb); } else box.add(mi.aabb); });
    });
    return box;
  }

  function build(ent, gl) {
    var pc = core.pc, extras = {};
    ((gl && gl.nodes) || []).forEach(function (n) { if (n.name) extras[n.name] = n.extras || {}; });
    root = new pc.Entity("stack");
    root.addChild(ent);
    root.enabled = false;
    core.app.root.addChild(root);
    root.enabled = true; root.syncHierarchy();
    // the baked light lives in the emissive pictures (black base colour): show those unlit, like Orbit
    ent.findComponents("render").forEach(function (r) {
      r.meshInstances.forEach(function (mi) {
        var m = mi.material;
        if (m && m.emissiveMap && m.useLighting !== false) { m.useLighting = false; m.useSkybox = false; m.useFog = false; m.update(); }
      });
    });
    [1, 2, 3].forEach(function (f) {
      var fe = ent.findByName("Floor " + f);
      if (!fe) return;
      var fl = { items: [] }, walls = {}, rooms = {};
      fe.children.slice().forEach(function (e) {
        var x = extras[e.name] || {}, b = worldBox(e);
        if (!b || x.part === "hidden" || x.part === "floor-root") return;
        var p = e.getPosition();
        var it = { e: e, f: f, part: x.part || "builtin", pos: [p.x, p.y, p.z], c: [b.center.x, b.center.y, b.center.z],
          h: [b.halfExtents.x, b.halfExtents.y, b.halfExtents.z], dir: [0, 0, 0], dist: 0, order: 0, now: null, off: [0, 0, 0],
          rnd: 0.04 + 0.96 * (((items.length * 0.6180339887) % 1)) };
        items.push(it); fl.items.push(it);
        if (it.part === "wall" || it.part === "builtin") {
          var key = e.name.replace(/\.\d+$/, "").replace(/_\d+_\d+$/, "");
          (walls[key] = walls[key] || []).push(it);
        } else if (it.part === "furniture") {
          var room = e.name.replace(/^F\d /, "").split("__")[0];
          (rooms[room] = rooms[room] || []).push(it);
        }
      });
      var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      fl.items.forEach(function (it) { for (var q = 0; q < 3; q++) { lo[q] = Math.min(lo[q], it.c[q] - it.h[q]); hi[q] = Math.max(hi[q], it.c[q] + it.h[q]); } });
      var fc = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
      Object.keys(walls).forEach(function (k) {
        var segs = walls[k], gl0 = [1e9, 1e9, 1e9], gh = [-1e9, -1e9, -1e9];
        segs.forEach(function (it) { for (var q = 0; q < 3; q++) { gl0[q] = Math.min(gl0[q], it.c[q] - it.h[q]); gh[q] = Math.max(gh[q], it.c[q] + it.h[q]); } });
        var vx = (gl0[0] + gh[0]) / 2 - fc[0], vz = (gl0[2] + gh[2]) / 2 - fc[2], d = Math.hypot(vx, vz);
        var order = (Math.atan2(-vz, vx) + Math.PI) / (2 * Math.PI);
        segs.forEach(function (it) { it.dir = d > 1e-3 ? [vx / d, 0, vz / d] : [1, 0, 0]; it.dist = d; it.order = order; });
      });
      Object.keys(rooms).forEach(function (k) {
        var ps = rooms[k], rc = [0, 0, 0];
        ps.forEach(function (it) { rc[0] += it.c[0]; rc[2] += it.c[2]; });
        rc[0] /= ps.length; rc[2] /= ps.length;
        ps.sort(function (a, b) { return (a.c[1] - b.c[1]) || (a.c[0] - b.c[0]); });
        ps.forEach(function (it, n) {
          var vx = it.c[0] - rc[0], vz = it.c[2] - rc[2], d = Math.hypot(vx, vz);
          it.dir = d > 1e-3 ? [vx / d, 0, vz / d] : [0, 0, 0]; it.dist = d; it.order = n / Math.max(1, ps.length - 1);
        });
      });
      floors[f] = fl;
    });
  }

  // where every piece is at explosion moment t (0..1): an offset in metres (pieces only move, never turn)
  function offsets(t) {
    var p0 = t, fOff = { 1: 0, 2: O.gap * p0, 3: 2 * O.gap * p0 };
    items.forEach(function (it) {
      var o = it.off, p;
      o[0] = 0; o[1] = fOff[it.f]; o[2] = 0;
      if (it.part === "wall" || it.part === "builtin") {
        p = piece(t, it.order);
        // (30 Oct night, James: one wall flew off on its own) the far end wall of the long ground floor went
        // ~1 m further out than the rest; the extra for distance is capped so every wall stays with its floor
        var k = (O.wallOut + 0.12 * Math.min(it.dist, 2.5)) * p;
        o[0] += it.dir[0] * k; o[2] += it.dir[2] * k;
      } else if (it.part === "furniture") {
        p = piece(t, 0.3 + 0.7 * it.order);
        o[1] += (O.rise + 0.5 * it.order) * p;
        var k2 = O.out * (0.5 + it.dist) * p;
        o[0] += it.dir[0] * k2; o[2] += it.dir[2] * k2;
      }
    });
  }
  function placePieces() {
    items.forEach(function (it) {
      it.e.setPosition(it.pos[0] + it.off[0], it.pos[1] + it.off[1], it.pos[2] + it.off[2]);
      it.now = [it.c[0] + it.off[0], it.c[1] + it.off[1], it.c[2] + it.off[2]];
    });
  }

  // the order of n points (xyz in p) along a 3D Morton curve inside their own bounding box
  function order(p, n) {
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], i, a;
    for (i = 0; i < n; i++) for (a = 0; a < 3; a++) { var v = p[i * 3 + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
    function spread(x) { x &= 1023; x = (x | (x << 16)) & 0x30000ff; x = (x | (x << 8)) & 0x300f00f; x = (x | (x << 4)) & 0x30c30c3; return (x | (x << 2)) & 0x9249249; }
    // key * 2^21 + index in one float64 (exact up to 2^53): a plain numeric typed-array sort, no comparator
    var kv = new Float64Array(n), out = new Uint32Array(n), k = [0, 0, 0];
    for (i = 0; i < n; i++) {
      for (a = 0; a < 3; a++) k[a] = Math.min(1023, Math.floor((p[i * 3 + a] - lo[a]) / Math.max(1e-6, hi[a] - lo[a]) * 1024));
      kv[i] = ((spread(k[0]) | (spread(k[1]) << 1) | (spread(k[2]) << 2)) >>> 0) * 2097152 + i;
    }
    kv.sort();
    for (i = 0; i < n; i++) out[i] = kv[i] % 2097152;
    return out;
  }

  /* ---------- the points: the house (exploded) -> the house's scan points ---------- */
  function buildPoints() {
    var pc = core.pc, P = win.ORBIT_POINTS && win.ORBIT_POINTS.exterior, AP = win.ORBIT_FILM && win.ORBIT_FILM.poses && win.ORBIT_FILM.poses.aerial;
    var raw = core.bytes("stack/points.bin"), meta = JSON.parse(new TextDecoder().decode(core.bytes("stack/points.json")));
    if (!raw || !P || !P.b64 || !AP) return;
    // targets: EVERY point of the outdoor scan (model metres), the condense formation space.js shows for
    // "One space." (James: straight to the whole outdoor scene, not to the house-only points first)
    var bin = atob(P.b64), n = Math.min(P.count, Math.floor(bin.length / 10)), ex = P.extent, C = P.frame.center;
    var u8 = new Uint8Array(n * 10);
    for (var i = 0; i < u8.length; i++) u8[i] = bin.charCodeAt(i);
    var dv = new DataView(u8.buffer), tgt = [], tc = [];
    for (i = 0; i < n; i++) {
      var o = i * 10;
      tgt.push(dv.getInt16(o, true) / 32767 * ex[0] + C[0], dv.getInt16(o + 2, true) / 32767 * ex[1] + C[1], dv.getInt16(o + 4, true) / 32767 * ex[2] + C[2]);
      tc.push(u8[o + 6], u8[o + 7], u8[o + 8], Math.round(255 * (0.55 + 0.45 * u8[o + 9] / 255)));
    }
    var N = tgt.length / 3;
    // the sources: the house points; each target gets one (shuffled), moved by its piece's final offset
    offsets(1);
    var byName = {}; items.forEach(function (it) { byName[it.e.name] = it; });
    var sdv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), SN = meta.count, stride = meta.stride || 18;
    var perm = new Uint32Array(SN); for (i = 0; i < SN; i++) perm[i] = i;
    var seed = 83; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (i = SN - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t0 = perm[i]; perm[i] = perm[j]; perm[j] = t0; }
    var sP = new Float32Array(N * 3), sC = new Uint8Array(N * 4);
    for (i = 0; i < N; i++) {
      var s = perm[i % SN], so = s * stride, it = byName[meta.pieces[sdv.getUint16(so + 16, true)]], off = it ? it.off : [0, 0, 0], jit = i >= SN ? 0.03 : 0;
      sP[i * 3] = sdv.getFloat32(so, true) + off[0] + (rnd() - 0.5) * jit;
      sP[i * 3 + 1] = sdv.getFloat32(so + 4, true) + off[1];
      sP[i * 3 + 2] = sdv.getFloat32(so + 8, true) + off[2] + (rnd() - 0.5) * jit;
      sC[i * 4] = raw[so + 12]; sC[i * 4 + 1] = raw[so + 13]; sC[i * 4 + 2] = raw[so + 14]; sC[i * 4 + 3] = 255;
    }
    // (3 Nov, James: smoother) pair by place, not at random: both sets are ordered along the same space-filling
    // curve (each in its own box), so a point from the left end of the house lands at the left end of the
    // building. Half way the points form a stretched house, not a grey cloud over the whole screen.
    var sI = order(sP, N), tI = order(tgt, N);
    var aS = new Float32Array(N * 3), aE = new Float32Array(N * 3), c0 = new Uint8Array(N * 4), c1 = new Uint8Array(N * 4), aR = new Float32Array(N);
    for (i = 0; i < N; i++) {
      var a = sI[i], b = tI[i];
      aS[i * 3] = sP[a * 3]; aS[i * 3 + 1] = sP[a * 3 + 1]; aS[i * 3 + 2] = sP[a * 3 + 2];
      aE[i * 3] = tgt[b * 3]; aE[i * 3 + 1] = tgt[b * 3 + 1]; aE[i * 3 + 2] = tgt[b * 3 + 2];
      for (var q = 0; q < 4; q++) { c0[i * 4 + q] = sC[a * 4 + q]; c1[i * 4 + q] = tc[b * 4 + q]; }
      aR[i] = rnd();
    }
    var dev = core.device, mesh = new pc.Mesh(dev);
    mesh.setVertexStream(pc.SEMANTIC_POSITION, aS, 3);
    mesh.setVertexStream(pc.SEMANTIC_ATTR10, aE, 3);
    mesh.setVertexStream(pc.SEMANTIC_COLOR, c0, 4, N, pc.TYPE_UINT8, true);
    mesh.setVertexStream(pc.SEMANTIC_ATTR11, c1, 4, N, pc.TYPE_UINT8, true);
    mesh.setVertexStream(pc.SEMANTIC_ATTR12, aR, 1);
    mesh.update(pc.PRIMITIVE_POINTS);
    mesh.aabb = new pc.BoundingBox(new pc.Vec3(AP.target[0], 8, AP.target[2]), new pc.Vec3(60, 40, 60));
    mat = new pc.ShaderMaterial({
      uniqueName: "OrbitStackPoints",
      attributes: { aStart: pc.SEMANTIC_POSITION, aEnd: pc.SEMANTIC_ATTR10, aCol0: pc.SEMANTIC_COLOR, aCol1: pc.SEMANTIC_ATTR11, aSeed: pc.SEMANTIC_ATTR12 },
      vertexGLSL: [
        "attribute vec3 aStart; attribute vec3 aEnd; attribute vec4 aCol0; attribute vec4 aCol1; attribute float aSeed;",
        "uniform mat4 matrix_viewProjection; uniform float uFly, uPix, uSize, uTime;",
        "varying vec4 vCol;",
        "void main(void) {",
        // every point leaves on its own slightly later time; it arcs up and swirls a little on the way
        // (3 Nov) start times closer together (0.4 -> 0.22): the points fly as one group, not a fog over the screen
        "  float k = clamp((uFly - aSeed * 0.22) / 0.78, 0.0, 1.0); k = k * k * (3.0 - 2.0 * k);",
        "  vec3 p = mix(aStart, aEnd, k);",
        "  float arc = sin(3.14159 * k);",
        "  p.y += arc * (0.6 + 1.4 * aSeed);",
        "  p.x += sin(aSeed * 40.0 + k * 6.0) * arc * 0.45; p.z += cos(aSeed * 31.0 + k * 5.0) * arc * 0.45;",
        "  gl_Position = matrix_viewProjection * vec4(p, 1.0);",
        "  gl_PointSize = clamp(uSize * uPix / max(gl_Position.w, 0.01), 1.5, 9.0);",
        "  vCol = mix(aCol0, aCol1, k);",
        "}"].join("\n"),
      fragmentGLSL: [
        "varying vec4 vCol; uniform float uAlpha;",
        "void main(void) {",
        "  vec2 d = gl_PointCoord - 0.5; float r = dot(d, d);",
        "  if (r > 0.25) discard;",
        "  float a = vCol.a * uAlpha * (1.0 - smoothstep(0.1, 0.25, r));",
        "  gl_FragColor = vec4(vCol.rgb * a, a);",
        "}"].join("\n")
    });
    mat.blendType = pc.BLEND_PREMULTIPLIED;
    mat.depthWrite = false;
    mat.cull = pc.CULLFACE_NONE;
    mat.update();
    var mi = new pc.MeshInstance(mesh, mat);
    mi.cull = false;
    pts = new pc.Entity("stack-points");
    pts.addComponent("render", { meshInstances: [mi], castShadows: false, receiveShadows: false });
    pts.enabled = false;
    core.app.root.addChild(pts);
    pts.N = N;
  }

  /* ---------- the frame box (where the house sits on screen) ---------- */
  function frameBox() {
    // (30 Oct evening) the who__subject box = all the room under the words, full width. (30 Oct late, James)
    // the whole box, not only its part on screen: the house keeps one size and slides up with the words.
    var vw = win.innerWidth || 1, vh = win.innerHeight || 1, b = boxEl ? boxEl.getBoundingClientRect() : null, room = 1, r;
    if (b && b.width > 8) {
      var top = Math.max(b.top, textEl ? textEl.getBoundingClientRect().bottom + 8 : b.top), bot = Math.max(b.bottom, top + vh * 0.2);
      r = { left: b.left, width: b.width, top: top, height: bot - top };
    } else r = { left: vw * 0.05, width: vw * 0.9, top: vh * 0.35, height: vh * 0.6 };
    return { cx: (r.left + r.width / 2) / vw * 2 - 1, cy: 1 - (r.top + r.height / 2) / vh * 2, fw: r.width / vw, fh: r.height / vh, room: room };
  }

  // the camera that fits the pieces (now) into the box, looking along dir
  function fitView(dir, box, fov, aspect) {
    var up0 = [0, 1, 0];
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    items.forEach(function (it) { for (var q = 0; q < 3; q++) { lo[q] = Math.min(lo[q], it.now[q] - it.h[q]); hi[q] = Math.max(hi[q], it.now[q] + it.h[q]); } });
    var c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], tv = Math.tan(fov / 2) * box.fh * 0.92, th = Math.tan(fov / 2) * aspect * box.fw * 0.92, D = 0;
    // (30 Oct night, James: the zoom in and out while it turns made him dizzy) the distance is the one that fits
    // the house from EVERY side at this height, not only from the current one, so turning never changes its size
    var cs = [];
    items.forEach(function (it) {
      for (var i = 0; i < 8; i++) cs.push([it.now[0] + (i & 1 ? it.h[0] : -it.h[0]) - c[0], it.now[1] + (i & 2 ? it.h[1] : -it.h[1]) - c[1], it.now[2] + (i & 4 ? it.h[2] : -it.h[2]) - c[2]]);
    });
    // (3 Nov 2026) no turn any more: only the one view direction has to fit (the house can be bigger)
    for (var a = 0; a < (O.spin ? 24 : 1); a++) {
      var ca = Math.cos(a * Math.PI / 12), sa = Math.sin(a * Math.PI / 12);
      var d2 = [dir[0] * ca + dir[2] * sa, dir[1], -dir[0] * sa + dir[2] * ca], r2 = norm(cross(d2, up0)), u2 = cross(r2, d2);
      for (var j = 0; j < cs.length; j++) {
        var r = cs[j], x = dot(r, r2), y = dot(r, u2), z = dot(r, d2);
        D = Math.max(D, Math.abs(x) / th - z, Math.abs(y) / tv - z);
      }
    }
    D *= user.zoom;
    return { eye: [c[0] - dir[0] * D, c[1] - dir[1] * D, c[2] - dir[2] * D], target: c, fov: fov, shift: [-box.cx, -box.cy], D: D };
  }

  var frontD = null;
  function baseDir() {
    // (30 Oct night, James: "just 1 full rotation") one fixed direction: the space engine's own slow sway no
    // longer adds to the turn, so the house goes round exactly once and then holds still until the points fly
    // (30 Oct late night, James) the turn starts and ends straight at the front: looking along the house's long
    // side from the end where the ground floor reaches out (floor 1 past floor 3), a little from above
    if (frontD) return frontD;
    var c1 = [0, 0], c3 = [0, 0];
    (floors[1] || { items: [] }).items.forEach(function (it) { c1[0] += it.c[0]; c1[1] += it.c[2]; });
    (floors[3] || { items: [] }).items.forEach(function (it) { c3[0] += it.c[0]; c3[1] += it.c[2]; });
    var n1 = Math.max(1, (floors[1] || { items: [] }).items.length), n3 = Math.max(1, (floors[3] || { items: [] }).items.length);
    var hx = c3[0] / n3 - c1[0] / n1, hz = c3[1] / n3 - c1[1] / n1, h = Math.hypot(hx, hz), el = O.front * Math.PI / 180;
    if (h < 1e-3) { var AP = win.ORBIT_FILM.poses.aerial; return norm([AP.target[0] - AP.eye[0], AP.target[1] - AP.eye[1], AP.target[2] - AP.eye[2]]); }
    frontD = [hx / h * Math.cos(el), -Math.sin(el), hz / h * Math.cos(el)];
    return frontD;
  }
  // where the flight ends: the aerial pose (the space engine's own end of "One space."), with its lens and shift
  function aimView(sc) {
    var AP = win.ORBIT_FILM.poses.aerial;
    if (!AP) return null;
    var fov = sc && sc.valid ? sc.fov : (AP.fov || 34) * Math.PI / 180;
    return { eye: AP.eye.slice(), target: AP.target.slice(), fov: fov, shift: sc && sc.valid ? sc.shift.slice() : [0, 0] };
  }
  function turn(dir, yawDeg, pitchDeg) {
    var a = yawDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    var d = [dir[0] * c + dir[2] * s, dir[1], -dir[0] * s + dir[2] * c];
    var el = Math.asin(clamp(-d[1], -1, 1)), h = Math.hypot(d[0], d[2]) || 1;
    var el2 = clamp(el + pitchDeg * Math.PI / 180, 0.08, 1.35);
    return [d[0] / h * Math.cos(el2), -Math.sin(el2), d[2] / h * Math.cos(el2)];
  }

  /* ---------- the scene ---------- */
  core.scene("stack", {
    update: function (st, dt, now) {
      if (st8 === "idle") load();
      // (3 Nov, James: "a point cloud moves between the hero and We're Orbit 3D") no stand-in points while the
      // house is still loading: the frame stays clean and the house builds up when it arrives. Only when the
      // house can not load at all (file://, no Draco) do the old house points stand in.
      if (st8 !== "ready") {
        if (st.w > 0.5 && !seenAt) seenAt = performance.now();
        // still loading past the point where the house would crumble: the points form the building as before
        var uL = ((win.innerHeight || 800) / 2 - sec.getBoundingClientRect().top) / (win.innerHeight || 800);
        // (3 Nov 2026) the still picture holds the frame meanwhile; it only goes once the visitor has scrolled
        // well into the part where the house comes apart (a still house can not come apart)
        setPoster(1 - sstep(2.0, 3.6, uL));
        core.spaceDim(st8 === "failed" ? 1 : sstep(U.apart, U.dots, uL));
        return 0;
      }
      // (30 Oct night, James's recording) the house arrived while the visitor already looked at it: no pop, it
      // builds up piece by piece over APPEAR s while the stand-in points fade (appear = 1 when it was in time)
      var appear = seenAt && readyAt > seenAt && !core.reduced ? clamp((performance.now() - readyAt) / (APPEAR * 1000), 0, 1) : 1;
      // (3 Nov 2026) with the still picture in the box the late house does not build up piece by piece: it is all
      // there at once and the picture (same angle) fades away over it, so the visitor sees one house, now live
      if (posterEl && posterLv > 0) {
        var pf = core.reduced ? 0 : 1 - clamp((performance.now() - readyAt) / 450, 0, 1);
        setPoster(Math.min(posterLv, pf));
        appear = 1;
        if (posterLv > 0) core.render();
      }
      if (appear < 1) core.render();
      // the shared one-floor house (hero / design) must never show inside this scene
      if (core.house && core.house.root && core.house.root.enabled) core.house.root.enabled = false;
      var vh = win.innerHeight || 800, r = sec.getBoundingClientRect();
      var uRaw = (vh / 2 - r.top) / vh;              // screens of the section passed by the screen centre
      // (30 Oct, James: "laggy and uneven") a short follow only: with 0.6 s the house ran half a screen behind
      // the scroll, so its points were still flying when the next scene took the stage (a jump)
      uNow = core.reduced ? uRaw : follow(uNow, uRaw, st.w < 0.98 && uRaw > U.dots ? 0.05 : 0.16, dt);
      if (Math.abs(uNow - uRaw) > 1e-4) core.render();
      // one shared progress for the turn and the explosion (t), so both end together
      var t = even((uNow - U.hold) / (U.apart - U.hold));
      var dots = sstep(U.apart, U.dots, uNow), fly = clamp((uNow - U.dots) / (U.fly - U.dots), 0, 1), out = sstep(U.fly, U.out, uNow);
      offsets(t); placePieces();
      // the solid house crumbles into its points piece by piece (the points are already there under it)
      var crumble = clamp((uNow - (U.apart + 0.3 * (U.dots - U.apart))) / (0.7 * (U.dots - U.apart)), 0, 1);
      root.enabled = crumble < 1;
      if (root.enabled) items.forEach(function (it) { var on = crumble < it.rnd && it.rnd <= appear; if (it.e.enabled !== on) it.e.enabled = on; });
      // the camera: the space engine's direction (so the house turns with it), the visitor's turn on top
      var aspect = (core.size()[0] || 1) / Math.max(1, core.size()[1] || 1), sc = win.OrbitSpace && win.OrbitSpace.camera ? win.OrbitSpace.camera() : null;
      var fov = sc && sc.valid ? sc.fov : 34 * Math.PI / 180;
      var bd = baseDir();
      dirNow = dirNow ? norm(lerp3(dirNow, bd, 1 - Math.exp(-dt / 0.6))) : bd;
      var keep = 1 - ease(fly);
      // once round the house while it comes apart: exactly 360 deg on the same progress as the explosion, so it
      // is fully apart just as it faces the way it began
      var spin = O.yaw0 + O.spin * t;
      var fb = frameBox(), v = fitView(turn(dirNow, spin + user.yaw * keep, user.pitch * keep), fb, fov, aspect);
      if (!cam || core.reduced) cam = v;
      else {
        // the scroll is already smoothed (uNow); only a touch more here for drags, so the turn does not lag twice
        var kc = 1 - Math.exp(-dt / 0.06);
        cam = { eye: lerp3(cam.eye, v.eye, kc), target: lerp3(cam.target, v.target, kc), fov: mix(cam.fov, v.fov, kc), shift: v.shift };   // the shift follows the box at once: house and words slide together
      }
      // while the points fly the camera moves onto the fixed aerial pose (from the front view the turn ends on),
      // and the space engine is led onto this very camera so its points land under ours
      // (lens and shift read live from the space engine until we lead it; once led, its camera is ours)
      if (out <= 0 || !aimC) aimC = aimView(sc);
      var view = cam, fe = ease(fly), aim = aimC;
      if (fly > 0 && aim) {
        view = { eye: lerp3(cam.eye, aim.eye, fe), target: lerp3(cam.target, aim.target, fe), fov: mix(cam.fov, aim.fov, fe), shift: [mix(cam.shift[0], aim.shift[0], fe), mix(cam.shift[1], aim.shift[1], fe)] };
      }
      // (3 Nov 2026, James: "between these 2 frames still a bit laggy") the space engine follows our camera from
      // the start of the flight (its points are still at 0.01 then): before, it was only led once they faded in,
      // so its camera jumped ~18 m in one frame just as its points became visible
      if (win.OrbitSpace && win.OrbitSpace.lead) win.OrbitSpace.lead(fly > 0 && aim ? view : null, 1);
      core.view({ eye: view.eye, target: view.target, fov: view.fov, shift: view.shift, near: 0.1, far: 400 });
      // the points
      if (pts) {
        pts.enabled = dots > 0.001 && out < 0.999;
        var hpx = (core.size()[1] || 800) * (core.dpr || 1) / (2 * Math.tan(view.fov / 2));
        mat.setParameter("uFly", fly);
        mat.setParameter("uPix", hpx);
        mat.setParameter("uSize", core.isPhone ? 0.085 : 0.065);
        mat.setParameter("uTime", now);
        if (pts.enabled) core.render();   // (4 Nov) the points move with the clock: keep drawing while they show
        mat.setParameter("uAlpha", sstep(U.apart, U.apart + 0.4 * (U.dots - U.apart), uNow) * (1 - out));
      }
      // the space engine's points: hidden while the solid house is on; awake (barely lit) while ours fly so its
      // camera is live; then they take over exactly under ours
      var w = st.w * (uNow < U.apart ? fb.room : 1);
      // (3 Nov) hidden from the very start of the scene (was 1 - sstep(0, 0.3, st.w): the points showed while
      // the hero handed over) and no stand-in points while a late house builds up
      // (3 Nov 2026, blink) the space points come up a little before our fade (SWAP), so with their ~0.4 s ease
      // they are fully there before the aerial scene takes the stage at U.out
      var SWAP_ON = !!(win.OrbitSpace && win.OrbitSpace.level);
      // They come up to SWAP_LV, not 1: at full brightness the space points read ~25 % brighter than ours (more
      // of them); js/stage-aerial.js takes them on to 1 while its camera pulls back, so the brightness stays even.
      var sd = uNow < U.apart ? 0 : uNow < SWAP[0] ? 0.01 : SWAP_ON ? mix(0.01, SWAP_LV, sstep(SWAP[0], SWAP[1], uNow)) : mix(0.01, 1, out);
      core.spaceDim(sd);
      // the "drag to turn" chip: while the house is whole or coming apart, until the visitor has turned it
      var chipOn = !used && uNow > U.hold * 0.5 && uNow < U.apart * 0.8 && w > 0.5;
      if (chip && chipOn !== chipShown) { chipShown = chipOn; chip.classList.toggle("is-off", !chipOn); }
      // (3 Nov 2026, James: "I don't like the blink") our points fade out exactly as the space engine's points
      // really come up (its brightness eases ~0.4 s behind what we ask). Before, ours went first: the picture
      // dipped ~7 % darker, then flashed ~16 % brighter. Now the two always add up to one picture.
      var keepK = 1 - out;
      if (SWAP_ON && uNow > SWAP[0] && win.OrbitSpace && win.OrbitSpace.level) {
        var lv = clamp((win.OrbitSpace.level() - 0.01) / (SWAP_LV - 0.01), 0, 1);
        keepK = 1 - lv * lv;   // theirs brightens in a curve: ours goes a little slower at first (no dip)
        if (keepK > 0.002 && keepK < 0.998) core.render();
      }
      return w * keepK;
    },
    // (3 Nov 2026, James) nothing to drag any more: the scroll alone takes it apart
    interactive: function () { return false; },
    down: function () {},
    move: function (p) { used = true; user.yaw -= p.dx * 0.3; if (p.type === "mouse") user.pitch = clamp(user.pitch + p.dy * 0.2, -25, 35); core.render(); },
    up: function () {},
    pinch: function (k) { user.zoom = clamp(user.zoom / k, 0.5, 2); core.render(); },
    // another scene has the stage: our pieces and points must not show in its pictures (the cards of "two")
    off: function () { if (root) root.enabled = false; if (pts) pts.enabled = false; core.spaceDim(1); if (win.OrbitSpace && win.OrbitSpace.lead) win.OrbitSpace.lead(null); }
  });
  // (30 Oct night, James's recording) start the download and the build while the hero is still on screen (the
  // act begins right after it, so it is within the ~1.5 screens rule): before, it only started once this scene
  // had the stage, and the old house points showed for a moment before the solid house popped in.
  // need() still waits for the start gate (first scroll / tap / key, or the hero film's end).
  // (31 Oct, phone speed) in the download lane after the hero scan: it starts as soon as the hero scan is in,
  // the visitor scrolls toward the act (its top on screen), or 8 s after the start gate, whichever comes first
  (function preload() {
    function go() { if (core.whenEngine) core.whenEngine(load); else load(); }
    if (core.lane) { core.lane("stack", { after: "hero", el: sec, near: 0.01, max: 8 }).then(go); return; }
    if (!("IntersectionObserver" in win)) { go(); return; }
    var io = new IntersectionObserver(function (en) {
      if (en.some(function (e) { return e.isIntersecting; })) { io.disconnect(); go(); }
    }, { rootMargin: "150% 0px 150% 0px" });
    io.observe(sec);
  })();
  // keyboard on the house box: arrows turn it, + / - zoom (only while it has focus; never on window)
  if (boxEl) boxEl.addEventListener("keydown", function (e) {
    var k = e.key, used = true;
    if (k === "ArrowLeft") user.yaw += 8; else if (k === "ArrowRight") user.yaw -= 8;
    else if (k === "+" || k === "=") user.zoom = clamp(user.zoom * 0.85, 0.5, 2); else if (k === "-") user.zoom = clamp(user.zoom / 0.85, 0.5, 2);
    else used = false;
    if (used) { e.preventDefault(); core.render(); }
  });
  S.stack = { aim: function () { return st8 === "ready" && aimC ? aimC : null; },
    state: function () { return { status: st8, u: uNow, pack: choice && choice.pack, why: choice && choice.why, mbit: choice && choice.mbit, poster: posterLv, items: items.length, points: pts ? pts.N : 0, seenAt: seenAt, readyAt: readyAt }; },
    reset: function () { user.yaw = user.pitch = 0; user.zoom = 1; core.render(); } };
})();
