/* Compare (#compare): "Look around, or move through."
   4 Nov 2026 (James picked option B "one frame, split slider"): the section PLAYS BY ITSELF.
   One full-screen frame, split by a handle the visitor can drag (keyboard: arrow keys on the handle):
     left  (phone: top)    = a 360 photo tour: looks around a little, a hop ring appears, it jumps to the next
                             spot (zoom + cross-fade, the way 360 tours do). Own small WebGL canvas, photos
                             assets/compare/pano-N.webp (phones: pano-N-s.webp).
     right (phone: bottom) = Orbit on the page's own stage (js/stage.js + stage-stream.js, scene "compare-scan"):
                             0  "3D scan"  the real scan glides through the kitchen,
                             1  "3D model" the scan melts down to the floor and the 3D model is under it; a chair
                                           and a lamp move by themselves; then the scan grows back up,
                             2  "Walk in"  eye height walk from the kitchen into the studio.
   Taking over: drag / tap / keys on a side = that side stops playing and follows the visitor (right side:
   drag = look, W A S D / arrows = walk, tap the floor = walk there; left side: drag = look, tap the ring =
   hop). After IDLE_MS without input the side plays on by itself. The pause button holds both sides; the
   three part buttons jump to a part. Reduced motion: it starts paused, nothing moves by itself.
   Without the stage (file://, no WebGL2, the scan fails) the right side shows stills per part.
   Old version (toggle + viewer iframe): work/backup-20261104-compare-auto/compare.js. */
(function () {
  "use strict";
  var sec = document.querySelector(".sec--compare");
  if (!sec) return;

  var SITE = window.ORBIT_SITE || {};
  var zone = sec.querySelector("[data-compare-zone]");
  var orbitEl = sec.querySelector("[data-cmp-orbit]");
  var panoEl = sec.querySelector("[data-cmp-pano]");
  var hopBtn = sec.querySelector("[data-cmp-hop]");
  var split = sec.querySelector("[data-cmp-split]");
  var tagR = sec.querySelector("[data-cmp-tag]");
  var grab = sec.querySelector("[data-cmp-grab]");
  var grabName = sec.querySelector("[data-cmp-grab-name]");
  var playBtn = sec.querySelector("[data-cmp-play]");
  var chaps = Array.prototype.slice.call(sec.querySelectorAll("[data-cmp-chap]"));
  var hintEl = sec.querySelector("[data-cmp-hint]");
  var statusEl = sec.querySelector("[data-compare-status]");
  var params = new URLSearchParams(location.search);
  var reducedMq = matchMedia("(prefers-reduced-motion: reduce)");
  var reduced = reducedMq.matches || params.get("reduce") === "1";
  var touchOnly = matchMedia("(hover: none) and (pointer: coarse)").matches;
  var isPhone = matchMedia("(pointer: coarse)").matches || innerWidth < 768;
  var IDLE_MS = 9000;
  // ?cmpt=<seconds> freezes the Orbit side at that moment, ?cmpp=<seconds> the 360 side (for checks)
  var FREEZE_R = params.has("cmpt") ? Number(params.get("cmpt")) : NaN;
  var FREEZE_L = params.has("cmpp") ? Number(params.get("cmpp")) : NaN;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function mix3(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }
  function ease(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function tr(s) { return window.OrbitLanguage ? window.OrbitLanguage.text(s) : s; }
  function say(t) { if (statusEl) { statusEl.textContent = ""; setTimeout(function () { statusEl.textContent = tr(t); }, 30); } }
  var hintTimer = 0;
  function hint(t) {
    if (!hintEl) return;
    clearTimeout(hintTimer);
    if (!t) { hintEl.classList.remove("is-on"); return; }
    hintEl.textContent = tr(t); hintEl.classList.add("is-on");
    hintTimer = setTimeout(function () { hintEl.classList.remove("is-on"); }, 4200);
  }

  /* ================= shared play state ================= */
  var P = {
    paused: reduced,           // the pause button (reduced motion: starts paused)
    onScreen: false,
    userR: 0, userL: 0         // time of the last input on each side (0 = playing by itself)
  };
  function playingR(now) { return !P.paused && P.onScreen && !document.hidden && !(P.userR && now - P.userR < IDLE_MS); }
  function playingL(now) { return !P.paused && P.onScreen && !document.hidden && !(P.userL && now - P.userL < IDLE_MS); }
  function paintEngaged() {
    var now = performance.now();
    zone.classList.toggle("is-engaged", !!((P.userR && now - P.userR < IDLE_MS) || (P.userL && now - P.userL < IDLE_MS)));
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) {
      en.forEach(function (e) { P.onScreen = e.isIntersecting; });
      if (P.onScreen) { L.kick(); if (R.stillWant) stills(); if (R.ready && !R.modelP) loadModel(); }
    }, { threshold: 0.15 }).observe(zone);
  } else P.onScreen = true;

  /* ================= the split handle ================= */
  var S = { k: 0.5, stack: false, drag: false };
  function layout() {
    var r = zone.getBoundingClientRect();
    var stack = r.width < r.height * 0.95;
    if (stack !== S.stack) {
      S.stack = stack;
      zone.classList.toggle("is-stack", stack);
      split.setAttribute("aria-orientation", stack ? "vertical" : "horizontal");
    }
    var len = stack ? r.height : r.width;
    zone.classList.toggle("is-narrow-l", S.k * len < 190);
    zone.classList.toggle("is-narrow-r", (1 - S.k) * len < 230);
  }
  function setSplit(k) {
    S.k = clamp(k, 0.1, 0.9);
    zone.style.setProperty("--split", S.k.toFixed(4));
    split.setAttribute("aria-valuenow", String(Math.round(S.k * 100)));
    layout();
    if (L) { L.dirty = true; if (L.kick) L.kick(); }
  }
  function splitFrom(e) {
    var r = zone.getBoundingClientRect();
    setSplit(S.stack ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width);
  }
  split.addEventListener("pointerdown", function (e) {
    S.drag = true; split.classList.add("is-drag");
    try { split.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  split.addEventListener("pointermove", function (e) { if (S.drag) splitFrom(e); });
  function endSplit() { S.drag = false; split.classList.remove("is-drag"); }
  split.addEventListener("pointerup", endSplit);
  split.addEventListener("pointercancel", endSplit);
  split.addEventListener("keydown", function (e) {
    var d = 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") d = -0.05;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") d = 0.05;
    if (e.key === "Home") { e.preventDefault(); setSplit(0.1); return; }
    if (e.key === "End") { e.preventDefault(); setSplit(0.9); return; }
    if (d) { e.preventDefault(); setSplit(S.k + d); }
  });
  addEventListener("resize", layout);
  setSplit(0.5);

  /* ================= LEFT: the 360 photo tour ================= */
  // the spots in hop order: photo number, the view at arrival (yaw0) and where the next spot is (yaw1),
  // degrees, 0 = the middle of the photo, + = to the right
  var SPOTS = [
    { n: 6, yaw0: -100, yaw1: -30 },    // kitchen: stove, then the flowers
    { n: 1, yaw0: -170, yaw1: -115 },   // long table towards the kitchen
    { n: 2, yaw0: -60, yaw1: -10 },     // the tiled table under the paper lamp
    { n: 3, yaw0: -170, yaw1: -120 },   // studio: bed, then the mannequins
    { n: 4, yaw0: -60, yaw1: 20 },      // the white wardrobes, then the big table
    { n: 5, yaw0: 120, yaw1: 175 }      // the studio from the window
  ];
  var DWELL = 4.4, HOP = 0.95, RING_PITCH = -30;
  var L = {
    gl: null, cv: null, prog: null, tex: {}, img: {}, ok: false, failed: false, dirty: true,
    t: 0, i: 0, yawU: 0, pitchU: 0, fovU: 0, drag: null, raf: 0, last: 0, hopAt: -1, hopNow: false
  };
  function panoSrc(n) { return "assets/compare/pano-" + n + (isPhone ? "-s" : "") + ".webp"; }
  function loadPano(n) {
    if (L.img[n]) return L.img[n];
    L.img[n] = new Promise(function (ok, no) {
      var im = new Image();
      im.decoding = "async";
      // (4 Nov 2026, phone lag) unpack the picture off the main thread first: otherwise the upload to the
      // graphics chip (texImage2D) unpacked it on the spot and froze the page (~0.9 s in the walk on a slow phone)
      im.onload = function () { if (im.decode) im.decode().then(function () { ok(im); }, function () { ok(im); }); else ok(im); };
      im.onerror = function () { no(new Error("pano " + n)); };
      im.src = panoSrc(n);
    });
    return L.img[n];
  }
  var VS = "attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}";
  var FS = [
    "precision highp float;varying vec2 v;",
    "uniform sampler2D tA,tB;uniform float k,tA_,tB_,asp,flash;uniform vec2 sh;uniform mat3 rA,rB;",
    "const float PI=3.14159265;",
    "vec3 look(sampler2D t,mat3 r,float tn){vec3 d=normalize(r*vec3((v.x-sh.x)*tn*asp,(v.y-sh.y)*tn,1.));",
    " vec2 uv=vec2(atan(d.x,d.z)/(2.*PI)+.5,.5-asin(clamp(d.y,-1.,1.))/PI);return texture2D(t,uv).rgb;}",
    "void main(){vec3 a=look(tA,rA,tA_);vec3 b=k>0.001?look(tB,rB,tB_):a;vec3 c=mix(a,b,k);",
    " c=mix(c,vec3(1.),flash);gl_FragColor=vec4(c,1.);}"
  ].join("\n");
  function rot(yawDeg, pitchDeg) {
    var y = yawDeg * Math.PI / 180, p = pitchDeg * Math.PI / 180;
    var cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
    // R = Ry(yaw) * Rx(-pitch) (column major for GLSL)
    return new Float32Array([cy, 0, -sy, sy * sp, cp, cy * sp, sy * cp, -sp, cy * cp]);
  }
  function initGL() {
    if (L.gl || L.failed) return !!L.gl;
    try {
      var cv = document.createElement("canvas");
      cv.setAttribute("aria-hidden", "true");
      var gl = cv.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "low-power" });
      if (!gl) throw new Error("no webgl");
      function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
      var pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error("link");
      gl.useProgram(pr);
      var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(gl.getUniformLocation(pr, "tA"), 0); gl.uniform1i(gl.getUniformLocation(pr, "tB"), 1);
      L.u = {};
      ["k", "tA_", "tB_", "asp", "flash", "sh", "rA", "rB"].forEach(function (n) { L.u[n] = gl.getUniformLocation(pr, n); });
      cv.addEventListener("webglcontextlost", function (e) { e.preventDefault(); L.failed = true; L.ok = false; panoEl.classList.remove("is-live"); });
      panoEl.insertBefore(cv, panoEl.firstChild);
      L.gl = gl; L.cv = cv; L.prog = pr;
      return true;
    } catch (err) { L.failed = true; return false; }
  }
  function texOf(n) {
    if (L.tex[n]) return L.tex[n];
    var gl = L.gl, im = L.imgReady && L.imgReady[n];
    if (!gl || !im) return null;
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // RGBA: the browser can hand the decoded picture over as it is (RGB made it repack every pixel first)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
    L.tex[n] = t;
    return t;
  }
  L.imgReady = {};
  function want(n) {
    loadPano(n).then(function (im) { L.imgReady[n] = im; L.dirty = true; L.kick(); }).catch(function () {});
  }
  L.started = false;
  L.start = function () {
    if (L.started) return;
    L.started = true;
    if (!initGL()) return;
    // the first two spots now, the rest one after another
    want(SPOTS[0].n);
    loadPano(SPOTS[0].n).then(function () {
      SPOTS.forEach(function (s, i) { if (i) setTimeout(function () { want(s.n); }, 300 * i); });
    }).catch(function () {});
  };
  // (4 Nov 2026, memory) far away: free the photo textures and pictures; L.start() loads them again
  L.drop = function () {
    if (!L.started) return;
    L.started = false;
    if (L.raf) { cancelAnimationFrame(L.raf); L.raf = 0; }
    try { Object.keys(L.tex).forEach(function (n) { L.gl.deleteTexture(L.tex[n]); }); } catch (e) { /* gone */ }
    L.tex = {}; L.img = {}; L.imgReady = {}; L.ok = false; L.dirty = true;
    panoEl.classList.remove("is-live");
  };
  L.kick = function () {
    if (!L.started || L.raf || L.failed) return;
    L.last = performance.now();
    L.raf = requestAnimationFrame(L.frame);
  };
  // the view of spot i at time t inside its dwell (0..DWELL+HOP)
  function spotView(i, t) {
    var s = SPOTS[i];
    var k = ease(sstep(0.2, DWELL - 0.25, t));
    return { yaw: mix(s.yaw0, s.yaw1, k) + Math.sin(t * 0.9) * 1.2, pitch: mix(-4, -10, k) };
  }
  L.frame = function (now) {
    L.raf = 0;
    if (!P.onScreen || document.hidden || L.failed) return;
    var dt = Math.min(0.1, (now - L.last) / 1000); L.last = now;
    var play = playingL(now);
    var cur = SPOTS[L.i], nxt = SPOTS[(L.i + 1) % SPOTS.length];
    var haveA = !!L.imgReady[cur.n], haveB = !!L.imgReady[nxt.n];
    if (isFinite(FREEZE_L)) {
      var cyc = DWELL + HOP, tot = FREEZE_L % (cyc * SPOTS.length);
      L.i = Math.floor(tot / cyc); L.t = tot - L.i * cyc; play = false;
      cur = SPOTS[L.i]; nxt = SPOTS[(L.i + 1) % SPOTS.length]; haveA = !!L.imgReady[cur.n]; haveB = !!L.imgReady[nxt.n];
    }
    if (play && haveA) {
      L.t += dt;
      // the user's own look eases back to the tour's view
      L.yawU *= Math.exp(-dt * 1.6); L.pitchU *= Math.exp(-dt * 1.6);
      if (L.t > DWELL && !haveB) L.t = DWELL;                    // wait for the next photo at the ring
    }
    if (L.hopNow && haveB && L.t < DWELL) L.t = DWELL;           // the visitor tapped the ring
    L.hopNow = false;
    if (L.t >= DWELL + HOP) { L.t -= DWELL + HOP; L.i = (L.i + 1) % SPOTS.length; L.yawU = 0; L.pitchU = 0; cur = SPOTS[L.i]; nxt = SPOTS[(L.i + 1) % SPOTS.length]; L.dirty = true; }
    var moving = (play && haveA) || L.t > DWELL;
    if (!(moving || L.dirty || L.drag)) { return; }           // still: nothing to draw, the loop sleeps
    L.dirty = false;
    draw(cur, nxt);
    L.raf = requestAnimationFrame(L.frame);
  };
  function draw(cur, nxt) {
    var gl = L.gl, cv = L.cv;
    var tA = texOf(cur.n);
    if (!gl || !tA) return;
    var r = zone.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, isPhone ? 1.5 : 1.75);
    var W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    gl.viewport(0, 0, W, H);
    // the visible part (left / top of the handle) and its centre in clip units
    var vw = S.stack ? r.width : r.width * S.k, vh = S.stack ? r.height * S.k : r.height;
    var sx = S.stack ? 0 : S.k - 1, sy = S.stack ? 1 - S.k : 0;
    var fovV = 68 + (vw / vh < 1 ? (1 - vw / vh) * 22 : 0);
    var tn = Math.tan(fovV * Math.PI / 360) * (r.height / vh);
    var asp = r.width / r.height;
    var v = spotView(L.i, Math.min(L.t, DWELL));
    var yaw = v.yaw + L.yawU, pitch = clamp(v.pitch + L.pitchU, -55, 45);
    var hk = L.t > DWELL ? clamp((L.t - DWELL) / HOP, 0, 1) : 0;
    var tB = hk > 0 ? texOf(nxt.n) : null;
    if (hk > 0 && !tB) hk = 0;
    // the jump: zoom into the ring, cross-fade, the new spot opens up
    var zA = 1 - 0.42 * ease(sstep(0, 0.75, hk)), zB = 1.25 - 0.25 * ease(sstep(0.35, 1, hk));
    var k = ease(sstep(0.3, 0.72, hk));
    var flash = 0.18 * Math.sin(Math.PI * sstep(0.25, 0.8, hk));
    var pA = mix(pitch, RING_PITCH * 0.6, ease(sstep(0, 0.7, hk)));
    var nv = spotView((L.i + 1) % SPOTS.length, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tA);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tB || tA);
    gl.uniform1f(L.u.k, k); gl.uniform1f(L.u.tA_, tn * zA); gl.uniform1f(L.u.tB_, tn * zB);
    gl.uniform1f(L.u.asp, asp); gl.uniform1f(L.u.flash, flash);
    gl.uniform2f(L.u.sh, sx, sy);
    gl.uniformMatrix3fv(L.u.rA, false, rot(yaw, pA));
    gl.uniformMatrix3fv(L.u.rB, false, rot(nv.yaw, nv.pitch));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!L.ok) { L.ok = true; panoEl.classList.add("is-live"); }
    // the hop ring: on the floor towards the next spot, from the middle of the stay
    var ringOn = hk === 0 && L.t > DWELL * 0.4;
    var ry = (cur.yaw1 - yaw) * Math.PI / 180, rp = (RING_PITCH - pitch) * Math.PI / 180;
    var dx = Math.sin(ry) * Math.cos(rp), dy = Math.sin(rp), dz = Math.cos(ry) * Math.cos(rp);
    if (ringOn && dz > 0.2) {
      var px = (dx / dz) / (tn * asp), py = (dy / dz) / tn;          // clip units
      var cx = (px + sx + 1) / 2 * r.width, cy = (1 - (py + sy)) / 2 * r.height;
      var inside = S.stack ? cy < vh - 30 && cy > 30 : cx < vw - 30 && cx > 30;
      hopBtn.hidden = !inside;
      hopBtn.style.transform = "translate(" + cx.toFixed(1) + "px," + cy.toFixed(1) + "px)";
      hopBtn.classList.toggle("is-ping", L.t > DWELL - 1.2);
      hopBtn.classList.toggle("is-press", L.t > DWELL - 0.3);
    } else hopBtn.hidden = true;
  }
  // the visitor takes the 360 photo
  panoEl.addEventListener("pointerdown", function (e) {
    if (e.target === hopBtn || hopBtn.contains(e.target)) return;
    L.drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, yaw: L.yawU, pitch: L.pitchU };
    panoEl.classList.add("is-drag");
  });
  addEventListener("pointermove", function (e) {
    var d = L.drag; if (!d || e.pointerId !== d.id) return;
    var mx = e.clientX - d.x, my = e.clientY - d.y;
    if (!d.moved && Math.hypot(mx, my) < 6) return;
    if (!d.moved && touchOnly && Math.abs(my) > Math.abs(mx)) { L.drag = null; panoEl.classList.remove("is-drag"); return; }   // a scroll
    d.moved = true;
    P.userL = performance.now(); paintEngaged();
    var r = zone.getBoundingClientRect();
    var k = 90 / Math.max(300, r.height);
    L.yawU = d.yaw - mx * k; L.pitchU = clamp(d.pitch + my * k, -40, 40);
    L.dirty = true; L.kick();
  });
  function endPano() { if (L.drag) { L.drag = null; panoEl.classList.remove("is-drag"); } }
  addEventListener("pointerup", endPano); addEventListener("pointercancel", endPano);
  hopBtn.addEventListener("click", function () {
    P.userL = performance.now(); paintEngaged();
    L.hopNow = true; L.dirty = true; L.kick();
    say("Hopped to the next spot.");
  });

  /* ================= RIGHT: Orbit on the stage ================= */
  // world = the scan's own frame on the stage (same as before: toModel 180 deg about x, metres x 1.067)
  // The 3D model (house.json "align": model = s R splat + t) is placed in that frame:
  var MODEL_POSE = { quat: [0.0059, 0.0051, -0.0138, 0.999874], scale: 1.06735, pos: [-13.00967, 0.41359, -6.48478] };
  // furniture that moves by itself in the 3D model (glb node names, model metres, degrees)
  var MOVES = [
    // (the pieces' own origin is the model origin: `at` = where the piece stands, from furniture.json)
    { node: "kitchen__Chair 6", name: "Chair", at: [11.15, 0.01, 5.84], t0: 13.6, t1: 15.8, d: [0.75, 0, 0.35], turn: -35 },
    { node: "kitchen__Pedestal + flowers", name: "Plant", at: [11.78, 0, 7.44], t0: 16.9, t1: 19.2, d: [-0.7, 0, -0.55], turn: 0 }
  ];
  // the Orbit side's timeline (seconds)
  var T = { melt: [11.2, 13.0], grow: [21.0, 22.8], parts: [0, 11.2, 22.8], end: 36 };
  // camera paths (world metres): [time, eye, look]
  var PATH = [
    // glide: down the long table towards the kitchen, then round to the island
    [0.0, [-0.35, 1.62, -3.7], [-1.0, 1.1, 0.6]],
    [4.5, [0.05, 1.55, -2.0], [-1.5, 0.95, 0.8]],
    [8.5, [0.35, 1.55, -0.2], [-0.6, 1.15, 3.6]],
    // 3D model: a little higher, the long table with its chairs and the flowers
    [11.2, [-0.4, 2.0, -3.05], [-1.0, 0.5, 0.3]],
    [16.0, [-0.25, 2.25, -3.3], [-0.75, 0.45, 0.5]],
    [21.0, [-0.4, 2.05, -3.0], [-1.0, 0.55, 0.6]],
    // walk in: across the kitchen, through the door, then the studio and its wardrobes
    [22.8, [-0.3, 1.6, 0.6], [-1.3, 1.45, 4.5]],
    [27.0, [-1.3, 1.6, 3.0], [-1.3, 1.45, 7.0]],
    [30.5, [-1.2, 1.6, 5.0], [0.8, 1.4, 8.8]],
    [36.0, [-0.6, 1.6, 6.0], [3.6, 1.35, 6.4]]
  ];
  function pathAt(t) {
    var i = 0;
    while (i < PATH.length - 2 && t > PATH[i + 1][0]) i++;
    var a = PATH[i], b = PATH[i + 1];
    var k = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
    // smooth through the points (ease in the parts where the camera changes its mind)
    var e = k * k * (3 - 2 * k);
    var bob = t > T.parts[2] ? Math.sin(t * 5.2) * 0.012 : 0;       // a very small step while walking
    var eye = mix3(a[1], b[1], e), look = mix3(a[2], b[2], e);
    eye[1] += bob;
    return { eye: eye, look: look };
  }
  function partAt(t) { return t >= T.parts[2] ? 2 : t >= T.parts[1] ? 1 : 0; }

  var R = {
    core: null, stream: null, ready: false, failed: false, started: false, live: 0,
    model: null, modelState: "", modelP: null, pieces: [], t: isFinite(FREEZE_R) ? FREEZE_R : 0,
    user: null, blend: null, keys: {}, go: null, lastPose: "", clip: "", lastPart: -1, chapP: [-1, -1, -1]
  };
  function use() {
    if (R.failed) return false;
    if (!(SITE.scans && SITE.scans.compare && SITE.scans.compare.url)) return false;
    if (location.protocol === "file:") return false;
    return !document.documentElement.classList.contains("stage-none");
  }
  var cfg = use() ? SITE.scans.compare : null;
  var FLOOR = cfg && isFinite(cfg.floor) ? cfg.floor : -0.05;
  var AREA = [-2.3, -4.6, 4.0, 10.2];       // where the visitor may walk (world x0, z0, x1, z1)

  var hit = document.createElement("div");
  hit.className = "compare__hit stage-hit";
  hit.setAttribute("data-hit", "compare-scan");
  hit.tabIndex = 0;
  hit.setAttribute("role", "application");
  hit.setAttribute("aria-label", "3D scan. Drag to look, W A S D or the arrow keys to walk.");
  hit.hidden = true;
  split.parentNode.insertBefore(hit, split);

  function poseNow() {
    // the camera right now: the visitor's own, or the path, eased from where it was
    var now = performance.now(), p;
    if (R.user) p = { eye: R.user.eye.slice(), look: lookOf(R.user) };
    else p = pathAt(R.t);
    if (R.blend) {
      var k = ease((now - R.blend.at) / 1400);
      if (k >= 1) R.blend = null;
      else p = { eye: mix3(R.blend.eye, p.eye, k), look: mix3(R.blend.look, p.look, k) };
    }
    return p;
  }
  function lookOf(u) {
    var cp = Math.cos(u.pitch);
    return [u.eye[0] + Math.sin(u.yaw) * cp, u.eye[1] + Math.sin(u.pitch), u.eye[2] + Math.cos(u.yaw) * cp];
  }
  function takeOver() {
    var now = performance.now();
    P.userR = now; paintEngaged();
    if (R.user) return;
    var p = poseNow();
    var d = [p.look[0] - p.eye[0], p.look[1] - p.eye[1], p.look[2] - p.eye[2]];
    R.user = { eye: p.eye.slice(), yaw: Math.atan2(d[0], d[2]), pitch: Math.atan2(d[1], Math.hypot(d[0], d[2])), scrollY: window.scrollY };
    R.blend = null;
    if (window.OrbitEngage) window.OrbitEngage.claim("scene", "compare-scan", function () { R.keys = {}; });
    hint(touchOnly ? "Drag to look. Tap the floor to walk there." : "Drag to look. W A S D or click the floor to walk.");
  }
  function giveBack() {
    // back to playing by itself: ease from the visitor's view onto the path
    if (!R.user) return;
    var p = poseNow();
    R.blend = { at: performance.now(), eye: p.eye, look: p.look };
    R.user = null; R.go = null; R.keys = {};
    if (window.OrbitEngage) window.OrbitEngage.release("compare-scan");
    paintEngaged();
  }
  function limit(e) {
    e[0] = clamp(e[0], AREA[0], AREA[2]); e[2] = clamp(e[2], AREA[1], AREA[3]);
    return e;
  }

  var WALK = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
  hit.addEventListener("pointerdown", function () { try { hit.focus({ preventScroll: true }); } catch (e) {} });
  hit.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (WALK[e.code] || WALK[e.key]) { e.preventDefault(); takeOver(); R.keys[e.code] = true; R.keys[e.key] = true; R.go = null; return; }
    if (e.key === "Escape") { P.userR = 0; giveBack(); }
  });
  addEventListener("keyup", function (e) { R.keys[e.code] = false; R.keys[e.key] = false; }, true);
  addEventListener("blur", function () { R.keys = {}; });
  hit.addEventListener("blur", function () { R.keys = {}; });

  function install() {
    var core = window.OrbitStage && window.OrbitStage._core;
    if (!cfg) { stills(); return; }
    if (!core || !core.scene) { setTimeout(install, 120); return; }
    R.core = core;
    if (core.streamOff && core.streamOff()) { fail(); return; }
    var dragging = false;
    core.scene("compare-scan", {
      interactive: function () { return R.live > 0.5; },
      down: function () { dragging = true; },
      move: function (p) {
        if (!dragging) return;
        takeOver();
        R.user.yaw -= p.dx * 0.0032;
        R.user.pitch = clamp(R.user.pitch + p.dy * 0.0024, -0.7, 0.6);
      },
      up: function () { dragging = false; },
      tap: function (p) {
        takeOver();
        var r = core.ray(p.x, p.y);
        if (!r || r.d[1] > -0.05) return;
        var t = (FLOOR - r.o[1]) / r.d[1];
        if (!(t > 0) || t > 30) return;
        var hx = r.o[0] + r.d[0] * t, hz = r.o[2] + r.d[2] * t;
        var e = R.user.eye, dx = hx - e[0], dz = hz - e[2], d = Math.hypot(dx, dz);
        if (d < 0.2) return;
        var k = Math.min(1.8, Math.max(0, d - 0.9)) / d;
        R.go = limit([e[0] + dx * k, e[1], e[2] + dz * k]);
      },
      pinch: function (k) {
        takeOver();
        var u = R.user, step = (k - 1) * 2.2;
        R.go = null;
        u.eye = limit([u.eye[0] + Math.sin(u.yaw) * step, u.eye[1], u.eye[2] + Math.cos(u.yaw) * step]);
      },
      off: function () {
        if (R.stream) { R.stream.show(0); R.stream.warm(false); }
        modelShow(false);
        R.live = 0; paintLive();
        setClip("");
        grab.classList.remove("is-on");
      },
      update: function (st, dt) { return tick(dt); }
    });
    /* (4 Nov 2026, memory: iPhone Safari closed the tab) this section's scan + model + 360 photos are ~1.4 GB
       (measured, phone) and used to load from the top of the page (lane max 40 s) and stay for the whole visit.
       Now: load when the section is within NEAR screens (after the walk scan, as before), and drop all of it
       again when it is more than FAR screens away; coming back loads it again (the stills show meanwhile). */
    core.whenEngine(function () {
      var walkIn = !core.laneAfter;
      if (core.laneAfter) core.laneAfter("walk").then(function () { walkIn = true; nearCheck(); });
      function nearCheck() {
        var r = sec.getBoundingClientRect(), vh = innerHeight || 800;
        var dist = r.top > vh ? (r.top - vh) / vh : r.bottom < 0 ? -r.bottom / vh : 0;
        if (dist <= NEAR && walkIn) start();
        else if (dist > FAR) drop();
      }
      if ("IntersectionObserver" in window) {
        var pct = function (k) { return Math.round(k * 100) + "% 0px " + Math.round(k * 100) + "% 0px"; };
        new IntersectionObserver(nearCheck, { rootMargin: pct(NEAR) }).observe(sec);
        new IntersectionObserver(nearCheck, { rootMargin: pct(FAR) }).observe(sec);
      } else { walkIn = true; start(); }
      nearCheck();
    });
  }
  var NEAR = 1.5, FAR = 3;
  function start() {
    if (R.started || !R.core || R.failed) return;
    R.started = true;
    var core = R.core;
    var s = R.stream = core.stream(cfg, { name: "compare-scan", frame: "model", prefetch: true });
    s.warm(true);
    s.ready.then(function () {
      if (R.stream !== s) return;   // dropped meanwhile
      R.ready = true; done1();
      // the height cut runs on world height: this scan is stored upside down (y down), so the cut looks at -y
      try { s.entity.gsplat.setParameter("uOrbitClip", [0, -1, 0, 0]); } catch (e) {}
      // (4 Nov 2026, phone lag) the model is first needed 11 s into this section's film: unpacking its pictures
      // froze the garden walk above (~0.45 s on a slow phone), so it loads once this section is on screen
      if (P.onScreen) loadModel();
    }).catch(function () { if (R.stream !== s) return; done1(); fail(); });
    s.onLost(function () { if (R.stream === s) fail(); });
  }
  // far away: give back the scan, the model and the 360 photos (memory); start() makes them again
  function drop() {
    if (!R.started) return;
    var s = R.stream;
    R.started = false; R.ready = false; R.live = 0; R.stream = null;
    setClip(""); modelShow(false); paintLive();
    try { if (s) s.destroy(); } catch (e) { /* gone */ }
    var dead = R.model, assets = R.modelAssets || [];
    R.model = null; R.modelP = null; R.modelState = ""; R.pieces = []; R.modelAssets = null; modelOn = false;
    try { if (dead) dead.destroy(); } catch (e) { /* gone */ }
    assets.forEach(function (a) { try { R.core.app.assets.remove(a); a.unload(); } catch (e) { /* gone */ } });
    L.drop();
    if (R.core) R.core.render();
  }
  function done1() { if (R.core && R.core.laneDone) R.core.laneDone("compare"); }
  function fail() {
    if (R.failed) return;
    R.failed = true; R.ready = false; R.live = 0;
    setClip(""); modelShow(false);
    paintLive(); stills();
  }

  /* ----- the 3D model (walls + furniture glb, loaded after the scan is in) ----- */
  function loadGlbUrl(url, tag) {
    var pc = R.core.pc, app = R.core.app;
    return new Promise(function (ok, no) {
      var a = new pc.Asset(tag, "container", { url: url, filename: tag + ".glb" });
      a.once("load", function () { ok(a); });
      a.once("error", function (e) { no(e instanceof Error ? e : new Error(String(e))); });
      app.assets.add(a); app.assets.load(a);
    });
  }
  function loadModel() {
    if (R.modelP) return R.modelP;
    var suf = isPhone ? "-phone" : "";
    R.modelState = "loading";
    var myP = R.modelP = Promise.all([
      loadGlbUrl("assets/compare/walls" + suf + ".glb", "cmp-walls"),
      loadGlbUrl("assets/compare/furniture" + suf + ".glb", "cmp-furn")
    ]).then(function (as) {
      var pc = R.core.pc;
      if (R.modelP !== myP) {   // dropped while it loaded: give it back at once
        as.forEach(function (a) { try { R.core.app.assets.remove(a); a.unload(); } catch (e) { /* gone */ } });
        return;
      }
      R.modelAssets = as;
      var root = new pc.Entity("CompareModel");
      as.forEach(function (a) { root.addChild(a.resource.instantiateRenderEntity()); });
      root.forEach(function (e) { if (/^Low(Wall|Lid)__/.test(e.name)) e.enabled = false; });
      R.core.prepMaterials(root);
      var q = MODEL_POSE.quat;
      root.setLocalRotation(new pc.Quat(q[0], q[1], q[2], q[3]));
      root.setLocalScale(MODEL_POSE.scale, MODEL_POSE.scale, MODEL_POSE.scale);
      root.setLocalPosition(MODEL_POSE.pos[0], MODEL_POSE.pos[1], MODEL_POSE.pos[2]);
      root.enabled = false;
      R.core.app.root.addChild(root);
      R.model = root;
      R.pieces = MOVES.map(function (m) {
        var ents = [];
        // its contact shadow is a child of the piece: it goes with it
        root.forEach(function (e) { if (e.name === m.node) ents.push(e); });
        return {
          m: m, ents: ents.map(function (e) {
            var p = e.getLocalPosition(), r = e.getLocalEulerAngles();
            return { e: e, p: [p.x, p.y, p.z], ry: r.y };
          })
        };
      });
      R.modelState = "ready";
    }).catch(function (err) {
      if (R.modelP !== myP) return;
      R.modelState = "failed";
      console.warn("[compare] 3D model", err && err.message);
    });
    return R.modelP;
  }
  var modelOn = false;
  function modelShow(on) {
    on = !!on && !!R.model;
    if (on === modelOn) return;
    modelOn = on;
    if (R.model) R.model.enabled = on;
    if (!on) placePieces(0, true);
    if (R.core) R.core.render();
  }
  // move the pieces for time t; returns the piece being moved now (for the hand), or null
  function placePieces(t, reset) {
    var active = null;
    R.pieces.forEach(function (pc_) {
      var m = pc_.m;
      var k = reset ? 0 : ease(sstep(m.t0, m.t1, t));
      if (!reset && t > m.t0 - 0.6 && t < m.t1 + 0.5) active = { piece: pc_, k: k };
      // turn around the spot where it stands (at), then move: pos = at + d - Ry * at
      var a = m.turn * k * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), P = m.at;
      var rx = c * P[0] + s * P[2], rz = -s * P[0] + c * P[2];
      pc_.ents.forEach(function (o) {
        o.e.setLocalPosition(o.p[0] + P[0] - rx + m.d[0] * k, o.p[1] + m.d[1] * k, o.p[2] + P[2] - rz + m.d[2] * k);
        o.e.setLocalEulerAngles(0, o.ry + m.turn * k, 0);
      });
    });
    return active;
  }
  // a model point -> world (for the hand over the piece)
  function modelToWorld(p) {
    // v' = v + 2w (q x v) + 2 q x (q x v), then scale and move
    var q = MODEL_POSE.quat, s = MODEL_POSE.scale, v = [p[0] * s, p[1] * s, p[2] * s];
    function cr(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    var qv = [q[0], q[1], q[2]], c1 = cr(qv, v), c2 = cr(qv, c1);
    return [v[0] + 2 * q[3] * c1[0] + 2 * c2[0] + MODEL_POSE.pos[0],
            v[1] + 2 * q[3] * c1[1] + 2 * c2[1] + MODEL_POSE.pos[1],
            v[2] + 2 * q[3] * c1[2] + 2 * c2[2] + MODEL_POSE.pos[2]];
  }

  function setClip(c) {
    var cv = R.core && R.core.canvas;
    if (!cv || R.clip === c) return;
    R.clip = c;
    cv.style.clipPath = c; cv.style.webkitClipPath = c;
  }
  var lastLive = -1;
  function paintLive() {
    var l = Math.round(R.live * 100) / 100;
    if (l === lastLive) return;
    lastLive = l;
    orbitEl.style.setProperty("--live", String(l));
    hit.hidden = !(l > 0.5);
  }
  function stills() {
    // no live stage: the part buttons switch the stills, the clock still runs for the buttons
    orbitEl.style.setProperty("--live", "0");
    hit.hidden = true;
    // (4 Nov 2026 audit, battery) the loop stops while the section is off screen; the observer above restarts it
    R.stillWant = true;
    if (!R.stillLoop && P.onScreen) {
      R.stillLoop = true;
      var last = performance.now();
      (function loop(now) {
        if (!P.onScreen) { R.stillLoop = false; return; }
        var dt = Math.min(0.1, (now - last) / 1000); last = now;
        if (playingR(now)) R.t = (R.t + dt) % T.end;
        paintPart();
        requestAnimationFrame(loop);
      })(last);
    }
  }
  var TAG = ["3D scan: it glides", "3D model: rearrange it", "Walk in: go anywhere"];
  function paintPart() {
    var part = partAt(R.t);
    if (part !== R.lastPart) {
      R.lastPart = part;
      orbitEl.setAttribute("data-chap", String(part));
      chaps.forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === part)); });
      if (tagR) tagR.textContent = tr(TAG[part]);
    }
    var a = T.parts[part], b = part < 2 ? T.parts[part + 1] : T.end;
    var p = Math.round(clamp((R.t - a) / (b - a), 0, 1) * 100) / 100;
    if (R.chapP[part] !== p) { R.chapP[part] = p; chaps[part].style.setProperty("--p", String(p)); }
  }

  function tick(dt) {
    var core = R.core, now = performance.now();
    // (4 Nov, James: "white box") the design tour's house (core.house, another home) can still be switched on by
    // the section before this one; it sits in the same world space and showed as a white block in the kitchen
    if (core.house && core.house.root && core.house.root.enabled) { core.house.root.enabled = false; core.render(); }
    if (!R.stream) { paintLive(); return 0; }
    var r = zone.getBoundingClientRect(), vh = innerHeight || 800, vw = innerWidth || 1000;
    var onScreen = r.bottom > 0 && r.top < vh;
    var want = R.ready && R.stream.drawn && onScreen && !document.hidden ? 1 : 0;
    R.stream.warm(onScreen || Math.abs(r.top) < vh * 1.5);
    R.stream.keep(onScreen);
    R.live = reduced ? want : R.live + (want - R.live) * (1 - Math.exp(-dt * 6));
    if (Math.abs(R.live - want) < 0.01) R.live = want;
    paintLive();
    if (P.userR && now - P.userR >= IDLE_MS && !Object.keys(R.keys).some(function (k) { return R.keys[k]; })) { P.userR = 0; giveBack(); }
    if (R.user && Math.abs(window.scrollY - R.user.scrollY) > 80) { P.userR = 0; giveBack(); }
    paintEngaged();

    // the clock
    if (isFinite(FREEZE_R)) R.t = FREEZE_R;
    else if (playingR(now) && R.live > 0.5) {
      var nt = R.t + dt;
      // the model is not in yet: wait at the end of the glide, or skip it when it failed
      if (R.t < T.melt[0] && nt >= T.melt[0] && R.modelState !== "ready") nt = R.modelState === "failed" ? T.parts[2] : T.melt[0] - 0.001;
      if (nt >= T.end) { R.blend = { at: now, eye: poseNow().eye, look: poseNow().look }; nt = 0; }
      R.t = nt;
    }
    var t = R.t;
    paintPart();

    // scan <-> model: the scan melts down to the floor over the model, and grows back up
    var CEIL = 3.4, LOW = FLOOR - 0.1, cut = 1e9, showModel = false;
    if (t >= T.melt[0] && t < T.grow[1] && R.modelState === "ready") {
      showModel = true;
      if (t < T.melt[1]) cut = mix(CEIL, LOW, ease((t - T.melt[0]) / (T.melt[1] - T.melt[0])));
      else if (t < T.grow[0]) cut = LOW;
      else cut = mix(LOW, CEIL, ease((t - T.grow[0]) / (T.grow[1] - T.grow[0])));
    }
    var scanOn = !(showModel && cut <= LOW + 0.001);
    R.stream.show(scanOn ? 1 : 0);
    R.stream.clip(scanOn && cut < 1e8 ? cut : null);
    modelShow(showModel);
    var act = showModel ? placePieces(t, false) : null;

    if (!(R.live > 0) || !onScreen) { setClip(""); grab.classList.remove("is-on"); return R.live; }

    // the canvas only shows on the Orbit side of the handle, inside the stage's rounded rectangle
    var rad = parseFloat(getComputedStyle(zone).borderTopLeftRadius) || 0;
    var x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom, rr;
    if (S.stack) { y0 = r.top + r.height * S.k; rr = "0 0 " + rad.toFixed(0) + "px " + rad.toFixed(0) + "px"; }
    else { x0 = r.left + r.width * S.k; rr = "0 " + rad.toFixed(0) + "px " + rad.toFixed(0) + "px 0"; }
    setClip("inset(" + Math.max(0, y0).toFixed(0) + "px " + Math.max(0, vw - x1).toFixed(0) + "px " +
      Math.max(0, vh - y1).toFixed(0) + "px " + Math.max(0, x0).toFixed(0) + "px round " + rr + ")");

    // walking by the visitor
    if (R.user) {
      var u = R.user;
      if (R.keys.ArrowLeft) u.yaw += 1.6 * dt;
      if (R.keys.ArrowRight) u.yaw -= 1.6 * dt;
      var fw = (R.keys.KeyW || R.keys.ArrowUp ? 1 : 0) - (R.keys.KeyS || R.keys.ArrowDown ? 1 : 0);
      var sd = (R.keys.KeyD ? 1 : 0) - (R.keys.KeyA ? 1 : 0);
      if (fw || sd) {
        P.userR = now;
        var step = 1.2 * Math.min(dt, 0.1), fx = Math.sin(u.yaw), fz = Math.cos(u.yaw);
        u.eye = limit([u.eye[0] + (fx * fw - fz * sd) * step, u.eye[1], u.eye[2] + (fz * fw + fx * sd) * step]);
      } else if (R.go) {
        var g = reduced ? 1 : 1 - Math.exp(-dt * 3.2);
        u.eye = [mix(u.eye[0], R.go[0], g), u.eye[1], mix(u.eye[2], R.go[2], g)];
        if (Math.hypot(R.go[0] - u.eye[0], R.go[2] - u.eye[2]) < 0.01) R.go = null;
      }
    }
    var pose = poseNow();
    // the lens: aim the picture at the middle of the visible part; the angle is kept for that part's height
    var cx = S.stack ? (r.left + r.right) / 2 : r.left + r.width * (1 + S.k) / 2;
    var cy = S.stack ? r.top + r.height * (1 + S.k) / 2 : (r.top + r.bottom) / 2;
    var regW = S.stack ? r.width : r.width * (1 - S.k), regH = S.stack ? r.height * (1 - S.k) : r.height;
    var asp = regW / Math.max(1, regH);
    var fovWant = 64 + (asp < 1 ? (1 - asp) * 26 : 0);
    var fov = 2 * Math.atan(Math.tan(fovWant * Math.PI / 360) * vh / Math.max(1, regH));
    // (PM[8] > 0 moves the picture left, PM[9] > 0 moves it down: same as the old stage lens shift)
    var shift = [-(cx - vw / 2) / (vw / 2), (cy - vh / 2) / (vh / 2)];
    var key = pose.eye.map(function (v) { return v.toFixed(3); }).join(",") + "|" + pose.look.map(function (v) { return v.toFixed(3); }).join(",") +
      "|" + shift[0].toFixed(3) + "," + shift[1].toFixed(3) + "|" + fov.toFixed(3) + "|" + cut.toFixed(3) + "|" + (act ? act.k.toFixed(3) : "");
    if (key !== R.lastPose) {
      R.lastPose = key;
      core.view({ eye: pose.eye, target: pose.look, fov: fov, shift: shift, near: 0.05, far: 200 });
      core.render();
    }

    // the hand over the piece that moves by itself
    if (act && !R.user && core.project) {
      var am = act.piece.m;
      var mp = [am.at[0] + am.d[0] * act.k, am.at[1] + 0.75, am.at[2] + am.d[2] * act.k];
      var sp = mp && core.project(modelToWorld(mp));
      if (sp && sp[2] > 0 && sp[0] > x0 && sp[0] < x1 && sp[1] > y0 && sp[1] < y1) {
        grab.style.transform = "translate(" + (sp[0] - r.left).toFixed(1) + "px," + (sp[1] - r.top).toFixed(1) + "px)";
        if (grabName.textContent !== tr(act.piece.m.name)) grabName.textContent = tr(act.piece.m.name);
        grab.classList.add("is-on");
        grab.classList.toggle("is-hold", act.k > 0 && act.k < 1);
      } else grab.classList.remove("is-on");
    } else grab.classList.remove("is-on");
    return R.live;
  }

  /* ================= the capsule ================= */
  function paintPlay() {
    playBtn.setAttribute("aria-pressed", String(!P.paused));
    playBtn.setAttribute("aria-label", tr(P.paused ? "Play the demo" : "Pause the demo"));
  }
  playBtn.addEventListener("click", function () {
    P.paused = !P.paused;
    if (!P.paused) { P.userR = 0; P.userL = 0; giveBack(); }
    paintPlay(); paintEngaged();
    L.dirty = true; L.kick();
    say(P.paused ? "Demo paused." : "Demo playing.");
  });
  chaps.forEach(function (b, i) {
    b.addEventListener("click", function () {
      var p = poseNow();
      R.user = null; R.go = null; P.userR = 0;
      R.blend = { at: performance.now(), eye: p.eye, look: p.look };
      R.t = T.parts[i] + (i === 1 ? T.melt[0] - T.parts[1] : 0);
      if (i === 1 && R.modelState !== "ready" && R.modelP == null && R.ready) loadModel();
      if (P.paused && !reduced) { P.paused = false; paintPlay(); }
      paintEngaged(); paintPart();
      say(["3D scan.", "3D model.", "Walk in."][i]);
    });
  });
  paintPlay();

  // start the 360 photos when the section comes near (one screen early)
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) {
      if (en.some(function (e) { return e.isIntersecting; })) { L.start(); L.kick(); }
    }, { rootMargin: "100% 0px 100% 0px" }).observe(sec);
    // (4 Nov 2026, memory) more than 3 screens away: the photos go (see L.drop)
    new IntersectionObserver(function (en) {
      if (en.every(function (e) { return !e.isIntersecting; })) L.drop();
    }, { rootMargin: "300% 0px 300% 0px" }).observe(sec);
  } else { L.start(); }
  install();
  // checks only (?cmpdbg): the state, to set the clocks from a test
  if (params.has("cmpdbg")) window.__cmp = { R: R, L: L, P: P, T: T, S: S, setSplit: setSplit };
})();
