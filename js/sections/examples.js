/* Examples (#examples). (3 Nov 2026, James: "just show our product there") "Results? Take a look" = finished
   work only, up to four large frames, no step texts. Each frame is filled from ORBIT_SITE.howto (js/embeds.js):
     embed = a live Orbit viewer link. Since 4 Nov 2026 every viewer is preloaded as soon as the page
             opens (one after the other) and shows its live scene, but only takes touches after the "Step
             inside" tap, which claims the page's one engaged view (js/engage.js). "Close" keeps it loaded.
     media = a picture, or a silent looping video (plays only on screen; reduced motion = paused).
   Empty frame = hidden online; on the test server (showSlotHints) a dashed box says which setting fills it.
   Old version with the four steps: work/backup-20261103-examples/. */
(function () {
  "use strict";
  var sec = document.querySelector(".sec--examples");
  if (!sec) return;
  var site = window.ORBIT_SITE || {}, items = site.howto || [], hints = !!site.showSlotHints;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var VIEWER_ORIGIN = "https://orbit-viewer.pages.dev";   // the only viewer a frame may open
  var vids = [], preloads = [];

  function safeEmbed(src) {
    try {
      var u = new URL(src);
      return u.origin === VIEWER_ORIGIN ? u.href : "";
    } catch (e) { return ""; }
  }

  function makeEmbed(box, it, i) {
    var url = safeEmbed(String(it.embed || "").trim());
    if (!url) { console.warn("[examples] frame " + (i + 1) + ": only " + VIEWER_ORIGIN + " links can be embedded"); return false; }
    var id = "example-" + i, frame = null;
    box.classList.add("is-embed");
    if (it.poster) {
      var img = document.createElement("img");
      img.className = "examples__poster";
      img.loading = "lazy"; img.decoding = "async"; img.alt = it.alt || "";
      img.src = it.poster;
      box.appendChild(img);
    }
    var open = document.createElement("button");
    open.type = "button";
    open.className = "examples__open";
    // (3 Nov 2026, James) an orange Play button, and an animated cursor that clicks it until the first tap
    open.innerHTML = '<svg class="examples__play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.8v12.4a1 1 0 0 0 1.52.85l10.04-6.2a1 1 0 0 0 0-1.7L10.02 4.95A1 1 0 0 0 8.5 5.8z" fill="currentColor"/></svg><span class="sr-only">Step inside</span>';
    var hand = document.createElement("span");
    hand.className = "examples__cursor";
    hand.setAttribute("aria-hidden", "true");
    hand.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 2.5v17.2l4.6-4.3 2.9 6.6 3-1.3-2.9-6.5h6.3z" fill="#fff" stroke="#0b0c0e" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    box.appendChild(hand);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        en.forEach(function (e) { box.classList.toggle("is-inview", e.isIntersecting); });
      }, { threshold: 0.4 }).observe(box);
    } else box.classList.add("is-inview");
    var close = document.createElement("button");
    close.type = "button";
    close.className = "examples__close";
    close.innerHTML = "<span>Close</span>";
    box.appendChild(open);
    // Close sits UNDER the frame: the viewer has its own buttons in every corner and along the bottom
    (box.parentElement || box).appendChild(close);

    /* (4 Nov 2026, James: "automatically download and ready as soon as the visitor reaches it, don't wait
       until it's clicked") the viewer is made BEFORE the tap: preload() runs when the section comes near
       (see the bottom of this file). It loads behind the poster, then shows the live scene, but it only
       takes touches after the tap, so scrolling the page past it still works. Close keeps it loaded. */
    function makeFrame(done) {
      if (frame) { if (done) done(); return; }
      frame = document.createElement("iframe");
      frame.className = "examples__frame";
      frame.src = url;
      frame.title = "Live 3D example by Orbit 3D";
      // (4 Nov 2026 audit) "pointer-lock" is not a browser permission name and "fullscreen" in allow already
      // covers allowfullscreen: both only made console warnings
      frame.setAttribute("allow", "xr-spatial-tracking; fullscreen; gyroscope; accelerometer");
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.tabIndex = -1;   // not reachable by keyboard until the visitor steps inside
      var finished = false;
      function ready() {
        if (finished) return; finished = true;
        // give the viewer a moment to draw its first picture before the poster makes way
        setTimeout(function () { box.classList.add("is-ready"); }, it.poster ? 2500 : 0);
        if (done) done();
      }
      frame.addEventListener("load", ready);
      setTimeout(ready, 12000);   // a slow viewer never holds up the next frame
      box.appendChild(frame);
    }
    preloads.push(makeFrame);

    function shut() {
      if (!frame) return;
      frame.tabIndex = -1;
      box.classList.remove("is-live");
      if (box.parentElement) box.parentElement.classList.remove("is-live");
      open.focus({ preventScroll: true });
    }
    open.addEventListener("click", function () {
      if (box.classList.contains("is-live")) return;
      makeFrame();   // already there when preloading ran; made now if not (old browser, data saver)
      frame.tabIndex = 0;
      box.classList.add("is-live", "is-ready", "is-used");   // the cursor demo has done its job
      if (box.parentElement) box.parentElement.classList.add("is-live");
      if (window.OrbitEngage) window.OrbitEngage.claim("frame", id, shut);
      try { frame.focus({ preventScroll: true }); } catch (e) { /* fine */ }
    });
    function letGo() {
      // release() does not call our callback (the holder ends it itself), so close it here too
      if (window.OrbitEngage && window.OrbitEngage.isEngaged(id)) window.OrbitEngage.release(id);
      shut();
    }
    close.addEventListener("click", letGo);
    // Esc inside the viewer: the page never sees the key, the viewer tells us (same message as js/slots.js)
    window.addEventListener("message", function (e) {
      if (!frame || e.source !== frame.contentWindow || e.origin !== VIEWER_ORIGIN) return;
      if (e.data && typeof e.data === "object" && e.data.type === "orbit:escape" && box.classList.contains("is-live")) letGo();
    });
    /* (4 Nov 2026, James: "when I click play on the examples, the 3D model just disappears") a playing
       frame pauses the page's own 3D stage (it saves the phone's graphics power). Without Close, scrolling
       back up left the stage paused, so the design house stayed gone. Now the frame lets go by itself once
       it is mostly off screen (the same rule as the other viewer windows in js/slots.js). */
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        en.forEach(function (e) {
          if (box.classList.contains("is-live") && e.intersectionRatio < 0.3) letGo();
        });
      }, { threshold: [0, 0.3] }).observe(box);
    }
    return true;
  }

  function makeMedia(box, it) {
    var src = String(it.media || "").trim(), el;
    if (!src) return false;
    if (/\.(mp4|webm)(\?|#|$)/i.test(src)) {
      el = document.createElement("video");
      el.muted = true; el.loop = true; el.playsInline = true; el.preload = "metadata";
      el.setAttribute("muted", ""); el.setAttribute("playsinline", "");
      if (it.poster) el.poster = it.poster;
      el.src = src;
      if (it.alt) el.setAttribute("aria-label", it.alt);
      vids.push(el);
    } else {
      el = document.createElement("img");
      el.loading = "lazy"; el.decoding = "async";
      el.alt = it.alt || "";
      el.src = src;
    }
    box.appendChild(el);
    return true;
  }

  sec.querySelectorAll("[data-media]").forEach(function (box, i) {
    var it = items[i] || {}, card = box.closest(".examples__card");
    var filled = it.embed ? makeEmbed(box, it, i) : makeMedia(box, it);
    if (filled) { box.classList.add("is-filled"); return; }
    if (card) card.classList.add(hints ? "is-hint" : "is-empty");
    if (hints) {
      var p = document.createElement("p");
      p.className = "examples__hint";
      p.textContent = "ORBIT_SITE.howto[" + i + "]: embed or media";
      box.appendChild(p);
    }
  });

  /* (4 Nov 2026, James) "Already designed?": the last frame takes a saved Orbit design file (button or, on
     computers, drag and drop). js/design-file.js checks it here in the browser; a good file is handed over
     in sessionStorage and the visitor goes to view-design.html, where the house opens big with the design on
     (one live viewer at a time, and room for full screen). A wrong file gets its words right here. */
  (function upload() {
    var drop = sec.querySelector("[data-design-drop]");
    var DF = window.OrbitDesignFile;
    if (!drop || !DF) return;
    var input = drop.querySelector("[data-design-input]"), pick = drop.querySelector("[data-design-pick]");
    var note = drop.querySelector("[data-design-error]"), busy = false;
    function say(text) { note.textContent = text || ""; note.hidden = !text; }
    function go(file) {
      if (!file || busy) return;
      busy = true; say("");
      DF.read(file).then(function (r) {
        busy = false;
        if (!r.ok) { say(r.error); return; }
        var kept = DF.stash(r.text);
        var lang = document.documentElement.lang === "nl" ? "nl" : "en";
        location.href = "view-design.html?lang=" + lang + (kept ? "" : "&again=1");
      });
    }
    pick.addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () { var f = DF.firstFile(input.files); input.value = ""; go(f); });
    var depth = 0;
    drop.addEventListener("dragenter", function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth++; drop.classList.add("is-over"); });
    drop.addEventListener("dragover", function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
    drop.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove("is-over"); });
    drop.addEventListener("drop", function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; drop.classList.remove("is-over");
      go(DF.firstFile(e.dataTransfer.files));
    });
    // A file dropped next to the area must not make the browser leave the site to show the file
    // (same guard as js/view-design.js).
    window.addEventListener("dragover", function (e) { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = drop.contains(e.target) ? "copy" : "none"; } });
    window.addEventListener("drop", function (e) { if (hasFiles(e) && !drop.contains(e.target)) e.preventDefault(); });
    function hasFiles(e) {
      var t = e.dataTransfer && e.dataTransfer.types;
      return !!t && Array.prototype.indexOf.call(t, "Files") > -1;
    }
  })();

  /* (4 Nov 2026, James: "start loading the instant the user enters the site") preload every live viewer
     right away when the page opens: one after the other (top frame first), so they do not fight over the
     visitor's connection. Data saver on = wait for the tap. */
  (function preloadAll() {
    if (!preloads.length) return;
    var conn = navigator.connection;
    if (conn && conn.saveData) return;
    function run(n) { if (n < preloads.length) preloads[n](function () { run(n + 1); }); }
    /* (4 Nov 2026, James said yes after the audit) wait until the top scan (hero) is in, so the first thing the
       visitor sees is not slowed down on a phone connection. Start anyway when the results come within ~1.5
       screens, or after 15 s (a hero that never reports back). */
    var started = false;
    function go() { if (started) return; started = true; run(0); }
    // the 3D engine (js/stage.js) is added by the page after this file runs: look for it once the page has loaded
    function hook() {
      var core = window.OrbitStage && window.OrbitStage._core;
      if (!core || !core.laneAfter) { go(); return; }
      core.laneAfter("hero").then(go);
    }
    if (document.readyState === "complete") hook(); else window.addEventListener("load", hook, { once: true });
    setTimeout(go, 15000);
    if ("IntersectionObserver" in window) {
      var near = new IntersectionObserver(function (en) {
        if (en.some(function (e) { return e.isIntersecting; })) { near.disconnect(); go(); }
      }, { rootMargin: "150% 0px 150% 0px" });
      near.observe(sec);
    }
  })();

  if (!vids.length || reduce) return;
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (e.isIntersecting) { var pr = e.target.play(); if (pr && pr.catch) pr.catch(function () {}); }
        else e.target.pause();
      });
    }, { threshold: 0.25 });
    vids.forEach(function (v) { io.observe(v); });
  }
})();
