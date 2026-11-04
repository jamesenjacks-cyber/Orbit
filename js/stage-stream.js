/* Orbit 3D - streamed splats on the stage (CONTRACT round 7, 7.1; builder E).
   The real, full Gaussian splats, streamed with levels of detail in exactly the Orbit viewer's
   format: a folder with lod-meta.json + tile folders <lod>_<n>/ (SOG webp), made by PlayCanvas
   splat-transform. PlayCanvas 2.22.1 reads it as a "gsplat" asset (unified mode), so this file
   only adds what the Orbit viewer adds around the engine (viewer v72 ~10399-10565, 12982-13001):

   - coarse first: the scan is held at its coarsest level everywhere (lodRangeMin = lodRangeMax =
     top) until the engine says nothing more is in flight for that layer; THEN `ready` resolves
     (the coarse scan is on screen, never an empty canvas) and the scan is let go to sharpen,
     spending the splat budget on what is near and in front;
   - budgets like the viewer's "balanced": desktop 3.5M, phone 1.2M splats (cfg.budget);
   - the viewer's engine settings: lodUpdateAngle 30 (phone 45), lodUpdateDistance 0.5,
     lodBehindPenalty 2 (phone 3), lodUnderfillLimit 2, colorUpdateAngle 10, long cooldown;
   - pixel ratio up to 2 while a streamed splat is shown (stage.js caps 1.75 / 1.5 otherwise),
     stepped down by 0.25 when the stage measures < 34 fps;
   - an on-demand stage: "frame:request" of the engine asks for the next frame, and while a
     scan is still fetching its coarse level off screen (prefetch) the stage keeps drawing
     (the canvas is invisible then, or the hidden scan is drawn with fade 0).

   Every stream has its OWN layer (added to the stage camera), so the engine's per-layer
   "frame:ready" (camera, layer, ready, pendingLoads) tells each stream's own state.
   A per-splat fade (work buffer modifier, alpha x uOrbitFade, fade 0 = zero size) lets two
   streams cross-fade.

   API  (on OrbitStage._core, created when this file runs; works once the engine runs)
     core.stream(cfg, opt) -> handle
       cfg  = an ORBIT_SITE.scans entry: { url, toModel?:{scale, quat:[x,y,z,w], t:[3]},
              toStudio?:{...}, budget?:{desktop, phone} }   (url may be a full https URL)
       opt  = { name, frame: "model"|"studio" (which transform; default model), prefetch: true }
       handle = {
         entity              the gsplat entity (null until the manifest is in)
         ready               Promise: resolves when the coarse level shows, rejects (quietly)
                             on file://, ?stream=0, no url, or a load error -> use the packs
         onLost(fn)          fn(err) once if the scan breaks AFTER ready resolved (it hides itself)
         setBudget(n)        splats for this scan while shown (n <= 0: back to cfg / default)
       cfg.finest = {desktop, phone}: the finest level it may fetch (default 1 / 2, round 8 cap)
         show(k)             0..1 fade (0 = not drawn; it keeps loading while it prefetches)
         warm(on)            its section is near: while not shown it stays enabled, invisible and
                             held at the coarse level (sorted, so showing it again is never an empty
                             frame, and it takes almost nothing of the visible scan's budget);
                             not warm and not shown = parked (disabled; loaded tiles are kept)
         destroy()
         state               "wait" | "manifest" | "coarse" | "sharp" | "error" | "off"
         drawn               enabled and sorted since it was (re)enabled (a parked scan needs a few
                             frames): callers keep their canvas alpha for it at 0 until then
         info()              {state, levels, count, loading, fade, budget}
       }
     core.streamOff(why) -> true when streaming is not possible here (file://, ?stream=0)
     core.scanCfg(slot)  -> ORBIT_SITE.scans[slot] (with a url) | null
   Debug: ?stagedbg=1 logs; ?stream=0 forces the round 6 packs. */
(function () {
  "use strict";

  var win = window, doc = document;
  var api = win.OrbitStage = win.OrbitStage || {};
  var core = api._core;
  var params = new URLSearchParams(location.search);
  var DBG = params.has("stagedbg");
  function log() { if (DBG) console.log.apply(console, ["[stage-stream]"].concat([].slice.call(arguments))); }
  if (!core) return;

  var isPhone = !!core.isPhone;
  var DEFAULT_BUDGET = { desktop: 3500000, phone: 1200000 };
  /* round 8 (download cap): the finest level a scan may fetch, 0 = full detail. Every level is a full copy
     of the scan at half the splats, so each level skipped halves what can come down. cfg.finest overrides. */
  var DEFAULT_FINEST = { desktop: 1, phone: 2 };
  // (3 Nov) uOrbitClip: a cut at a height in world metres (dot(xyz, center) + w = the height of a splat
  // centre, now (0,1,0,0); everything above uOrbitClipY is not drawn). Used by the design tour's real scan for a
  // dollhouse view from above the ceiling. Off = clipY 1e9.
  var FADE_GLSL = [
    "uniform float uOrbitFade;",
    "uniform vec4 uOrbitClip;",
    "uniform float uOrbitClipY;",
    "void modifySplatCenter(inout vec3 center) {",
    "}",
    "void modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) {",
    "  if (uOrbitFade <= 0.001) scale = vec3(0.0);",
    "  if (dot(uOrbitClip.xyz, originalCenter) + uOrbitClip.w > uOrbitClipY) scale = vec3(0.0);",
    "}",
    "void modifySplatColor(vec3 center, inout vec4 color) {",
    "  color.a *= uOrbitFade;",
    "}"
  ].join("\n");

  function offWhy() {
    if (location.protocol === "file:") return "file://";
    if (params.get("stream") === "0") return "?stream=0";
    return "";
  }
  core.streamOff = function () { return !!offWhy(); };
  core.scanCfg = function (slot) {
    var S = win.ORBIT_SITE && win.ORBIT_SITE.scans;
    var c = S && S[slot];
    return c && typeof c.url === "string" && c.url ? c : null;
  };

  var streams = [], hooked = false, ratio = { want: 0, applied: 0, lowAt: 0 };

  function num(x, d) { x = +x; return isFinite(x) ? x : d; }
  function budgetOf(h) {
    if (h.budgetSet > 0) return h.budgetSet;
    var b = h.cfg.budget || {}, n = isPhone ? num(b.phone, 0) : num(b.desktop, 0);
    return n > 0 ? Math.round(n) : (isPhone ? DEFAULT_BUDGET.phone : DEFAULT_BUDGET.desktop);
  }
  /* (31 Oct, phone speed) a slow line or "data saver" on: never sharper than the second-lightest level
     (Chrome / Android tell it; Safari does not, it gets the normal levels). ?net=slow tries it. */
  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var SLOW = params.get("net") === "slow" || !!(conn && (conn.saveData || /(^|-)(2g|3g)$/.test(conn.effectiveType || "")));
  core.slowNet = SLOW;
  function finestOf(h) {
    if (params.get("lod") === "full") return 0;   // ?lod=full: full detail everywhere (to compare)
    var f = h.cfg.finest || {}, n = isPhone ? num(f.phone, -1) : num(f.desktop, -1);
    if (n < 0) n = isPhone ? DEFAULT_FINEST.phone : DEFAULT_FINEST.desktop;
    if (SLOW) n = Math.max(n, h.levels - 2);
    return Math.max(0, Math.min(h.levels - 1, Math.round(n)));
  }
  function put(o, k, v) { try { if (o && o[k] !== v) o[k] = v; } catch (e) { /* not in this build */ } }

  /* ---------- engine hooks (once) ---------- */
  function hook() {
    if (hooked || !core.app) return;
    hooked = true;
    var app = core.app, g = app.scene.gsplat;
    // the viewer's flat-screen settings (applyGfx), set once: they rebuild buffers when changed
    put(g, "lodUpdateAngle", isPhone ? 45 : 30);
    put(g, "lodUpdateDistance", 0.5);
    put(g, "lodBehindPenalty", isPhone ? 3 : 2);
    put(g, "lodUnderfillLimit", 2);
    put(g, "colorUpdateAngle", 10);
    put(g, "cooldownTicks", 1200);
    try {
      app.systems.gsplat.on("frame:ready", onFrameReady);
      app.systems.gsplat.on("frame:request", function () { if (anyShown() || anyPrefetch()) core.render(); });
    } catch (e) { log("no gsplat events", e && e.message); }
    app.on("update", tick);
  }
  function anyShown() { for (var i = 0; i < streams.length; i++) if (streams[i].fade > 0.002 && streams[i].ent) return true; return false; }
  function anyPrefetch() { for (var i = 0; i < streams.length; i++) if (streams[i].prefetching) return true; return false; }

  function onFrameReady(cam, layer, ready, loading) {
    for (var i = 0; i < streams.length; i++) {
      var h = streams[i];
      if (!h.layer || layer !== h.layer) continue;
      h.loading = Math.max(0, +loading || 0);
      h.frames++;
      if (ready) h.cold = false;   // sorted for the current state: what it draws now is complete
      if (h.loading > 0) h.started = true;
      if (h.state === "coarse") {
        var files = 0;
        try { files = h.asset.resource.octree.fileResources.size; } catch (e) { files = 0; }
        if (files > 0) h.started = true;
        if (ready && h.loading === 0 && h.started && h.frames > 2) reveal(h);
      } else if (h.state === "sharp") {
        if (h.loading > 0) core.render();
      }
    }
  }
  function reveal(h) {
    if (h.state !== "coarse") return;
    h.state = "sharp";
    h.prefetching = false;
    clearTimeout(h.safety);
    log(h.name, "coarse in", Math.round(performance.now() - h.t0), "ms,", h.levels, "levels");
    // shown: let it sharpen; warm: keep it coarse and invisible; else park it (disabled = no sort,
    // no draw; the loaded tiles stay in the octree)
    apply(h);
    h.okFn();
  }

  // every frame (after stage.js's own update): budget, pixel ratio, prefetch frames
  function tick() {
    var app = core.app, shown = 0, budget = 0;
    for (var i = 0; i < streams.length; i++) {
      var h = streams[i];
      if (h.ent && h.fade > 0.002 && h.ent.enabled) { shown++; budget = Math.max(budget, budgetOf(h)); }
      if (h.prefetching || (h.cold && h.ent && h.ent.enabled)) app.renderNextFrame = true;
    }
    if (shown) put(app.scene.gsplat, "splatBudget", budget);
    pixelRatio(shown > 0);
  }
  function pixelRatio(on) {
    var dev = core.device, c = core.canvas;
    if (!dev || !c) return;
    var dpr = win.devicePixelRatio || 1, now = performance.now();
    if (on) {
      if (!ratio.want) ratio.want = Math.min(dpr, 2);
      // slow device: step down (never below the stage's own ratio)
      if (core.fps && core.fps < 34 && now - ratio.lowAt > 2500 && ratio.want > Math.max(1, core.dpr || 1)) {
        ratio.want = Math.max(Math.max(1, core.dpr || 1), ratio.want - 0.25); ratio.lowAt = now;
        log("pixel ratio down to", ratio.want, "fps", core.fps);
      }
    }
    var want = on ? Math.max(ratio.want, core.dpr || 1) : (core.dpr || 1);
    if (Math.abs(dev.maxPixelRatio - want) < 1e-3) return;
    dev.maxPixelRatio = want;
    dev.resizeCanvas(c.clientWidth || win.innerWidth, c.clientHeight || win.innerHeight);
    core.render();
  }

  // the entity state from fade / prefetch / warm (values written only when they change)
  function apply(h) {
    var e = h.ent;
    if (!e) return;
    var shown = h.fade > 0.002, on = shown || h.prefetching || (h.warmOn && h.state === "sharp");
    // (4 Nov 2026, phone battery) the scenes call show() every frame: only a real change asks for a redraw
    var changed = false;
    if (e.enabled !== on) { e.enabled = on; if (on) h.cold = true; changed = true; }
    var c = e.gsplat;
    if (!c) { if (changed) core.render(); return; }
    var f = on ? h.fade : 0;
    if (h.fadeSet !== f) { h.fadeSet = f; c.setParameter("uOrbitFade", f); changed = true; }
    if (h.state === "sharp") {
      // held (31 Oct, download lane): shown, but kept at its first level until the next scene's download is in
      // (4 Nov 2026, James: "it loaded the old splat for a sec") keep(true): hidden but warm stays at its sharp
      // levels, so a quick switch back (hero 3D model -> Real scan) never fades in the coarse level first
      var sharpHidden = !shown && h.keepOn && h.warmOn;
      var top = h.levels - 1, lo = (shown || sharpHidden) && !h.held ? finestOf(h) : top, hi = shown || sharpHidden ? 99 : top;
      if (c.lodRangeMin !== lo) { c.lodRangeMin = lo; changed = true; }
      if (c.lodRangeMax !== hi) { c.lodRangeMax = hi; changed = true; }
    }
    if (changed) core.render();
  }

  /* ---------- one stream ---------- */
  function transformOf(cfg, frame) {
    var T = frame === "studio" ? (cfg.toStudio || cfg.toModel) : (cfg.toModel || cfg.toStudio);
    if (!T) return null;
    var s = num(T.scale, 1), q = Array.isArray(T.quat) && T.quat.length === 4 ? T.quat.map(Number) : [0, 0, 0, 1];
    var t = Array.isArray(T.t) && T.t.length >= 3 ? T.t.map(Number) : [0, 0, 0];
    var ql = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return { s: s > 0 ? s : 1, q: [q[0] / ql, q[1] / ql, q[2] / ql, q[3] / ql], t: t };
  }

  core.stream = function (cfg, opt) {
    opt = opt || {};
    var okFn, noFn;
    var h = {
      cfg: cfg || {}, name: opt.name || "scan", frame: opt.frame || "model",
      state: "wait", ent: null, asset: null, layer: null, fade: 0, levels: 0, count: 0, loading: 0,
      frames: 0, started: false, prefetching: false, budgetSet: 0, t0: performance.now(), safety: 0,
      warmOn: false, fadeSet: -1
    };
    var ready = new Promise(function (ok, no) { okFn = ok; noFn = no; });
    ready.catch(function () { /* callers fall back to the packs */ });
    h.okFn = okFn;
    var lostFns = [];
    function fail(why) {
      if (h.state === "error" || h.state === "off") return;
      var late = h.state === "sharp";   // `ready` already resolved: tell onLost() instead
      h.state = why === "off" ? "off" : "error";
      h.prefetching = false;
      clearTimeout(h.safety);
      log(h.name, "no stream:", why);
      // (Codex QC R7) a broken scan hides itself; after it showed, onLost() tells the callers to fall back
      try { if (h.ent) h.ent.enabled = false; } catch (e) { /* gone */ }
      if (!late) { noFn(new Error(String(why))); return; }
      if (why === "off") return;
      lostFns.splice(0).forEach(function (fn) { try { fn(new Error(String(why))); } catch (e) { console.warn("[stage-stream] onLost", e); } });
      core.render();
    }
    var handle = {
      ready: ready,
      // fn(err) once, when the scan breaks AFTER `ready` resolved (it is hidden by then): fall back to the packs
      onLost: function (fn) { if (typeof fn === "function") lostFns.push(fn); },
      setBudget: function (n) { h.budgetSet = num(n, 0) > 0 ? Math.round(n) : 0; core.render(); },
      show: function (k) {
        k = Math.max(0, Math.min(1, num(k, 0)));
        k = Math.round(k * 200) / 200;
        h.fade = k;
        apply(h);
      },
      // warm = its section is near: when not shown it stays enabled, invisible and at the coarse level
      // only (sorted and ready, so showing it again never starts from an empty frame)
      warm: function (on) { on = !!on; if (h.warmOn === on) return; h.warmOn = on; apply(h); },
      // (4 Nov 2026) keep(on): while warm and hidden, keep the sharp levels loaded instead of the coarse one
      keep: function (on) { on = !!on; if (h.keepOn === on) return; h.keepOn = on; apply(h); },
      // (3 Nov) clip(y): do not draw splats above y (model metres); clip(null) = everything
      clip: function (y) {
        var v = typeof y === "number" && isFinite(y) ? y : 1e9;
        if (h.clipSet === v || !h.ent || !h.ent.gsplat) return;
        h.clipSet = v; h.ent.gsplat.setParameter("uOrbitClipY", v); core.render();
      },
      // (31 Oct, download lane) hold(true) = draw only the first (lightest) level, fetch nothing sharper yet
      hold: function (on) { on = !!on; if (h.held === on) return; h.held = on; log(h.name, on ? "held at its first level" : "may sharpen"); apply(h); },
      destroy: function () {
        fail("off");
        var i = streams.indexOf(h); if (i >= 0) streams.splice(i, 1);
        try { if (h.ent) h.ent.destroy(); } catch (e) { /* gone */ }
        try { if (h.asset) { core.app.assets.remove(h.asset); h.asset.unload(); } } catch (e) { /* gone */ }
        try {
          if (h.layer) {
            var cc = core.camera.camera;
            cc.layers = cc.layers.filter(function (id) { return id !== h.layer.id; });
            core.app.scene.layers.remove(h.layer);
          }
        } catch (e) { /* gone */ }
        h.ent = null; h.asset = null; h.layer = null;
      },
      info: function () { return { state: h.state, levels: h.levels, count: h.count, loading: h.loading, fade: h.fade, budget: budgetOf(h), enabled: !!(h.ent && h.ent.enabled), warm: h.warmOn }; }
    };
    Object.defineProperty(handle, "entity", { enumerable: true, get: function () { return h.ent; } });
    Object.defineProperty(handle, "state", { enumerable: true, get: function () { return h.state; } });
    // true when enabled and the engine has sorted it since (re)enabling: showing it now is never empty
    Object.defineProperty(handle, "drawn", { enumerable: true, get: function () { return !!(h.ent && h.ent.enabled && !h.cold && h.state === "sharp"); } });

    var why = offWhy() || (!h.cfg.url ? "no url" : "");
    if (why) { fail(why === "no url" ? why : "off"); return handle; }
    streams.push(h);
    (core.whenEngine || core.whenReady)(function () {
      if (h.state !== "wait") return;
      var pc = core.pc, app = core.app;
      if (!pc || !app || !pc.GSplatHandler) { fail("no gsplat in this engine"); return; }
      hook();
      h.state = "manifest";
      var url = h.cfg.url, file = url.split("?")[0].split("/").pop() || "lod-meta.json";
      var a = new pc.Asset("orbit-scan-" + h.name, "gsplat", { url: url, filename: file });
      h.asset = a;
      a.once("load", function () {
        if (h.state !== "manifest") return;
        try {
          var oct = a.resource && a.resource.octree;
          if (!oct) throw new Error("not a streamed scan (no lod-meta tree)");
          h.levels = Math.max(1, Number(oct.lodLevels) || 1);
          h.count = (a.resource.numSplats) || 0;
          h.layer = new pc.Layer({ name: "OrbitScan-" + h.name });
          app.scene.layers.push(h.layer);
          var cc = core.camera.camera;
          cc.layers = cc.layers.concat([h.layer.id]);
          var e = new pc.Entity("OrbitScan-" + h.name);
          var T = transformOf(h.cfg, h.frame);
          if (T) { e.setLocalPosition(T.t[0], T.t[1], T.t[2]); e.setLocalRotation(T.q[0], T.q[1], T.q[2], T.q[3]); e.setLocalScale(T.s, T.s, T.s); }
          e.addComponent("gsplat", { asset: a, unified: true, layers: [h.layer.id] });
          var c = e.gsplat, top = h.levels - 1;
          c.setWorkBufferModifier({ glsl: FADE_GLSL });
          c.setParameter("uOrbitFade", h.fade); h.fadeSet = h.fade;
          // the work buffer already holds the centres in world (= the model's) metres: the height is plain y
          // (tested 3 Nov: the scan's own transform row cut nothing)
          c.setParameter("uOrbitClip", [0, 1, 0, 0]); c.setParameter("uOrbitClipY", 1e9); h.clipSet = 1e9;
          c.lodRangeMin = top; c.lodRangeMax = top;   // coarse first, everywhere
          app.root.addChild(e);
          h.ent = e;
          h.state = "coarse";
          h.prefetching = opt.prefetch !== false;
          e.enabled = h.prefetching || h.fade > 0.002;
          // a coarse wave that never settles is let go after 25 s (the viewer waits for a stall);
          // (Codex QC R7) but when not one tile came in by then, the scan failed: fall back to the packs
          h.safety = setTimeout(function () {
            var files = 0;
            try { files = h.asset.resource.octree.fileResources.size; } catch (e) { files = 0; }
            // (tiles asked for but none arrived = every tile failed: also a fallback)
            if (files > 0) reveal(h); else fail("no tiles after 25 s");
          }, 25000);
          core.render();
          log(h.name, "manifest in", Math.round(performance.now() - h.t0), "ms,", h.count, "splats,", h.levels, "levels");
        } catch (err) { fail(err && err.message); }
      });
      a.once("error", function (err) { fail(err && err.message || err); });
      app.assets.add(a);
      app.assets.load(a);
    });
    return handle;
  };
  log("ready", offWhy() || "http");
})();
