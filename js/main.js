/* Site-wide behaviour: palette switch, nav state, reveal on scroll. */
(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.remove("no-js");

  // Palette: ?palette=void|ice|silver, remembered per visitor.
  var PALETTES = ["silver", "void", "ice"];
  var params = new URLSearchParams(location.search);
  var chosen = params.get("palette");
  try { if (!chosen) chosen = localStorage.getItem("orbit-palette"); } catch (e) {}
  if (chosen && PALETTES.indexOf(chosen) > -1) root.setAttribute("data-palette", chosen);

  if (params.has("palettes")) {
    var bar = document.createElement("div");
    bar.className = "palette-switch";
    bar.setAttribute("aria-label", "Try a colourway");
    PALETTES.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = p;
      b.setAttribute("aria-pressed", String((root.getAttribute("data-palette") || "silver") === p));
      b.addEventListener("click", function () {
        root.setAttribute("data-palette", p);
        try { localStorage.setItem("orbit-palette", p); } catch (e) {}
        bar.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      });
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
  }

  // Nav: solid once the page leaves the top. Uses an observer, not scroll events.
  var nav = document.querySelector(".nav");
  var sentinel = document.createElement("div");
  sentinel.style.cssText = "position:absolute;top:0;left:0;height:80px;width:1px;pointer-events:none";
  document.body.prepend(sentinel);
  if (nav && "IntersectionObserver" in window) {
    new IntersectionObserver(function (e) { nav.classList.toggle("is-scrolled", !e[0].isIntersecting); }).observe(sentinel);
  }

  // Nav (30 Oct 2026, option B). The page you are on lights its chip (Portfolio, Pricing, About us).
  var all = function (sel) { return nav ? Array.prototype.slice.call(nav.querySelectorAll(sel)) : []; };
  var pageName = document.body.getAttribute("data-page");
  all("[data-page-link]").forEach(function (a) {
    if (a.getAttribute("data-page-link") === pageName) a.setAttribute("aria-current", "page");
  });

  // "How it works" panel (computers) and the Menu sheet (phones): open on click, close on Esc, a click
  // outside, or a link inside. Only one is open at a time.
  var pops = [];
  var pop = function (btn, box, onToggle) {
    if (!btn || !box) return null;
    var p = {
      open: function () { pops.forEach(function (o) { if (o !== p) o.close(); }); box.hidden = false; btn.setAttribute("aria-expanded", "true"); if (onToggle) onToggle(true); },
      close: function () { if (box.hidden) return; box.hidden = true; btn.setAttribute("aria-expanded", "false"); if (onToggle) onToggle(false); },
      btn: btn, box: box
    };
    btn.addEventListener("click", function () { if (box.hidden) p.open(); else p.close(); });
    box.addEventListener("click", function (e) { if (e.target.closest("a")) p.close(); });
    pops.push(p);
    return p;
  };
  var menuText = nav && nav.querySelector("[data-menu-text]");
  pop(nav && nav.querySelector("[data-story-btn]"), nav && nav.querySelector("#nav-story"));
  pop(nav && nav.querySelector("[data-menu-btn]"), nav && nav.querySelector("#nav-sheet"), function (on) {
    if (menuText) menuText.textContent = on ? "Close" : "Menu";
  });
  if (pops.length) {
    document.addEventListener("click", function (e) {
      // A label can replace its text during this click; the event path still identifies its button.
      if (e.target.closest && e.target.closest('.language-switch')) return;
      var path = e.composedPath();
      pops.forEach(function (p) { if (path.indexOf(p.box) < 0 && path.indexOf(p.btn) < 0) p.close(); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      pops.forEach(function (p) { if (!p.box.hidden) { p.close(); p.btn.focus(); } });
    });
    // the sheet closes when the screen gets wide enough for the capsule (and the other way round)
    var wide = matchMedia("(min-width: 900px)");
    var closeAll = function () { pops.forEach(function (p) { p.close(); }); };
    if (wide.addEventListener) wide.addEventListener("change", closeAll); else if (wide.addListener) wide.addListener(closeAll);
  }

  // Round 9 (review D Nav), redone for option B: while you are in the story, "How it works" turns into
  // the white chip, its label becomes the step you are in and the dots show how far you are. An observer
  // watches a thin band across the middle of the screen; the section in that band is the current one.
  // No scroll listeners. Parts without a step of their own borrow the nearest one that tells the same
  // story; hero, who and contact light nothing.
  // (4 Nov 2026, James) five steps in page order: 01 Welcome (hero + "We're Orbit 3D."), 02 One space (from
  // "One space." on inside #scan = the zone mark "one-space-zone", and the walk in), 03 Not 360 photos
  // (#compare), 04 Design (#design + the whole floor), 05 Explore (results). Contact lights nothing.
  var NAV_OF = { top: "#top", scan: "#top", "one-space-zone": "#one-space", walk: "#one-space", compare: "#compare",
    design: "#design", floor: "#design", examples: "#examples" };
  var STEPS = ["#top", "#one-space", "#compare", "#design", "#examples"];
  var story = nav && nav.querySelector(".nav__story");
  var stepSr = nav && nav.querySelector("[data-step-sr]");
  var stepLinks = all(".nav__links a, [data-step-link]");
  var showStep = function (href) {
    var i = href ? STEPS.indexOf(href) : -1;
    if (story) story.classList.toggle("is-on", i > -1);
    all("[data-step-label]").forEach(function (s) { s.classList.toggle("is-shown", s.getAttribute("data-step-label") === (href || "")); });
    all("[data-dot]").forEach(function (d, k) { d.classList.toggle("is-on", k === i); d.classList.toggle("is-done", k < i); });
    if (stepSr) stepSr.textContent = i > -1 ? "How it works, now: " + nav.querySelector('[data-step-label="' + href + '"]').textContent : "How it works";
    stepLinks.forEach(function (a) {
      var h = a.getAttribute("data-step-link") || a.getAttribute("href").replace(/^index\.html/, "");
      if (href && h === href) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
  };
  showStep(null);
  var secs = [];
  Array.prototype.slice.call(document.querySelectorAll("main > section[id]")).forEach(function (s) {
    secs.push(s);
    // a zone inside a pinned section counts after that section (page order: the later one wins)
    Array.prototype.slice.call(s.querySelectorAll("[data-nav-zone]")).forEach(function (z) {
      if (!z.id) z.id = z.getAttribute("data-nav-zone").replace(/^#/, "") + "-zone";
      secs.push(z);
    });
  });
  if (story && secs.length && "IntersectionObserver" in window) {
    var inBand = {};
    var markNav = function () {
      var cur = null;
      secs.forEach(function (s) { if (inBand[s.id]) cur = s.id; });   // last one in page order
      showStep(cur ? NAV_OF[cur] || null : null);
    };
    var bandIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { inBand[en.target.id] = en.isIntersecting; });
      markNav();
    }, { rootMargin: "-45% 0px -54% 0px", threshold: 0 });
    secs.forEach(function (s) { bandIO.observe(s); });
  }

  // Reveal on scroll.
  var items = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    items.forEach(function (i) { io.observe(i); });
  } else {
    items.forEach(function (i) { i.classList.add("is-in"); });
  }

  // Reduced motion switched on or off while the page is open: the point film, the 3D stage and
  // the sections read the setting once at start, so reload (the browser keeps the scroll spot).
  var rm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
  if (rm) {
    var onRm = function () { location.reload(); };
    if (rm.addEventListener) rm.addEventListener("change", onRm); else if (rm.addListener) rm.addListener(onRm);
  }

  // Partners bar above "Contact us" (ORBIT_SITE.partners in embeds.js). No logos yet = the bar stays
  // hidden online; on the local test server (or with showSlotHints) it shows empty boxes to fill.
  var site = window.ORBIT_SITE || {};
  var pBox = document.querySelector("[data-partners]");
  if (pBox) {
    var list = (site.partners || []).filter(function (p) { return p && (p.logo || p.name); });
    var local = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
    var row = pBox.querySelector("[data-partners-row]");
    if (list.length) {
      list.forEach(function (p) {
        var li = document.createElement("li");
        var url = p.url && /^https?:\/\//i.test(p.url) ? p.url : "";
        var inner = url ? document.createElement("a") : document.createElement("span");
        inner.className = "partners__item";
        if (url) { inner.href = url; inner.target = "_blank"; inner.rel = "noopener"; }
        if (p.logo) {
          var img = document.createElement("img");
          img.src = p.logo; img.alt = p.name || "Partner"; img.loading = "lazy"; img.decoding = "async";
          inner.appendChild(img);
        } else {
          inner.textContent = p.name;
        }
        li.appendChild(inner); row.appendChild(li);
      });
      pBox.hidden = false;
    } else if (site.showSlotHints) {
      for (var k = 0; k < 5; k++) {
        var e = document.createElement("li");
        e.innerHTML = '<span class="partners__item partners__item--empty">Partner logo</span>';
        row.appendChild(e);
      }
      pBox.hidden = false;
    }
  }

  // Email link(s) from embeds.js
  var mail = (window.ORBIT_SITE || {}).email;
  if (mail) document.querySelectorAll("[data-mail]").forEach(function (a) {
    a.href = "mailto:" + mail;
    if (a.hasAttribute("data-mail-text")) a.textContent = mail;
  });
  // (4 Nov 2026) Legal details: the registered business address from ORBIT_SITE.company (hidden while empty).
  var addr = ((window.ORBIT_SITE || {}).company || {}).address;
  document.querySelectorAll("[data-company-address]").forEach(function (el) {
    if (typeof addr === "string" && addr.trim()) { el.querySelector("[data-company-address-text]").textContent = addr.trim(); el.hidden = false; }
    else el.hidden = true;
  });

  // Service worker (31 Oct 2026, sw.js): online over https only, keeps the big scan files on the visitor's
  // device so a second visit (or scrolling back) does not download them again. Never on the local test servers.
  // (?sw=1 tries it on a local test server)
  if ("serviceWorker" in navigator && ((location.protocol === "https:" && !/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) || /[?&]sw=1/.test(location.search))) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () { /* no helper: the site works the same */ }); });
  }
})();
