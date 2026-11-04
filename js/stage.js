/* Orbit 3D - the solid stage: the shared PlayCanvas engine, the ONE 3D house and the
   visitor's design on a fixed, transparent canvas (#stage) above the scan points (#space).
   PlayCanvas 2.22.1 (vendor/playcanvas.min.js, global `pc`) is loaded lazily after the
   first paint. Works from file:// (every binary is a base64 pack script, CONTRACT 4.3)
   and over http.

   Nothing 3D at page load, and nothing while the hero film plays: the watchers wait for the first
   scroll / press / tap / key or ~9 s after load (round 8). Then the ENGINE starts when #scan is
   within ~1.5 screens (or a section calls need()); the HOUSE pack when #scan (card B), #design or #floor is within
   ~1.5 screens, on need("house"), or (desktop only) on idle 6 s after load.
   Beats: every [data-stage="<scene>"] element is read each frame (weight around the
   screen centre, progress -1..1). Pointer input only comes from `.stage-hit` elements
   (sections make them); data-hit="<scene>" on a .stage-hit limits it to that scene.
   This file never listens to the wheel. Debug: ?stagedbg=1 logs timings.

   Round 8 (CONTRACT 8.3, owner F1): the scene "room-model", its catalogue drawer, the
   turnable preview, undo / history and the saved design (localStorage) are retired. The
   scenes "tour" and "floor" live in js/stage-tour.js and use core.design below. The design
   is now ONE in-memory design for the page visit, shown on the shared house in EVERY scene
   that draws it (card B of #scan, the station tour, the whole floor): swaps of real pieces
   by library pieces (true sizes, floor contact; a piece that hangs over another one, like a
   TV over its cabinet, goes up with it), moves / turns kept inside the piece's own room,
   wall paint per room, and room lights on / off (lights.json in the house pack: the room's
   baked light dims, its lamp glows fade, 0.4 s).

   PUBLIC API  window.OrbitStage
     ready, need(pack), file(name), event "orbit:stage-ready" on document,
     event "orbit:stage-engine" (engine only, before the house)
     hero.on(...)   (kept so old callers do not break; never fires)
     tour, floor    (js/stage-tour.js, CONTRACT 8.3)

   OrbitStage._core  (for js/stage-aerial.js / stage-real.js / stage-stream.js, E, and
   js/stage-tour.js, F1). Exists at once; engine fields fill in when loaded. Use
   core.whenEngine(fn) (engine only), core.whenReady(fn) (engine + house), core.scene(id, def).
     engine                       true once the engine runs (before the house)
     whenEngine(fn)               fn(core) once the engine runs (no house yet)
     wantHouse(why)               start the house pack now (also starts the engine)
     pack(base) -> name           the pack for this device: "aerial" -> "aerial-lite" on
                                  phones (aerial, patio, studio, real have lite packs)
     handoff {from, alpha, view, t}   set when the stage owner changes: the scene that had
                                  it, its canvas alpha and the last camera view
     owner() -> scene id | null   the scene that owns the stage now (round 8)
     pc, app, device, canvas      engine objects (null until loaded)
     camera                       the ONE camera entity (camera.camera = component)
     isPhone, reduced, dpr        flags (dpr = current pixel ratio)
     size() -> [cssW, cssH]       the canvas size in CSS px (round 8)
     beats.get(id) -> {w, pr, wT, prT, el, alpha}  damped / raw weight + progress of a scene
     scene(id, def)               register a scene; def = {
         update(st, dt, now) -> alpha 0..1   called ONLY while the scene owns the stage
                                  (highest beat weight; it keeps it while fading out).
                                  st = beats.get(id). Set the camera with core.view(),
                                  move the house with house.pose(). alpha = canvas opacity.
         interactive(st) -> bool  takes .stage-hit input now (sets html.stage-live)
         down(p) move(p) up(p) tap(p) pinch(k, p)   p = {x, y, dx, dy, vx, vy, moved, type, el}
                                  (el = the .stage-hit element the press started on)
         off()                    another scene took over / nothing on screen }
     render()                     draw a frame this tick (render on demand)
     view(v)                      camera <- {eye:[3], target:[3], up?, fov (vertical
                                  RADIANS), shift?:[x,y] (lens shift = PM[8], PM[9]),
                                  near?, far?}    (OrbitSpace.camera() fits 1:1)
     getView()                    the last view object
     ray(cssX, cssY) -> {o:[3], d:[3]}   world ray through a CSS pixel
     project([x,y,z]) -> [cssX, cssY, depth] | null
     spaceDim(k)                  OrbitSpace.dim(k) with a rounded-value guard (round 8)
     need, file, bytes(name) -> Uint8Array, glbJson(name) -> glTF JSON chunk
     loadGlb(name, tag) -> Promise<pc.Asset>   container asset from a packed glb
     prepMaterials(entity)        Orbit's baked-unlit material look for any glb instance
     house = {                    the ONE shared model (one instance for all scenes)
       root      entity in app.root: scenes move / turn / scale THIS (pose())
       body      child of root; walls + furniture glbs in the model frame
       json, list, lights        house.json, furniture.json, lights.json (parsed)
       byName(name)              entity by glb node name
       bounds {min,max}, centre [x,y,z], floorY, rooms (house.json rooms), roomBox {id: [x0,z0,x1,z1]}
       pieces                    [{node, name, kind, room, lib, ent, box, rest?}] all furniture
       pose(pos|null, yawDeg, scale, centred)  root transform; centred = turn around
                                 the house centre; pose(null) = identity (model = world)
       look("outside"|"inside")  outside: roof, lamps, blinds off (house.hide)
       cutaway(eyeModel, targetModel, "ext"|"all"|"room"|"none", dt, box?)   swap walls for
                                 their LowWall copies (ext: exterior walls facing the camera;
                                 all: every wall between camera and target; room: + the walls
                                 of box [x0,z0,x1,z1] that face the camera; none: all whole)
       toModel([x,y,z]) -> [x,y,z]   world -> model frame
       shadow                    contact-shadow entity (enable per scene)
       dimRooms(roomId|null, k)  baked colour x k for every room except roomId (1 = off);
                                 the room lights (below) stay as they are
       light(roomId, on)         that room's lamps on / off (0.4 s fade; reduced motion: at once)
      lamps(roomId)             [{key, name, pos, lumen}] the room's own lamps (glow rooms)
      lamp(key, on), lampOn(key) one lamp; the room's baked light follows its lumen share
       lightOn(roomId) -> bool
     }
     design = {                   the visitor's design (round 8), for js/stage-tour.js
       on("change", fn)          {what: swap|load|error|move|turn|restore|paint|lights|reset|library, node?}
       catalog() -> Promise<[{id, name, category, w, d, h}]>   library index (library.js)
       rec(id), thumb(id) -> blob URL | null, preload([ids])
       piece(node) -> {node, name, room, lib, libId, moved, canRestore, movable} | null
       box(node) -> oriented box now {cx, cz, y0, y1, ux, uz, hu, hn} (model frame)
       swap(node, libId|"original"|null, turnDeg?) -> Promise   (true size, its spot kept)
       spot(node) -> {x, z, r}   setSpot(node, x, z, r) -> kept spot (in its room, on the floor)
       changed(what, node)       tell listeners after a drag (no extra work)
       restore(node), reset()    (reset = starting arrangement + colours + lights on)
       select(node|null), selected(), outline()   highlight + floor outline (call outline()
                                 inside a scene update while a piece is chosen)
       paint(roomId, hex|null) -> bool, paintNow(roomId) -> hex|null   interior walls of a room
       light(roomId, on), lightOn(roomId)
       rayBox(ray, box) -> t | -1, planeHit(cssX, cssY, y) -> {x, z} | null
       state() -> copy of the design data }
*/
(function () {
  "use strict";

  var win = window, doc = document, root = doc.documentElement;
  var canvas = doc.getElementById("stage");
  var params = new URLSearchParams(location.search);
  var DBG = params.has("stagedbg");
  var reduced = !!(win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches) || params.get("reduce") === "1";
  var isPhone = (win.matchMedia && win.matchMedia("(pointer: coarse)").matches) || win.innerWidth < 768;
  var SCRIPT = doc.currentScript && doc.currentScript.src;
  var BASE = SCRIPT ? new URL("../", SCRIPT).href : "";

  /* ---------- small maths ---------- */
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function ease(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function follow(cur, to, tau, dt) { return tau <= 0 ? to : cur + (to - cur) * (1 - Math.exp(-dt / tau)); }
  function v3(a) { return [a[0], a[1], a[2]]; }
  function lerp3(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm3(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function basis(e, t, up) {
    var z = norm3([e[0] - t[0], e[1] - t[1], e[2] - t[2]]), x = norm3(cross3(up || [0, 1, 0], z)), y = cross3(z, x);
    return { x: x, y: y, z: z };
  }
  var D2R = Math.PI / 180;
  function log() { if (DBG) console.log.apply(console, ["[stage]"].concat([].slice.call(arguments))); }

  /* ---------- tiny event emitters ---------- */
  function emitter() {
    var h = {};
    return {
      on: function (e, fn) { (h[e] = h[e] || []).push(fn); return function () { h[e] = (h[e] || []).filter(function (f) { return f !== fn; }); }; },
      emit: function (e, d) { (h[e] || []).slice().forEach(function (fn) { try { fn(d); } catch (err) { console.warn("[stage] handler", err); } }); }
    };
  }
  var designEv = emitter(), heroEv = emitter();

  /* ---------- packs (CONTRACT 4.3) ---------- */
  // (Codex QC R7) the studio packs share "studio/" with the photo packs: only the scan file itself says they are in
  var PREFIX = { house: "house/", library: "lib/index.json", real: "real/", "real-lite": "real/",
    studio: "studio/room.ply", "studio-lite": "studio/room.ply", "studio-photo": "studio/pano.jpg", "studio-photo-lite": "studio/pano.jpg" };
  var LITE = { aerial: 1, patio: 1, studio: 1, real: 1 };   // packs that have a -lite twin for phones
  var packP = {}, packEl = {}, urlCache = {};
  function files() { return (win.ORBIT_STAGE && win.ORBIT_STAGE.files) || {}; }
  function packPresent(name) {
    if (/^lib\//.test(name)) return typeof files()[name + ".glb"] === "string";
    var p = PREFIX[name] || (name + "/"), f = files();
    for (var k in f) if (k.indexOf(p) === 0) return true;
    return false;
  }
  function need(name) {
    // no 3D layer on this device: never download packs it cannot draw (the acts show stills)
    if (root.classList.contains("stage-none")) return Promise.reject(new Error("stage off"));
    if (name === "house") wantHouse("need house"); // (round 6) asking for the house builds it too
    // round 8: nothing downloads while the hero film plays (the start gate, see watch())
    if (!gateOpen) return new Promise(function (ok) { gated(ok); }).then(function () { return needRaw(name); });
    return needRaw(name);
  }
  function needRaw(name) {
    if (packP[name]) return packP[name];
    if (!webgl2()) { fail("no WebGL2"); return Promise.reject(new Error("stage off")); }
    wake("need " + name); // a section asks for a pack: the engine starts too
    packP[name] = new Promise(function (ok, no) {
      if (packPresent(name)) { ok(); return; }
      var s = doc.createElement("script");
      s.src = BASE + "assets/stage/" + name + ".js";
      s.onload = function () { ok(); };
      s.onerror = function () { packP[name] = null; packEl[name] = null; s.remove(); no(new Error("pack " + name + " missing")); };
      packEl[name] = s;
      doc.head.appendChild(s);
    });
    return packP[name];
  }
  // a pack's script let go (its files already read): need() will load it again next time
  function forgetPack(name) {
    packP[name] = null;
    if (packEl[name]) { try { packEl[name].remove(); } catch (e) { /* gone */ } packEl[name] = null; }
  }
  function packFor(base) { return LITE[base] && isPhone ? base + "-lite" : base; }
  var MIME = { glb: "model/gltf-binary", json: "application/json", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
  function bytes(name) {
    var s = files()[name];
    if (typeof s !== "string") return null;
    // (4 Nov 2026, phone lag) the browser's own fast decoder where it has one (Safari 18.2+, recent Chrome)
    if (typeof Uint8Array.fromBase64 === "function") { try { return Uint8Array.fromBase64(s); } catch (e) { /* old way */ } }
    var bin = atob(s), n = bin.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function file(name) {
    if (urlCache[name]) return urlCache[name];
    var u = bytes(name);
    if (!u) return null;
    var ext = (name.split(".").pop() || "").toLowerCase();
    urlCache[name] = URL.createObjectURL(new Blob([u], { type: MIME[ext] || "application/octet-stream" }));
    return urlCache[name];
  }
  function jsonFile(name) {
    var u = bytes(name);
    return u ? JSON.parse(new TextDecoder("utf-8").decode(u)) : null;
  }
  // glTF JSON chunk (PlayCanvas drops node extras; research/04 2d)
  function readGlbJson(u8) {
    if (!u8 || u8.length < 20) return null;
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint32(0, true) !== 0x46546C67 || dv.getUint32(16, true) !== 0x4E4F534A) return null;
    var jl = dv.getUint32(12, true);
    return JSON.parse(new TextDecoder("utf-8").decode(new Uint8Array(u8.buffer, u8.byteOffset + 20, jl)));
  }
  function glbJson(name) { return readGlbJson(bytes(name)); }

  /* ---------- public API (exists at once; works after load) ---------- */
  var api = win.OrbitStage || {};
  var core = {
    pc: null, app: null, device: null, canvas: canvas, camera: null, house: null,
    isPhone: isPhone, reduced: reduced, dpr: 1, engine: false, handoff: null,
    need: need, file: file, bytes: bytes, glbJson: glbJson, pack: packFor
  };
  var ready = false, readyFns = [], engineFns = [], wakeState = null, gl2State = null, houseState = null;
  Object.defineProperty(api, "ready", { enumerable: true, configurable: true, get: function () { return ready; } });
  api.need = need;
  api.file = file;
  api._core = core;
  win.OrbitStage = api;
  core.whenReady = function (fn) { if (ready) { try { fn(core); } catch (e) { console.warn(e); } } else readyFns.push(fn); };
  core.whenEngine = function (fn) { if (core.engine) { try { fn(core); } catch (e) { console.warn(e); } } else engineFns.push(fn); };
  core.wantHouse = function (why) { wantHouse(why); };

  /* ---------- beats ---------- */
  var beatEls = [], beatState = {}, collectT = 0;
  function collectBeats() { beatEls = Array.prototype.slice.call(doc.querySelectorAll("[data-stage]")); }
  function bstate(id) { return beatState[id] || (beatState[id] = { id: id, w: 0, pr: -1, wT: 0, prT: -1, el: null, alpha: 0, seen: false }); }
  core.beats = { get: function (id) { return bstate(id); }, list: function () { return beatEls.slice(); } };
  function readBeats(dt) {
    var vh = win.innerHeight || 800, vc = vh * 0.5, band = vh * 0.15, k, s;
    for (k in beatState) { s = beatState[k]; s.wT = 0; s.seen = false; }
    for (var i = 0; i < beatEls.length; i++) {
      var el = beatEls[i], id = el.getAttribute("data-stage");
      if (!id) continue;
      var r = el.getBoundingClientRect();
      if (r.height <= 0 && r.width <= 0 && el.getClientRects().length === 0) continue;
      var b = Math.min(band, Math.max(r.height, 1) * 0.25);
      var w = sstep(r.top - b, r.top + b, vc) * (1 - sstep(r.bottom - b, r.bottom + b, vc));
      var pr = clamp((vc - r.top) / Math.max(r.height, 1), 0, 1) * 2 - 1;
      s = bstate(id);
      if (!s.seen || w > s.wT) { s.wT = w; s.prT = pr; s.el = el; s.seen = true; }
    }
    for (k in beatState) {
      s = beatState[k];
      if (reduced || !s.init) { s.w = s.wT; s.pr = s.prT; s.init = true; }
      else { s.w = follow(s.w, s.wT, 0.12, dt); s.pr = follow(s.pr, s.prT, 0.12, dt); }
      if (Math.abs(s.w - s.wT) < 1e-3) s.w = s.wT;
    }
  }

  /* ---------- scenes registry ---------- */
  var scenes = {}, owner = null;
  core.scene = function (id, def) { scenes[id] = def; bstate(id); };

  /* ---------- engine state + camera ---------- */
  var pc = null, app = null, device = null, camE = null;
  var view = { eye: [0, 5, 10], target: [0, 0, 0], up: [0, 1, 0], fov: 40 * D2R, shift: [0, 0], near: 0.05, far: 300 };
  var dirty = true, lastAlpha = -1, cssW = 1, cssH = 1;
  core.render = function () { dirty = true; };
  core.getView = function () { return view; };
  // (4 Nov 2026, phone battery) the scenes call core.view() every frame; before, that always meant a full redraw
  // (60 per second while the visitor only reads). Now only a camera that really moved draws, plus a short settle
  // time after the last change (the splat sort results arrive a frame or two later).
  var SETTLE = 0.6, settleT = 0;
  function sameV(a, b, eps) { for (var i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > eps) return false; return true; }
  function wakeDraw() { dirty = true; settleT = performance.now() / 1000 + SETTLE; }
  core.view = function (v) {
    var old = view;
    view = {
      eye: v3(v.eye), target: v3(v.target), up: v.up ? v3(v.up) : [0, 1, 0],
      fov: v.fov || 40 * D2R, shift: v.shift ? [v.shift[0] || 0, v.shift[1] || 0] : [0, 0],
      near: v.near || 0.05, far: v.far || 300
    };
    var moved = !(sameV(old.eye, view.eye, 1e-5) && sameV(old.target, view.target, 1e-5) && sameV(old.up, view.up, 1e-6) &&
      sameV(old.shift, view.shift, 1e-6) && Math.abs(old.fov - view.fov) < 1e-6 && old.near === view.near && old.far === view.far);
    if (!camE) return;
    if (!moved) return;
    camE.setPosition(view.eye[0], view.eye[1], view.eye[2]);
    camE.lookAt(view.target[0], view.target[1], view.target[2], view.up[0], view.up[1], view.up[2]);
    var c = camE.camera, fd = view.fov / D2R;
    if (Math.abs(c.fov - fd) > 1e-4) c.fov = fd;
    if (Math.abs(c.nearClip - view.near) > 1e-5) c.nearClip = view.near;
    if (Math.abs(c.farClip - view.far) > 1e-3) c.farClip = view.far;
    wakeDraw();
  };
  function aspect() { return cssW / Math.max(1, cssH); }
  core.ray = function (cx, cy) {
    var asp = aspect(), f = 1 / Math.tan(view.fov / 2);
    var nx = cx / cssW * 2 - 1, ny = 1 - cy / cssH * 2;
    var x = (nx + view.shift[0]) * asp / f, y = (ny + view.shift[1]) / f;
    var b = basis(view.eye, view.target, view.up);
    var d = norm3([b.x[0] * x + b.y[0] * y - b.z[0], b.x[1] * x + b.y[1] * y - b.z[1], b.x[2] * x + b.y[2] * y - b.z[2]]);
    return { o: v3(view.eye), d: d };
  };
  core.project = function (p) {
    var b = basis(view.eye, view.target, view.up), q = [p[0] - view.eye[0], p[1] - view.eye[1], p[2] - view.eye[2]];
    var x = dot3(q, b.x), y = dot3(q, b.y), z = -dot3(q, b.z);
    if (z <= 1e-4) return null;
    var f = 1 / Math.tan(view.fov / 2), asp = aspect();
    var nx = f / asp * x / z - view.shift[0], ny = f * y / z - view.shift[1];
    return [(nx + 1) / 2 * cssW, (1 - ny) / 2 * cssH, z];
  };

  /* ---------- size ---------- */
  var dprCap = isPhone ? 1.5 : 1.75;
  function resize() {
    if (!device) return;
    cssW = canvas.clientWidth || win.innerWidth; cssH = canvas.clientHeight || win.innerHeight;
    var dpr = Math.min(win.devicePixelRatio || 1, dprCap);
    core.dpr = dpr;
    device.maxPixelRatio = dpr;
    device.resizeCanvas(cssW, cssH);
    dirty = true;
    // re-fit the play view when the width changes (not on phone address-bar height changes)
  }

  /* ---------- the shared house ---------- */
  var H = null; // core.house

  // Orbit's material look (hvMaterials, research/04 2c)
  function prepMaterials(ent) {
    var seen = new Set();
    ent.findComponents("render").forEach(function (r) {
      r.meshInstances.forEach(function (mi) {
        var m = mi.material;
        if (!m || seen.has(m) || !(m instanceof pc.StandardMaterial)) return;
        seen.add(m);
        // (round 6) a material shared by several instances of one glb is changed once only:
        // a second pass would copy the already-cleared diffuse into the emissive (black piece)
        if (m._orbitPrep) return;
        m._orbitPrep = true;
        var nm = m.name || "";
        if (/^baked__/.test(nm) || nm === "cap__low") {
          // baked colour x light pictures: unlit, drawn through the emissive map
          m.useLighting = false;
          m.emissive.copy(m.diffuse);
          if (m.diffuseMap) {
            m.emissiveMap = m.diffuseMap; m.emissiveMapUv = m.diffuseMapUv;
            m.emissiveMapTiling.copy(m.diffuseMapTiling); m.emissiveMapOffset.copy(m.diffuseMapOffset);
            m.emissiveMapRotation = m.diffuseMapRotation; m.emissiveMapChannel = "rgb";
            m.emissiveMap.anisotropy = Math.min(8, device.maxAnisotropy || 1);
          }
          m.useSkybox = false; m.useTonemap = false; m.useFog = false;
          m.diffuse.set(0, 0, 0); m.diffuseMap = null;
          m.metalness = 0; if (m.specular) m.specular.set(0, 0, 0);
          m.update();
        } else if (/^shadow__/.test(nm) || /__shadow$/i.test(mi.node.name)) {
          m.depthWrite = false; m.useFog = false; m.useSkybox = false; m.update();
        } else {
          if (m.useDynamicRefraction || m.refraction > 0) {
            m.useDynamicRefraction = false; m.refraction = 0; m.refractionMap = null;
            m.blendType = pc.BLEND_NORMAL; m.opacity = Math.min(m.opacity, 0.28); m.depthWrite = false;
          }
          if (m.useMetalness) m.metalness = Math.min(m.metalness, 0.45);
          m.useFog = false; m.useSkybox = false;
          m.update();
        }
      });
    });
  }
  core.prepMaterials = function (e) { prepMaterials(e); };

  function loadGlb(name, tag) {
    var u8 = bytes(name), url = file(name);
    if (!u8) return Promise.reject(new Error("no file " + name));
    return new Promise(function (ok, no) {
      var a = new pc.Asset(tag, "container", { url: url, filename: tag + ".glb", contents: u8.buffer });
      a.once("load", function () { if (a.file) a.file.contents = null; ok(a); });
      a.once("error", function (e) { no(e instanceof Error ? e : new Error(String(e))); });
      app.assets.add(a); app.assets.load(a);
    });
  }
  core.loadGlb = loadGlb;

  // box of everything under `ent` (no __shadow parts), in the local frame of `frame`
  var tmpV = null, tmpM = null;
  function measure(ent, frame) {
    var inv = new pc.Mat4();
    if (frame) inv.copy(frame.getWorldTransform()).invert();
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    ent.findComponents("render").forEach(function (r) {
      for (var q = r.entity; q && q !== ent.parent; q = q.parent) if (/__shadow$/i.test(q.name)) return;
      r.meshInstances.forEach(function (mi) {
        var bb = mi.mesh && mi.mesh.aabb; if (!bb) return;
        tmpM.copy(inv).mul(mi.node.getWorldTransform());
        var c = bb.center, h = bb.halfExtents;
        for (var i = 0; i < 8; i++) {
          tmpV.set(c.x + (i & 1 ? h.x : -h.x), c.y + (i & 2 ? h.y : -h.y), c.z + (i & 4 ? h.z : -h.z));
          tmpM.transformPoint(tmpV, tmpV);
          if (tmpV.x < mn[0]) mn[0] = tmpV.x; if (tmpV.y < mn[1]) mn[1] = tmpV.y; if (tmpV.z < mn[2]) mn[2] = tmpV.z;
          if (tmpV.x > mx[0]) mx[0] = tmpV.x; if (tmpV.y > mx[1]) mx[1] = tmpV.y; if (tmpV.z > mx[2]) mx[2] = tmpV.z;
        }
      });
    });
    return isFinite(mn[0]) ? { mn: mn, mx: mx } : null;
  }

  // oriented box of a piece in the MODEL frame (body at identity when called):
  // centre (cx, cz), floor y0..top y1, unit long side (ux, uz), half sizes hu (long), hn
  function pieceBox(ent) {
    var m = measure(ent, ent);
    if (!m) return null;
    var wt = ent.getWorldTransform();
    var c = new pc.Vec3((m.mn[0] + m.mx[0]) / 2, m.mn[1], (m.mn[2] + m.mx[2]) / 2);
    wt.transformPoint(c, c);
    var ax = new pc.Vec3(), az = new pc.Vec3(); wt.getX(ax); wt.getZ(az);
    var sx = Math.hypot(ax.x, ax.z) || 1, sz = Math.hypot(az.x, az.z) || 1;
    var hx = (m.mx[0] - m.mn[0]) / 2 * sx, hz = (m.mx[2] - m.mn[2]) / 2 * sz;
    var box = { cx: c.x, cz: c.z, y0: c.y, y1: c.y + (m.mx[1] - m.mn[1]), ux: ax.x / sx, uz: ax.z / sx, hu: hx, hn: hz };
    if (hz > hx) { box.ux = az.x / sz; box.uz = az.z / sz; box.hu = hz; box.hn = hx; }
    return box;
  }

  // round 8: rooms whose lamps get a soft glow sprite (the "Lights" toggle of the station tour)
  var GLOW_ROOMS = ["kitchen"];
  // baked light x this colour when a room's lights are off (daylight only: darker, a little cool)
  var LIGHT_OFF = [0.36, 0.385, 0.47], ONE3 = [1, 1, 1];
  function glowTexture() {
    var N = 64, cv = doc.createElement("canvas"); cv.width = cv.height = N;
    var g = cv.getContext("2d"), gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    gr.addColorStop(0, "rgb(255,255,255)"); gr.addColorStop(0.18, "rgb(190,190,190)"); gr.addColorStop(0.5, "rgb(52,52,52)"); gr.addColorStop(1, "rgb(0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, N, N);
    var t = new pc.Texture(device, { width: N, height: N, format: pc.PIXELFORMAT_RGBA8, mipmaps: true, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR });
    t.setSource(cv);
    return t;
  }

  function buildHouse(wallsA, furnA, house, list, gWalls, gFurn, lights) {
    var rootE = new pc.Entity("OrbitHouse"), body = new pc.Entity("OrbitHouseBody"), poseKey = "";
    rootE.addChild(body);
    body.addChild(wallsA.resource.instantiateRenderEntity());
    body.addChild(furnA.resource.instantiateRenderEntity());
    app.root.addChild(rootE);
    var byName = {};
    body.forEach(function (e) { if (e.name && !byName[e.name]) byName[e.name] = e; });
    prepMaterials(body);

    var extras = {};
    [gWalls, gFurn].forEach(function (g) {
      if (!g || !g.nodes) return;
      g.nodes.forEach(function (n) { if (n.name && n.extras && !extras[n.name]) extras[n.name] = n.extras; });
    });

    var b = house.bounds || { min: [0, 0, 0], max: [6, 2.7, 9] };
    var floorY = Number(house.floorY) || 0;
    var centre = [(b.min[0] + b.max[0]) / 2, floorY, (b.min[2] + b.max[2]) / 2];
    var hideSet = {};
    (house.hide || []).forEach(function (n) { hideSet[n] = 1; });
    for (var en in extras) if (extras[en] && extras[en].cutaway_hide) hideSet[en] = 1;
    var hideEnts = Object.keys(hideSet).map(function (n) { return byName[n]; }).filter(Boolean);
    body.forEach(function (e) { if (/^Low(Wall|Lid)__/.test(e.name)) e.enabled = false; });

    // walls for the cutaway (house.json walls + glb extras a/b for the plane)
    var walls = [];
    (house.walls || []).forEach(function (w) {
      var full = byName[w.full]; if (!full) return;
      var ex = extras[w.full] || {};
      var low = w.low ? byName[w.low] : null, same = w.low === w.full;
      var c = w.centre || [0, 0, 0], n = null, t = null, half = 1;
      if (ex.a && ex.b) {
        var ax = ex.a[0], az = -ex.a[1], bx = ex.b[0], bz = -ex.b[1];
        var tx = bx - ax, tz = bz - az, tl = Math.hypot(tx, tz) || 1;
        t = [tx / tl, tz / tl]; n = [-t[1], t[0]]; half = tl / 2;
      }
      if (w.outward) { n = [w.outward[0], w.outward[1]]; if (!t) t = [-n[1], n[0]]; }
      if (!n) {
        var bb = measure(full, null);
        if (bb) { var dx = bb.mx[0] - bb.mn[0], dz = bb.mx[2] - bb.mn[2]; n = dx < dz ? [1, 0] : [0, 1]; t = [-n[1], n[0]]; half = Math.max(dx, dz) / 2; }
        else { n = [1, 0]; t = [0, 1]; }
      }
      // glass: the glass walls and their windows (see-through, see cutaway "all")
      var glass = /-glass/.test(w.full);
      // (30 Oct, James: walls should lower smoothly, not vanish) the full wall's height in its parent's
      // frame, so it can slide down to the low wall's top (or the floor) before the swap
      var slide = null;
      if (!same && full.parent) {
        var up = full.getLocalRotation().transformVector(new pc.Vec3(0, 1, 0));
        var fb = up.y > 0.999 ? measure(full, full.parent) : null;
        var lb = fb && low ? measure(low, full.parent) : null;
        if (fb && fb.mx[1] - fb.mn[1] > 0.05) {
          var lp0 = full.getLocalPosition(), ls0 = full.getLocalScale();
          slide = { y0: fb.mn[1], top: fb.mx[1], lowTop: lb ? Math.min(lb.mx[1], fb.mx[1]) : fb.mn[1] + 0.01,
                    py: lp0.y, px: lp0.x, pz: lp0.z, sx: ls0.x, sy: ls0.y, sz: ls0.z };
        }
      }
      walls.push({ name: w.full, full: full, low: low, same: same, ext: !!w.exterior && !!w.outward, glass: glass, c: [c[0], c[2]], n: n, t: t, half: half, isLow: false, sm: NaN, slide: slide, u: 0 });
    });
    var SLIDE_S = 0.5;   // seconds for a wall to go down or up
    function showWall(w) {
      var sl = w.slide, u = w.u;
      if (!sl || u <= 0 || u >= 1) {
        w.full.enabled = u < 1;
        if (w.low) w.low.enabled = u >= 1;
        if (sl) { w.full.setLocalScale(sl.sx, sl.sy, sl.sz); w.full.setLocalPosition(sl.px, sl.py, sl.pz); }
        dirty = true;
        return;
      }
      var e = u * u * (3 - 2 * u), h = sl.top + (sl.lowTop - sl.top) * e;
      var s = Math.max(0.002, (h - sl.y0) / (sl.top - sl.y0));
      w.full.enabled = true;
      if (w.low) w.low.enabled = false;
      w.full.setLocalScale(sl.sx, sl.sy * s, sl.sz);
      w.full.setLocalPosition(sl.px, sl.py + (sl.y0 - sl.py) * (1 - s), sl.pz);
      dirty = true;
    }
    function setLow(w, on) {
      if (w.isLow === on) return;
      w.isLow = on;
      if (w.same) return;
      if (reduced || !w.slide) { w.u = on ? 1 : 0; showWall(w); }
    }
    // moves every sliding wall one step toward its goal (called from cutaway each frame)
    function slideWalls(dt) {
      var step = Math.min(dt || 0.016, 0.1) / SLIDE_S;
      walls.forEach(function (w) {
        if (w.same || !w.slide) return;
        var goal = w.isLow ? 1 : 0;
        if (w.u === goal) return;
        w.u = goal > w.u ? Math.min(goal, w.u + step) : Math.max(goal, w.u - step);
        showWall(w);
      });
    }

    // furniture pieces (furniture.json words + the glb's own boxes)
    var pieces = [], pieceBy = {};
    ((list && list.items) || []).forEach(function (it) {
      var ent = byName[it.node]; if (!ent) return;
      var box = pieceBox(ent); if (!box) return;
      var p = { node: it.node, name: it.name || it.label || it.node, kind: it.kind || "other", room: it.room, lib: it.lib || null, ent: ent, box: box, hidden: !!hideSet[it.node], internal: /^[a-z0-9_]+$/.test(it.label || it.name || "") };
      pieces.push(p); pieceBy[p.node] = p;
    });
    // (round 8) a piece above the floor that hangs over another one of its room (a TV over its
    // cabinet, within 50 cm): when that one becomes taller, this one goes up with it
    pieces.forEach(function (p) {
      var pb = p.box; if (pb.y0 < floorY + 0.05) return;
      var hp = halfXZ(pb.hu, pb.hn, pb.ux, pb.uz), best = null;
      pieces.forEach(function (q) {
        if (q === p || q.room !== p.room || q.hidden) return;
        var c = q.box; if (c.y0 > floorY + 0.05 || c.y1 > pb.y0 + 0.05 || c.y1 < floorY + 0.2) return;
        var hq = halfXZ(c.hu, c.hn, c.ux, c.uz);
        if (Math.abs(c.cx - pb.cx) > hp[0] + hq[0] + 0.5 || Math.abs(c.cz - pb.cz) > hp[1] + hq[1] + 0.5) return;
        if (!best || c.y1 > best.box.y1) best = q;
      });
      if (best) p.rest = { node: best.node, gap: Math.max(0, pb.y0 - best.box.y1) };
    });
    // supports first, so a piece that rests on another is placed after it
    var order = pieces.slice().sort(function (x, y) { return (x.rest ? 1 : 0) - (y.rest ? 1 : 0); });

    // which room each mesh instance belongs to (for dimming the other rooms)
    var rooms = house.rooms || [], roomBox = {};
    rooms.forEach(function (r) {
      var x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      (r.poly || []).forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); });
      roomBox[r.id] = [x0, z0, x1, z1];
    });
    var wallByEnt = new Map();
    walls.forEach(function (w) { wallByEnt.set(w.full, w); if (w.low) wallByEnt.set(w.low, w); });
    var mis = [];
    body.findComponents("render").forEach(function (r) {
      var tags = null;
      for (var q = r.entity; q && q !== body; q = q.parent) {
        var nm = q.name || "", mm;
        if ((mm = /^Floor__(.+)$/.exec(nm))) { tags = [mm[1]]; break; }
        var w = wallByEnt.get(q);
        if (w) {
          tags = [];
          for (var id in roomBox) { var rb = roomBox[id]; if (w.c[0] > rb[0] - 0.3 && w.c[0] < rb[2] + 0.3 && w.c[1] > rb[1] - 0.3 && w.c[1] < rb[3] + 0.3) tags.push(id); }
          break;
        }
        if ((mm = /^([a-z0-9_]+?)__/.exec(nm)) && roomBox[mm[1]]) { tags = [mm[1]]; break; }
      }
      r.meshInstances.forEach(function (mi) {
        var m = mi.material;
        mis.push({ mi: mi, tags: tags || [], base: m && m.emissive ? [m.emissive.r, m.emissive.g, m.emissive.b] : [1, 1, 1], k: 1, hi: 1 });
      });
    });

    // contact shadow: a blurred dark ellipse quad under the floating house
    var shM = new pc.StandardMaterial();
    shM.useLighting = false; shM.diffuse.set(0, 0, 0); shM.emissive.set(0, 0, 0);
    shM.opacityMap = blobTexture(true); shM.opacityMapChannel = "a"; shM.opacity = 0.7;
    shM.blendType = pc.BLEND_NORMAL; shM.depthWrite = false; shM.useFog = false; shM.useSkybox = false; shM.update();
    var shadow = new pc.Entity("OrbitHouseShadow");
    shadow.addComponent("render", { type: "plane", material: shM, castShadows: false, receiveShadows: false });
    shadow.setLocalPosition(centre[0], b.min[1] - 0.03, centre[2]);
    shadow.setLocalScale((b.max[0] - b.min[0]) * 1.6, 1, (b.max[2] - b.min[2]) * 1.38);
    shadow.enabled = false;
    body.addChild(shadow);

    // (round 8) lamp glows: a soft additive sprite at each lamp of the GLOW_ROOMS (lights.json),
    // turned to the camera every drawn frame. Each lamp switches on its own (29 Oct, James: tap the
    // lamp itself); numbered parts ("Ceiling spots 1", "... 2") are one lamp. The room's baked light
    // follows the share of its lamp lumen that is on.
    var glows = [], glowMat = {}, gTex = null, lamps = {}, roomLamps = {};
    ((lights && lights.items) || []).forEach(function (it) {
      if (GLOW_ROOMS.indexOf(it.room) < 0 || !Array.isArray(it.pos) || it.pos.length < 3) return;
      var lname = String(it.name || "Lamp").replace(/\s+\d+$/, ""), key = it.room + "/" + lname;
      var lp = lamps[key];
      if (!lp) {
        lp = lamps[key] = { key: key, room: it.room, name: lname, lumen: 0, pts: [] };
        (roomLamps[it.room] || (roomLamps[it.room] = [])).push(key);
      }
      lp.lumen += +it.lumen || 600;
      var pts = [], ax = Array.isArray(it.axis) ? it.axis : [1, 0, 0], L = +it.length || 0;
      if (it.shape === "line" && L > 0.3) {
        var n = Math.max(2, Math.round(L / 0.42));
        for (var i = 0; i < n; i++) { var f = (i + 0.5) / n - 0.5; pts.push([it.pos[0] + ax[0] * L * f, it.pos[1] + ax[1] * L * f, it.pos[2] + ax[2] * L * f]); }
      } else pts.push([it.pos[0], it.pos[1], it.pos[2]]);
      var rr = (it.shape === "spot" ? 0.26 : 0.3) * clamp(Math.sqrt((+it.lumen || 600) / 700), 0.75, 1.35);
      if (!gTex) gTex = glowTexture();
      if (!glowMat[key]) {
        var gm = new pc.StandardMaterial();
        gm.useLighting = false; gm.diffuse.set(0, 0, 0); gm.emissiveMap = gTex; gm.emissive.set(1, 0.86, 0.66);
        gm.blendType = pc.BLEND_ADDITIVE; gm.depthWrite = false; gm.cull = pc.CULLFACE_NONE;
        gm.useFog = false; gm.useSkybox = false; gm.useTonemap = false; gm.update();
        gm._orbitPrep = true;
        glowMat[key] = gm;
      }
      pts.forEach(function (q) {
        var e = new pc.Entity("OrbitGlow");
        e.addComponent("render", { type: "plane", material: glowMat[key], castShadows: false, receiveShadows: false });
        e.setLocalPosition(q[0], q[1] - 0.05, q[2]);
        e.setLocalScale(2 * rr, 1, 2 * rr);
        body.addChild(e);
        glows.push({ ent: e, room: it.room, lamp: key });
        lp.pts.push(q);
      });
    });
    // each lamp's middle (model metres), for the tap targets of the station tour
    Object.keys(lamps).forEach(function (k) {
      var lp = lamps[k], n = lp.pts.length || 1, c = [0, 0, 0];
      lp.pts.forEach(function (q) { c[0] += q[0] / n; c[1] += q[1] / n; c[2] += q[2] / n; });
      lp.pos = c;
    });

    var invBody = new pc.Mat4(), tv = new pc.Vec3();
    // roomId (a room without glow lamps) or lamp key ("kitchen/Linear pendant")
    //   -> { v: shown 0..1, to: 0|1, u: fade clock 0..1 }
    var LT = {};
    function switchOne(id, on) {
      var s = LT[id] || (LT[id] = { v: 1, to: 1, u: 1 });
      var to = on ? 1 : 0;
      if (s.to === to) return;
      s.to = to; s.from = s.v; s.u = 0;
      if (reduced) { s.v = to; s.u = 1; lightApply(); }
      dirty = true;
    }
    function isOn(id) { var s = LT[id]; return !s || s.to === 1; }
    H = {
      root: rootE, body: body, json: house, list: list, lights: lights, extras: extras, floorY: floorY,
      bounds: b, centre: centre, pieces: pieces, pieceBy: pieceBy, order: order, walls: walls, rooms: rooms, roomBox: roomBox, mis: mis, shadow: shadow,
      glows: glows, glowMat: glowMat, LT: LT, lamps: lamps, roomLamps: roomLamps,
      // the room's light as shown, 0..1: its lamps' lumen share that is on (else its own room state)
      roomV: function (roomId) {
        var ks = roomLamps[roomId];
        if (!ks) { var s = LT[roomId]; return s ? s.v : 1; }
        var all = 0, on = 0;
        ks.forEach(function (k) { var s = LT[k], l = lamps[k].lumen; all += l; on += l * (s ? s.v : 1); });
        return all > 0 ? on / all : 1;
      },
      byName: function (n) { return byName[n] || null; },
      // (4 Nov 2026, phone battery) the scenes pose the house every frame: redraw only when the pose changed
      pose: function (pos, yawDeg, scale, centred) {
        var key = pos ? [pos[0], pos[1], pos[2], yawDeg || 0, scale || 1, !!centred].join() : "rest";
        if (!pos) { rootE.setLocalPosition(0, 0, 0); rootE.setLocalEulerAngles(0, 0, 0); rootE.setLocalScale(1, 1, 1); body.setLocalPosition(0, 0, 0); }
        else {
          rootE.setLocalPosition(pos[0], pos[1], pos[2]);
          rootE.setLocalEulerAngles(0, yawDeg || 0, 0);
          var s = scale || 1; rootE.setLocalScale(s, s, s);
          if (centred) body.setLocalPosition(-centre[0], -centre[1], -centre[2]); else body.setLocalPosition(0, 0, 0);
        }
        if (key !== poseKey) { poseKey = key; dirty = true; }
      },
      look: function (mode) {
        if (H._look === mode) return;
        H._look = mode;
        hideEnts.forEach(function (e) { e.enabled = mode === "inside"; });
        dirty = true;
      },
      toModel: function (p) {
        invBody.copy(body.getWorldTransform()).invert();
        tv.set(p[0], p[1], p[2]); invBody.transformPoint(tv, tv);
        return [tv.x, tv.y, tv.z];
      },
      // which full walls are low now (names; for checks and for choosing a keep list)
      lowWalls: function () { return walls.filter(function (w) { return w.isLow; }).map(function (w) { return w.name; }); },
      // keep (3 Nov, James): names of walls that stay full height whatever the camera does (the TV stop's
      // paintable wall must stay up to show the wall colours)
      cutaway: function (eye, tgt, mode, dt, box, keep) {
        var k = 1 - Math.exp(-7 * Math.min(dt || 0.016, 0.1));
        walls.forEach(function (w) {
          var want = false;
          if (keep && keep.indexOf(w.name) > -1) { setLow(w, false); return; }
          // "room" (dollhouse): the room's own walls that face the camera go low too
          if (mode === "room" && box && w.c[0] > box[0] - 0.35 && w.c[0] < box[2] + 0.35 && w.c[1] > box[1] - 0.35 && w.c[1] < box[3] + 0.35) {
            var mx = (box[0] + box[2]) / 2, mz = (box[1] + box[3]) / 2;
            var sm = (mx - w.c[0]) * w.n[0] + (mz - w.c[1]) * w.n[1];
            if (Math.abs(sm) > 0.4) {
              var ex0 = eye[0] - w.c[0], ez0 = eye[2] - w.c[1], ed = Math.hypot(ex0, ez0) || 1;
              var face = -(ex0 * w.n[0] + ez0 * w.n[1]) / ed * (sm > 0 ? 1 : -1);
              want = face > (w.isLow ? 0.04 : 0.1);
            }
          }
          if (want) { /* already low */ } else if (mode === "ext") {
            if (w.ext) {
              var dx = eye[0] - w.c[0], dz = eye[2] - w.c[1], d = Math.hypot(dx, dz) || 1;
              var s = (dx * w.n[0] + dz * w.n[1]) / d;
              w.sm = isFinite(w.sm) && !reduced ? w.sm + (s - w.sm) * k : s;
              want = w.isLow ? w.sm > 0.15 : w.sm > 0.22;
            }
          } else if (mode === "all" || mode === "room") {
            var sc = (eye[0] - w.c[0]) * w.n[0] + (eye[2] - w.c[1]) * w.n[1];
            // the line to the target, and (29 Oct, James) two lines to its sides, so a wall at the
            // edge of the screen goes low too when the visitor swings around
            var gx = tgt[0] - eye[0], gz = tgt[2] - eye[2], gl = Math.hypot(gx, gz) || 1, lat = Math.min(1.6, gl * 0.45);
            // (30 Oct, James) a glass wall is see-through: only the straight line to the target lowers it,
            // never the side lines or the camera standing next to it (the kitchen glass vanished there)
            var r0 = mode === "all" && !w.glass ? 1 : 0;
            for (var r = -r0; r <= r0 && !want; r++) {
              var tx2 = tgt[0] - gz / gl * lat * r, tz2 = tgt[2] + gx / gl * lat * r;
              var st = (tx2 - w.c[0]) * w.n[0] + (tz2 - w.c[1]) * w.n[1];
              if (sc * st < 0 && Math.abs(sc) > 0.03) {
                var f = st / (st - sc), px = tx2 + (eye[0] - tx2) * f, pz = tz2 + (eye[2] - tz2) * f;
                var along = Math.abs((px - w.c[0]) * w.t[0] + (pz - w.c[1]) * w.t[1]);
                want = along < w.half + (r ? 0.1 : w.isLow ? 1.6 : 1.3);
              }
            }
            // the camera right next to a wall: that wall goes low
            if (!want && r0 && Math.abs(sc) < (w.isLow ? 0.55 : 0.4)) {
              want = Math.abs((eye[0] - w.c[0]) * w.t[0] + (eye[2] - w.c[1]) * w.t[1]) < w.half + 0.2;
            }
          }
          setLow(w, want);
        });
        slideWalls(dt);
      },
      dimRooms: function (roomId, k) {
        H.mis.forEach(function (o) { applyTint(o, (roomId && o.tags.indexOf(roomId) < 0) ? k : 1, o.hi); });
      },
      // a room with glow lamps: all its lamps; lightOn = at least one of them on
      light: function (roomId, on) {
        if (!roomId) return;
        if (roomLamps[roomId]) roomLamps[roomId].forEach(function (k) { switchOne(k, on); });
        else switchOne(roomId, on);
      },
      lightOn: function (roomId) { return roomLamps[roomId] ? roomLamps[roomId].some(isOn) : isOn(roomId); },
      lamp: function (key, on) { if (lamps[key]) switchOne(key, on); },
      lampOn: function (key) { return isOn(key); },
      allOn: function () { Object.keys(LT).forEach(function (id) { switchOne(id, true); }); }
    };
    return H;
  }

  // the room-light colour of a mesh instance (1,1,1 = as baked): a room's own parts take the full
  // change, a wall shared with another room half of it
  function lightOf(tags) {
    if (!H || !tags || !tags.length) return ONE3;
    var out = null;
    for (var i = 0; i < tags.length; i++) {
      var v = H.roomV(tags[i]); if (v >= 0.9999) continue;
      var share = tags.length > 1 ? 0.5 : 1, off = 1 - v;
      out = out || [1, 1, 1];
      for (var c = 0; c < 3; c++) out[c] *= 1 - off * share * (1 - LIGHT_OFF[c]);
    }
    return out || ONE3;
  }
  function lightApply() {
    if (!H) return;
    H.mis.forEach(function (o) { o.lt = lightOf(o.tags); applyTint(o, o.k, o.hi); });
    for (var r in H.glowMat) { var s = H.LT[r], v = s ? s.v : 1, m = H.glowMat[r]; m.emissive.set(1 * v, 0.86 * v, 0.66 * v); m.update(); }
    H.glows.forEach(function (g) { var s = H.LT[g.lamp], on = !s || s.v > 0.002; if (g.ent.enabled !== on) g.ent.enabled = on; });
    dirty = true;
  }
  // the 0.4 s fades of the room lights; true while one runs
  function stepLights(dt) {
    if (!H) return false;
    var any = false;
    for (var r in H.LT) {
      var s = H.LT[r];
      if (s.u >= 1) continue;
      s.u = Math.min(1, s.u + dt / 0.4);
      s.v = mix(s.from, s.to, sstep(0, 1, s.u));
      any = true;
    }
    if (any) lightApply();
    return any;
  }
  // every drawn frame: the glow sprites face the camera (a plane's +Y toward it)
  var glowP = null;
  function orientGlows() {
    if (!H || !H.glows.length || !camE) return;
    glowP = camE.getPosition();
    H.glows.forEach(function (g) { if (g.ent.enabled) { g.ent.lookAt(glowP); g.ent.rotateLocal(-90, 0, 0); } });
  }

  // per mesh instance colour factor: dim (k) x highlight (hi) x room light (o.lt), on the baked emissive
  function applyTint(o, k, hi) {
    o.k = k; o.hi = hi;
    var t = k * hi, l = o.lt || ONE3, r = t * l[0], g = t * l[1], bl = t * l[2];
    if (Math.abs(r - 1) < 1e-4 && Math.abs(g - 1) < 1e-4 && Math.abs(bl - 1) < 1e-4) {
      if (o.set) { o.mi.deleteParameter("material_emissive"); o.set = false; dirty = true; }
      return;
    }
    if (o.set && Math.abs(o.tr - r) < 1e-4 && Math.abs(o.tg - g) < 1e-4 && Math.abs(o.tb - bl) < 1e-4) return;
    o.arr = o.arr || new Float32Array(3);
    o.arr[0] = o.base[0] * r; o.arr[1] = o.base[1] * g; o.arr[2] = o.base[2] * bl;
    o.mi.setParameter("material_emissive", o.arr); o.set = true; o.tr = r; o.tg = g; o.tb = bl;
    dirty = true;
  }
  // soft blob texture: ellipse (contact shadow) or rounded rectangle (swap blob, research/04 3d)
  function blobTexture(ellipse) {
    var N = 128, cv = doc.createElement("canvas"); cv.width = cv.height = N;
    var g = cv.getContext("2d"), img = g.createImageData(N, N);
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var a;
      if (ellipse) a = Math.pow(1 - sstep(0, 1, Math.hypot((x + 0.5) / N - 0.5, (y + 0.5) / N - 0.5) * 2), 1.6);
      else {
        var du = Math.max(0, Math.abs((x + 0.5) / N - 0.5) - 0.32) / 0.18, dv = Math.max(0, Math.abs((y + 0.5) / N - 0.5) - 0.32) / 0.18;
        a = 1 - sstep(0, 1, Math.hypot(du, dv));
      }
      img.data[(y * N + x) * 4 + 3] = Math.round(clamp(a, 0, 1) * 255);
    }
    g.putImageData(img, 0, 0);
    var t = new pc.Texture(device, { width: N, height: N, format: pc.PIXELFORMAT_RGBA8, mipmaps: true, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR });
    t.setSource(cv);
    return t;
  }

  /* ---------- paint (port of the Orbit v70 chunk, research/04 section 4) ----------
     Plain colours only (no floor patterns); a floor "paint" tints the floor. */
  var FN_ROOMS = 24;
  var FN_PLAIN = [
    "uniform vec3 material_emissive;",
    "uniform float material_emissiveIntensity;",
    "uniform sampler2D orbitFnMap;",
    "uniform vec4 orbitFnBox;",
    "uniform float orbitFnKind;",
    "uniform mat4 orbitFnW2M;",
    "uniform vec4 orbitFnC[24];",
    "uniform vec4 orbitFnP[24];",
    "#ifdef STD_EMISSIVE_TEXTURE",
    "void fnApply(inout vec3 e) {",
    "  if (orbitFnKind < 0.5) return;",
    "  vec3 P = (orbitFnW2M * vec4(vPositionW, 1.0)).xyz;",
    "  vec3 dPx = dFdx(P);",
    "  vec3 dPy = dFdy(P);",
    "  vec3 N = normalize(cross(dPx, dPy));",
    "  vec3 raw = {STD_EMISSIVE_TEXTURE_DECODE}(texture2DBias({STD_EMISSIVE_TEXTURE_NAME}, {STD_EMISSIVE_TEXTURE_UV}, textureBias)).rgb;",
    "  vec3 blur = {STD_EMISSIVE_TEXTURE_DECODE}(texture2DBias({STD_EMISSIVE_TEXTURE_NAME}, {STD_EMISSIVE_TEXTURE_UV}, textureBias + 2.5)).rgb;",
    "  vec3 E = (orbitFnW2M * vec4(view_position, 1.0)).xyz;",
    "  if (dot(N, P - E) > 0.0) N = -N;",
    "  bool fl = orbitFnKind > 1.5 && orbitFnKind < 2.5;",
    "  bool sl = orbitFnKind > 2.5;",
    "  vec3 Q = fl ? P : P + normalize(vec3(N.x, 0.0, N.z) + vec3(1e-5)) * 0.080;",
    "  vec2 m = (Q.xz - orbitFnBox.xy) * orbitFnBox.zw;",
    "  float r = floor(textureLod(orbitFnMap, clamp(m, 0.0, 1.0), 0.0).r * 255.0 + 0.5) - 1.0;",
    "  if (fl ? N.y < 0.7 : sl ? abs(N.y) > 0.85 : abs(N.y) > 0.5) return;",
    "  if (m.x < 0.0 || m.y < 0.0 || m.x > 1.0 || m.y > 1.0 || r < 0.0 || r > 23.5) return;",
    "  int i = int(r);",
    "  vec4 C = orbitFnC[i];",
    "  if (C.a < 0.5) return;",
    "  vec4 S = orbitFnP[i];",
    "  float lw = dot(blur, vec3(0.2126, 0.7152, 0.0722));",
    "  float lr = dot(raw, vec3(0.2126, 0.7152, 0.0722));",
    "  float light = clamp(lw / max(S.z, 0.003), 0.0, 3.0);",
    "  float detail = clamp(lr / max(lw, 0.003), 0.6, 1.5);",
    "  vec3 col = C.rgb * mix(1.0, detail, fl ? 0.35 : 0.5);",
    "  vec3 x = col * light;",
    "  x = min(x, vec3(0.8) + max(x - vec3(0.8), vec3(0.0)) * 0.35);",
    "  e = x * material_emissive * material_emissiveIntensity;",
    "}",
    "#else",
    "void fnApply(inout vec3 e) {}",
    "#endif",
    "void getEmission() {",
    "  dEmission = material_emissive * material_emissiveIntensity;",
    "  #ifdef STD_EMISSIVE_TEXTURE",
    "  dEmission *= {STD_EMISSIVE_TEXTURE_DECODE}(texture2DBias({STD_EMISSIVE_TEXTURE_NAME}, {STD_EMISSIVE_TEXTURE_UV}, textureBias)).{STD_EMISSIVE_TEXTURE_CHANNEL};",
    "  fnApply(dEmission);",
    "  #endif",
    "}"
  ].join("\n");

  var FN = null; // { ok, map, box, targets, mats, refs: {walls:[], floor:[]}, rooms }

  function pointInPoly(x, z, poly) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi)) c = !c;
    }
    return c;
  }
  function fnPrepare() {
    if (FN) return FN;
    FN = { ok: false };
    try {
      var t0 = performance.now();
      var rooms = (H.rooms || []).slice(0, FN_ROOMS);
      var x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      rooms.forEach(function (r) { (r.poly || []).forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }); });
      if (!isFinite(x0)) return FN;
      x0 -= 0.3; z0 -= 0.3; x1 += 0.3; z1 += 0.3;
      var sx = x1 - x0, sz = z1 - z0, k = 512 / Math.max(sx, sz);
      var W = Math.max(8, Math.ceil(sx * k)), Hh = Math.max(8, Math.ceil(sz * k));
      var order = rooms.map(function (r, i) { return i; }).sort(function (a, b) { return (rooms[a].area || 0) - (rooms[b].area || 0); });
      var idxMap = new Uint8Array(W * Hh);
      var tex = new pc.Texture(device, { width: W, height: Hh, format: pc.PIXELFORMAT_RGBA8, mipmaps: false, minFilter: pc.FILTER_NEAREST, magFilter: pc.FILTER_NEAREST, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
      var px = tex.lock();
      for (var v = 0; v < Hh; v++) for (var u = 0; u < W; u++) {
        var x = x0 + (u + 0.5) / W * sx, z = z0 + (v + 0.5) / Hh * sz, hit = 0;
        for (var oi = 0; oi < order.length; oi++) { if (pointInPoly(x, z, rooms[order[oi]].poly || [])) { hit = order[oi] + 1; break; } }
        var o = (v * W + u) * 4; px[o] = hit; px[o + 1] = 0; px[o + 2] = 0; px[o + 3] = hit ? 255 : 0;
        idxMap[v * W + u] = hit;
      }
      tex.unlock();
      FN.map = tex; FN.box = new Float32Array([x0, z0, 1 / sx, 1 / sz]); FN.rooms = rooms;
      FN.roomAt = function (x, z) {
        var uu = Math.floor((x - x0) / sx * W), vv = Math.floor((z - z0) / sz * Hh);
        if (uu < 0 || vv < 0 || uu >= W || vv >= Hh) return -1;
        return idxMap[vv * W + uu] - 1;
      };
      // targets: baked wall / floor surfaces (fnTargets)
      var wallNames = {};
      (H.json.walls || []).forEach(function (w) { wallNames[w.full] = 1; if (w.low) wallNames[w.low] = 1; });
      for (var nm in H.extras) { var ex = H.extras[nm]; if (ex && (ex.kind === "wall" || ex.kind === "window")) { wallNames[nm] = 1; wallNames["LowWall__" + nm] = 1; } }
      var targets = [], mats = new Set();
      H.body.findComponents("render").forEach(function (r) {
        var kind = 0, stop = false;
        for (var q = r.entity, n = 0; q && q !== H.body && n < 64; q = q.parent, n++) {
          if (/^mwSwap-|__shadow$/i.test(q.name)) { stop = true; break; }
          if (/^Floor__/.test(q.name)) { kind = 2; break; }
          if (wallNames[q.name]) { kind = 1; break; }
        }
        if (stop || !kind) return;
        r.meshInstances.forEach(function (mi) {
          var m = mi.material;
          if (!m || !/^baked__/.test(m.name || "") || !m.emissiveMap || /window|plinth|ceiling|glass/i.test(m.name)) return;
          targets.push({ mi: mi, kind: kind, C: new Float32Array(FN_ROOMS * 4), P: new Float32Array(FN_ROOMS * 4) });
          mats.add(m);
        });
      });
      FN.targets = targets; FN.mats = Array.from(mats);
      FN.w2m = new Float32Array(16); FN.w2m[0] = FN.w2m[5] = FN.w2m[10] = FN.w2m[15] = 1;
      FN.refs = fnRoomRefs(targets);
      FN.mats.forEach(function (m) {
        m.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set("emissivePS", FN_PLAIN);
        m.setParameter("orbitFnMap", tex); m.setParameter("orbitFnBox", FN.box); m.setParameter("orbitFnKind", 0);
        m.setParameter("orbitFnW2M", FN.w2m);
        m.setParameter("orbitFnC[0]", new Float32Array(FN_ROOMS * 4)); m.setParameter("orbitFnP[0]", new Float32Array(FN_ROOMS * 4));
        m.clearVariants(); m.update();
      });
      FN.ok = true;
      FN.checkAt = performance.now() + 1500;
      log("paint ready in", Math.round(performance.now() - t0), "ms:", targets.length, "surfaces,", FN.mats.length, "materials", JSON.stringify(FN.refs));
    } catch (e) {
      console.warn("[stage] paint setup failed:", e && e.message);
      FN.ok = false;
    }
    return FN;
  }
  function fnRevert() {
    if (!FN || !FN.mats) return;
    FN.mats.forEach(function (m) { try { m.getShaderChunks(pc.SHADERLANGUAGE_GLSL).delete("emissivePS"); m.clearVariants(); m.update(); } catch (e) { /* ignore */ } });
    FN.ok = false; dirty = true;
  }
  function fnCheck() {
    if (!FN || !FN.ok || !FN.checkAt || performance.now() < FN.checkAt) return;
    FN.checkAt = 0;
    var bad = false;
    FN.mats.forEach(function (m) { if (m.variants) m.variants.forEach(function (sh) { if (sh && sh.failed) bad = true; }); });
    if (bad) { console.warn("[stage] paint shader failed, paint is off"); fnRevert(); }
  }
  var pixCache = new Map();
  function texPixels(t) {
    if (pixCache.has(t)) return pixCache.get(t);
    var out = null;
    try {
      var src = t.getSource && t.getSource();
      if (src) {
        var S = 1024, cv = doc.createElement("canvas"); cv.width = cv.height = S;
        var g = cv.getContext("2d", { willReadFrequently: true });
        g.drawImage(src, 0, 0, S, S);
        out = { w: S, h: S, d: g.getImageData(0, 0, S, S).data };
      }
    } catch (e) { out = null; }
    pixCache.set(t, out);
    return out;
  }
  // per room: 70th percentile of the baked brightness over its walls / floor (fnSamples + fnRoomRefs)
  function fnRoomRefs(targets) {
    var nR = FN.rooms.length, acc = { walls: [], floor: [] };
    for (var i = 0; i < nR; i++) { acc.walls.push([]); acc.floor.push([]); }
    var seed = 12345; function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    var LUT = new Float32Array(256); for (var q = 0; q < 256; q++) LUT[q] = Math.pow(q / 255, 2.2);
    targets.forEach(function (t) {
      var mesh = t.mi.mesh, mat = t.mi.material, pix = texPixels(mat.emissiveMap);
      if (!pix || !mesh) return;
      var pos = [], uv = [], idx = [];
      if (!mesh.getPositions(pos) || !mesh.getUvs(0, uv)) return;
      mesh.getIndices(idx);
      if (!idx.length) for (var z = 0; z < pos.length / 3; z++) idx.push(z);
      var wt = t.mi.node.getWorldTransform(), P = new pc.Vec3();
      var nv = pos.length / 3, wp = new Float32Array(nv * 3);
      for (var vi = 0; vi < nv; vi++) { P.set(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]); wt.transformPoint(P, P); wp[vi * 3] = P.x; wp[vi * 3 + 1] = P.y; wp[vi * 3 + 2] = P.z; }
      var grp = t.kind === 2 ? "floor" : "walls", budget = 20000;
      for (var ti = 0; ti + 2 < idx.length && budget > 0; ti += 3) {
        var a = idx[ti], b = idx[ti + 1], c = idx[ti + 2];
        var ax = wp[a * 3], ay = wp[a * 3 + 1], az = wp[a * 3 + 2];
        var e1 = [wp[b * 3] - ax, wp[b * 3 + 1] - ay, wp[b * 3 + 2] - az], e2 = [wp[c * 3] - ax, wp[c * 3 + 1] - ay, wp[c * 3 + 2] - az];
        var n = cross3(e1, e2), nl = Math.hypot(n[0], n[1], n[2]);
        if (nl < 1e-9) continue;
        var ny = n[1] / nl, area = nl / 2;
        if (t.kind === 2 ? Math.abs(ny) < 0.7 : Math.abs(ny) > 0.5) continue;
        var cx = ax + (e1[0] + e2[0]) / 3, cz = az + (e1[2] + e2[2]) / 3;
        if (t.kind !== 2) { var hl = Math.hypot(n[0], n[2]) || 1; cx += n[0] / hl * 0.08; cz += n[2] / hl * 0.08; }
        var room = FN.roomAt(cx, cz);
        if (room < 0) continue;
        var ns = clamp(Math.round(area / 0.0025), 4, 600);
        for (var s = 0; s < ns && budget > 0; s++, budget--) {
          var r1 = rnd(), r2 = rnd(); if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
          r1 = 0.05 + r1 * 0.9; r2 = 0.05 + r2 * 0.9; if (r1 + r2 > 0.95) { var sc2 = 0.95 / (r1 + r2); r1 *= sc2; r2 *= sc2; }
          var w0 = 1 - r1 - r2;
          var u = uv[a * 2] * w0 + uv[b * 2] * r1 + uv[c * 2] * r2, v = uv[a * 2 + 1] * w0 + uv[b * 2 + 1] * r1 + uv[c * 2 + 1] * r2;
          u -= Math.floor(u); v -= Math.floor(v);
          var o = ((Math.min(pix.h - 1, Math.floor(v * pix.h)) * pix.w) + Math.min(pix.w - 1, Math.floor(u * pix.w))) * 4;
          acc[grp][room].push(0.2126 * LUT[pix.d[o]] + 0.7152 * LUT[pix.d[o + 1]] + 0.0722 * LUT[pix.d[o + 2]]);
        }
      }
    });
    var refs = { walls: [], floor: [] };
    ["walls", "floor"].forEach(function (g) {
      acc[g].forEach(function (a, i) {
        if (a.length > 4000) { var st = a.length / 4000, bb = []; for (var j = 0; j < a.length; j += st) bb.push(a[Math.floor(j)]); a = bb; }
        a.sort(function (x, y) { return x - y; });
        refs[g][i] = a.length ? a[Math.min(a.length - 1, Math.floor(a.length * 0.7))] : 0;
      });
    });
    return refs;
  }
  function hexLin(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [Math.pow(((n >> 16) & 255) / 255, 2.2), Math.pow(((n >> 8) & 255) / 255, 2.2), Math.pow((n & 255) / 255, 2.2)];
  }
  function fnPush() {
    if (!FN || !FN.ok) return;
    var any = false;
    FN.targets.forEach(function (t) {
      var grp = t.kind === 2 ? "floor" : "walls", st = D.paint[grp], on = false;
      t.C.fill(0); t.P.fill(0);
      FN.rooms.forEach(function (r, i) {
        var lin = st[r.id] && hexLin(st[r.id]), ref = FN.refs[grp][i];
        if (!lin || !(ref > 0)) return;
        t.C[i * 4] = lin[0]; t.C[i * 4 + 1] = lin[1]; t.C[i * 4 + 2] = lin[2]; t.C[i * 4 + 3] = 1;
        t.P[i * 4 + 2] = ref; t.P[i * 4 + 3] = 0.35;
        on = true;
      });
      t.mi.setParameter("orbitFnKind", on ? t.kind : 0);
      t.mi.setParameter("orbitFnC[0]", t.C); t.mi.setParameter("orbitFnP[0]", t.P);
      if (on) any = true;
    });
    FN.active = any;
    dirty = true;
  }
  var w2mTmp = null;
  function fnFrame() {
    if (!FN || !FN.ok || !FN.active) return;
    w2mTmp = w2mTmp || new pc.Mat4();
    w2mTmp.copy(H.body.getWorldTransform()).invert();
    FN.w2m.set(w2mTmp.data);
    FN.mats.forEach(function (mt) { mt.setParameter("orbitFnW2M", FN.w2m); });
  }

  /* ---------- the library (CONTRACT 6.6): lib/index.json + one pack per piece ----------
     library.js holds the index of the library pieces and a 160 px picture of each;
     lib/<id>.js holds one piece's glb. A piece pack is read once into a PlayCanvas
     asset, then its base64 text and blob are let go; at most LIB_MAX assets stay
     (least recently used first out, never one that is on show or loading). */
  var CAT = null, catById = {}, catP = null;
  function loadCatalog() {
    if (catP) return catP;
    catP = needRaw("library").then(function () {
      var j = jsonFile("lib/index.json");
      var list = Array.isArray(j) ? j : (j && j.items) || [];
      CAT = list.filter(function (r) { return r && typeof r.id === "string"; }).map(function (r) {
        var o = { id: r.id, name: String(r.name || "Piece"), category: r.category || r.kind || "other", w: +r.w || 0, d: +r.d || 0, h: +r.h || 0, kb: +r.kb || 0 };
        o.kind = o.category;
        if (+r.scale > 0 && +r.scale !== 1) o.scale = +r.scale;
        return o;
      });
      catById = {};
      CAT.forEach(function (r) { catById[r.id] = r; });
      designEv.emit("change", { what: "library", count: CAT.length });
      return CAT;
    });
    catP.catch(function () { catP = null; });
    return catP;
  }
  var LIB_MAX = 24, libCache = new Map();   // id -> { p: Promise<asset>, a: asset|null, t: last use }
  function pieceAsset(id) {
    var c = libCache.get(id);
    if (c) { c.t = performance.now(); return c.p; }
    var name = "lib/" + id, fname = name + ".glb";
    c = { t: performance.now(), a: null, p: null };
    c.p = needRaw(name).then(function () {
      return loadGlb(fname, "lib-" + id);
    }).then(function (a) {
      // the asset has it now: free the base64 text, its blob URL and the script tag
      try { delete files()[fname]; } catch (e) { /* read-only object */ }
      if (urlCache[fname]) { try { URL.revokeObjectURL(urlCache[fname]); } catch (e) { /* ignore */ } delete urlCache[fname]; }
      forgetPack(name);
      c.a = a;
      return a;
    });
    c.p.catch(function () { if (libCache.get(id) === c) libCache.delete(id); forgetPack(name); });
    libCache.set(id, c);
    trimCache();
    return c.p;
  }
  function libInUse(id) {
    for (var n in E) if (E[n].libId === id) return true;
    for (var m in pend) if (pend[m].id === id) return true;
    return false;
  }
  function trimCache() {
    if (libCache.size <= LIB_MAX) return;
    var old = [];
    libCache.forEach(function (c, id) { if (c.a && !libInUse(id)) old.push([c.t, id]); });
    old.sort(function (a, b) { return a[0] - b[0]; });
    while (libCache.size > LIB_MAX && old.length) {
      var id = old.shift()[1], c = libCache.get(id);
      libCache.delete(id);
      // (Codex QC R7) the GLB's own parts ("lib-<id>/render/0", ".../material/1" ...) go too, or they pile up
      try {
        var pre = c.a.name + "/";
        app.assets.list().forEach(function (s) { if (s.name && s.name.indexOf(pre) === 0) { app.assets.remove(s); try { s.unload(); } catch (e) { /* gone */ } } });
      } catch (e) { /* gone */ }
      try { app.assets.remove(c.a); c.a.unload(); } catch (e) { /* gone */ }
    }
  }

  /* ---------- which way a piece faces (round 7) ----------
     The library keeps every piece as it stood in its house ("front: not normalised"), and
     Orbit v72 only lines up the long sides, so a swap could face the wall. The front is read
     from the shape: seats, chairs and beds are tall at the back (backrest, headboard), so the
     middle of the high parts lies behind the middle of the footprint. null = no clear answer
     (tables, cabinets), then the wall rule decides (front = away from the nearest wall). */
  var gfM = null, gfV = null;
  function geoFront(ent, frame) {
    gfM = gfM || new pc.Mat4(); gfV = gfV || new pc.Vec3();
    var inv = new pc.Mat4(); if (frame) inv.copy(frame.getWorldTransform()).invert();
    var pts = [], buf = [];
    ent.findComponents("render").forEach(function (r) {
      for (var q = r.entity; q && q !== ent.parent; q = q.parent) if (/__shadow$/i.test(q.name || "")) return;
      r.meshInstances.forEach(function (mi) {
        var mesh = mi.mesh, n = 0;
        if (!mesh || typeof mesh.getPositions !== "function") return;
        buf.length = 0;
        try { n = mesh.getPositions(buf) || 0; } catch (e) { n = 0; }
        if (!n) return;
        gfM.copy(inv).mul(mi.node.getWorldTransform());
        var step = Math.max(1, Math.floor(n / 3000));
        for (var i = 0; i < n; i += step) { gfV.set(buf[3 * i], buf[3 * i + 1], buf[3 * i + 2]); gfM.transformPoint(gfV, gfV); pts.push(gfV.x, gfV.y, gfV.z); }
      });
    });
    if (pts.length < 60) return null;
    var x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, i;
    for (i = 0; i < pts.length; i += 3) {
      x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); z0 = Math.min(z0, pts[i + 2]); z1 = Math.max(z1, pts[i + 2]);
    }
    var h = y1 - y0, hx = Math.max(0.02, (x1 - x0) / 2), hz = Math.max(0.02, (z1 - z0) / 2), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (h < 0.2) return null;
    var yH = y0 + 0.7 * h, sx = 0, sz = 0, cnt = 0;
    for (i = 0; i < pts.length; i += 3) if (pts[i + 1] >= yH) { sx += (pts[i] - cx) / hx; sz += (pts[i + 2] - cz) / hz; cnt++; }
    if (cnt < 10) return null;
    var ox = sx / cnt, oz = sz / cnt;
    if (Math.hypot(ox, oz) < 0.2) return null;            // the high parts sit in the middle: no back
    var fx = -ox * hx, fz = -oz * hz, l = Math.hypot(fx, fz) || 1;
    return [fx / l, fz / l];
  }
  // front = away from the nearest wall of the piece's room (within 70 cm), else toward its middle
  function wallFront(cx, cz, room) {
    var rb = roomBoxOf(room); if (!rb) return null;
    var d = [[cx - rb[0], [1, 0]], [rb[2] - cx, [-1, 0]], [cz - rb[1], [0, 1]], [rb[3] - cz, [0, -1]]];
    d.sort(function (a, b) { return a[0] - b[0]; });
    if (d[0][0] < 0.7) return d[0][1];
    var mx = (rb[0] + rb[2]) / 2 - cx, mz = (rb[1] + rb[3]) / 2 - cz, l = Math.hypot(mx, mz);
    return l > 0.3 ? [mx / l, mz / l] : null;
  }
  // the front of a real piece as it stood in the scan (model frame), cached (read while it stands unmoved)
  function realFront(p) {
    if (p._front === undefined) {
      var f = null;
      try { f = geoFront(p.ent, H.body); } catch (e) { f = null; }
      if (f && p.orig) {
        // the piece may stand turned by a move right now: take that turn back out
        var cur = p.ent.getLocalRotation(), o = p.orig.rot;
        if (Math.abs(cur.x - o.x) + Math.abs(cur.y - o.y) + Math.abs(cur.z - o.z) + Math.abs(cur.w - o.w) > 1e-4) {
          var r = -((D.moves[p.node] || {}).r || 0) * D2R;
          f = rotXZ(f, r);
        }
      }
      p._front = f;
    }
    return p._front || wallFront(p.box.cx, p.box.cz, p.room);
  }
  // (x, z) turned by t radians about up, the way setLocalEulerAngles(0, t, 0) turns local axes
  function rotXZ(f, t) { var c = Math.cos(t), s = Math.sin(t); return [f[0] * c + f[1] * s, -f[0] * s + f[1] * c]; }
  // of th0 + 0 / 180 (and 90 / 270 when the piece is about square), the turn whose front looks most along F
  function faceTurn(th0, f, F, square) {
    if (!f || !F) return th0;
    var best = th0, bd = -2;
    (square ? [0, 90, 180, 270] : [0, 180]).forEach(function (k) {
      var g = rotXZ(f, (th0 + k) * D2R), dd = g[0] * F[0] + g[1] * F[1];
      if (dd > bd + 1e-6) { bd = dd; best = th0 + k; }
    });
    return best;
  }
  function about(a, b) { return Math.abs(a - b) / Math.max(a, b, 1e-3) < 0.15; }

  /* ---------- the visitor's design (round 8, CONTRACT 8.3; port of mwSwap / mwPlaceItem of Orbit v72) ----------
     ONE design for the page visit (no storage this round), always shown on the shared house.
     D is plain data; the entities follow it (placeAll).
       swaps[node] = { id: libId, turn }     a real piece shown as a library piece (turn = extra degrees)
       moves[node] = { x, z, r }             a real or swapped piece moved / turned: metres from its
                                             own middle, degrees
       paint = { walls: {roomId: hex}, floor: {} }
       lights = { roomId: false }            a room's lamps off */
  var MD_FIXED = /\b(doors?|doorway|doorframe|stairs?|staircase|stairway|stairwell|ladders?|paving|grass|gravel|skirting|plaster|tiles?|sockets?|switch(es)?|intercom|vents?|thermostats?|opening)\b/i;
  function emptyDesign() { return { swaps: {}, moves: {}, paint: { walls: {}, floor: {} }, lights: {} }; }
  var D = emptyDesign(), E = {}, pend = {}, ticket = {}, blobMat = null, SEL = null;
  function pieceOf(node) { return H && node && H.pieceBy[node] || null; }
  function designable(p) { return !!p && !p.hidden && !p.internal && !MD_FIXED.test(p.name || ""); }
  function swapOf(node) { var s = D.swaps[node]; return s && s.id ? s : null; }
  function libIdFor(node) { var s = swapOf(node); return s ? s.id : null; }
  function normDeg(r) { return ((r % 360) + 540) % 360 - 180; }
  // half the footprint along the house's x and z for a box turned by t (radians)
  function halfXZ(hu, hn, ux, uz) { return [Math.abs(ux) * hu + Math.abs(uz) * hn, Math.abs(uz) * hu + Math.abs(ux) * hn]; }
  function moved(b, m) {
    var t = m ? (m.r || 0) * D2R : 0, c = Math.cos(t), s = Math.sin(t);
    return { cx: b.cx + (m ? m.x || 0 : 0), cz: b.cz + (m ? m.z || 0 : 0), y0: b.y0, y1: b.y1, ux: b.ux * c + b.uz * s, uz: -b.ux * s + b.uz * c, hu: b.hu, hn: b.hn };
  }
  // how far a real piece that hangs over another one goes up (that one swapped for a taller piece)
  function liftOf(p) {
    if (!p || !p.rest) return 0;
    var q = boxNow(p.rest.node);
    return q ? Math.max(0, q.y1 + p.rest.gap - p.box.y0) : 0;
  }
  // the piece's box as it stands now (model frame)
  function boxNow(node) {
    var p = pieceOf(node);
    if (!p) return null;
    var s = swapOf(node), e = E[node];
    if (s && e && e.ent && e.box && e.ent.enabled) return e.box;
    var b = moved(p.box, D.moves[node]), dy = liftOf(p);
    if (dy) { b.y0 += dy; b.y1 += dy; }
    return b;
  }
  function roomBoxOf(room) { var rb = H && H.roomBox[room]; return rb && isFinite(rb[0]) ? rb : null; }
  // keep a footprint in its room: [lo + e, hi - e] (its middle when the room is narrower);
  // keep0 = a spot that is always allowed (where a real piece stood first)
  function keepAxis(lo, hi, e, c, keep0) {
    var a = lo + e, z = hi - e;
    if (!(a <= z)) a = z = (lo + hi) / 2;
    if (keep0 !== undefined) { a = Math.min(a, keep0); z = Math.max(z, keep0); }
    return clamp(c, a, z);
  }
  function keepIn(room, cx, cz, ex, ez, k0) {
    var rb = roomBoxOf(room);
    if (!rb) return [cx, cz];
    return [keepAxis(rb[0], rb[2], ex, cx, k0 && k0[0]), keepAxis(rb[1], rb[3], ez, cz, k0 && k0[1])];
  }
  // a real piece's move kept in its room (its first spot always allowed), turn -180..180
  function keepReal(p, m) {
    var o = { x: +m.x || 0, z: +m.z || 0, r: normDeg(+m.r || 0) };
    var b = moved(p.box, o), hz = halfXZ(b.hu, b.hn, b.ux, b.uz);
    var c = keepIn(p.room, b.cx, b.cz, hz[0], hz[1], [p.box.cx, p.box.cz]);
    o.x = c[0] - p.box.cx; o.z = c[1] - p.box.cz;
    return o;
  }
  /* A real piece of the model where its move says (m) and lifted by dy, or back where the kit put
     it (null) (mdPoseEnt): about the piece's own middle, the turn r about up, then the shift. */
  var tq1 = null, tq2 = null, tm1 = null;
  function poseReal(p, m, dy) {
    var e = p.ent;
    if (!p.orig) { if (!m && !dy) return; p.orig = { pos: e.getLocalPosition().clone(), rot: e.getLocalRotation().clone() }; }
    e.setLocalPosition(p.orig.pos);
    e.setLocalRotation(p.orig.rot);
    if (!m && !dy) { dirty = true; return; }
    m = m || { x: 0, z: 0, r: 0 };
    tm1 = tm1 || new pc.Mat4(); tq1 = tq1 || new pc.Quat(); tq2 = tq2 || new pc.Quat();
    var B = H.body.getWorldTransform(), inv = tm1.copy(B).invert();
    var mp = inv.transformPoint(e.getPosition(), new pc.Vec3());
    var t = (m.r || 0) * D2R, c = Math.cos(t), s = Math.sin(t), dx = mp.x - p.box.cx, dz = mp.z - p.box.cz;
    var np = new pc.Vec3(p.box.cx + m.x + dx * c + dz * s, mp.y + (dy || 0), p.box.cz + m.z - dx * s + dz * c);
    e.setPosition(B.transformPoint(np, new pc.Vec3()));
    var qb = H.body.getRotation().clone(), qi = qb.clone().invert();
    var q = tq1.mul2(qb, tq2.setFromEulerAngles(0, m.r || 0, 0));
    q.mul(qi); q.mul(e.getRotation());
    e.setRotation(q);
    dirty = true;
  }
  // a library piece in its wrapper, standing on the floor with its bottom middle at the origin
  function wrapFor(node, id, a, rec, room) {
    var inst = a.resource.instantiateRenderEntity();
    var W = new pc.Entity("mwSwap-" + node);
    W.addChild(inst);
    prepMaterials(W);
    var m = measure(inst, W) || { mn: [-0.3, 0, -0.3], mx: [0.3, 0.6, 0.3] };
    inst.setLocalPosition(-(m.mn[0] + m.mx[0]) / 2, -m.mn[1], -(m.mn[2] + m.mx[2]) / 2);
    var sc = (rec && rec.scale) || 1, front = null;
    try { front = geoFront(inst, W); } catch (err) { front = null; }
    // its own contact shadow (a child "<id>__shadow") goes with it; else a soft patch under it
    var own = inst.findOne(function (q) { return q !== inst && /__shadow$/i.test(q.name || ""); });
    if (!own) {
      if (!blobMat) {
        blobMat = new pc.StandardMaterial();
        blobMat.useLighting = false; blobMat.diffuse.set(0, 0, 0); blobMat.emissive.set(0, 0, 0);
        blobMat.opacityMap = blobTexture(false); blobMat.opacityMapChannel = "a"; blobMat.opacity = 0.5;
        blobMat.blendType = pc.BLEND_NORMAL; blobMat.depthWrite = false; blobMat.useFog = false; blobMat.update();
        blobMat._orbitPrep = true;
      }
      var bl = new pc.Entity("mwBlob__shadow");
      bl.addComponent("render", { type: "plane", material: blobMat, castShadows: false, receiveShadows: false });
      bl.setLocalPosition(0, 0.004 / sc, 0);
      bl.setLocalScale((m.mx[0] - m.mn[0]) + 2 * 0.12 / sc, 1, (m.mx[2] - m.mn[2]) + 2 * 0.12 / sc);
      W.addChild(bl);
    }
    W.setLocalScale(sc, sc, sc);
    W.enabled = false;
    H.body.addChild(W);
    var wmis = [], tags = room ? [room] : [];
    W.findComponents("render").forEach(function (r) {
      r.meshInstances.forEach(function (mi) {
        var mt = mi.material, o = { mi: mi, tags: tags, base: mt && mt.emissive ? [mt.emissive.r, mt.emissive.g, mt.emissive.b] : [1, 1, 1], k: 1, hi: 1 };
        o.lt = lightOf(tags);
        if (o.lt !== ONE3) applyTint(o, 1, 1);
        wmis.push(o);
      });
    });
    H.mis = H.mis.concat(wmis);
    var ix = (m.mx[0] - m.mn[0]) * sc, iz = (m.mx[2] - m.mn[2]) * sc;
    return { libId: id, ent: W, mis: wmis, sc: sc, front: front, ix: ix, iz: iz, ih: (m.mx[1] - m.mn[1]) * sc, box: null,
      // a piece with real depth that replaces a wall-hung one (a TV on its foot): it stands on the piece below
      stand: Math.min(ix, iz) > 0.1 };
  }
  function dropWrap(node) {
    var e = E[node];
    if (!e) return;
    delete E[node];
    H.mis = H.mis.filter(function (o) { return e.mis.indexOf(o) < 0; });
    try { e.ent.destroy(); } catch (err) { /* gone */ }
    dirty = true;
  }
  /* Where the wrapper stands: on the real piece's middle, its long side along the real one's
     (mwPlaceItem), facing where the real one faced, plus the move. Never shrunk; pushed back into
     its room when it is bigger than the space (its footprint stays inside). A swap for a wall-hung
     piece hangs at the same height (above the piece below it); one with a foot stands on that piece. */
  function placeWrap(node) {
    var e = E[node], p = pieceOf(node), s = swapOf(node);
    if (!e || !e.ent || !p || !s) return;
    var mv = D.moves[node], b = p.box, L = b.hu >= b.hn ? [b.ux, b.uz] : [-b.uz, b.ux];
    var th = e.ix >= e.iz ? Math.atan2(-L[1], L[0]) / D2R : Math.atan2(L[0], L[1]) / D2R;
    // (a bed faces along its long side: then the quarter turns count too; only long pieces, never a TV on its foot)
    var endOn = !!e.front && Math.max(e.ix, e.iz) > 1.6 && Math.abs(e.ix >= e.iz ? e.front[0] : e.front[1]) > 0.7;
    th = faceTurn(th, e.front, realFront(p), about(e.ix, e.iz) || endOn);
    th += (+s.turn || 0) + (mv ? mv.r || 0 : 0);
    var cx = b.cx + (mv ? mv.x || 0 : 0), cz = b.cz + (mv ? mv.z || 0 : 0), y0 = H.floorY, keepMv = true;
    if (b.y0 > H.floorY + 0.05) {
      var q = p.rest ? boxNow(p.rest.node) : null;
      if (q && e.stand) { cx = q.cx; cz = q.cz; y0 = q.y1 + 0.004; keepMv = false; }
      else y0 = Math.max(b.y0, q ? q.y1 + p.rest.gap : b.y0);
    }
    var t = th * D2R, ux = Math.cos(t), uz = -Math.sin(t), hz = halfXZ(e.ix / 2, e.iz / 2, ux, uz);
    var c = keepIn(p.room, cx, cz, hz[0], hz[1]);
    // the kept spot is written back, so a drag past the wall does not lag behind
    if (keepMv && mv) { mv.x = c[0] - b.cx; mv.z = c[1] - b.cz; }
    e.ent.setLocalPosition(c[0], y0, c[1]);
    e.ent.setLocalEulerAngles(0, th, 0);
    e.box = { cx: c[0], cz: c[1], y0: y0, y1: y0 + e.ih, ux: ux, uz: uz, hu: e.ix / 2, hn: e.iz / 2 };
    dirty = true;
  }
  // the entities follow D: a swapped piece shows its library piece (the old one stays while the
  // new one loads), the others stand where their move says (supports first)
  function placeAll() {
    if (!H) return;
    H.order.forEach(function (p) {
      if (!designable(p)) return;
      var s = swapOf(p.node), e = E[p.node];
      var show = !!(s && e && e.ent && (e.libId === s.id || (pend[p.node] && pend[p.node].id === s.id)));
      if (p.ent.enabled === show) p.ent.enabled = !show;
      if (show) { placeWrap(p.node); if (!e.ent.enabled) e.ent.enabled = true; }
      else {
        if (e && e.ent.enabled) e.ent.enabled = false;
        if (D.moves[p.node] || p.orig || p.rest) poseReal(p, D.moves[p.node] || null, liftOf(p));
      }
    });
    dirty = true;
  }
  function syncNode(node) {
    var id = libIdFor(node), e = E[node];
    if (!id) { if (e) dropWrap(node); return; }
    if (e && e.libId === id) return;
    if (pend[node] && pend[node].id === id) return;
    var tk = ticket[node] = (ticket[node] || 0) + 1;
    var P = pieceAsset(id).then(function (a) {
      if (ticket[node] !== tk) return;
      delete pend[node];
      if (libIdFor(node) !== id || !pieceOf(node)) return;
      dropWrap(node);
      E[node] = wrapFor(node, id, a, catById[id], pieceOf(node).room);
      placeAll();
      if (SEL === node) selectNode(node);
      trimCache();
      designEv.emit("change", { what: "load", node: node, id: id });
    }, function (err) {
      if (ticket[node] !== tk) return;
      delete pend[node];
      console.warn("[stage] piece could not load:", err && err.message);
      // the design goes back to what is on screen
      var cur = E[node];
      if (cur) D.swaps[node] = { id: cur.libId, turn: 0 }; else delete D.swaps[node];
      syncAll();
      designEv.emit("change", { what: "error", node: node, id: id });
      throw err;
    });
    pend[node] = { id: id, p: P };
    P.catch(function () { /* told by the "error" event */ });
  }
  function syncAll() {
    if (!H) return;
    Object.keys(E).forEach(function (n) { if (!libIdFor(n)) dropWrap(n); });
    Object.keys(D.swaps).forEach(syncNode);
    placeAll();
    trimCache();
  }
  // resolves once this node shows this piece (or a newer choice replaced it)
  function waitFor(node, id) {
    if (E[node] && E[node].libId === id) return Promise.resolve();
    if (pend[node] && pend[node].id === id) return pend[node].p;
    return Promise.resolve();
  }
  function changed(what, node) {
    syncAll();
    paintSync();
    designEv.emit("change", { what: what, node: node || null });
  }
  var paintKey = "{\"walls\":{},\"floor\":{}}";
  function paintSync() {
    var k = JSON.stringify(D.paint);
    if (k === paintKey) return;
    var any = Object.keys(D.paint.walls).length + Object.keys(D.paint.floor).length > 0;
    if (any && !fnPrepare().ok) return;
    paintKey = k;
    if (FN && FN.ok) fnPush();
  }
  function spotOf(node) {
    var m = D.moves[node];
    return pieceOf(node) ? { x: m ? m.x : 0, z: m ? m.z : 0, r: m ? m.r : 0 } : null;
  }
  function setSpot(node, x, z, r) {
    var p = pieceOf(node);
    if (!designable(p)) return null;
    var m = swapOf(node) ? { x: +x || 0, z: +z || 0, r: normDeg(+r || 0) } : keepReal(p, { x: x, z: z, r: r });
    if (Math.abs(m.x) < 1e-4 && Math.abs(m.z) < 1e-4 && Math.abs(m.r) < 0.05) delete D.moves[node]; else D.moves[node] = m;
    placeAll();
    return spotOf(node);
  }
  function selAll(node) {
    var e = E[node], p = pieceOf(node), set = new Set(), out = [];
    if (p) p.ent.findComponents("render").forEach(function (r) { r.meshInstances.forEach(function (mi) { set.add(mi); }); });
    H.mis.forEach(function (o) { if (set.has(o.mi)) out.push(o); });
    return e ? out.concat(e.mis) : out;
  }
  /* (29 Oct, James) nothing may stand between the visitor and the view: a thing (furniture or a fixed
     part of the model, never a wall or a floor) goes invisible while the camera is inside it, while it
     blocks the line to the target, or while it stands low and close in front of the camera (the
     clutter at the foot of the screen). Nothing is removed: it is only not drawn (meshInstance.visible)
     and comes back as soon as it is out of the way. Boxes = the world AABB of each render (the tour
     uses pose(null), so world = model frame). keep = piece nodes that always stay; eye null = all back. */
  var CLR = { list: null, n: 0 };
  function clrList() {
    var skip = new Set();
    H.walls.forEach(function (w) { skip.add(w.full); if (w.low) skip.add(w.low); });
    var out = [];
    H.body.findComponents("render").forEach(function (r) {
      var nodeName = null, wall = false;
      for (var q = r.entity; q && q !== H.body; q = q.parent) {
        var nm = q.name || "";
        if (skip.has(q) || /^(Floor|LowWall|LowLid)__|^Orbit(Glow|HouseShadow)/.test(nm)) { wall = true; break; }
        if (!nodeName && H.pieceBy[nm]) nodeName = nm;
      }
      if (!wall) out.push({ r: r, node: nodeName, hid: false });
    });
    // swapped pieces: their wrapper knows its node
    Object.keys(E).forEach(function (node) {
      var e = E[node]; if (!e || !e.ent) return;
      e.ent.findComponents("render").forEach(function (r) { out.forEach(function (o) { if (o.r === r) o.node = node; }); });
    });
    return out;
  }
  function boxOf(r) {
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    r.meshInstances.forEach(function (mi) {
      var a = mi.aabb, c = a.center, h = a.halfExtents;
      mn[0] = Math.min(mn[0], c.x - h.x); mn[1] = Math.min(mn[1], c.y - h.y); mn[2] = Math.min(mn[2], c.z - h.z);
      mx[0] = Math.max(mx[0], c.x + h.x); mx[1] = Math.max(mx[1], c.y + h.y); mx[2] = Math.max(mx[2], c.z + h.z);
    });
    return isFinite(mn[0]) ? { mn: mn, mx: mx } : null;
  }
  function inAabb(b, x, y, z, m) {
    return x > b.mn[0] - m && x < b.mx[0] + m && y > b.mn[1] - m && y < b.mx[1] + m && z > b.mn[2] - m && z < b.mx[2] + m;
  }
  function blocks(b, eye, tgt, was) {
    var m = was ? 0.12 : 0.05;   // a little stickier once hidden, so it does not flicker on the edge
    var big = b.mx[0] - b.mn[0] > 3 || b.mx[2] - b.mn[2] > 3;   // a whole kitchen run, a roof: never
    if (big) return false;
    if (inAabb(b, eye[0], eye[1], eye[2], m + 0.1)) return true;
    var dx = tgt[0] - eye[0], dy = tgt[1] - eye[1], dz = tgt[2] - eye[2], dist = Math.hypot(dx, dy, dz) || 1;
    // the line of sight, up to just before the target
    for (var i = 1; i <= 24; i++) {
      var t = i / 24 * 0.8;
      if (inAabb(b, eye[0] + dx * t, eye[1] + dy * t, eye[2] + dz * t, m)) return true;
    }
    // low and close in front of the camera (not lamps, shelves or what hangs on the walls)
    if (b.mn[1] > 1.0) return false;
    var cx = (b.mn[0] + b.mx[0]) / 2 - eye[0], cy = (b.mn[1] + b.mx[1]) / 2 - eye[1], cz = (b.mn[2] + b.mx[2]) / 2 - eye[2];
    var along = (cx * dx + cy * dy + cz * dz) / dist;
    if (along < -0.2 || along > dist * (was ? 0.5 : 0.42)) return false;
    var side = Math.sqrt(Math.max(0, cx * cx + cy * cy + cz * cz - along * along));
    var half = Math.max(b.mx[0] - b.mn[0], b.mx[2] - b.mn[2]) / 2;
    return side < Math.max(0.6, along * 1.05) + half;
  }
  // hideAlso (round 9): piece nodes that stay hidden at this stop whatever the camera does (a lamp
  // shade that only clutters the view there); they come back with everything else
  function clearView(eye, tgt, keep, hideAlso) {
    if (!H) return;
    if (!CLR.list || ++CLR.n > 45) { CLR.n = 0; var old = CLR.list; CLR.list = clrList(); if (old) old.forEach(function (o) { if (o.hid) set(o, false); }); }
    function set(o, hide) { o.hid = hide; o.r.meshInstances.forEach(function (mi) { mi.visible = !hide; }); dirty = true; }
    if (!eye) { CLR.list.forEach(function (o) { if (o.hid) set(o, false); }); return; }
    CLR.list.forEach(function (o) {
      var hide = false;
      if (hideAlso && o.r.entity.enabled && hideAlso.some(function (n) { return o.node === n || (o.r.entity.name || "").indexOf(n) === 0; })) hide = true;
      else if (o.r.entity.enabled && (!o.node || ((!keep || keep.indexOf(o.node) < 0) && o.node !== SEL))) {
        var b = boxOf(o.r);
        hide = !!b && blocks(b, eye, tgt, o.hid);
      }
      if (hide !== o.hid) set(o, hide);
    });
  }
  function selectNode(node) {
    if (!H) return;
    if (SEL) selAll(SEL).forEach(function (o) { applyTint(o, o.k, 1); });
    SEL = node && designable(pieceOf(node)) ? node : null;
    if (SEL) selAll(SEL).forEach(function (o) { applyTint(o, o.k, 1.2); });
    dirty = true;
  }
  /* (round 9, review C couch 3) the chosen piece: a soft glowing ring on the floor under it (the thin
     orange box looked like a debug line). One plane with a soft rounded-rectangle texture, a child of
     the house body (model frame), turned and sized to the piece's footprint. Shown only while a scene
     calls outline() in its update (every frame); it fades in over 0.25 s and is gone otherwise. */
  var SG = { ent: null, mat: null, want: false, a: 0 }, SG_M = 44, SG_N = 256;
  function selGlowTexture() {
    var N = SG_N, m = SG_M, cv = doc.createElement("canvas"); cv.width = cv.height = N;
    var g = cv.getContext("2d"), r = 52;
    function rr(x, y, w, h, q) { g.beginPath(); g.moveTo(x + q, y); g.arcTo(x + w, y, x + w, y + h, q); g.arcTo(x + w, y + h, x, y + h, q); g.arcTo(x, y + h, x, y, q); g.arcTo(x, y, x + w, y, q); g.closePath(); }
    g.clearRect(0, 0, N, N);
    // (round 9 fix, manager) a thin, soft ring: about half the width and glow of the first version
    rr(m, m, N - 2 * m, N - 2 * m, r); g.fillStyle = "rgba(255,255,255,0.07)"; g.fill();
    g.shadowColor = "rgba(255,255,255,0.8)"; g.shadowBlur = 10; g.lineWidth = 4; g.strokeStyle = "rgba(255,255,255,0.95)";
    rr(m, m, N - 2 * m, N - 2 * m, r); g.stroke();
    var t = new pc.Texture(device, { width: N, height: N, format: pc.PIXELFORMAT_RGBA8, mipmaps: true, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR });
    t.setSource(cv);
    return t;
  }
  function selGlow() {
    if (SG.ent || !H || !pc) return SG.ent;
    var m = SG.mat = new pc.StandardMaterial();
    m.useLighting = false; m.diffuse.set(0, 0, 0); m.emissive.set(1, 0.46, 0.24);
    m.opacityMap = selGlowTexture(); m.opacityMapChannel = "a"; m.opacity = 0;
    m.blendType = pc.BLEND_NORMAL; m.depthWrite = false; m.cull = pc.CULLFACE_NONE;
    m.useFog = false; m.useSkybox = false; m.useTonemap = false; m.update();
    m._orbitPrep = true;
    // "OrbitGlow..." = skipped by clearView, never hidden as clutter
    var e = SG.ent = new pc.Entity("OrbitGlowSelect");
    e.addComponent("render", { type: "plane", material: m, castShadows: false, receiveShadows: false });
    e.enabled = false;
    H.body.addChild(e);
    return e;
  }
  function drawOutline() {
    if (!SEL || !app || !H) return;
    var b = boxNow(SEL); if (!b) return;
    var e = selGlow(); if (!e) return;
    var pad = 0.1, k = SG_N / (SG_N - 2 * SG_M);
    e.setLocalPosition(b.cx, b.y0 + 0.012, b.cz);
    e.setLocalEulerAngles(0, Math.atan2(-b.uz, b.ux) / D2R, 0);
    e.setLocalScale(2 * (b.hu + pad) * k, 1, 2 * (b.hn + pad) * k);
    if (!e.enabled) e.enabled = true;
    SG.want = true; dirty = true;
  }
  // every frame after the scene's update: fade the ring in while it is wanted, out (then off) when not
  function stepSelGlow(dt) {
    if (!SG.ent) return;
    var to = SG.want && SEL ? 0.65 : 0;
    SG.want = false;
    if (Math.abs(SG.a - to) < 0.004) { if (SG.a === to) { if (!to && SG.ent.enabled) SG.ent.enabled = false; return; } SG.a = to; }
    else SG.a = reduced ? to : follow(SG.a, to, 0.08, dt);
    SG.mat.opacity = SG.a; SG.mat.update();
    if (!SG.a && SG.ent.enabled) SG.ent.enabled = false;
    dirty = true;
  }
  function rayBox(ray, b) {
    // into the box frame (u = long side, y, n)
    var ox = ray.o[0] - b.cx, oz = ray.o[2] - b.cz;
    var o = [ox * b.ux + oz * b.uz, ray.o[1], -ox * b.uz + oz * b.ux];
    var d = [ray.d[0] * b.ux + ray.d[2] * b.uz, ray.d[1], -ray.d[0] * b.uz + ray.d[2] * b.ux];
    var lo = [-b.hu, b.y0, -b.hn], hi = [b.hu, b.y1, b.hn], t0 = 0, t1 = 1e9;
    for (var i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return -1; continue; }
      var a = (lo[i] - o[i]) / d[i], c = (hi[i] - o[i]) / d[i];
      if (a > c) { var tt = a; a = c; c = tt; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 > t1) return -1;
    }
    return t0;
  }
  // where the ray through a CSS pixel meets the level y (house at identity: model = world)
  function planeHit(cx, cy, y) {
    var r = core.ray(cx, cy);
    if (Math.abs(r.d[1]) < 0.02) return null;
    var t = (y - r.o[1]) / r.d[1];
    if (!(t > 0) || t > 80) return null;
    return { x: r.o[0] + r.d[0] * t, z: r.o[2] + r.d[2] * t };
  }

  /* ---------- pointer input from .stage-hit ---------- */
  var ptrs = new Map(), gest = null;
  function ownerTakes(hitEl) {
    if (!owner || !scenes[owner]) return null;
    var def = scenes[owner], st = bstate(owner);
    var only = hitEl.getAttribute("data-hit");
    if (only && only !== owner) return null;
    if (!def.interactive || !def.interactive(st)) return null;
    return def;
  }
  function pinchDist() { var a = []; ptrs.forEach(function (p) { a.push(p); }); return a.length < 2 ? 0 : Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
  function onDown(e) {
    var hit = e.target && e.target.closest ? e.target.closest(".stage-hit") : null;
    if (!hit) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    var def = gest ? gest.def : ownerTakes(hit);
    if (!def) return;
    if (e.pointerType === "mouse") e.preventDefault();
    try { hit.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gest) {
      gest = { def: def, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, pinch: 0, vx: 0, vy: 0, lt: performance.now() };
      if (def.down) def.down({ x: e.clientX, y: e.clientY, type: e.pointerType, el: hit });
    }
    if (ptrs.size === 2) { gest.pinch = pinchDist(); gest.moved = true; }
    dirty = true;
  }
  function onMove(e) {
    if (!gest || !ptrs.has(e.pointerId)) return;
    var p = ptrs.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    var now = performance.now(), dtm = Math.max(4, now - gest.lt) / 1000; gest.lt = now;
    if (ptrs.size >= 2) {
      var d = pinchDist();
      if (gest.pinch > 0 && d > 0 && gest.def.pinch) gest.def.pinch(d / gest.pinch, { x: e.clientX, y: e.clientY });
      gest.pinch = d;
      return;
    }
    if (!gest.moved && Math.hypot(e.clientX - gest.x0, e.clientY - gest.y0) > 6) gest.moved = true;
    if (!gest.moved) return;
    gest.vx = mix(gest.vx, dx / dtm, 0.35); gest.vy = mix(gest.vy, dy / dtm, 0.35);
    if (gest.def.move) gest.def.move({ x: e.clientX, y: e.clientY, dx: dx, dy: dy, type: e.pointerType });
    dirty = true;
  }
  function onUp(e) {
    if (!gest || !ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size) { gest.pinch = 0; return; }
    var g = gest; gest = null;
    var quick = performance.now() - g.t0 < 500;
    if (e.type === "pointerup" && !g.moved && quick && g.def.tap) g.def.tap({ x: e.clientX, y: e.clientY, type: e.pointerType });
    var stale = performance.now() - g.lt > 90; // finger stopped before lifting = no fling
    if (g.def.up) g.def.up({ x: e.clientX, y: e.clientY, vx: stale ? 0 : g.vx, vy: stale ? 0 : g.vy, moved: g.moved, type: e.pointerType });
    dirty = true;
  }

  /* ---------- the frame (PlayCanvas update; render on demand) ---------- */
  var slow = { t: 0, n: 0, skip: 2 };
  /* Round 8 (manager): (1) the stage draws NOTHING when no [data-stage] beat is on or near the screen
     (within 0.6 screens), so no house can bleed through the plain sections; (2) while an Orbit viewer
     iframe is engaged (OrbitEngage kind "frame", html.frame-engaged) the loop does no work and draws
     nothing (core.paused() tells the splat scenes, which drop their budgets themselves). */
  var frameHold = false, heldOut = false, lastScrollY = -1, farIdle = 0, farSkip = 0, shaderWait = false;
  doc.addEventListener("orbit:engage", function (e) {
    var d = e && e.detail; if (!d || d.kind !== "frame") return;
    frameHold = !!d.on; dirty = true;
  });
  // (4 Nov 2026 audit) a playing frame only pauses the stage when no 3D section is on or near the screen:
  // pressing Play on the first result while the floor model was still in view made the model vanish
  core.paused = function () { return (frameHold || root.classList.contains("frame-engaged")) && !beatsNear(); };
  function beatsNear() {
    var vh = win.innerHeight || 800, m = vh * 0.6;
    for (var i = 0; i < beatEls.length; i++) {
      var r = beatEls[i].getBoundingClientRect();
      if ((r.height > 0 || r.width > 0) && r.bottom > -m && r.top < vh + m && scenes[beatEls[i].getAttribute("data-stage")]) return true;
    }
    return false;
  }
  function frame(dt) {
    var now = performance.now() / 1000;
    dt = Math.min(Math.max(dt || 0.016, 0), 0.1);
    if (core.paused()) {
      // the last picture must not stay on screen behind the live iframe: fade the canvas out (0.3 s)
      if (lastAlpha !== 0) {
        canvas.style.transition = reduced ? "none" : "opacity .3s ease";
        canvas.style.opacity = "0";
        root.classList.remove("stage-on", "stage-live");
        lastAlpha = 0; heldOut = true;
      }
      return;
    }
    if (heldOut) {
      // back from an iframe: the next opacity change fades in too, then plain again
      heldOut = false; dirty = true;
      setTimeout(function () { if (!heldOut) canvas.style.transition = "none"; }, 450);
    }
    // (4 Nov 2026, phone battery) far from every 3D section (contact, examples...) with nothing on the stage:
    // look only every 8th frame whether one comes near again, instead of measuring all sections every frame
    if (!owner && lastAlpha === 0 && farIdle > 30 && (++farSkip & 7)) return;
    // the page scrolled: draw (scroll-driven scenes move pieces without moving the camera)
    var sy = win.scrollY || win.pageYOffset || 0;
    if (sy !== lastScrollY) { lastScrollY = sy; wakeDraw(); }
    if (now < settleT) dirty = true;
    if (shaderWait) { shaderWait = false; wakeDraw(); }
    if (++collectT > 60) { collectT = 0; collectBeats(); }
    readBeats(dt);
    // owner = the registered scene with the highest beat weight; it keeps the stage while fading out
    var best = null, bw = 0.0005, near = beatsNear();
    farIdle = near ? 0 : farIdle + 1;
    for (var id in scenes) { var s = bstate(id); if (s.w > bw) { bw = s.w; best = id; } }
    if (!best && owner && bstate(owner).alpha > 0.002) best = owner;
    if (!near) best = null;
    if (best !== owner) {
      if (owner && scenes[owner] && scenes[owner].off) { try { scenes[owner].off(); } catch (e) { console.warn(e); } }
      // what the next scene takes over from (round 6): same house, same camera, no blink
      core.handoff = { from: owner, alpha: owner ? Math.max(0, lastAlpha) : 0, t: performance.now(),
        view: { eye: v3(view.eye), target: v3(view.target), up: v3(view.up), fov: view.fov, shift: view.shift.slice(), near: view.near, far: view.far } };
      if (owner) bstate(owner).alpha = 0;
      owner = best;
      dirty = true;
    }
    var alpha = 0, live = false;
    if (owner) {
      var st = bstate(owner), def = scenes[owner];
      try { alpha = clamp(+def.update(st, dt, now) || 0, 0, 1); } catch (e) { console.warn("[stage] scene", owner, e); alpha = 0; }
      st.alpha = alpha;
      live = alpha > 0.5 && !!(def.interactive && def.interactive(st));
    }
    fnCheck();
    if (alpha > 0.002) fnFrame();
    stepLights(dt);
    stepSelGlow(dt);
    var a2 = near ? Math.round(alpha * 100) / 100 : 0;
    if (a2 !== lastAlpha) {
      canvas.style.opacity = String(a2);
      root.classList.toggle("stage-on", a2 > 0);
      lastAlpha = a2; dirty = true;
    }
    if (root.classList.contains("stage-live") !== live) root.classList.toggle("stage-live", live);
    // (4 Nov 2026, James: "still lagging a lot on phone") a phone that cannot hold 45 fps draws every other frame:
    // a steady 30 instead of an uneven 26-35 (the stacked house alone is ~730 pieces a frame); the page itself,
    // the scroll and the scene clocks keep running every frame
    var skipDraw = frameDiv > 1 && (++frameN % frameDiv) !== 0;
    if (a2 > 0 && dirty && !skipDraw) { orientGlows(); app.renderNextFrame = true; perf(dt * frameDiv); }
    warmTick();
    if (a2 > 0 && !skipDraw) dirty = false;
  }
  core.owner = function () { return owner; };
  // slow device: lower the pixel ratio step by step (never below 1)
  function perf(dt) {
    if (reduced) return;
    if ((slow.skip -= dt) > 0) return;
    slow.t += dt; slow.n++;
    if (slow.t >= 2) {
      var fps = slow.n / slow.t; slow.t = 0; slow.n = 0;
      core.fps = fps;
      log("fps", fps.toFixed(1), "dpr", core.dpr);
      if (fps < 40 && dprCap > 1) { dprCap = Math.max(1, dprCap - 0.25); resize(); slow.skip = 1; }
      // phones only, once (fps counts drawn frames): below 45 -> draw at 30 for the rest of the visit
      if (isPhone && frameDiv === 1 && fps < 45) { frameDiv = 2; log("phone: drawing at 30 fps"); }
    }
  }
  var frameDiv = 1, frameN = 0;

  /* ---------- boot ---------- */
  function fail(msg) {
    if (msg) console.warn("[stage] off:", msg);
    if (canvas) canvas.style.display = "none";
    root.classList.remove("stage-on", "stage-live");
    root.classList.add("stage-none");
  }
  function hasWebGL2() {
    try {
      var c = doc.createElement("canvas"), g = c.getContext("webgl2");
      if (!g) return false;
      var ext = g.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext();
      return true;
    } catch (e) { return false; }
  }
  function loadEngine() {
    if (win.pc && win.pc.AppBase) return Promise.resolve(win.pc);
    return new Promise(function (ok, no) {
      var s = doc.createElement("script");
      s.src = BASE + "vendor/playcanvas.min.js";
      s.onload = function () { win.pc ? ok(win.pc) : no(new Error("engine missing")); };
      s.onerror = function () { no(new Error("engine script missing")); };
      doc.head.appendChild(s);
    });
  }
  function boot() {
    if (!canvas) return;
    if (!webgl2()) { fail("no WebGL2"); return; }
    canvas.style.transition = "none";
    canvas.style.opacity = "0";
    var t0 = performance.now();
    loadEngine().then(function (P) {
      pc = core.pc = P;
      tmpV = new pc.Vec3(); tmpM = new pc.Mat4();
      return pc.createGraphicsDevice(canvas, { deviceTypes: [pc.DEVICETYPE_WEBGL2], antialias: !isPhone, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    }).then(function (dev) {
      device = core.device = dev;
      var o = new pc.AppOptions();
      o.graphicsDevice = dev;
      o.componentSystems = [pc.RenderComponentSystem, pc.CameraComponentSystem, pc.LightComponentSystem].concat(pc.GSplatComponentSystem ? [pc.GSplatComponentSystem] : []);
      o.resourceHandlers = [pc.TextureHandler, pc.ContainerHandler].concat(pc.GSplatHandler ? [pc.GSplatHandler] : []);
      app = core.app = new pc.AppBase(canvas);
      app.init(o);
      app.setCanvasFillMode(pc.FILLMODE_NONE);
      app.setCanvasResolution(pc.RESOLUTION_AUTO);
      app.autoRender = false;
      app.scene.ambientLight = new pc.Color(0.5, 0.5, 0.52);
      camE = core.camera = new pc.Entity("StageCamera");
      camE.addComponent("camera", { clearColor: new pc.Color(0, 0, 0, 0), fov: 40, nearClip: 0.05, farClip: 300 });
      // lens shift (the space engine frames subjects with PM[8], PM[9])
      camE.camera.calculateProjection = function (mat) { mat.data[8] = view.shift[0]; mat.data[9] = view.shift[1]; };
      app.root.addChild(camE);
      var sun = new pc.Entity("StageSun");
      sun.addComponent("light", { type: "directional", color: new pc.Color(1, 0.98, 0.95), intensity: 0.85, castShadows: false });
      sun.setLocalEulerAngles(55, 35, 0);
      app.root.addChild(sun);
      resize();
      win.addEventListener("resize", resize);
      core.sun = sun;
      // (30 Oct, James: "laggy") a model material whose shader is still compiling is skipped for a frame or two
      // instead of freezing the page while it compiles (100-150 ms each, the browser compiles in the background)
      if (dev.extParallelShaderCompile) {
        var setS = dev.setShader.bind(dev);
        dev.setShader = function (s, async) { return setS(s, async || !!(s && s.name && s.name.indexOf("StandardShader") === 0)); };
        // (4 Nov 2026) a part skipped because its shader is still compiling must be drawn once it is done: the
        // stage no longer redraws every frame, so keep drawing while any shader is still being compiled
        if (typeof dev.activateShader === "function") {
          var actS = dev.activateShader.bind(dev);
          dev.activateShader = function () { var r = actS(); if (dev.shaderValid === false && dev.shader && !dev.shader.failed) shaderWait = true; return r; };
        }
      }
      app.on("update", frame);
      app.start();
      canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); }, false);
      log("engine", Math.round(performance.now() - t0), "ms");
      core.engine = true;
      engineFns.splice(0).forEach(function (fn) { try { fn(core); } catch (e) { console.warn(e); } });
      fire("orbit:stage-engine");
      if (houseState === "wanted") loadHouse();
    }).catch(function (e) {
      fail(e && e.message);
    });
  }
  function fire(name) {
    var ev; try { ev = new CustomEvent(name); } catch (e) { ev = doc.createEvent("Event"); ev.initEvent(name, true, true); }
    doc.dispatchEvent(ev);
  }
  // the house: wanted (pack starts downloading at once), built once the engine runs
  function wantHouse(why) {
    if (houseState || !canvas) return;
    if (!gateOpen) { gated(function () { wantHouse(why); }); return; }
    if (root.classList.contains("stage-none") || !webgl2()) return;
    houseState = "wanted";
    log("house wanted:", why);
    needRaw("house").catch(function () { /* reported by loadHouse */ });
    if (core.engine) loadHouse(); else wake(why);
  }
  /* core.prewarm(entity) (30 Oct, James: smooth transitions): every material under entity (hidden pieces too,
     such as the low walls the cutaway shows later) is drawn once into a tiny off-screen picture, so its shader
     starts compiling right after loading and is ready long before it first shows on screen. */
  var warm = null;
  core.prewarm = function (ent) {
    if (!app || !ent || !device.extParallelShaderCompile) return;
    if (!warm) {
      var layer = new pc.Layer({ name: "OrbitWarm" });
      app.scene.layers.push(layer);
      if (core.sun) core.sun.light.layers = core.sun.light.layers.concat([layer.id]);
      var tex = new pc.Texture(device, { name: "OrbitWarm", width: 4, height: 4, format: pc.PIXELFORMAT_RGBA8, mipmaps: false });
      var ce = new pc.Entity("OrbitWarmCamera");
      ce.addComponent("camera", { layers: [layer.id], renderTarget: new pc.RenderTarget({ colorBuffer: tex, depth: true }),
        clearColor: new pc.Color(0, 0, 0, 0), frustumCulling: false, priority: -1,
        toneMapping: camE.camera.toneMapping, gammaCorrection: camE.camera.gammaCorrection });
      ce.enabled = false;
      app.root.addChild(ce);
      warm = { layer: layer, cam: ce, list: [], n: 0, seen: {} };
    }
    var add = [];
    ent.findComponents("render").forEach(function (r) {
      (r.meshInstances || []).forEach(function (mi) {
        var vf = mi.mesh && mi.mesh.vertexBuffer && mi.mesh.vertexBuffer.format;
        var key = mi.material.id + "|" + (vf ? vf.renderingHashString : "");
        if (warm.seen[key]) return;
        warm.seen[key] = true;
        var w = new pc.MeshInstance(mi.mesh, mi.material, mi.node);
        w.cull = false;
        add.push(w);
      });
    });
    if (!add.length) return;
    warm.layer.addMeshInstances(add);
    warm.list = warm.list.concat(add);
    warm.cam.enabled = true;
    warm.n = 45;   // drawn (skipped until compiled) for about 0.75 s, then taken away
  };
  function warmTick() {
    if (!warm || warm.n <= 0) return;
    app.renderNextFrame = true;
    if (--warm.n > 0) return;
    warm.layer.removeMeshInstances(warm.list);
    warm.list = [];
    warm.cam.enabled = false;
  }
  function loadHouse() {
    if (houseState !== "wanted") return;
    houseState = "loading";
    var t0 = performance.now();
    needRaw("house").then(function () {
      var hj = jsonFile("house/house.json"), fl = jsonFile("house/furniture.json") || { items: [] }, lj = null;
      try { lj = jsonFile("house/lights.json"); } catch (e) { lj = null; }
      if (!hj) throw new Error("house.json missing");
      var gW = glbJson("house/walls.glb"), gF = glbJson("house/furniture.glb");
      return Promise.all([loadGlb("house/walls.glb", "house-walls"), loadGlb("house/furniture.glb", "house-furniture")]).then(function (as) {
        buildHouse(as[0], as[1], hj, fl, gW, gF, lj);
        core.house = H;
        core.prewarm(H.root);
        // (30 Oct night, James saw a solid ground floor under the stack's points) the house is hidden until a
        // scene that uses it turns it on (hero model view, tour, floor); before, it stayed on when it finished
        // loading while the stack scene had the stage, right where the stack's ground floor is
        H.root.enabled = false;
        log("house", Math.round(performance.now() - t0), "ms,", H.pieces.length, "pieces");
      });
    }).then(function () {
      ready = true;
      houseState = "done";
      readyFns.splice(0).forEach(function (fn) { try { fn(core); } catch (e) { console.warn(e); } });
      dirty = true;
      fire("orbit:stage-ready");
    }).catch(function (e) {
      // the engine keeps running for the scenes that need no house (the aerial splat)
      houseState = "failed";
      console.warn("[stage] house off:", e && e.message);
      root.classList.add("house-none");
    });
  }

  doc.addEventListener("pointerdown", onDown, { passive: false });
  doc.addEventListener("pointermove", onMove, { passive: true });
  doc.addEventListener("pointerup", onUp, { passive: true });
  doc.addEventListener("pointercancel", onUp, { passive: true });
  doc.addEventListener("orbit:feed", collectBeats);
  doc.addEventListener("visibilitychange", function () { dirty = true; });
  collectBeats();

  /* Round 5: the hero house is gone (CONTRACT 5.6). OrbitStage.hero stays so old
     callers do not break; its events never fire. */
  api.hero = { on: heroEv.on };

  /* Round 8 (CONTRACT 8.1): the scene "room-model", its catalogue drawer, the turnable preview and
     OrbitStage.room are retired (the room section is gone). The station tour and the whole floor
     (js/stage-tour.js) use core.design. */
  var lastDim = -1;
  function spaceDim(k) {
    k = Math.round(k * 100) / 100;
    if (k === lastDim) return;
    var S = win.OrbitSpace;
    // (31 Oct) the stage now loads before the points engine: only remember a value it really received
    if (S && typeof S.dim === "function") { lastDim = k; try { S.dim(k); } catch (e) { /* ignore */ } }
  }
  core.spaceDim = spaceDim;
  core.size = function () { return [cssW, cssH]; };

  var HEXRE = /^#[0-9a-f]{6}$/i;
  core.design = {
    on: designEv.on,
    catalog: function () { return loadCatalog(); },
    rec: function (id) { return catById[id] || null; },
    thumb: function (id) { return id && catById[id] ? file("lib/t/" + id + ".webp") : null; },
    preload: function (ids) {
      (ids || []).forEach(function (id) { if (catById[id]) pieceAsset(id).catch(function () { /* told on use */ }); });
    },
    piece: function (node) {
      var p = pieceOf(node); if (!designable(p)) return null;
      var s = swapOf(node);
      return { node: node, name: p.name, room: p.room, lib: p.lib, libId: s ? s.id : null, moved: !!D.moves[node],
        canRestore: !!(s || D.moves[node]), loading: !!(pend[node] && s && pend[node].id === s.id) };
    },
    box: function (node) { return H ? boxNow(node) : null; },
    swap: function (node, id, turn) {
      var p = pieceOf(node);
      if (!designable(p)) return Promise.reject(new Error("no piece"));
      if (!id || id === "original" || id === p.lib) {
        var had = !!D.swaps[node];
        delete D.swaps[node];
        if (had) changed("swap", node);
        return Promise.resolve();
      }
      return loadCatalog().then(function () {
        if (!catById[id]) throw new Error("no library piece");
        var cur = D.swaps[node];
        if (cur && cur.id === id) return waitFor(node, id);
        D.swaps[node] = { id: id, turn: +turn || 0 };
        changed("swap", node);
        return waitFor(node, id);
      });
    },
    spot: function (node) { return spotOf(node); },
    setSpot: function (node, x, z, r) { return setSpot(node, x, z, r); },
    changed: function (what, node) { designEv.emit("change", { what: what, node: node || null }); },
    restore: function (node) {
      if (!pieceOf(node)) return false;
      if (!D.swaps[node] && !D.moves[node]) return false;
      if (pend[node]) { ticket[node] = (ticket[node] || 0) + 1; delete pend[node]; }
      delete D.swaps[node]; delete D.moves[node];
      changed("restore", node);
      return true;
    },
    reset: function () {
      Object.keys(ticket).forEach(function (n) { ticket[n]++; delete pend[n]; });   // drop loads still running
      selectNode(null);
      D = emptyDesign();
      if (H) H.allOn();
      changed("reset");
      return true;
    },
    select: function (node) { selectNode(node || null); },
    selected: function () { return SEL; },
    clear: clearView,
    outline: drawOutline,
    paint: function (room, hex) {
      if (!H || !H.roomBox[room]) return false;
      if (hex) {
        hex = String(hex).toLowerCase();
        if (!HEXRE.test(hex) || !fnPrepare().ok) return false;
        if (D.paint.walls[room] === hex) return true;
        D.paint.walls[room] = hex;
      } else {
        if (!D.paint.walls[room]) return true;
        delete D.paint.walls[room];
      }
      paintSync();
      designEv.emit("change", { what: "paint", room: room });
      return true;
    },
    paintNow: function (room) { return D.paint.walls[room] || null; },
    light: function (room, on) {
      if (!H) return false;
      on = !!on;
      if (H.lightOn(room) === on) return true;
      (H.roomLamps[room] || [room]).forEach(function (k) { if (on) delete D.lights[k]; else D.lights[k] = false; });
      H.light(room, on);
      designEv.emit("change", { what: "lights", room: room, on: on });
      return true;
    },
    lightOn: function (room) { return !H || H.lightOn(room); },
    // one lamp of a room (key from lamps(room)); the room's light follows its lamps
    lamp: function (key, on) {
      if (!H || !H.lamps[key]) return false;
      on = !!on;
      if (H.lampOn(key) === on) return true;
      if (on) delete D.lights[key]; else D.lights[key] = false;
      H.lamp(key, on);
      designEv.emit("change", { what: "lights", lamp: key, on: on });
      return true;
    },
    lampOn: function (key) { return !H || H.lampOn(key); },
    // [{ key, name, pos (model metres), lumen }] of a room's switchable lamps
    lamps: function (room) {
      if (!H) return [];
      return (H.roomLamps[room] || []).map(function (k) { var l = H.lamps[k]; return { key: k, name: l.name, pos: l.pos.slice(), lumen: l.lumen }; });
    },
    rayBox: rayBox,
    planeHit: planeHit,
    state: function () { return JSON.parse(JSON.stringify(D)); }
  };

  /* ---------- when to start (round 8) ----------
     Nothing 3D at page load. wake() boots the ENGINE once, wantHouse() the house:
     - #scan within ~1.5 screen heights: the engine (+ the aerial pack, when
       js/stage-aerial.js registered a scene "aerial") and the house (card B of #scan);
     - #design or #floor within ~1.5 screen heights: the house;
     - #walk within ~1.5 screen heights: the patio pack (only without a streamed scan);
     - a section calls OrbitStage.need(...) (need("house") = the house too);
     - desktop only: on idle 6 s after load, the house + patio (phones never, to save data).
     Never before the page's first paint (wake waits for load + one frame). */
  function prefetch(base) {
    if (!scenes[base]) return;   // nobody draws it: never download it
    // round 7 (E7 note): the real scan streams instead; the old base64 pack only on file://, ?stream=0,
    // no ORBIT_SITE.scans entry (E's scenes ask for it themselves when a stream fails)
    if (typeof core.scanCfg === "function" && core.scanCfg(base === "patio" ? "house" : base) && !(core.streamOff && core.streamOff())) return;
    needRaw(packFor(base)).catch(function () { log("no pack", base); });
  }
  function webgl2() { if (gl2State === null) gl2State = hasWebGL2(); return gl2State; }
  function wake(why) {
    if (wakeState) return;
    if (!gateOpen) { gated(function () { wake(why); }); return; }
    wakeState = why || "?";
    log("wake:", wakeState);
    if (!canvas) return;
    // (31 Oct, phone speed) after the first paint, no longer after "load": "load" also waits for the ~3 MB of
    // background points, which held the 3D engine (and the hero's real scan) back by seconds on a phone
    function go() { win.requestAnimationFrame(function () { setTimeout(boot, 30); }); }
    if (doc.readyState !== "loading") go(); else doc.addEventListener("DOMContentLoaded", go, { once: true });
  }
  core.wake = wake;
  /* ---------- download lane (31 Oct, phone speed) ----------
     The big downloads come one after another in story order: hero scan -> stacked house -> drone scan ->
     house scan (#walk) -> house model (#design). Before, they all started together and shared the line, so on
     a 4G phone the hero scan arrived after 30 s and the stacked house only when the visitor was already inside
     its scene. core.lane(id, opt) -> Promise that resolves when job `id` may start:
       opt.after  = the job before it (its core.laneDone(after) starts this one),
       opt.el     = the element that needs it, opt.near = how close (screens) it may come before this one
                    starts anyway (the visitor is faster than the line),
       opt.max    = seconds after the start gate when it starts anyway (a job before it that never ends).
     Every job calls core.laneDone(id) when its download is in (or failed). ?stagedbg logs the order. */
  var laneSig = {};
  function sig(id) {
    if (!laneSig[id]) { var f, p = new Promise(function (ok) { f = ok; }); laneSig[id] = { p: p, fire: f, done: false }; }
    return laneSig[id];
  }
  core.laneAfter = function (id) { return sig(id).p; };
  core.laneDone = function (id) { var s = sig(id); if (!s.done) { s.done = true; log("lane done:", id); s.fire(); } };
  core.lane = function (id, opt) {
    opt = opt || {};
    return new Promise(function (go) {
      var on = false;
      function start(why) { if (on) return; on = true; log("lane start:", id, "(" + why + ")"); go(); }
      if (opt.after) sig(opt.after).p.then(function () { start("after " + opt.after); });
      else start("first");
      if (opt.el && "IntersectionObserver" in win) {
        var m = Math.round((opt.near || 1) * 100) + "%";
        var io = new IntersectionObserver(function (en) {
          if (en.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start("near"); }
        }, { rootMargin: m + " 0px " + m + " 0px" });
        io.observe(opt.el);
      }
      if (opt.max) gated(function () { setTimeout(function () { start("max " + opt.max + " s"); }, opt.max * 1000); });
    });
  };
  /* Round 8 (manager, for H's hero film): the watchers below act only once the visitor has scrolled or
     pressed / tapped / pressed a key, or the hero film is over (~9 s after load), whichever comes first;
     the ~1.5 screens rule holds after that. need(), wantHouse() and wake() (any caller) wait too. The first
     scroll is seen by a per-frame look at scrollY (no scroll listener), stopped once open. */
  var GATE_S = doc.querySelector('[data-stage="hero-room"]') ? 0.35 : 9, gateOpen = false, gateQ = [];
  function gateRun() {
    if (gateOpen) return;
    gateOpen = true;
    log("start gate open");
    gateQ.splice(0).forEach(function (fn) { try { fn(); } catch (e) { console.warn(e); } });
  }
  function gated(fn) { if (gateOpen) fn(); else gateQ.push(fn); }
  core.gate = function () { return gateOpen; };
  (function gate() {
    var y0 = win.scrollY || win.pageYOffset || 0, t0 = 0;
    ["pointerdown", "keydown", "touchstart"].forEach(function (ev) { doc.addEventListener(ev, gateRun, { passive: true, once: true }); });
    function look() {
      if (gateOpen) return;
      if (Math.abs((win.scrollY || win.pageYOffset || 0) - y0) > 4) { gateRun(); return; }
      win.requestAnimationFrame(look);
    }
    function armed() {
      y0 = win.scrollY || win.pageYOffset || 0;
      // opened mid page (a #link, a reload further down): nothing to wait for
      if (y0 > (win.innerHeight || 800) * 0.5) { gateRun(); return; }
      setTimeout(gateRun, GATE_S * 1000);
      win.requestAnimationFrame(look);
    }
    // (31 Oct) armed at the first paint, not at "load" (that waits for the background points, see wake())
    if (doc.readyState !== "loading") armed(); else doc.addEventListener("DOMContentLoaded", armed, { once: true });
  })();
  (function watch() {
    if (!canvas) return;
    function byIds(ids) { return ids.map(function (id) { return doc.getElementById(id); }).filter(Boolean); }
    // (31 Oct) the house model is first seen in #design (card B of #scan is gone, the stack has its own pack):
    // it waits in the download lane after the house scan, or starts when #design is 2.5 screens away
    var houseActs = byIds(["design", "floor"]), walk = byIds(["walk"]);
    var scan = doc.getElementById("scan"), near = { rootMargin: "150% 0px 150% 0px" };
    function any(en) { return en.some(function (e) { return e.isIntersecting; }); }
    if (!("IntersectionObserver" in win)) { gated(function () { wantHouse("no IntersectionObserver"); prefetch("patio"); }); return; }
    if (scan) {
      var io0 = new IntersectionObserver(function (en) {
        if (any(en)) { io0.disconnect(); gated(function () { wake("scan near"); prefetch("aerial"); }); }
      }, near);
      io0.observe(scan);
    }
    if (houseActs.length) {
      // (4 Nov 2026, memory: iPhone Safari closed the tab) phones do not take the house early in the lane: only
      // when #design comes within 2.5 screens (or the hero's model button asks for it), so the top of the page
      // does not hold it in memory as well
      core.lane("house", { after: isPhone ? "never (phone)" : "walk", el: houseActs[0], near: 2.5 }).then(function () { gated(function () { wantHouse("lane"); }); });
    }
    if (walk.length) {
      var io2 = new IntersectionObserver(function (en) {
        if (any(en)) { io2.disconnect(); gated(function () { prefetch("patio"); }); }
      }, near);
      walk.forEach(function (el) { io2.observe(el); });
    }
    if (!isPhone) {
      var idle = function () {
        setTimeout(function () {
          // (31 Oct) the house model no longer jumps the download lane on idle (it slowed the scans before it)
          var go = function () { gated(function () { prefetch("patio"); }); };
          if (win.requestIdleCallback) win.requestIdleCallback(go, { timeout: 2000 }); else go();
        }, 6000);
      };
      if (doc.readyState === "complete") idle(); else win.addEventListener("load", idle, { once: true });
    }
  })();
})();

