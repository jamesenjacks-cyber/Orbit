/* Orbit story site (5 Nov 2026): the 3D of the scroll story. PlayCanvas 2.22.1 (vendor/playcanvas.min.js).
   Light by design (James: "only load what is shown"):
   - the camera follows ONE fixed path (STORY.path in js/story-data.js): nothing has to be ready for free looking;
   - scans stream in the Orbit viewer's own tile format (lod-meta.json + SOG tiles): the engine fetches only the
     tiles the camera needs, never sharper than STORY.scans.*.finest (the sharpest level is not even shipped);
   - each part (aerial scan, house model, indoor scan, first floor) starts loading about one chapter before it is
     seen (STORY.need); the light phone models are used everywhere;
   - one canvas, drawn only while something moves or streams in.
   Reads window.OrbitStory (js/story.js) every frame and gives back OrbitStory.spot(name) for the pin, the box and
   the cursor. Without WebGL2 the page keeps its words and panels (class is-fallback). Debug: ?storydbg=1. */
(function () {
  "use strict";
  var win = window, doc = document;
  var OS = win.OrbitStory, D = win.STORY;
  var root = doc.querySelector("[data-story]");
  var canvas = root && root.querySelector("[data-canvas]");
  if (!OS || !D || !canvas) return;
  var DBG = new URLSearchParams(location.search).has("storydbg");
  function log() { if (DBG) console.log.apply(console, ["[story-3d]"].concat([].slice.call(arguments))); }
  var isPhone = win.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
  var pc, app, dev, cam, sun, scanLayer;
  var parts = {};
  var need = D.need || {};
  var dirty = true, busyUntil = 0;

  /* ---------- small maths ---------- */
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function smooth(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }
  function cr(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  // the camera along STORY.path. A key with hold: true = stand still from the key before (no curve through it).
  // 5 Nov, evening: the camera only slows down where it really stops (the start and end of a hold, the first and last key).
  // Between those stops it keeps its speed through the keys (it used to brake to zero at every key: stop-and-go).
  var stops = null;
  function stopKeys() {
    var K = D.path, s = { 0: 1 }; s[K.length - 1] = 1;
    for (var i = 1; i < K.length; i++) { if (K[i].hold) { s[i - 1] = 1; s[i] = 1; } if (K[i].stop) s[i] = 1; }
    return Object.keys(s).map(Number).sort(function (a, b) { return a - b; });
  }
  // speed up, keep an even speed, slow down (q = the part of the run used to speed up / slow down)
  function trapezoid(u, q) {
    var v = 1 / (1 - q);
    if (u < q) return v * u * u / (2 * q);
    if (u > 1 - q) return 1 - v * (1 - u) * (1 - u) / (2 * q);
    return v * (q / 2 + u - q);
  }
  function camAt(P) {
    var K = D.path, n = K.length;
    if (P <= K[0].P) return K[0];
    if (P >= K[n - 1].P) return K[n - 1];
    stops = stops || stopKeys();
    var j = 0; while (j < stops.length - 2 && P > K[stops[j + 1]].P) j++;
    var s0 = stops[j], s1 = stops[j + 1], run = s1 - s0 > 1;
    if (run) { var a0 = K[s0].P, b0 = K[s1].P; P = a0 + clamp(trapezoid(clamp((P - a0) / (b0 - a0 || 1), 0, 1), 0.28), 0, 1) * (b0 - a0); }
    var i = 0; while (i < n - 2 && P > K[i + 1].P) i++;
    var a = K[i], b = K[i + 1], raw = clamp((P - a.P) / (b.P - a.P || 1), 0, 1);
    // one move between two stops: ease it; inside a longer run the speed is already shaped above
    var t = run ? raw : smooth(raw);
    var A = (a.hold || i === 0) ? a : K[i - 1], B = (b.hold || !K[i + 2] || K[i + 2].hold) ? b : K[i + 2];
    if (b.hold) A = a;
    var out = { pos: [], at: [], fov: lerp(a.fov, b.fov, t) };
    for (var k = 0; k < 3; k++) {
      out.pos[k] = cr(A.pos[k], a.pos[k], b.pos[k], B.pos[k], t);
      out.at[k] = cr(A.at[k], a.at[k], b.at[k], B.at[k], t);
    }
    // turn: true (5 Nov evening): turn the head evenly (angles), instead of sliding the look-at point from one spot to
    // the other, which swung most of a big turn into its last part ("whiplash")
    if (b.turn) {
      var da = dirOf(a), db = dirOf(b), dy = db.yaw - da.yaw;
      while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      var yaw = da.yaw + dy * t, pitch = lerp(da.pitch, db.pitch, t), dist = lerp(da.dist, db.dist, t);
      out.at = [out.pos[0] + Math.sin(yaw) * Math.cos(pitch) * dist, out.pos[1] + Math.sin(pitch) * dist, out.pos[2] + Math.cos(yaw) * Math.cos(pitch) * dist];
    }
    return out;
  }
  function dirOf(k) {
    var dx = k.at[0] - k.pos[0], dy = k.at[1] - k.pos[1], dz = k.at[2] - k.pos[2], h = Math.hypot(dx, dz);
    return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, h), dist: Math.hypot(h, dy) };
  }
  function track(T, P, d) {
    if (!T || !T.length) return d === undefined ? 0 : d;
    if (P <= T[0][0]) return T[0][1];
    for (var i = 0; i < T.length - 1; i++) if (P <= T[i + 1][0]) return lerp(T[i][1], T[i + 1][1], smooth((P - T[i][0]) / (T[i + 1][0] - T[i][0] || 1)));
    return T[T.length - 1][1];
  }

  /* ---------- engine ---------- */
  function hasWebGL2() {
    try { var c = doc.createElement("canvas"), g = c.getContext("webgl2"); if (!g) return false; var x = g.getExtension("WEBGL_lose_context"); if (x) x.loseContext(); return true; } catch (e) { return false; }
  }
  function loadEngine() {
    if (win.pc && win.pc.AppBase) return Promise.resolve(win.pc);
    return new Promise(function (ok, no) {
      var s = doc.createElement("script"); s.src = "vendor/playcanvas.min.js";
      s.onload = function () { win.pc ? ok(win.pc) : no(new Error("engine missing")); };
      s.onerror = function () { no(new Error("engine script missing")); };
      doc.head.appendChild(s);
    });
  }
  var dprCap = Math.min(win.devicePixelRatio || 1, isPhone ? 1.6 : 1.5), fps = { t: 0, n: 0, v: 60 };
  function resize() {
    if (!dev) return;
    var w = canvas.clientWidth || win.innerWidth, h = canvas.clientHeight || win.innerHeight;
    dev.maxPixelRatio = dprCap;
    dev.clientRect = { width: w, height: h };
    dev.resizeCanvas(w, h);
    dirty = true;
  }
  function fallback(why) { console.warn("[story-3d] no 3D:", why); root.classList.add("is-fallback"); }

  function boot() {
    if (!hasWebGL2()) { fallback("no WebGL2"); return; }
    loadEngine().then(function (P) {
      pc = P;
      // 5 Nov night: the house models and pieces are Draco-compressed (about a third of the size, same look). The
      // decoder (vendor/, the same files as the big site) only downloads when the first model arrives (lazyInit).
      if (pc.dracoInitialize) pc.dracoInitialize({ jsUrl: "vendor/draco_wasm_wrapper.js", wasmUrl: "vendor/draco_decoder.wasm", numWorkers: 1, lazyInit: true });
      return pc.createGraphicsDevice(canvas, { deviceTypes: [pc.DEVICETYPE_WEBGL2], antialias: !isPhone, alpha: false, preserveDrawingBuffer: !!DBG, powerPreference: "high-performance" });
    }).then(function (d) {
      dev = d;
      if (typeof dev.updateClientRect === "function") dev.updateClientRect = function () { /* resize() sets it */ };
      var o = new pc.AppOptions();
      o.graphicsDevice = dev;
      o.componentSystems = [pc.RenderComponentSystem, pc.CameraComponentSystem, pc.LightComponentSystem, pc.GSplatComponentSystem];
      o.resourceHandlers = [pc.TextureHandler, pc.ContainerHandler, pc.GSplatHandler];
      app = new pc.AppBase(canvas);
      app.init(o);
      app.setCanvasFillMode(pc.FILLMODE_NONE);
      app.setCanvasResolution(pc.RESOLUTION_AUTO);
      app.autoRender = false;
      app.scene.ambientLight = new pc.Color(D.ambient[0], D.ambient[1], D.ambient[2]);
      var bg = new pc.Color(0.039, 0.043, 0.051, 1);
      cam = new pc.Entity("cam");
      cam.addComponent("camera", { clearColor: bg, fov: 50, nearClip: 0.05, farClip: 600, priority: 0 });
      app.root.addChild(cam);
      // ONE layer for every scan, made before the first frame (tested 5 Nov: a second scan layer added later to the
      // camera was never drawn by the engine's unified splat renderer)
      scanLayer = new pc.Layer({ name: "Scans" });
      app.scene.layers.push(scanLayer);
      cam.camera.layers = cam.camera.layers.concat([scanLayer.id]);
      sun = new pc.Entity("sun");
      sun.addComponent("light", { type: "directional", color: new pc.Color(1, 0.98, 0.95), intensity: 0.8, castShadows: false });
      sun.setLocalEulerAngles(55, 35, 0);
      app.root.addChild(sun);
      var g = app.scene.gsplat;
      try { g.lodUpdateAngle = isPhone ? 45 : 30; g.lodUpdateDistance = 0.5; g.lodBehindPenalty = isPhone ? 3 : 2; g.lodUnderfillLimit = 2; g.colorUpdateAngle = 10; g.splatBudget = isPhone ? 900000 : 2500000; } catch (e) { /* */ }
      try {
        app.systems.gsplat.on("frame:request", function () { dirty = true; });
        // keep drawing while a scan is still sorting or fetching tiles (the engine only asks for tiles while it draws)
        app.systems.gsplat.on("frame:ready", function (c, layer, ready, loading) { if (!ready || loading > 0) { dirty = true; busyUntil = performance.now() + 300; } });
      } catch (e) { /* */ }
      resize();
      win.addEventListener("resize", resize);
      app.on("update", tick);
      app.start();
      canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); }, false);
      log("engine up");
      OS.onChange(function () { dirty = true; });
      setupInput();
    }).catch(function (e) { fallback(e && e.message); });
  }

  /* ---------- parts ---------- */
  var FADE_GLSL = [
    "uniform float uFade;",
    "uniform float uClipY;",
    "uniform vec4 uCut;",   // the drag line: a plane through the camera; only the part on its right side is drawn
    "uniform float uKeepY;", // ... except above this height (the floor above the model), which shows on both sides
    "uniform float uSideA;", // 0 = the left side hidden; up to 1 = the scan fades in there too (the line has gone)
    "bool offSide(vec3 c) { return dot(uCut.xyz, c) + uCut.w < 0.0 && c.y < uKeepY; }",
    "void modifySplatCenter(inout vec3 center) {}",
    "void modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) {",
    "  if (uFade <= 0.001 || modifiedCenter.y > uClipY || (uSideA <= 0.001 && offSide(modifiedCenter))) scale = vec3(0.0);",
    "}",
    "void modifySplatColor(vec3 center, inout vec4 color) { color.a *= uFade; if (offSide(center)) color.a *= uSideA; }"
  ].join("\n");

  function place(e, X) {
    if (!X) return;
    if (X.m) {
      // a 3x4 row-major matrix (hood.json): rotation x uniform scale + translation
      var R = X.m, s = Math.hypot(R[0][0], R[1][0], R[2][0]);
      var m = new pc.Mat4();
      m.set([R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, R[0][3], R[1][3], R[2][3], 1]);
      var q = new pc.Quat(); var mr = m.clone();
      mr.data[0] /= s; mr.data[1] /= s; mr.data[2] /= s; mr.data[4] /= s; mr.data[5] /= s; mr.data[6] /= s; mr.data[8] /= s; mr.data[9] /= s; mr.data[10] /= s;
      q.setFromMat4(mr);
      e.setLocalPosition(R[0][3], R[1][3], R[2][3]); e.setLocalRotation(q); e.setLocalScale(s, s, s);
      return;
    }
    if (X.t) e.setLocalPosition(X.t[0], X.t[1], X.t[2]);
    if (X.euler) e.setLocalEulerAngles(X.euler[0], X.euler[1], X.euler[2]);
    if (X.scale) e.setLocalScale(X.scale, X.scale, X.scale);
  }

  function makeScan(name, cfg) {
    var p = { name: name, kind: "scan", cfg: cfg, state: "load", ent: null, layer: null, fade: -1, clip: -1 };
    var a = new pc.Asset("scan-" + name, "gsplat", { url: cfg.url, filename: "lod-meta.json" });
    p.asset = a;
    a.once("load", function () {
      try {
        var oct = a.resource && a.resource.octree;
        p.levels = Math.max(1, Number(oct && oct.lodLevels) || 1);
        p.layer = scanLayer;
        var e = new pc.Entity("scan-" + name);
        place(e, cfg.to);
        e.addComponent("gsplat", { asset: a, unified: true, layers: [p.layer.id] });
        e.gsplat.setWorkBufferModifier({ glsl: FADE_GLSL });
        e.gsplat.setParameter("uFade", 0);
        e.gsplat.setParameter("uClipY", 1e9);
        e.gsplat.setParameter("uCut", [0, 0, 0, 1]);
        e.gsplat.setParameter("uKeepY", cfg.keepY == null ? 1e9 : cfg.keepY);
        e.gsplat.setParameter("uSideA", 0);
        var f = cfg.finest || {}, finest = isPhone ? (f.phone == null ? 2 : f.phone) : (f.desktop == null ? 1 : f.desktop);
        p.finest = clamp(finest, 0, p.levels - 1);
        e.gsplat.lodRangeMin = p.levels - 1; e.gsplat.lodRangeMax = p.levels - 1;   // coarse first
        // on from the start and for its whole part of the story (drawn at size 0 while faded out): the engine's
        // unified splat renderer did not draw a scan that was switched on later (tested 5 Nov)
        e.enabled = true;
        // a scan inside a model's frame gets its own copy of that frame (so hiding the model never hides the scan)
        var par = app.root;
        if (cfg.parent && D.models[cfg.parent]) { par = new pc.Entity("frame-" + name); place(par, D.models[cfg.parent].to); app.root.addChild(par); }
        par.addChild(e);
        p.ent = e; p.state = "ready";
        p.sharpAt = performance.now() + 900;
        log(name, "scan in,", p.levels, "levels, finest", p.finest);
        dirty = true;
      } catch (err) { p.state = "error"; console.warn("[story-3d] scan", name, err); }
    });
    a.once("error", function (err) { p.state = "error"; console.warn("[story-3d] scan", name, err); });
    app.assets.add(a); app.assets.load(a);
    return p;
  }

  function loadGlb(url) {
    return new Promise(function (ok, no) {
      var a = new pc.Asset(url, "container", { url: url });
      a.once("load", function () { ok(a); }); a.once("error", no);
      app.assets.add(a); app.assets.load(a);
    });
  }
  function makeModel(name, cfg) {
    var p = { name: name, kind: "model", cfg: cfg, state: "load", nodes: {}, tops: [], topsOn: null };
    p.root = new pc.Entity("model-" + name);
    place(p.root, cfg.to);
    p.root.enabled = false;
    app.root.addChild(p.root);
    var urls = [cfg.walls].concat(cfg.furniture ? [cfg.furniture] : []);
    Promise.all(urls.map(loadGlb)).then(function (assets) {
      assets.forEach(function (a) { p.root.addChild(a.resource.instantiateRenderEntity()); });
      var hide = {}; (cfg.hide || []).forEach(function (n) { hide[n] = 1; });
      var hideRe = cfg.hideRe ? new RegExp(cfg.hideRe, "i") : null;
      var tops = cfg.tops || [];
      (function walk(e) {
        if (e.name) {
          (p.nodes[e.name] = p.nodes[e.name] || []).push(e);
          if (hide[e.name] || hideRe && hideRe.test(e.name)) e.enabled = false;
          else if (tops.some(function (t) { return e.name.indexOf(t) === 0; })) p.tops.push(e);
          // the Orbit viewer's low wall copies stay hidden (the story never cuts walls)
          if (e.name.indexOf("LowWall__") === 0 || e.name.indexOf("LowLid__") === 0) e.enabled = false;
        }
        for (var i = 0; i < e.children.length; i++) walk(e.children[i]);
      })(p.root);
      // window panes: the bake holds the pane cut-out in its alpha; glass is see-through (as in the Orbit viewer)
      var fixed = {};
      meshInstances([p.root]).forEach(function (mi) {
        var m = mi.material; if (!m || fixed[m.id]) return; fixed[m.id] = 1;
        var n = m.name || "";
        if (/^baked__.*window/i.test(n) && m.diffuseMap) clearPanes(m);
        // glass asks for refraction (a copy of the screen the story never makes: the engine fills it with its
        // pink "missing" colour): plain see-through glass instead
        if (m.refraction > 0 || m.useDynamicRefraction || /glass|window/i.test(n) && m.blendType !== pc.BLEND_NONE) {
          m.refraction = 0; m.useDynamicRefraction = false;
          if (/^pbr__glass/.test(n)) { m.blendType = pc.BLEND_NORMAL; m.opacity = 0.1; m.depthWrite = false; }
          m.update();
        }
        // 5 Nov evening (James: "undarken"): the baked light drawn as it is, like the Orbit viewer (hvMaterials, v55):
        // baked__* = its picture as light, no lighting on top (that made the rooms darker than in the viewer)
        if (/^baked__/.test(n) || n === "cap__low") {
          m.useLighting = false;
          if (m.diffuse) m.emissive = m.diffuse.clone();
          if (m.diffuseMap) {
            m.emissiveMap = m.diffuseMap; m.emissiveMapUv = m.diffuseMapUv;
            m.emissiveMapTiling.copy(m.diffuseMapTiling); m.emissiveMapOffset.copy(m.diffuseMapOffset);
            m.emissiveMapRotation = m.diffuseMapRotation; m.emissiveMapChannel = m.diffuseMapChannel;
          }
          m.useSkybox = false; m.useTonemap = false; m.useFog = false;
          m.diffuse = new pc.Color(0, 0, 0); m.diffuseMap = null;
          m.metalness = 0; if (m.specular) m.specular = new pc.Color(0, 0, 0);
          try { var most = Math.min(8, dev.maxAnisotropy || 1); if (m.emissiveMap && m.emissiveMap.anisotropy < most) m.emissiveMap.anisotropy = most; } catch (e) { /* */ }
          m.update();
        } else if (/^pbr__/.test(n)) {
          if (typeof m.metalness === "number" && m.metalness > 0.45) m.metalness = 0.45;
          m.useFog = false; m.update();
        }
      });
      // ceilings and roof baked as materials (the Orbit viewer's oiHideTops): baked__ceilings*, baked__roof*
      p.topMis = meshInstances([p.root]).filter(function (mi) { var n = (mi.material && mi.material.name) || ""; return /^baked__(ceiling|roof)/i.test(n); });
      p.state = "ready";
      log(name, "model in,", Object.keys(p.nodes).length, "nodes,", p.tops.length, "tops");
      dirty = true;
    }).catch(function (err) { p.state = "error"; console.warn("[story-3d] model", name, err); });
    return p;
  }
  // the window bake has the panes in Blender's "missing picture" pink: make those pixels see-through (once, on the
  // CPU, 1024 px), so you look through the glass into the rooms like in the Orbit viewer
  function clearPanes(m) {
    try {
      var src = m.diffuseMap.getSource && m.diffuseMap.getSource();
      if (!src || !src.width) return;
      var c = doc.createElement("canvas"); c.width = src.width; c.height = src.height;
      var g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(src, 0, 0);
      var im = g.getImageData(0, 0, c.width, c.height), d = im.data, n = 0;
      for (var i = 0; i < d.length; i += 4) {
        var r = d[i], gg = d[i + 1], b = d[i + 2];
        if (r > 120 && b > 120 && gg < 0.62 * Math.min(r, b)) { d[i + 3] = 0; n++; }
      }
      if (!n) return;
      g.putImageData(im, 0, 0);
      var t = new pc.Texture(dev, { name: "panes", width: c.width, height: c.height, format: pc.PIXELFORMAT_RGBA8, mipmaps: true,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, addressU: m.diffuseMap.addressU, addressV: m.diffuseMap.addressV });
      t.setSource(c);
      m.diffuseMap = t; m.opacityMap = t; m.opacityMapChannel = "a"; m.alphaTest = 0.5; m.update();
      log("panes cleared:", n, "pixels in", m.name);
    } catch (e) { console.warn("[story-3d] panes", e); }
  }
  function nodes(p, name) { return (p && p.nodes[name]) || []; }
  function meshInstances(list) {
    var out = [];
    list.forEach(function (e) { e.findComponents("render").forEach(function (r) { if (r.meshInstances) out = out.concat(r.meshInstances); }); });
    return out;
  }
  function wantParts(P) {
    Object.keys(need).forEach(function (name) {
      var r = need[name];
      if (parts[name] || !(P > r[0] - 1.1 && P < r[1] + 0.6)) return;
      var sc = D.scans[name], mo = D.models[name];
      parts[name] = sc ? makeScan(name, sc) : makeModel(name, mo);
    });
  }

  /* ---------- the design states on the house model ---------- */
  // 5 Nov night: two swappable pieces (STORY.slots: the coffee table and the corner sofa), OS.state.table / .sofa
  var swap = { cache: {}, loading: {}, slot: {} };
  function pieceOf(id) { return D.pieces.filter(function (x) { return x.id === id; })[0]; }
  function placePiece(piece, ent) {
    if (piece.slot === "table") {   // where the visitor put the table
      ent.setLocalPosition(D.table.pos[0] + mv.x, D.table.pos[1] + mv.lift, D.table.pos[2] + mv.z);
      ent.setLocalEulerAngles(0, D.table.yaw || 0, 0);
    } else {
      ent.setLocalPosition(piece.at[0], piece.at[1], piece.at[2]);
      ent.setLocalEulerAngles(0, piece.yaw || 0, 0);
    }
  }
  function applySlot(house, slot) {
    var sw = swap.slot[slot] || (swap.slot[slot] = { cur: "orig", ent: null });
    var id = OS.state[slot] || "orig";
    if (!house || house.state !== "ready" || sw.cur === id) return;
    var orig = [];
    D.slots[slot].nodes.forEach(function (n) { orig = orig.concat(nodes(house, n), nodes(house, n + "__shadow")); });
    sw.cur = id;
    // the vase on the coffee table: hidden while another table stands there (it would float or sink into it)
    if (slot === "table") tableEnts(house).forEach(function (o) { if (o.rider) o.e.enabled = id === "orig"; });
    if (id === "orig") {
      orig.forEach(function (e) { e.enabled = true; });
      if (sw.ent) sw.ent.enabled = false;
      sw.ent = null; dirty = true; return;
    }
    var piece = pieceOf(id);
    if (!piece || !piece.glb) return;
    var show = function () {
      if (sw.cur !== id) return;
      if (sw.ent) sw.ent.enabled = false;
      sw.ent = swap.cache[id]; placePiece(piece, sw.ent); sw.ent.enabled = true;
      orig.forEach(function (x) { x.enabled = false; });
      dirty = true;
    };
    if (swap.cache[id]) { show(); return; }
    if (swap.loading[id]) return;
    swap.loading[id] = true;
    loadGlb(piece.glb).then(function (a) {
      var holder = new pc.Entity("piece-" + id);
      holder.addChild(a.resource.instantiateRenderEntity());
      holder.enabled = false;
      house.root.addChild(holder);
      swap.cache[id] = holder;
      // the visitor may have picked again meanwhile
      if (OS.state[slot] === id) { sw.cur = "?"; applySlot(house, slot); }
    }).catch(function (e) { console.warn("[story-3d] piece", e); swap.loading[id] = false; });
  }
  function applyTable(house) { Object.keys(D.slots || {}).forEach(function (s) { applySlot(house, s); }); }

  /* ---------- move the table by hand (5 Nov evening, James: "touch and move objects like an actual thing") ----------
     The visitor drags the table over the floor (its box on the page is the handle); it follows with a little weight
     (spring), lifts a few cm while held and stays inside its part of the room (STORY.tableArea). The vase and flowers
     on it ride along. */
  var mv = { tx: 0, tz: 0, x: 0, z: 0, lift: 0, liftT: 0, ents: null };
  function modelInv(house) { var m = house.root.getWorldTransform().clone(); m.invert(); return m; }
  function tableEnts(house) {
    if (mv.ents) return mv.ents;
    var list = nodes(house, D.table.node).concat(nodes(house, D.table.node + "__shadow"));
    // riders: things standing on the table top (vase, flowers)
    var inv = modelInv(house), c = new pc.Vec3(), A = D.tableArea || {}, tb = D.table.pos, riders = [];
    house.root.findComponents("render").forEach(function (r) {
      var e = r.entity; if (list.indexOf(e) >= 0 || !r.meshInstances || !r.meshInstances.length) return;
      if (/^(wall|realism|LowWall|LowLid|floor)/i.test(e.name || "")) return;
      var a = r.meshInstances[0].aabb; inv.transformPoint(a.center, c);
      if (Math.abs(c.x - tb[0]) < 0.36 && Math.abs(c.z - tb[2]) < 0.62 && c.y > 0.38 && c.y < 1.3 && a.halfExtents.length() < 0.9) { list.push(e); riders.push(e); }
    });
    mv.ents = list.map(function (e) { return { e: e, base: e.getPosition().clone(), rider: riders.indexOf(e) >= 0 }; });
    log("table moves with", mv.ents.length, "parts");
    return mv.ents;
  }
  function moveWorld(house) {
    var v = new pc.Vec3(mv.x, mv.lift, mv.z), out = new pc.Vec3();
    house.root.getWorldTransform().transformVector(v, out);
    return out;
  }
  function applyMove(house, dt) {
    if (!house || house.state !== "ready") return;
    if (OS.state.at < 5 && (mv.tx || mv.tz)) { mv.tx = 0; mv.tz = 0; }
    if (!mv.ents && !mv.tx && !mv.tz && !mv.liftT) return;   // never touched: nothing to do (measured once, when first held)
    var k = OS.reduced() ? 1 : 1 - Math.exp(-dt * 14);
    var nx = mv.x + (mv.tx - mv.x) * k, nz = mv.z + (mv.tz - mv.z) * k, nl = mv.lift + (mv.liftT - mv.lift) * (1 - Math.exp(-dt * 18));
    if (Math.abs(nx - mv.x) + Math.abs(nz - mv.z) + Math.abs(nl - mv.lift) < 1e-5 && mv.applied) return;
    mv.x = Math.abs(nx - mv.tx) < 1e-4 ? mv.tx : nx; mv.z = Math.abs(nz - mv.tz) < 1e-4 ? mv.tz : nz; mv.lift = Math.abs(nl - mv.liftT) < 1e-4 ? mv.liftT : nl;
    mv.applied = true;
    var w = moveWorld(house);
    tableEnts(house).forEach(function (o) { o.e.setPosition(o.base.x + w.x, o.base.y + w.y, o.base.z + w.z); });
    Object.keys(swap.cache).forEach(function (id) { var pz = pieceOf(id); if (pz && pz.slot === "table") placePiece(pz, swap.cache[id]); });
    dirty = true; if (OS.ask) OS.ask();
  }
  // where a screen point lands on the floor, in ground model metres
  function floorAt(house, sx, sy) {
    var a = new pc.Vec3(), b = new pc.Vec3();
    cam.camera.screenToWorld(sx, sy, cam.camera.nearClip, a);
    cam.camera.screenToWorld(sx, sy, 50, b);
    var inv = modelInv(house), A = new pc.Vec3(), B = new pc.Vec3();
    inv.transformPoint(a, A); inv.transformPoint(b, B);
    var dy = B.y - A.y; if (Math.abs(dy) < 1e-6) return null;
    var t = (0 - A.y) / dy; if (t < 0) return null;
    return { x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t };
  }
  function clampMove(x, z) {
    var A = D.tableArea, p = D.table.pos;
    if (!A) return { x: x, z: z };
    return { x: clamp(p[0] + x, A.x[0], A.x[1]) - p[0], z: clamp(p[2] + z, A.z[0], A.z[1]) - p[2] };
  }

  /* ---------- look around a little (5 Nov evening, James: "interactable, a little movement and look around") ----------
     Drag the picture to turn the head (up to about 30 degrees left / right, 14 up / down; on phones only sideways, up
     and down is the page scroll); on computers the picture also follows the mouse a tiny bit. It eases back to the
     story's own view when you scroll on. Small on purpose: the camera never looks where the story did not load. */
  var lk = { yaw: 0, pitch: 0, px: 0, py: 0, mx: 0, my: 0 };
  function setupInput() {
    var stage = root.querySelector("[data-stage]"), box = root.querySelector("[data-box]");
    var drag = null;
    stage.addEventListener("pointerdown", function (e) {
      if (!cam || e.button > 0) return;
      var house = parts[D.designOn];
      if (box && e.target === box && house && house.state === "ready" && OS.state.at === 5 && OS.state.slot !== "sofa") {
        var r = stage.getBoundingClientRect(), h = floorAt(house, e.clientX - r.left, e.clientY - r.top);
        if (!h) return;
        drag = { kind: "table", h0: h, x0: mv.tx, z0: mv.tz, id: e.pointerId };
        mv.liftT = 0.04; OS.state.tryIt = true; box.classList.add("is-grab");
        try { box.setPointerCapture(e.pointerId); } catch (err) { /* */ }
        if (OS.hideCursor) OS.hideCursor();
        e.preventDefault(); return;
      }
      if (e.target !== canvas) return;
      drag = { kind: "look", x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== "mouse" };
      OS.looked = true;   // the "drag to look around" hint has done its job
      canvas.classList.add("is-look");
    });
    win.addEventListener("pointermove", function (e) {
      if (e.pointerType === "mouse" && !drag) { lk.mx = clamp(e.clientX / win.innerWidth * 2 - 1, -1, 1); lk.my = clamp(e.clientY / win.innerHeight * 2 - 1, -1, 1); dirty = true; }
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.kind === "table") {
        var house = parts[D.designOn], r = stage.getBoundingClientRect(), h = house && floorAt(house, e.clientX - r.left, e.clientY - r.top);
        if (!h) return;
        var m = clampMove(drag.x0 + h.x - drag.h0.x, drag.z0 + h.z - drag.h0.z);
        mv.tx = m.x; mv.tz = m.z; dirty = true;
        return;
      }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      // grab the picture: drag right = the view follows the finger (the head turns left)
      lk.yaw = clamp(lk.yaw + dx * 0.12, -30, 30);
      if (!drag.touch) lk.pitch = clamp(lk.pitch + dy * 0.1, -14, 14);
      dirty = true;
    });
    var up = function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.kind === "table") { mv.liftT = 0; if (box) box.classList.remove("is-grab"); }
      canvas.classList.remove("is-look");
      drag = null; dirty = true;
    };
    win.addEventListener("pointerup", up); win.addEventListener("pointercancel", up);
    doc.addEventListener("mouseleave", function () { lk.mx = 0; lk.my = 0; dirty = true; });
  }

  // the model's light is baked into its textures (emissive maps): dim = scale the emissive colour
  function scaleMat(m, k, key) {
    if (!m) return;
    if (!m.__orbit) m.__orbit = { em: m.emissive ? m.emissive.clone() : null, di: m.diffuse ? m.diffuse.clone() : null };
    var o = m.__orbit;
    if (o.em) m.emissive = new pc.Color(o.em.r * k, o.em.g * k, o.em.b * k);
    if (o.di) m.diffuse = new pc.Color(o.di.r * k, o.di.g * k, o.di.b * k);
    m.update();
  }
  /* the three lamps (5 Nov evening, James: "click the light to turn it on or off", "light from 3 areas"): each lamp
     has its own glow (its own copy of the material), a warm pool of light on the floor and a real light for the
     non-baked parts; the baked room gets darker by a third per lamp switched off. Lamps fade, they do not blink. */
  var look = { paint: undefined }, lampFx = null, roomK = 1;
  function poolTexture() {
    var c = doc.createElement("canvas"); c.width = c.height = 128;
    var g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255,214,160,1)"); r.addColorStop(0.45, "rgba(255,190,120,0.45)"); r.addColorStop(1, "rgba(255,170,90,0)");
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    var t = new pc.Texture(dev, { width: 128, height: 128, format: pc.PIXELFORMAT_RGBA8, mipmaps: true });
    t.setSource(c); return t;
  }
  function makeLamps(house) {
    var tex = poolTexture();
    lampFx = (D.lamps || []).map(function (L, i) {
      var mis = meshInstances([].concat.apply([], L.glow.map(function (n) { return nodes(house, n); })));
      mis.forEach(function (mi) { if (!mi.__own) { mi.material = mi.material.clone(); mi.__own = true; mi.material.__orbit = null; } mi.__lamp = true; });
      var pool = new pc.Entity("pool-" + i);
      var pm = new pc.StandardMaterial();
      pm.useLighting = false; pm.diffuse = new pc.Color(0, 0, 0); pm.emissive = new pc.Color(1, 1, 1); pm.emissiveMap = tex;
      pm.opacityMap = tex; pm.opacityMapChannel = "a"; pm.blendType = pc.BLEND_ADDITIVEALPHA; pm.depthWrite = false; pm.useTonemap = false; pm.useFog = false;
      pm.opacity = 0; pm.update();
      pool.addComponent("render", { type: "plane", material: pm, castShadows: false, receiveShadows: false });
      pool.setLocalPosition(L.at[0], 0.012, L.at[2]);
      var size = L.at[1] > 2.2 ? 3.2 : 2.4;
      pool.setLocalScale(size, 1, size);
      house.root.addChild(pool);
      var lt = new pc.Entity("lamp-" + i);
      lt.addComponent("light", { type: "omni", color: new pc.Color(1, 0.82, 0.62), intensity: 0, range: 4.5, castShadows: false });
      lt.setLocalPosition(L.at[0], L.at[1] - 0.15, L.at[2]);
      house.root.addChild(lt);
      return { mis: mis, pool: pool, pm: pm, light: lt, lv: -1 };
    });
  }
  function applyLight(house, dt) {
    if (!house || house.state !== "ready") return;
    if (!lampFx) makeLamps(house);
    var S = OS.state, changed = false, sum = 0;
    lampFx.forEach(function (f, i) {
      var want = S.lamps[i] ? 1 : 0;
      var lv = f.lv < 0 ? want : (OS.reduced() ? want : f.lv + clamp(want - f.lv, -dt * 3.2, dt * 3.2));
      sum += lv;
      if (Math.abs(lv - f.lv) < 1e-4) return;
      f.lv = lv; changed = true;
      f.mis.forEach(function (mi) { scaleMat(mi.material, 0.08 + 0.92 * lv); });
      f.pm.opacity = 0.32 * lv; f.pm.update();
      f.light.light.intensity = 0.9 * lv;
    });
    if (!changed) return;
    var k = D.lightOffDim + (1 - D.lightOffDim) * (sum / (lampFx.length || 1));
    roomK = k;
    var seen = {};
    meshInstances([house.root]).forEach(function (mi) {
      var m = mi.material; if (!m || mi.__lamp || mi.__own || seen[m.id]) return; seen[m.id] = 1;
      if (m.blendType === pc.BLEND_ADDITIVEALPHA) return;
      scaleMat(m, k);
    });
    app.scene.ambientLight = new pc.Color(D.ambient[0] * k, D.ambient[1] * k, D.ambient[2] * k);
    sun.light.intensity = 0.85 * k;
    look.paint = undefined;   // paint keeps the dim
    dirty = true; busyUntil = performance.now() + 200;
  }
  function applyPaint(house) {
    if (!house || house.state !== "ready") return;
    var hex = OS.state.paint;
    if (look.paint === hex) return;
    look.paint = hex;
    var k = roomK;
    meshInstances([].concat.apply([], D.paint.nodes.map(function (n) { return nodes(house, n); }))).forEach(function (mi) {
      if (!mi.__own) { mi.material = mi.material.clone(); mi.__own = true; mi.material.__orbit = null; }
      var m = mi.material;
      if (!m.__base) m.__base = { em: m.emissive ? m.emissive.clone() : null, di: m.diffuse ? m.diffuse.clone() : null };
      var c = null;
      if (hex) { c = new pc.Color(); c.fromString(hex); }
      // tint the baked wall: paint colour x the bake's light and shadow (the bake of a white wall is near grey)
      var em = m.__base.em, di = m.__base.di, g = 1.1;
      if (m.emissiveMap && em) m.emissive = c ? new pc.Color(c.r * g * k, c.g * g * k, c.b * g * k) : new pc.Color(em.r * k, em.g * k, em.b * k);
      if (m.diffuseMap && di) m.diffuse = c ? new pc.Color(c.r * k, c.g * k, c.b * k) : new pc.Color(di.r * k, di.g * k, di.b * k);
      if (!m.emissiveMap && !m.diffuseMap && di) m.diffuse = c ? c : di;
      m.update();
    });
    dirty = true;
  }

  /* ---------- screen spots for the page ---------- */
  var V3, W3;
  function project(w) {
    if (!cam) return null;
    V3 = V3 || new pc.Vec3(); W3 = W3 || new pc.Vec3();
    W3.set(w[0], w[1], w[2]);
    // behind the camera = not on screen
    var f = cam.forward, cp = cam.getPosition();
    if ((w[0] - cp.x) * f.x + (w[1] - cp.y) * f.y + (w[2] - cp.z) * f.z < 0.05) return null;
    cam.camera.worldToScreen(W3, V3);
    return { x: V3.x, y: V3.y };
  }
  var lampW = null;
  OS.spot = function (name) {
    if (!app || !pc) return null;
    // lamp0, lamp1, lamp2: the lamps' screen spots (for the tap rings)
    if (/^lamp\d$/.test(name)) {
      var li = +name.slice(4), L = D.lamps && D.lamps[li];
      if (!L) return null;
      lampW = lampW || {};
      // the middle of the lamp's own parts (the lamp shade), measured once the model is in; until then STORY.lamps.at
      if (!lampW[name] && lampFx && lampFx[li] && lampFx[li].mis.length) {
        var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
        lampFx[li].mis.forEach(function (mi) { var a = mi.aabb, c = a.center, h = a.halfExtents;
          mn = [Math.min(mn[0], c.x - h.x), Math.min(mn[1], c.y - h.y), Math.min(mn[2], c.z - h.z)];
          mx = [Math.max(mx[0], c.x + h.x), Math.max(mx[1], c.y + h.y), Math.max(mx[2], c.z + h.z)]; });
        // a little above the bottom: on the shade, not on the cord of a hanging lamp
        lampW[name] = [(mn[0] + mx[0]) / 2, mn[1] + Math.min(0.12, (mx[1] - mn[1]) * 0.5), (mn[2] + mx[2]) / 2];
      }
      return project(lampW[name] || D.H(L.at[0], L.at[1], L.at[2]));
    }
    var sp = D.spots && D.spots[name];
    if (!sp) return null;
    var half = sp.half;
    if (name === "table" && (mv.x || mv.z || mv.lift) && parts[D.designOn] && parts[D.designOn].state === "ready") {
      var w = moveWorld(parts[D.designOn]);
      sp = { c: [sp.c[0] + w.x, sp.c[1] + w.y, sp.c[2] + w.z], half: sp.half };
    }
    if (name === "table" && OS.state.table !== "orig") {
      var pz = pieceOf(OS.state.table);
      if (pz && pz.box) half = pz.box;
    }
    if (name === "sofa" && OS.state.sofa && OS.state.sofa !== "orig") {   // a swapped sofa stands in its own spot
      var ps = pieceOf(OS.state.sofa);
      if (ps && ps.at && ps.box) { sp = { c: D.H(ps.at[0], ps.box[1], ps.at[2]), half: ps.box }; half = ps.box; }
    }
    var c = project(sp.c);
    if (!c) return null;
    if (!half) return c;
    var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9, k = 0;
    var cy = sp.c[1] - (sp.half ? sp.half[1] : 0) + half[1];
    for (var ix = -1; ix <= 1; ix += 2) for (var iy = -1; iy <= 1; iy += 2) for (var iz = -1; iz <= 1; iz += 2) {
      var q = project([sp.c[0] + ix * half[0], cy + iy * half[1], sp.c[2] + iz * half[2]]);
      if (!q) continue; k++;
      minx = Math.min(minx, q.x); maxx = Math.max(maxx, q.x); miny = Math.min(miny, q.y); maxy = Math.max(maxy, q.y);
    }
    if (!k) return null;
    return { x: (minx + maxx) / 2, y: (miny + maxy) / 2, w: maxx - minx, h: maxy - miny };
  };

  /* ---------- every frame ---------- */
  var lastP = -1, lastWipe = -1, shownOnce = false, lastW = 0, lastH = 0, lensY = 0, Pc = null;
  function tick(dt) {
    var S = OS.state, now = performance.now();
    wantParts(S.P);
    // 5 Nov, evening: the camera glides after the scroll (a mouse wheel moves in steps: the picture used to jump with each
    // step). Far jumps (menu, rail) and reduced motion: straight there.
    var target = S.P;
    if (Pc === null || OS.reduced() || Math.abs(target - Pc) > 1.2) Pc = target;
    else { Pc += (target - Pc) * (1 - Math.exp(-Math.min(dt, 0.1) * 6.5)); if (Math.abs(target - Pc) < 0.0004) Pc = target; }
    var P = Pc;
    S.Pcam = P;
    if (dirty && OS.ask) OS.ask();   // the pin / box / cursor follow the new picture
    if (P !== lastP || S.wipe !== lastWipe) { dirty = true; busyUntil = now + 1200; }
    lastP = P; lastWipe = S.wipe;
    if (canvas.clientWidth !== lastW || canvas.clientHeight !== lastH) { lastW = canvas.clientWidth; lastH = canvas.clientHeight; resize(); }

    var c = camAt(P);
    var portrait = isPhone && win.innerHeight > win.innerWidth;
    var fovK = portrait ? (D.phoneFovT ? track(D.phoneFovT, P, D.phoneFov) : D.phoneFov) : 1;
    // portrait phones: a panel covers the lower half in the design chapters, so look at the piece and draw the picture higher
    var pa = portrait && D.phoneAt ? track(D.phoneAt.k, P) : 0;
    if (pa > 0.001) for (var q = 0; q < 3; q++) c.at[q] = lerp(c.at[q], D.phoneAt.at[q], pa);
    lensY = portrait ? track(D.phoneShift, P) : 0;
    if (!cam.camera.calculateProjection) cam.camera.calculateProjection = function (mat) { mat.data[9] = lensY; };
    cam.setPosition(c.pos[0], c.pos[1], c.pos[2]);
    cam.lookAt(c.at[0], c.at[1], c.at[2]);
    cam.camera.fov = Math.min(100, c.fov * fovK);
    // look around a little: the dragged turn eases back to the story's view while you scroll on; the mouse sway is tiny
    if (lk.lastP != null && P !== lk.lastP) { var back = Math.exp(-Math.abs(P - lk.lastP) * 22); lk.yaw *= back; lk.pitch *= back; }
    lk.lastP = P;
    var sw = OS.reduced() || isPhone ? 0 : 1, ke = 1 - Math.exp(-Math.min(dt, 0.1) * 4);
    lk.px += (lk.mx * sw - lk.px) * ke; lk.py += (lk.my * sw - lk.py) * ke;
    if (Math.abs(lk.px - lk.mx * sw) + Math.abs(lk.py - lk.my * sw) > 0.002) dirty = true;
    var yaw = lk.yaw - lk.px * 2.2, pitch = lk.pitch - lk.py * 1.3;
    if (Math.abs(yaw) + Math.abs(pitch) > 0.01) { cam.rotateLocal(0, yaw, 0); cam.rotateLocal(pitch, 0, 0); }
    if (sw && Math.abs(lk.px) + Math.abs(lk.py) > 0.001) cam.translateLocal(lk.px * 0.08, -lk.py * 0.05, 0);

    var M = D.mix;
    Object.keys(parts).forEach(function (name) {
      var p = parts[name];
      if (p.state !== "ready") return;
      var k = track(M[name], P);
      if (p.kind === "scan") {
        // on (registered, sorted, loading) for its whole part of the story; switched off far outside it to save the
        // phone's work. Switched on AGAIN (scrolling back), the engine only draws it after its layer list is set
        // once more, a moment later (tested 5 Nov 2026).
        var r = need[name] || [0, 99], on = P > r[0] - 1.1 && P < r[1] + 0.25;
        if (p.ent.enabled !== on) {
          p.ent.enabled = on; dirty = true; busyUntil = now + 1500;
          if (on) p.relayer = [now + 150];
        }
        if (p.relayer && p.relayer.length && now > p.relayer[0]) {
          p.relayer.shift();
          if (p.ent.enabled) { p.ent.gsplat.layers = []; p.ent.gsplat.layers = [scanLayer.id]; dirty = true; busyUntil = now + 1500; }
        }
        if (Math.abs(p.fade - k) > 0.002) { p.fade = k; p.ent.gsplat.setParameter("uFade", k); dirty = true; }
        var clip = M[name + "Clip"] ? track(M[name + "Clip"], P) : 1e9;
        if (Math.abs(p.clip - clip) > 0.003) { p.clip = clip; p.ent.gsplat.setParameter("uClipY", clip); dirty = true; }
        if (p.sharpAt && now > p.sharpAt) { p.sharpAt = 0; p.ent.gsplat.lodRangeMin = p.finest; p.ent.gsplat.lodRangeMax = 99; dirty = true; busyUntil = now + 3000; }
      } else {
        var vis = k > 0.5;
        if (p.root.enabled !== vis) { p.root.enabled = vis; dirty = true; }
        var tops = track(M[name + "Tops"], P, 1) > 0.5;
        if (p.topsOn !== tops) { p.topsOn = tops; p.tops.forEach(function (e) { e.enabled = tops; }); (p.topMis || []).forEach(function (mi) { mi.visible = tops; }); dirty = true; }
        if (M[name + "Y"]) {
          var y = track(M[name + "Y"], P), b = p.cfg.to.m ? [p.cfg.to.m[0][3], p.cfg.to.m[1][3], p.cfg.to.m[2][3]] : [0, 0, 0];
          p.root.setLocalPosition(b[0], b[1] + y, b[2]);
        }
      }
    });

    // the drag line (chapter 3): the model left of the line, the indoor scan right of it. The line on the screen is
    // a plane through the camera in 3D; the scan only draws what lies on its right side (uCut in FADE_GLSL).
    var gr = parts.ground;
    if (gr && gr.state === "ready") {
      var cut = [0, 0, 0, 1];
      if (S.at === 3) {
        var x = clamp(S.wipe, 0, 1), A = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
        var tx = Math.tan(cam.camera.fov * Math.PI / 360) * A * (2 * x - 1);
        var F = cam.forward, R = cam.right, U = cam.up, C = cam.getPosition();
        var d = [F.x + R.x * tx, F.y + R.y * tx, F.z + R.z * tx];
        var n = [d[1] * U.z - d[2] * U.y, d[2] * U.x - d[0] * U.z, d[0] * U.y - d[1] * U.x];   // d x up = towards the right
        cut = [n[0], n[1], n[2], -(n[0] * C.x + n[1] * C.y + n[2] * C.z)];
      }
      var ck = cut.join(",");
      if (gr.cutKey !== ck) { gr.cutKey = ck; gr.ent.gsplat.setParameter("uCut", cut); dirty = true; }
      // the line has gone: the scan fades in on the model side too (S.cutFade, js/story.js)
      var sa = S.cutFade || 0;
      if (gr.sideA !== sa) { gr.sideA = sa; gr.ent.gsplat.setParameter("uSideA", sa); dirty = true; }
    }

    var house = parts[D.designOn];
    applyTable(house); applyLight(house, Math.min(dt, 0.1)); applyPaint(house); applyMove(house, Math.min(dt, 0.1));

    if (!shownOnce && parts.sky && parts.sky.state === "ready" && parts.sky.ent.enabled && now > (parts.sky.readyAt || (parts.sky.readyAt = now + 700))) {
      shownOnce = true; root.classList.add("is-live");
    }
    // draw only when needed (and keep drawing a moment after a change, while tiles stream in)
    if (dirty || now < busyUntil) { app.renderNextFrame = true; dirty = false; }
    // slow device: draw a little less sharp
    fps.t += dt; fps.n++;
    if (fps.t > 2) { fps.v = fps.n / fps.t; fps.t = 0; fps.n = 0; if (fps.v < 32 && dprCap > 1) { dprCap = Math.max(1, dprCap - 0.25); resize(); log("pixel ratio", dprCap); } }
  }
  // the page asks for the pin and the box every scroll frame: keep them in step with the camera
  var oldFrame = OS.onFrame;
  OS.onFrame = function (S) { if (oldFrame) oldFrame(S); };

  function start() { boot(); }
  if (doc.readyState === "complete") start(); else win.addEventListener("load", start);
  win.OrbitStory3D = { parts: parts, camAt: camAt, app: function () { return app; } };
})();
