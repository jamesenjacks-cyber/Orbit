/* Floating furniture (4 Nov 2026, James): a few real pieces from the furniture library (IKEA sofa, armchair,
   coffee table, a floor lamp and a planter; copies in assets/furniture/, the originals are never touched)
   float and turn slowly behind the "Already designed?" card and the upload area of view-design.html.
   Live 3D, not a picture film ("Real 3D, not frames"): a small WebGL2 renderer of our own, no engine.
   - <div data-furniture="card|page"> holds a still picture (the same pieces, for reduced motion, no WebGL or
     while loading); a canvas is added on top and fades in once the first frame is drawn (class is-live).
   - Loads only when the box comes near the screen, draws only while it is on screen and the tab is visible,
     30 frames a second on phones, 60 on computers; phones get three pieces, computers five.
   - The files are fixed paths of this site (no visitor input). Only plain triangles + the baked colour
     texture are read from each .glb; the flat shadow planes (unlit) are left out. */
(function () {
  "use strict";
  var boxes = Array.prototype.slice.call(document.querySelectorAll("[data-furniture]"));
  if (!boxes.length) return;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var phone = matchMedia("(max-width: 767px), (pointer: coarse)").matches;
  if (reduce || location.protocol === "file:") return;          // the still picture stays

  var BASE = "assets/furniture/";
  // Pieces (library ids): sofa = sofa-landskrona-2-seat-sofa-35a4, chair = chair-dyvlinge-swivel-easy-chair-1e59,
  // lamp = lamp-standing-lamp-0cbd, table = table-gladom-tray-table-2c21, plant = plant-large-potted-plant-71a2.
  // Their start turn, turn speed (radians a second) and bob phase:
  var PIECES = {
    sofa:  { file: "sofa.glb",  yaw: -0.5, spin: 0.10, bob: 0.0 },
    chair: { file: "chair.glb", yaw: 0.9,  spin: -0.13, bob: 1.7 },
    lamp:  { file: "lamp.glb",  yaw: 0.2,  spin: 0.08, bob: 3.1 },
    table: { file: "table.glb", yaw: 0.6,  spin: -0.09, bob: 4.4 },
    plant: { file: "plant.glb", yaw: 0.0,  spin: 0.12, bob: 2.4 }
  };
  // layouts: spots per piece, and where the group sits in the box (cx/cy = centre in -1..1, fw/fh = how much
  // of the box width / height the group may fill)
  var LAYOUT = {
    card: {
      wide:  { spots: { sofa: [0, 0, 0], chair: [1.55, 0.35, 0.55], lamp: [-1.5, 0.45, -0.5], table: [0.15, -0.75, 1.1], plant: [1.45, 1.25, -0.9] },
               cx: 0.04, cy: 0.0, fw: 0.84, fh: 0.8 },
      phone: { spots: { sofa: [0, -0.15, 0], chair: [1.35, 0.4, 0.4], lamp: [-1.3, 0.35, -0.4] },
               cx: 0.0, cy: 0.0, fw: 0.86, fh: 0.82 }
    },
    page: {
      wide:  { spots: { lamp: [-3.4, 0.25, -0.3], chair: [-2.5, -0.55, 0.6], sofa: [3.0, -0.5, 0.2], plant: [3.7, 0.8, -0.6], table: [2.3, 0.95, -1.0] },
               cx: 0.0, cy: 0.0, fw: 0.96, fh: 0.86 },
      // phones: a band of furniture above the words (css/pages.css), like the card on the main page
      phone: { spots: { sofa: [0, -0.15, 0], chair: [1.35, 0.4, 0.4], lamp: [-1.3, 0.35, -0.4] },
               cx: 0.0, cy: 0.0, fw: 0.86, fh: 0.82 }
    }
  };

  // ---------- .glb reading (only what these files need) ----------
  var cache = {};
  function loadGlb(name) {
    if (cache[name]) return cache[name];
    cache[name] = fetch(BASE + PIECES[name].file, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("furniture " + name + ": " + r.status);
      return r.arrayBuffer();
    }).then(parseGlb);
    return cache[name];
  }
  function parseGlb(buf) {
    var dv = new DataView(buf);
    if (buf.byteLength < 28 || dv.getUint32(0, true) !== 0x46546C67 || dv.getUint32(4, true) !== 2) throw new Error("not a glb");
    var jsonLen = dv.getUint32(12, true);
    if (dv.getUint32(16, true) !== 0x4E4F534A || 20 + jsonLen + 8 > buf.byteLength) throw new Error("bad glb");
    var json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
    var binAt = 20 + jsonLen, binLen = dv.getUint32(binAt, true);
    if (dv.getUint32(binAt + 4, true) !== 0x004E4942 || binAt + 8 + binLen > buf.byteLength) throw new Error("bad glb bin");
    var bin = new Uint8Array(buf, binAt + 8, binLen);
    return { json: json, bin: bin };
  }
  var COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  var SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  function accessor(g, i) {
    var a = g.json.accessors[i], bv = g.json.bufferViews[a.bufferView], T = COMP[a.componentType], n = SIZE[a.type];
    if (!T || !n) throw new Error("accessor type");
    // (security check QC-20261104-1000 LOW-2) whole numbers in sane limits, inside the bufferView and the BIN chunk
    var int = function (v, d) { return v === undefined ? d : (Number.isInteger(v) && v >= 0 ? v : -1); };
    var es = T.BYTES_PER_ELEMENT, bvOff = int(bv.byteOffset, 0), bvLen = int(bv.byteLength, -1), aOff = int(a.byteOffset, 0);
    var stride = int(bv.byteStride, es * n), count = int(a.count, -1);
    if (bvOff < 0 || bvLen < 0 || aOff < 0 || count < 1 || count > 500000 || stride < es * n || stride > 252) throw new Error("accessor values");
    var off = bvOff + aOff;
    if (off + stride * (count - 1) + es * n > bvOff + bvLen || bvOff + bvLen > g.bin.byteLength) throw new Error("accessor range");
    var out = new T(count * n);
    var src = new DataView(g.bin.buffer, g.bin.byteOffset);
    var get = { 5126: "getFloat32", 5125: "getUint32", 5123: "getUint16", 5121: "getUint8", 5122: "getInt16", 5120: "getInt8" }[a.componentType];
    for (var k = 0; k < count; k++) for (var c = 0; c < n; c++) out[k * n + c] = src[get](off + k * stride + c * es, true);
    return out;
  }
  // 4x4 column-major helpers
  function mul(a, b) { var o = new Float32Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  function trs(n) {
    var nums = function (v, k) { return Array.isArray(v) && v.length === k && v.every(function (x) { return typeof x === "number" && isFinite(x); }); };
    if (n.matrix !== undefined) { if (!nums(n.matrix, 16)) throw new Error("node matrix"); return new Float32Array(n.matrix); }
    var t = nums(n.translation, 3) ? n.translation : [0, 0, 0], q = nums(n.rotation, 4) ? n.rotation : [0, 0, 0, 1], s = nums(n.scale, 3) ? n.scale : [1, 1, 1];
    var x = q[0], y = q[1], z = q[2], w = q[3];
    return new Float32Array([
      (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
      2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
      2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
      t[0], t[1], t[2], 1]);
  }
  // -> { parts: [{ pos, nrm, uv, idx, color, image }], min, max }
  function meshOf(g) {
    var j = g.json, parts = [], min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    var I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    var visits = 0;   // (security check QC-20261104-1000 LOW-1) a node list that repeats itself cannot freeze the page
    function visit(ni, parent, depth) {
      if (++visits > 256) throw new Error("too many nodes");
      var n = j.nodes[ni]; if (!n || depth > 16) return;
      var m = mul(parent, trs(n));
      if (n.mesh !== undefined) j.meshes[n.mesh].primitives.forEach(function (p) {
        if ((p.mode !== undefined && p.mode !== 4) || p.attributes.POSITION === undefined || p.attributes.NORMAL === undefined) return;
        var mat = p.material !== undefined ? j.materials[p.material] : {};
        if (mat.alphaMode === "BLEND" || (mat.extensions && mat.extensions.KHR_materials_unlit)) return;   // shadow planes
        var pos = accessor(g, p.attributes.POSITION), nrm = accessor(g, p.attributes.NORMAL);
        var uv = p.attributes.TEXCOORD_0 !== undefined ? accessor(g, p.attributes.TEXCOORD_0) : new Float32Array(pos.length / 3 * 2);
        var idx = p.indices !== undefined ? accessor(g, p.indices) : null;
        for (var v = 0; v < pos.length; v += 3) {
          var x = pos[v], y = pos[v + 1], z = pos[v + 2];
          pos[v] = m[0] * x + m[4] * y + m[8] * z + m[12];
          pos[v + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
          pos[v + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
          for (var c = 0; c < 3; c++) { if (pos[v + c] < min[c]) min[c] = pos[v + c]; if (pos[v + c] > max[c]) max[c] = pos[v + c]; }
          var a = nrm[v], b = nrm[v + 1], d = nrm[v + 2];
          var nx = m[0] * a + m[4] * b + m[8] * d, ny = m[1] * a + m[5] * b + m[9] * d, nz = m[2] * a + m[6] * b + m[10] * d;
          var L = Math.hypot(nx, ny, nz) || 1; nrm[v] = nx / L; nrm[v + 1] = ny / L; nrm[v + 2] = nz / L;
        }
        var pbr = mat.pbrMetallicRoughness || {}, color = pbr.baseColorFactor || [1, 1, 1, 1], image = null;
        if (pbr.baseColorTexture && j.textures) {
          var tex = j.textures[pbr.baseColorTexture.index], im = tex && j.images[tex.source];
          if (im && im.bufferView !== undefined && /^image\/(png|jpeg|webp)$/.test(im.mimeType || "")) {
            var bv = j.bufferViews[im.bufferView];
            image = new Blob([g.bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)], { type: im.mimeType });
          }
        }
        parts.push({ pos: pos, nrm: nrm, uv: uv, idx: idx, color: color, image: image });
      });
      (n.children || []).forEach(function (c) { visit(c, m, depth + 1); });
    }
    (j.scenes[j.scene || 0].nodes || []).forEach(function (ni) { visit(ni, I, 0); });
    return { parts: parts, min: min, max: max };
  }

  // ---------- WebGL ----------
  var VS = "#version 300 es\nin vec3 aP; in vec3 aN; in vec2 aU; uniform mat4 uM; uniform mat4 uVP; out vec3 vN; out vec2 vU; out vec3 vW;" +
    "void main(){ vec4 w = uM * vec4(aP, 1.0); vW = w.xyz; vN = mat3(uM) * aN; vU = aU; gl_Position = uVP * w; }";
  var FS = "#version 300 es\nprecision mediump float; in vec3 vN; in vec2 vU; in vec3 vW; uniform sampler2D uT; uniform vec4 uC; uniform vec3 uEye; uniform float uA; out vec4 o;" +
    "void main(){ vec3 n = normalize(vN); vec4 b = texture(uT, vU) * uC; vec3 L = normalize(vec3(-0.45, 0.8, 0.55));" +
    " float l = max(dot(n, L), 0.0); vec3 V = normalize(uEye - vW); float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);" +
    " vec3 c = b.rgb * (0.86 + 0.34 * l) + vec3(1.0, 0.42, 0.22) * rim * 0.3;" +
    " c += vec3(0.1) * (1.0 - dot(b.rgb, vec3(0.333)));" +   // black metal legs stay readable on the dark frame
    " o = vec4(c * uA, uA); }";

  function Scene(box, layoutName) {
    this.box = box; this.layoutName = layoutName;
    this.on = false; this.live = false; this.t0 = 0; this.last = 0; this.raf = 0; this.px = 0; this.pxT = 0;
  }
  Scene.prototype.start = function () {
    var self = this, box = this.box;
    var canvas = document.createElement("canvas");
    canvas.className = "furn__gl";
    canvas.setAttribute("aria-hidden", "true");
    var gl = canvas.getContext("webgl2", { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: "low-power" });
    if (!gl) return;
    this.gl = gl; this.canvas = canvas;
    var prog = this.program(VS, FS); if (!prog) return;
    this.prog = prog;
    this.loc = { P: gl.getAttribLocation(prog, "aP"), N: gl.getAttribLocation(prog, "aN"), U: gl.getAttribLocation(prog, "aU"),
      M: gl.getUniformLocation(prog, "uM"), VP: gl.getUniformLocation(prog, "uVP"), T: gl.getUniformLocation(prog, "uT"),
      C: gl.getUniformLocation(prog, "uC"), E: gl.getUniformLocation(prog, "uEye"), A: gl.getUniformLocation(prog, "uA") };
    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); self.stop(); box.classList.remove("is-live"); });
    box.appendChild(canvas);
    var lay = LAYOUT[this.layoutName][phone ? "phone" : "wide"];
    this.lay = lay;
    var names = Object.keys(lay.spots);
    Promise.all(names.map(function (n) { return loadGlb(n).then(function (g) { return self.upload(n, meshOf(g)); }); })).then(function (list) {
      self.items = list;
      self.fit();
      self.t0 = performance.now();
      self.ready = true;
      if (self.on) self.loop();
    }).catch(function (err) { console.warn("[furniture] not shown:", err && err.message); canvas.remove(); });
    if ("ResizeObserver" in window) new ResizeObserver(function () { self.size(); if (self.ready && !self.raf) self.draw(performance.now()); }).observe(box);
    if (!phone) box.addEventListener("pointermove", function (e) {
      var r = box.getBoundingClientRect(); self.pxT = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 2;
    });
    box.addEventListener("pointerleave", function () { self.pxT = 0; });
    this.size();
  };
  Scene.prototype.program = function (vs, fs) {
    var gl = this.gl;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
  };
  Scene.prototype.upload = function (name, mesh) {
    var gl = this.gl, loc = this.loc, spec = PIECES[name], spot = this.lay.spots[name];
    var cx = (mesh.min[0] + mesh.max[0]) / 2, cy = (mesh.min[1] + mesh.max[1]) / 2, cz = (mesh.min[2] + mesh.max[2]) / 2;
    var r = Math.hypot(mesh.max[0] - mesh.min[0], mesh.max[1] - mesh.min[1], mesh.max[2] - mesh.min[2]) / 2;
    var parts = mesh.parts.map(function (p) {
      var vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      function buf(data, at, n) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, n, gl.FLOAT, false, 0, 0); }
      buf(p.pos, loc.P, 3); buf(p.nrm, loc.N, 3); buf(p.uv, loc.U, 2);
      var count = p.pos.length / 3, type = 0;
      if (p.idx) {
        var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        var idx = p.idx instanceof Uint32Array || p.idx instanceof Uint16Array ? p.idx : new Uint16Array(p.idx);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW); count = idx.length; type = idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      }
      gl.bindVertexArray(null);
      var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      var part = { vao: vao, count: count, type: type, tex: tex, color: p.color };
      if (p.image && window.createImageBitmap) createImageBitmap(p.image).then(function (bmp) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        if (bmp.close) bmp.close();
      }).catch(function () { /* plain colour then */ });
      return part;
    });
    return { name: name, parts: parts, c: [cx, cy, cz], r: r, spot: spot, spec: spec };
  };
  Scene.prototype.size = function () {
    if (!this.canvas) return;
    var r = this.box.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.aspect = r.width / Math.max(1, r.height);
    if (this.items) this.fit();
  };
  // camera distance so the whole group fills the layout's part of the box
  Scene.prototype.fit = function () {
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    this.items.forEach(function (it) { for (var c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], it.spot[c] - it.r); hi[c] = Math.max(hi[c], it.spot[c] + it.r); } });
    this.center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    var hw = (hi[0] - lo[0]) / 2, hh = (hi[1] - lo[1]) / 2, tanH = Math.tan(14 * Math.PI / 180);
    this.dist = Math.max(hw / (tanH * this.aspect * this.lay.fw), hh / (tanH * this.lay.fh)) + (hi[2] - lo[2]) / 2;
  };
  Scene.prototype.draw = function (now) {
    var gl = this.gl, loc = this.loc, lay = this.lay, t = (now - this.t0) / 1000;
    this.px += (this.pxT - this.px) * 0.04;
    var fovy = 28 * Math.PI / 180, f = 1 / Math.tan(fovy / 2), near = 0.1, far = 100, a = this.aspect;
    var P = new Float32Array([f / a, 0, 0, 0, 0, f, 0, 0, lay.cx, lay.cy, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
    // the eye: a little above the group, turned a touch with the pointer (computers)
    var yaw = this.px * 0.12, pitch = 0.16, d = this.dist, C = this.center;
    var eye = [C[0] + Math.sin(yaw) * Math.cos(pitch) * d, C[1] + Math.sin(pitch) * d, C[2] + Math.cos(yaw) * Math.cos(pitch) * d];
    var V = lookAt(eye, C), VP = mul(P, V);
    var fade = Math.min(1, t / 0.9); fade = fade * fade * (3 - 2 * fade);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);   // leaves and thin parts are one-sided
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(loc.VP, false, VP); gl.uniform3fv(loc.E, eye); gl.uniform1f(loc.A, fade); gl.uniform1i(loc.T, 0);
    gl.activeTexture(gl.TEXTURE0);
    this.items.forEach(function (it) {
      var s = it.spec, ry = s.yaw + t * s.spin, bob = Math.sin(t * 0.55 + s.bob) * 0.06, tilt = Math.sin(t * 0.37 + s.bob) * 0.035;
      var cy = Math.cos(ry), sy = Math.sin(ry), ct = Math.cos(tilt), st = Math.sin(tilt);
      // move the piece's middle to the origin, tilt a little (x), turn (y), then to its spot
      var R = new Float32Array([cy, 0, -sy, 0, sy * st, ct, cy * st, 0, sy * ct, -st, cy * ct, 0, 0, 0, 0, 1]);
      var T0 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -it.c[0], -it.c[1], -it.c[2], 1]);
      var T1 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, it.spot[0], it.spot[1] + bob, it.spot[2], 1]);
      gl.uniformMatrix4fv(loc.M, false, mul(T1, mul(R, T0)));
      it.parts.forEach(function (p) {
        gl.uniform4fv(loc.C, p.color);
        gl.bindTexture(gl.TEXTURE_2D, p.tex);
        gl.bindVertexArray(p.vao);
        if (p.type) gl.drawElements(gl.TRIANGLES, p.count, p.type, 0); else gl.drawArrays(gl.TRIANGLES, 0, p.count);
      });
    });
    gl.bindVertexArray(null);
    if (!this.live && t > 0.05) { this.live = true; this.box.classList.add("is-live"); }
  };
  function lookAt(e, c) {
    var z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]], zl = Math.hypot(z[0], z[1], z[2]); z = [z[0] / zl, z[1] / zl, z[2] / zl];
    var x = [z[2], 0, -z[0]], xl = Math.hypot(x[0], x[2]) || 1; x = [x[0] / xl, 0, x[2] / xl];
    var y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]);
  }
  Scene.prototype.loop = function () {
    var self = this;
    if (this.raf || !this.ready) return;
    var step = phone ? 1000 / 30 - 2 : 0;
    var tick = function (now) {
      self.raf = 0;
      if (!self.on || document.hidden) return;
      if (now - self.last >= step) { self.last = now; self.draw(now); }
      self.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  };
  Scene.prototype.stop = function () { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; };

  // ---------- start each box when it comes near, draw while on screen ----------
  var scenes = boxes.map(function (b) { return new Scene(b, LAYOUT[b.getAttribute("data-furniture")] ? b.getAttribute("data-furniture") : "card"); });
  if (!("IntersectionObserver" in window)) return;
  var near = new IntersectionObserver(function (en) {
    en.forEach(function (e) {
      if (!e.isIntersecting) return;
      near.unobserve(e.target);
      var s = scenes[boxes.indexOf(e.target)];
      if (s && !s.canvas) s.start();
    });
  }, { rootMargin: "60% 0px" });
  var seen = new IntersectionObserver(function (en) {
    en.forEach(function (e) {
      var s = scenes[boxes.indexOf(e.target)];
      if (!s) return;
      s.on = e.isIntersecting;
      if (s.on) s.loop(); else s.stop();
    });
  }, { threshold: 0 });
  boxes.forEach(function (b) { near.observe(b); seen.observe(b); });
  document.addEventListener("visibilitychange", function () { scenes.forEach(function (s) { if (!document.hidden && s.on) s.loop(); }); });

  // test hook (the still pictures were made with it): OrbitFurniture.still(i, t) draws box i at time t and
  // returns the picture as a data URL
  window.OrbitFurniture = {
    state: function () { return scenes.map(function (s) { return { layout: s.layoutName, ready: !!s.ready, live: s.live, on: s.on, pieces: s.items ? s.items.length : 0 }; }); },
    still: function (i, t) { var s = scenes[i]; if (!s || !s.ready) return ""; s.stop(); s.px = 0; s.pxT = 0; s.t0 = performance.now() - t * 1000; s.draw(performance.now()); return s.canvas.toDataURL("image/png"); }
  };
})();
