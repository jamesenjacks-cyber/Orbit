/* 3D windows ("slots"). Reads js/embeds.js (or the dashboard feed) and fills
   every [data-slot].
   Two modes:
   - normal: still poster first, the 3D only loads after the visitor presses
     Enter (so scrolling a phone is never captured).
   - data-autoplay: the 3D loads by itself while the window is near the
     screen, but stays "behind glass" (it plays, e.g. an idle model spin, yet
     takes no touches) until the visitor presses "Explore". Use for the hero
     and the showcase only, so at most two previews run at once.
   Only ONE window is interactive ("live") at a time; a live window that
   scrolls off screen is closed to save battery.

   Sections can use:
     OrbitSlots.render(el)     build/rebuild one slot (after changing data-slot)
     OrbitSlots.open(el) / close(el) / closeAll() / refresh()
     OrbitSlots.data(el)       {key, title, poster, embed, kind}
   Events on the slot element (bubbling): "orbit:live", "orbit:closed".

   Round 8 FRAMES (CONTRACT 8.4, research/10 section 4): one implementation for the Orbit viewer
   iframes of "Look around, or move through." and "This is what you get.":
     var f = OrbitSlots.frame(hostEl, { id, src: function (mode) -> url|"", title: function (mode),
                                        mode, zone, poster, soon, onChange })
     f.engage() f.release() f.unload() f.setMode(m) f.refresh() f.isLoaded() f.isEngaged()
   States on the host: is-loaded (iframe exists), is-engaged (it takes the pointer and keys),
   is-empty (no source: an honest "coming soon"). The iframe loads ONLY on a tap on the shield and
   only ONE iframe exists on the whole page (loading one removes the other). Engaged = the iframe has
   the pointer and the focus; claim kind "frame" in OrbitEngage. Released by: Done (f.release()), Esc,
   a press outside the zone, focus leaving the zone, the mouse away from the zone for 400 ms, less
   than 30% visible, or {type:"orbit:escape"} posted by the viewer. Host events (bubbling):
   "orbit:frame" {detail:{type:"engage"|"release"|"loaded"|"interact"|"unload"}}. */
(function () {
  "use strict";

  var SITE = window.ORBIT_SITE || {};
  var live = null;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)");

  function embeds() { return window.ORBIT_EMBEDS || {}; }

  function data(el) {
    var key = el.getAttribute("data-slot") || "";
    var d = embeds()[key] || {};
    return {
      key: key,
      kind: el.getAttribute("data-kind") || d.kind || "",
      title: el.getAttribute("data-title") || d.alt || d.title || "3D view",
      poster: el.getAttribute("data-poster") || d.poster || "",
      embed: (el.getAttribute("data-embed") || d.embed || "").trim()
    };
  }

  function posterSrc(p) {
    if (!p) return "";
    return /^(https?:)?\/\/|^assets\/|^data:/.test(p) ? p : "assets/posters/" + p;
  }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function isAuto(slot) { return slot.hasAttribute("data-autoplay") && !reduce.matches; }

  function render(slot) {
    var d = data(slot);
    slot.innerHTML = "";
    slot.classList.remove("is-live", "is-opening", "is-max", "is-preview");
    slot.classList.toggle("slot--auto", slot.hasAttribute("data-autoplay"));
    slot.setAttribute("role", "group");
    slot.setAttribute("aria-label", d.title);

    slot.appendChild(el("div", "slot__void"));

    if (d.poster) {
      var img = el("img", "slot__poster");
      img.alt = d.title;
      img.loading = slot.hasAttribute("data-eager") ? "eager" : "lazy";
      img.decoding = "async";
      img.src = posterSrc(d.poster);
      img.onerror = function () { img.remove(); };
      slot.appendChild(img);
    }

    if (!d.embed && SITE.showSlotHints) {
      slot.appendChild(el("p", "slot__hint",
        "Window <b>" + (d.key || "unnamed") + "</b>. Paste its Orbit embed in js/embeds.js"));
    }

    var auto = slot.hasAttribute("data-autoplay");
    var enter = el("button", "slot__enter" + (auto ? " slot__enter--explore" : ""),
      auto ? "<span>Explore</span>" : "Enter");
    enter.type = "button";
    enter.setAttribute("aria-label", (auto ? "Explore in 3D: " : "Enter 3D view: ") + d.title);
    enter.addEventListener("click", function () { open(slot); });
    // Round 4: an empty window shows no button at all (no "Soon" placeholders).
    if (d.embed) slot.appendChild(enter);
    else slot.classList.add("slot--empty");

    slot.appendChild(el("div", "slot__ring-wipe"));
    slot.appendChild(el("span", "slot__live-tag", "Live"));

    var ctrl = el("div", "slot__ctrl");
    var max = el("button", "", "Full screen");
    max.type = "button";
    max.addEventListener("click", function () { toggleMax(slot); });
    var x = el("button", "", "Close");
    x.type = "button";
    x.setAttribute("aria-label", "Close 3D view");
    x.addEventListener("click", function () { close(slot); });
    ctrl.appendChild(max);
    ctrl.appendChild(x);
    slot.appendChild(ctrl);

    if (d.embed && isAuto(slot) && slot._near) startPreview(slot);
  }

  // (4 Nov 2026, security check QC-20261104-0903 L3) never paste embed code into the page as HTML: take the
  // link out of it (embedUrl, inert DOMParser) and make the iframe ourselves, only for the Orbit viewer.
  function buildEmbed(code, title) {
    var wrap = el("div", "slot__live");
    var src = embedUrl(code), ok = false;
    try { var u = new URL(src); ok = u.protocol === "https:" && u.origin === "https://orbit-viewer.pages.dev"; } catch (e) { ok = false; }
    if (ok) {
      var f = document.createElement("iframe");
      f.src = src;
      f.title = title;
      f.allow = "fullscreen; xr-spatial-tracking; accelerometer; gyroscope; autoplay";
      f.loading = "lazy";
      wrap.appendChild(f);
    }
    return wrap;
  }

  // Autoplay: load the embed "behind glass" (no pointer events).
  function startPreview(slot) {
    if (slot.querySelector(".slot__live")) return;
    var d = data(slot);
    if (!d.embed) return;
    slot.appendChild(buildEmbed(d.embed, d.title));
    slot.classList.add("is-preview");
  }
  function stopPreview(slot) {
    if (slot.classList.contains("is-live")) return;
    var l = slot.querySelector(".slot__live");
    if (l) { l.remove(); slot.classList.remove("is-preview"); }
  }

  function open(slot) {
    var d = data(slot);
    if (!d.embed || slot.classList.contains("is-live")) return;
    if (live && live !== slot) close(live);
    unloadFrames();
    live = slot;
    var hasPreview = !!slot.querySelector(".slot__live");
    var instant = reduce.matches || hasPreview;
    if (!hasPreview) slot.classList.add("is-opening");
    setTimeout(function () {
      if (!slot.querySelector(".slot__live")) slot.appendChild(buildEmbed(d.embed, d.title));
      slot.classList.add("is-live");
      slot.classList.remove("is-opening");
      var c = slot.querySelector(".slot__ctrl button:last-child");
      if (c) c.focus({ preventScroll: true });
      slot.dispatchEvent(new CustomEvent("orbit:live", { bubbles: true }));
    }, instant ? 0 : 650);
  }

  function close(slot) {
    if (!slot) return;
    if (document.fullscreenElement === slot) document.exitFullscreen().catch(function () {});
    document.body.classList.remove("has-max-slot");
    var wasLive = slot.classList.contains("is-live");
    var hadFocus = slot.contains(document.activeElement);
    if (live === slot) live = null;
    render(slot);
    if (hadFocus) slot.querySelector(".slot__enter").focus({ preventScroll: true });
    if (wasLive) slot.dispatchEvent(new CustomEvent("orbit:closed", { bubbles: true }));
  }

  function closeAll() { if (live) close(live); }

  function toggleMax(slot) {
    if (slot.requestFullscreen && !document.fullscreenElement) {
      slot.requestFullscreen().catch(function () { fallbackMax(slot); });
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      fallbackMax(slot);
    }
  }
  function fallbackMax(slot) {
    var on = slot.classList.toggle("is-max");
    document.body.classList.toggle("has-max-slot", on);
    maxLabel(slot, on);
  }
  function maxLabel(slot, on) {
    var b = slot.querySelector(".slot__ctrl button");
    if (b) b.textContent = on ? "Exit full screen" : "Full screen";
  }
  document.addEventListener("fullscreenchange", function () {
    if (live) maxLabel(live, document.fullscreenElement === live);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && live && live.classList.contains("is-max")) fallbackMax(live);
  });

  var hasIO = "IntersectionObserver" in window;
  // Close a live window once it is fully off screen.
  var io = hasIO ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting && en.target === live && !en.target.classList.contains("is-max") && document.fullscreenElement !== en.target) close(en.target);
    });
  }, { threshold: 0 }) : null;
  // Autoplay windows: load when near the screen, unload when far away.
  var near = hasIO ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      var s = en.target;
      s._near = en.isIntersecting;
      if (!isAuto(s)) return;
      if (en.isIntersecting) startPreview(s); else stopPreview(s);
    });
  }, { rootMargin: "60% 0px 60% 0px" }) : null;

  function init(root) {
    (root || document).querySelectorAll("[data-slot]").forEach(function (s) {
      if (!s.classList.contains("slot")) s.classList.add("slot");
      if (!hasIO) s._near = true;
      render(s);
      if (io && !s._observed) { io.observe(s); if (near) near.observe(s); s._observed = true; }
    });
  }

  // Re-render every slot that is not in use (after the dashboard feed arrives).
  function refresh() {
    document.querySelectorAll("[data-slot]").forEach(function (s) { if (s !== live) render(s); });
  }

  /* ======================================================================
     FRAMES (round 8): shielded Orbit viewer iframes. See the header comment.
     ====================================================================== */
  var frames = [];
  var loadedFrame = null;
  var ALLOW = "fullscreen; xr-spatial-tracking; gyroscope; accelerometer";
  var REFERRER = "strict-origin-when-cross-origin";
  var COARSE = matchMedia("(pointer: coarse)").matches;
  var CALL = COARSE ? "Tap to explore" : "Click to explore";
  var CALL_AGAIN = COARSE ? "Tap to use it again" : "Click to use it again";

  function isTest() { return location.hostname === "127.0.0.1" || location.hostname === "localhost"; }
  function testBase() {
    if (!isTest()) return "";
    try { return new URLSearchParams(location.search).get("viewer") || ""; } catch (e) { return ""; }
  }

  // viewer link for one record: base?lib=<library>&<params>&ref=<opaque reference>
  function viewerUrl(ref) {
    var V = SITE.viewer || {};
    var base = testBase() || V.base || "";
    if (!base) return "";
    if (!ref) return "";
    return base + "?lib=" + encodeURIComponent(V.lib || "") + (V.params ? "&" + V.params : "") + "&ref=" + encodeURIComponent(ref);
  }

  function viewerOnly(u) {
    if (!u) return "";
    try {
      var p = new URL(u, location.href);
      if (p.protocol === "https:" && p.origin === "https://orbit-viewer.pages.dev") return p.href;
      if (isTest() && /^https?:$/.test(p.protocol)) return p.href;
    } catch (e) {}
    return "";
  }

  // A pasted embed (a link or <iframe> code) -> the link only. The code is parsed, never inserted.
  function embedUrl(code) {
    code = (code || "").trim();
    if (!code) return "";
    if (/^https?:\/\//i.test(code)) return code;
    try {
      var d = new DOMParser().parseFromString(code, "text/html");
      var f = d.querySelector("iframe");
      var s = f ? f.getAttribute("src") : "";
      if (s && /^https?:\/\//i.test(s)) return s;
    } catch (e) {}
    return "";
  }

  function unloadFrames() { if (loadedFrame) loadedFrame.unload(); }

  function originOf(u) { try { return new URL(u, location.href).origin; } catch (e) { return "*"; } }

  function makeFrame(host, o) {
    o = o || {};
    var F = { host: host, id: o.id || "frame-" + (frames.length + 1), mode: o.mode || "" };
    var zone = o.zone || host;
    var iframe = null, url = "", engaged = false, awayT = 0, loadT = 0;
    var shield = null, label = null, stage = null, veil = null, soon = null;

    host.classList.add("frame");
    host.innerHTML = "";
    host.appendChild(el("div", "frame__void"));
    if (o.poster) {
      var img = el("img", "frame__poster");
      img.alt = "";
      img.decoding = "async";
      img.loading = "lazy";
      img.src = posterSrc(o.poster);
      img.onerror = function () { img.remove(); };
      host.appendChild(img);
    }
    stage = el("div", "frame__stage");
    host.appendChild(stage);
    // Round 9 (review C Compare 3): ONE call on the poster, the light glass pill of the site.
    // The old orange "Enter" orbit ring is gone (here, while loading and in "coming soon").
    veil = el("div", "frame__veil");
    veil.setAttribute("aria-hidden", "true");
    veil.appendChild(el("span", "frame__pill frame__pill--wait", "Opening the viewer"));
    host.appendChild(veil);

    soon = el("div", "frame__soon");
    var soonText = el("p", "frame__soon-text", o.soon || "Viewer coming soon");
    soon.appendChild(soonText);
    host.appendChild(soon);

    shield = el("button", "frame__shield");
    shield.type = "button";
    label = el("span", "frame__label frame__pill", CALL);
    shield.appendChild(label);
    host.appendChild(shield);

    function title() { return (o.title ? o.title(F.mode) : "") || "Orbit viewer"; }
    // (4 Nov 2026, security check QC-20261104-1725 L1) only the Orbit viewer may be framed (any address only on
    // the local test server, for ?viewer= tests)
    function want() { return viewerOnly(o.src ? (o.src(F.mode) || "") : ""); }
    F.origin = function () { try { return url ? new URL(url).origin : ""; } catch (e) { return ""; } };
    function emit(type) {
      host.dispatchEvent(new CustomEvent("orbit:frame", { bubbles: true, detail: { type: type, id: F.id, mode: F.mode } }));
      if (o.onChange) { try { o.onChange(type, F); } catch (e) { console.error(e); } }
    }

    function paint() {
      var u = want();
      var empty = !u;
      host.classList.toggle("is-empty", empty);
      host.classList.toggle("is-loaded", !!iframe);
      host.classList.toggle("is-engaged", engaged);
      shield.hidden = empty || engaged;
      soon.hidden = !empty;
      shield.setAttribute("aria-label", iframe ? "Take control of the 3D view: " + title() : "Explore in 3D: " + title());
      label.textContent = iframe ? CALL_AGAIN : CALL;
      host.setAttribute("role", "group");
      host.setAttribute("aria-label", title());
    }

    function postFocus() {
      if (!iframe || !iframe.contentWindow || host.classList.contains("is-loading")) return;   // onLoad focuses again
      try { iframe.contentWindow.postMessage({ type: "orbit:focus" }, originOf(url)); } catch (e) {}
    }
    function focusIn() {
      if (!iframe || !engaged) return;
      try { iframe.focus({ preventScroll: true }); } catch (e) {}
      try { if (iframe.contentWindow) iframe.contentWindow.focus(); } catch (e) {}
      postFocus();
    }

    function onLoad() {
      clearTimeout(loadT);
      host.classList.remove("is-loading");
      emit("loaded");
      if (engaged) loadT = setTimeout(focusIn, 300);
    }

    function load() {
      var u = want();
      if (iframe || !u) return !!iframe;
      if (loadedFrame && loadedFrame !== F) loadedFrame.unload();
      closeAll();
      url = u;
      iframe = document.createElement("iframe");
      iframe.title = title();
      iframe.setAttribute("allow", ALLOW);
      iframe.setAttribute("referrerpolicy", REFERRER);
      iframe.loading = "eager";
      iframe.addEventListener("load", onLoad);
      iframe.addEventListener("mouseenter", function () { clearTimeout(awayT); });
      host.classList.add("is-loading");
      iframe.src = u;
      stage.appendChild(iframe);
      loadedFrame = F;
      return true;
    }

    // What changes when the holder lets go (shield back, iframe stays loaded).
    function apply(refocus) {
      if (!engaged) return;
      engaged = false;
      clearTimeout(awayT);
      document.documentElement.classList.remove("frame-engaged");
      if (iframe && document.activeElement === iframe) { try { iframe.blur(); } catch (e) {} }
      paint();
      emit("release");
      if (refocus && !shield.hidden) { try { shield.focus({ preventScroll: true }); } catch (e) {} }
    }

    F.engage = function () {
      if (!want()) return;
      load();
      if (engaged) return;
      OrbitEngage_claim(F.id, function () { apply(!!document.activeElement && zone.contains(document.activeElement)); });
      engaged = true;
      document.documentElement.classList.add("frame-engaged");
      paint();
      emit("engage");
      focusIn();
    };
    F.release = function (refocus) {
      if (!engaged) return;
      if (window.OrbitEngage) window.OrbitEngage.release(F.id);
      apply(refocus !== false);
    };
    F.unload = function () {
      if (engaged) F.release(false);
      clearTimeout(loadT);
      if (iframe) { iframe.removeEventListener("load", onLoad); iframe.src = "about:blank"; iframe.remove(); iframe = null; }
      if (loadedFrame === F) loadedFrame = null;
      host.classList.remove("is-loading");
      url = "";
      paint();
      emit("unload");
    };
    F.setMode = function (m) {
      if (m === F.mode) return;
      F.mode = m;
      F.refresh();
    };
    // The source may have changed (a mode, or the config): swap what is loaded, keep the engagement.
    F.refresh = function () {
      var u = want();
      if (iframe) {
        if (!u) { F.unload(); return; }
        if (u !== url) {
          url = u;
          iframe.title = title();
          host.classList.add("is-loading");
          iframe.src = u;
        }
      }
      paint();
    };
    F.isLoaded = function () { return !!iframe; };
    F.isEngaged = function () { return engaged; };
    F.contentWindow = function () { return iframe ? iframe.contentWindow : null; };
    F.zone = zone;
    F.handle = function (data) {
      var t = data && data.type;
      if (t === "orbit:escape") F.release(true);
      else if (t === "orbit:interact") emit("interact");
      else if (t === "orbit:loaded") { host.classList.remove("is-loading"); emit("loaded"); }
    };
    F.outside = function (target) { return engaged && !zone.contains(target); };
    F.away = function () {
      clearTimeout(awayT);
      awayT = setTimeout(function () { if (engaged) F.release(false); }, 400);
    };
    F.back = function () { clearTimeout(awayT); };

    shield.addEventListener("click", function () { F.engage(); });
    zone.addEventListener("pointerleave", function (e) { if (engaged && e.pointerType === "mouse") F.away(); });
    zone.addEventListener("pointerenter", function () { F.back(); });
    zone.addEventListener("pointermove", function () { F.back(); }, { passive: true });

    if (hasIO) {
      new IntersectionObserver(function (en) {
        var r = en[0].intersectionRatio;
        if (engaged && r < 0.3) F.release(false);
      }, { threshold: [0, 0.3, 0.6] }).observe(host);
      // far away: do not keep a running viewer
      new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting && iframe) F.unload();
      }, { rootMargin: "80% 0px 80% 0px", threshold: 0 }).observe(host);
    }

    frames.push(F);
    paint();
    return F;
  }

  function OrbitEngage_claim(id, release) {
    if (window.OrbitEngage) window.OrbitEngage.claim("frame", id, release);
  }

  // One shared set of listeners for all frames.
  document.addEventListener("pointerdown", function (e) {
    frames.forEach(function (F) { if (F.outside(e.target)) F.release(false); });
  }, true);
  document.addEventListener("focusin", function (e) {
    frames.forEach(function (F) { if (F.outside(e.target)) F.release(false); });
  });
  window.addEventListener("message", function (e) {
    for (var i = 0; i < frames.length; i++) {
      var F = frames[i], w = F.contentWindow();
      if (w && e.source === w) { if (e.origin !== F.origin()) return; F.handle(e.data && typeof e.data === "object" ? e.data : null); return; }
    }
  });


  window.OrbitSlots = { init: init, render: render, open: open, close: close, closeAll: closeAll, refresh: refresh, data: data,
    frame: makeFrame, viewerUrl: viewerUrl, embedUrl: embedUrl, isTest: isTest };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(); });
  else init();
})();

