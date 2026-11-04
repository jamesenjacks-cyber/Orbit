/* Hero: real house scan or the matching 3D model, small camera move, then direct exploration.
   Drag / arrows look around, WASD walks (same camera for both). Uses the shared renderer and house model.
   Round 9 (handoff rule 9.1): as the hero leaves, the room gently pulls back (wider lens, eye a little up)
   and fades out over ~0.35 screen, so it is dark before "We're Orbit 3D." reaches the screen; only then
   do the points come up (core.spaceDim). Scrolling back restores it. Opacity of the scene only. */
(function () {
  'use strict';
  var sec = document.querySelector('.sec--hero'), core, stream;
  if (!sec) return;
  var view = sec.querySelector('.hero__view'), status = sec.querySelector('[data-hero-status]');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var attempts = 0;
  var mode = 'scan', ready = false, started = 0, yaw = 0, pitch = 0, fov = 65, touched = false;
  var lastPose = '', lastAmount = -1;
  var amount = 0, prog = 0, dragging = false, lastY = window.scrollY, available = false;
  // Start view (model metres): where the visitor stands and what they look at.
  var START = { eye: [16.0, 1.85, 2.8], look: [11.5, 0.95, 5.0] };   // kitchen, along the island to the patio glass
  // ?herostart=ex,ey,ez,lx,ly,lz tries another start view (for framing it, not linked anywhere).
  var hs = (new URLSearchParams(location.search).get('herostart') || '').split(',').map(Number);
  if (hs.length === 6 && hs.every(isFinite)) START = { eye: hs.slice(0, 3), look: hs.slice(3) };
  var EYE = START.eye, BASE = [START.look[0] - EYE[0], START.look[1] - EYE[1], START.look[2] - EYE[2]], walk = [0, 0], keys = {}, SPEED = 1.3, REACH = 1.6;
  var touchOnly = matchMedia('(hover: none) and (pointer: coarse)').matches;
  var HINT = touchOnly ? 'Drag to look around.' : 'Drag to look. WASD to walk.';
  var modeButtons = sec.querySelectorAll('[data-hero-mode]');
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  var whoTitle = document.querySelector('#who-title'), cueOff = false, lastFade = -1;
  // the dock and the hero buttons fade with the room (CSS --hero-fade); fully gone = .hero--gone (hidden for
  // the keyboard too), back as soon as the room shows again
  function setFade(f) {
    f = Math.round(f * 100) / 100;
    if (f === lastFade) return;
    lastFade = f;
    sec.style.setProperty('--hero-fade', String(f));
    sec.classList.toggle('hero--gone', f < .02);
  }
  function say(s) { if (status.textContent !== s) status.textContent = s; }
  function resume() {
    sec.classList.remove('hero--exploring');
    if (window.OrbitEngage) window.OrbitEngage.release('hero-room');
  }
  function explore() {
    if (!available) return;
    touched = true;
    sec.classList.add('hero--exploring');
    if (window.OrbitEngage) window.OrbitEngage.claim('scene', 'hero-room', function () { sec.classList.remove('hero--exploring'); });
    say(touchOnly ? 'Drag to look. Scroll to continue.' : 'Drag to look, WASD to walk. Scroll to continue.');
  }
  function reset() { yaw = pitch = 0; fov = 65; walk = [0, 0]; keys = {}; touched = true; resume(); }
  function setMode(next) {
    mode = next; touched = true; resume();
    modeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.heroMode === mode)); });
    if (mode === 'model' && core) { core.wantHouse('hero model requested'); say('Opening the matching 3D model...'); }
    else say(ready ? HINT : 'Opening the real scan...');
  }
  // Walk limits: the room the start eye stands in (from the house model), else a circle around the start.
  function limitWalk() {
    // (3 Nov, James: "I cannot move WASD") the start eye sits on the kitchen / hall line, so the first box
    // found was the hall and walking forward into the kitchen hit its edge at once. Use the room the eye
    // stands deepest in (the kitchen), not the first one found.
    var H = core && core.house, rb = null, best = 0, id;
    if (H && H.roomBox) for (id in H.roomBox) {
      var b = H.roomBox[id];
      if (!b) continue;
      var depth = Math.min(EYE[0] - b[0], b[2] - EYE[0], EYE[2] - b[1], b[3] - EYE[2]);
      if (depth > best) { best = depth; rb = b; }
    }
    if (rb) {
      // the start spot itself always stays allowed (it may sit closer to a wall than the margin)
      walk[0] = clamp(walk[0], Math.min(0, rb[0] + .35 - EYE[0]), Math.max(0, rb[2] - .35 - EYE[0]));
      walk[1] = clamp(walk[1], Math.min(0, rb[1] + .35 - EYE[2]), Math.max(0, rb[3] - .35 - EYE[2]));
    } else {
      var d = Math.hypot(walk[0], walk[1]);
      if (d > REACH) { walk[0] *= REACH / d; walk[1] *= REACH / d; }
    }
  }
  var WALK_KEYS = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1 };
  sec.querySelector('[data-hero-enter]').addEventListener('click', function () { explore(); view.focus({ preventScroll: true }); });
  modeButtons.forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.heroMode); }); });
  sec.querySelector('[data-hero-reset]').addEventListener('click', reset);
  sec.querySelectorAll('[data-hero-zoom]').forEach(function (b) { b.addEventListener('click', function () { explore(); fov = clamp(fov + (b.dataset.heroZoom === 'in' ? -5 : 5), 42, 78); }); });
  // A drag in the view also gives it the keyboard, so WASD works right after looking around.
  view.addEventListener('pointerdown', function () { view.focus({ preventScroll: true }); });
  view.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (WALK_KEYS[e.code]) { e.preventDefault(); explore(); keys[e.code] = true; return; }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home','Escape','Enter'].indexOf(e.key) < 0) return;
    e.preventDefault();
    if (e.key === 'Escape' || e.key === 'Home') { reset(); return; }
    explore();
    if (e.key === 'ArrowLeft') yaw -= .06;
    if (e.key === 'ArrowRight') yaw += .06;
    if (e.key === 'ArrowUp') pitch += .04;
    if (e.key === 'ArrowDown') pitch -= .04;
    if (e.key === '+' || e.key === '=') fov -= 4;
    if (e.key === '-') fov += 4;
    pitch = clamp(pitch, -.25, .25); fov = clamp(fov, 42, 78);
  });
  view.addEventListener('keyup', function (e) { if (WALK_KEYS[e.code]) keys[e.code] = false; });
  view.addEventListener('blur', function () { keys = {}; });
  // (3 Nov) the stacked house (js/stage-stack.js) follows the hero, unless it could not load
  function stackNext() {
    var s = window.OrbitStage && window.OrbitStage.stack;
    return !!(s && s.state && s.state().status !== 'failed');
  }
  function install() {
    core = window.OrbitStage && window.OrbitStage._core;
    if (!core || !core.stream) { if (++attempts < 250) setTimeout(install, 80); else say('Preview only. Explore more below.'); return; }
    core.scene('hero-room', {
      interactive: function () { return available; },
      down: function () { dragging = true; },
      move: function (p) {
        if (!dragging) return;
        explore(); yaw = yaw - p.dx * .003; pitch = clamp(pitch + p.dy * .002, -.25, .25);
      },
      up: function () { dragging = false; },
      pinch: function (k) { explore(); fov = clamp(fov / k, 42, 78); },
      off: function () { lastPose = ''; keys = {}; if (stream) { stream.show(0); stream.warm(false); if (stream.keep) stream.keep(false); } if (core.house) core.house.root.enabled = false; resume(); core.spaceDim(1); },
      update: function (st, dt, now) {
        var r = sec.getBoundingClientRect();
        if (r.bottom <= 0 || document.hidden) { if (r.bottom <= 0) setFade(0); if (stream) { stream.show(0); stream.warm(false); if (stream.keep) stream.keep(false); } if (core.house) core.house.root.enabled = false; core.spaceDim(stackNext() ? 0 : 1); lastPose = ''; resume(); return 0; }
        // leaving the hero: out 0 (at rest) .. 1 (hero gone). The room fades over out .08 - .42 and never
        // outlives the moment the who heading reaches the bottom of the screen (guard).
        var vh = innerHeight || 800, out = clamp((vh - r.bottom) / vh, 0, 1);
        var fade = 1 - sstep(.08, .42, out);
        if (whoTitle) fade = Math.min(fade, clamp((whoTitle.getBoundingClientRect().top - vh) / (vh * .18), 0, 1));
        var push = reduced.matches ? 0 : sstep(0, .45, out);
        setFade(fade);
        var moved = r.top < -24;
        if (moved !== cueOff) { cueOff = moved; sec.classList.toggle('hero--moved', moved); }
        if (Math.abs(window.scrollY - lastY) > 3) resume();
        lastY = window.scrollY;
        if (mode === 'model' && document.documentElement.classList.contains('house-none')) { setMode('scan'); say('Model unavailable. The real scan is still here.'); }
        var target = mode === 'model' && core.house ? 1 : 0;
        // (4 Nov 2026, James: "the transition is not so smooth") an even 0.9 s ease-in-out crossfade instead of
        // the old exponential one (that jumped at the start and crawled at the end)
        prog = reduced.matches ? target : clamp(prog + (target > prog ? 1 : -1) * Math.min(dt, .1) / .9, Math.min(prog, target), Math.max(prog, target));
        amount = prog * prog * (3 - 2 * prog);
        // the scan stays sharp (not dropped to its coarse level) while the model is in front of it
        if (stream) { stream.warm(true); if (stream.keep) stream.keep(true); stream.show(1 - amount); }
        var H = core.house;
        var base = BASE, a = Math.atan2(base[0], base[2]) + yaw;
        var len = Math.hypot(base[0], base[2]);
        // WASD: walk along the view direction on the floor plane.
        var fw = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), sd = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
        if ((fw || sd) && available) {
          var step = SPEED * Math.min(dt, .1), fx = Math.sin(a), fz = Math.cos(a);
          walk[0] += (fx * fw - fz * sd) * step; walk[1] += (fz * fw + fx * sd) * step;
          limitWalk();
        }
        var eye0 = [EYE[0] + walk[0], EYE[1], EYE[2] + walk[1]];
        var look0 = [eye0[0] + Math.sin(a) * len, eye0[1] + base[1] + pitch * len, eye0[2] + Math.cos(a) * len];
        if (H) { H.root.enabled = amount > .01; if (amount > .01) { H.pose(null, 0, 1, false); H.look('inside'); H.cutaway(eye0, look0, 'none', dt); } }
        // The scan fades over the model at exactly the same camera pose.
        available = (ready && stream && stream.drawn) || !!(H && target);
        // The poster photo stays up until what is chosen really draws (no dark frame when switching back).
        var shown = target ? !!H : !!(ready && stream && stream.drawn);
        sec.classList.toggle('hero--ready', shown);
        // the points (the next scene) only come up once the room is gone
        // (3 Nov, James) not while the stacked house follows: it shows its own points later, the point layer
        // coming up here was the cloud moving between the hero and "We're Orbit 3D."
        core.spaceDim(available && fade > .002 || stackNext() ? 0 : sstep(.42, .66, out));
        if (!available) return 0;
        if (!started) started = now;
        var k = reduced.matches || touched ? 1 : clamp((now - started) / 2.8, 0, 1);
        k = k * k * (3 - 2 * k);
        // opening move: starts a little forward and settles back to the start spot (never into the wall behind)
        var eye = [eye0[0] + (1-k)*.35*Math.sin(a), eye0[1] + push * .22, eye0[2] + (1-k)*.35*Math.cos(a)];
        // the exit pull-back: the lens widens a little (feels like stepping back, never into the wall behind)
        var fovE = Math.min(fov + push * 13, 92);
        var poseKey = [eye.join(','), yaw, pitch, fovE].join('|');
        if (lastPose !== poseKey) { lastPose = poseKey; core.view({ eye: eye, target: [eye[0]+Math.sin(a)*len, eye[1]-push*.22+base[1]+pitch*len, eye[2]+Math.cos(a)*len], fov: fovE*Math.PI/180, shift:[0,0], near:.05, far:400 }); }
        if (!sec.classList.contains('hero--exploring')) say(mode === 'model' && !H ? 'Opening the matching 3D model...' : HINT);
        if (lastAmount !== amount) { lastAmount = amount; core.render(); }
        return fade;
      }
    });
    core.whenEngine(function () {
      var cfg = core.scanCfg('hero') || core.scanCfg('house');
      if (!cfg) { say('Preview only. Explore more below.'); return; }
      stream = core.stream(cfg, { name:'hero-interior', frame:'model', prefetch:true });
      // (3 Nov) the design tour's "Real scan" switch shows this same stream (same files, same tiles)
      core.heroStream = stream;
      // the hero shows its first level and only sharpens once the next scene (the stacked house) is in, so a
      // visitor who scrolls on finds it ready (31 Oct, phone speed)
      if (stream.hold && core.laneAfter) { stream.hold(true); core.laneAfter('stack').then(function () { stream.hold(false); }); }
      // (31 Oct, phone speed) the hero scan is the first job of the download lane (stage.js core.lane)
      stream.ready.then(function () { ready = true; say(HINT); laneDone(); }).catch(failed);
      stream.onLost(failed);
    });
    function laneDone() { if (core.laneDone) core.laneDone('hero'); }
    function failed() { laneDone(); ready = false; available = false; sec.classList.remove('hero--ready'); say('Preview only. Explore more below.'); }
    core.wake('interior hero');
  }
  setTimeout(function () { if (!ready && !available) say('3D is taking longer to open. You can keep scrolling.'); }, 25000);
  install();
})();
