/* "View your design" page (view-design.html, 4 Nov 2026, James).
   1. An upload area: a button (all devices) and drag and drop (computers). A file can also come from the
      "Already designed?" card on the main page (sessionStorage, js/design-file.js).
   2. A good file: the house's own viewer link (only an allowed Orbit viewer, see design-file.js) opens in a big
      frame with start=design. As soon as the viewer page has loaded, this page sends it
      { type: "orbit:openDesign", text } every second until it answers orbit:designOpened
      (ok = "Your design is back", wait = the house is still coming in: keep sending, error = its words).
      No answer after 90 s (a viewer older than v87 does not know the message) = a calm "could not open" line.
   3. "Full screen" = the Fullscreen API on the frame (the design stays on; a new tab would lose it). Phones
      without it (iPhone) get the frame over the whole screen with an "Exit full screen" button.
   Every text from the file or the viewer is set with textContent only. */
(function () {
  "use strict";
  var DF = window.OrbitDesignFile;
  var drop = document.querySelector("[data-vd-drop]");
  var view = document.querySelector("[data-vd-view]");
  if (!DF || !drop || !view) return;

  var SEND_MS = 1000, GIVE_UP_MS = 90000, SLOW_MS = 20000;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (sel) { return document.querySelector(sel); };
  var input = $("[data-vd-input]"), pick = $("[data-vd-pick]"), err = $("[data-vd-error]");
  var frameBox = $("[data-vd-frame]"), core = $("[data-vd-core]"), exitBtn = $("[data-vd-exit]");
  var statusBox = $(".vd-status"), status = $("[data-vd-status]");
  var retry = $("[data-vd-retry]"), full = $("[data-vd-full]"), another = $("[data-vd-another]");

  var SAY = {
    opening: "Opening your house...",
    putting: "Putting your design back...",
    slow: "Still busy. A big house can take a minute.",
    back: "Your design is back.",
    timeout: "Could not open the design here yet. The house is shown without it. Try again later.",
    again: "Choose your file once more, please."
  };

  var cur = null;        // { text, url, origin }
  var frame = null, timer = 0, startedAt = 0, done = false;

  function sayError(text) { err.textContent = text || ""; err.hidden = !text; }
  function setStatus(state, text) {
    statusBox.setAttribute("data-vd-state", state);
    status.textContent = text;
    retry.hidden = state !== "fail";
  }

  // ---------- step 1: the file ----------
  var busy = false;
  function useFile(file) {
    if (!file || busy) return;
    busy = true; sayError("");
    DF.read(file).then(function (r) {
      busy = false;
      if (!r.ok) { sayError(r.error); return; }
      DF.stash(r.text);   // a reload of this page opens it again (sessionStorage, this tab only)
      open(r);
    });
  }
  pick.addEventListener("click", function () { input.click(); });
  input.addEventListener("change", function () { var f = DF.firstFile(input.files); input.value = ""; useFile(f); });

  var depth = 0;
  function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, "Files") > -1; }
  drop.addEventListener("dragenter", function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth++; drop.classList.add("is-over"); });
  drop.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove("is-over"); });
  drop.addEventListener("drop", function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; drop.classList.remove("is-over");
    useFile(DF.firstFile(e.dataTransfer.files));
  });
  // A file dropped next to the area must not make the browser leave this page to show the file.
  window.addEventListener("dragover", function (e) { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = drop.contains(e.target) ? "copy" : "none"; } });
  window.addEventListener("drop", function (e) { if (hasFiles(e) && !drop.contains(e.target)) e.preventDefault(); });

  // ---------- step 2: the house with the design ----------
  function stopSending() { if (timer) { clearInterval(timer); timer = 0; } }
  function send() {
    if (!frame || done) return;
    if (Date.now() - startedAt > GIVE_UP_MS) { stopSending(); done = true; setStatus("fail", SAY.timeout); return; }
    if (Date.now() - startedAt > SLOW_MS && statusBox.getAttribute("data-vd-state") === "wait") status.textContent = SAY.slow;
    try { frame.contentWindow.postMessage({ type: "orbit:openDesign", text: cur.text }, cur.origin); } catch (e) { /* not there yet */ }
  }
  function startSending() {
    stopSending(); done = false; startedAt = Date.now();
    setStatus("wait", SAY.putting);
    send();
    timer = setInterval(send, SEND_MS);
  }
  window.addEventListener("message", function (e) {
    if (!frame || e.source !== frame.contentWindow || !cur || e.origin !== cur.origin) return;
    var d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.type === "orbit:escape") { if (maxed) setMax(false); return; }
    if (d.type !== "orbit:designOpened" || done) return;
    if (d.ok === true) { stopSending(); done = true; setStatus("ok", SAY.back); return; }
    if (d.wait) return;   // the house is still coming in: the timer sends it again
    stopSending(); done = true;
    setStatus("fail", typeof d.error === "string" && d.error ? d.error.slice(0, 200) : SAY.timeout);
  });

  function open(r) {
    cur = r;
    if (frame) { frame.remove(); frame = null; }
    stopSending();
    drop.hidden = true; view.hidden = false;
    document.body.classList.add("is-viewing");
    setStatus("wait", SAY.opening);
    frame = document.createElement("iframe");
    frame.className = "vd-frame__view";
    frame.title = "Your design in the Orbit viewer";
    frame.setAttribute("allow", "xr-spatial-tracking; fullscreen; pointer-lock; gyroscope; accelerometer");
    frame.setAttribute("allowfullscreen", "");
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    // Every load of the viewer page (also when it moves itself) starts the hand-over again.
    frame.addEventListener("load", startSending);
    frame.src = r.url;
    core.insertBefore(frame, exitBtn);
    requestAnimationFrame(function () {
      frameBox.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    });
  }

  retry.addEventListener("click", function () {
    if (!cur) return;
    open(cur);
  });
  another.addEventListener("click", function () {
    if (maxed) setMax(false);
    if (fsEl()) exitFs();
    stopSending();
    if (frame) { frame.remove(); frame = null; }
    cur = null; done = false;
    DF.clear();
    view.hidden = true; drop.hidden = false;
    document.body.classList.remove("is-viewing");
    sayError("");
    pick.focus();
    input.click();
  });

  // ---------- full screen ----------
  var fsEl = function () { return document.fullscreenElement || document.webkitFullscreenElement || null; };
  var canFs = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) &&
              !!(frameBox.requestFullscreen || frameBox.webkitRequestFullscreen);
  function exitFs() {
    try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* already out */ }
  }
  var maxed = false;
  function setMax(on) {
    maxed = on;
    frameBox.classList.toggle("is-max", on);
    document.documentElement.classList.toggle("vd-locked", on);
    exitBtn.hidden = !on;
    if (on) exitBtn.focus(); else full.focus();
  }
  full.addEventListener("click", function () {
    if (canFs) {
      var p;
      try { p = (frameBox.requestFullscreen || frameBox.webkitRequestFullscreen).call(frameBox); } catch (e) { setMax(true); return; }
      if (p && p.catch) p.catch(function () { setMax(true); });
    } else setMax(true);
  });
  exitBtn.addEventListener("click", function () { if (fsEl()) exitFs(); if (maxed) setMax(false); });
  function onFs() { var on = fsEl() === frameBox; exitBtn.hidden = !on && !maxed; frameBox.classList.toggle("is-fs", on); }
  document.addEventListener("fullscreenchange", onFs);
  document.addEventListener("webkitfullscreenchange", onFs);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && maxed) setMax(false); });

  // ---------- start: a file handed over from the main page (or kept from before a reload) ----------
  var text = DF.take();
  if (text) {
    var r = DF.check(text);
    if (r.ok) open(r); else { DF.clear(); sayError(r.error); }
  } else if (/[?&]again=1/.test(location.search)) {
    sayError(SAY.again);
  }
})();
