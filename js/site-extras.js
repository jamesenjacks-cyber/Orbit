/* Story site extras (7 Nov 2026, James: "make the site real" list). Loaded at the end of every story page.
   1. Top bar backing: .nav gets .is-solid once page content (not the 3D story) scrolls under it.
   2. Phones: the "Book a call" button at the bottom (.stick-cta) shows from the results until the contact
      section is in view.
   3. Anonymous visit counts, without cookies: one small record per page view goes to our own Orbit stats Worker
      (the one the Orbit viewer uses), as "scan" website-<page>. A fresh random id per page view, nothing is saved
      on the device, no IP or browser fingerprint is stored by the Worker. Sent only on the real site (orbit3d.nl),
      not on the test server. privacy.html section 2 describes it; change both together. */
/* 4. (10 Nov 2026) The word editor for James's business partner (js/word-editor.js): only loaded when the address
   has ?edit (it then stays on for this tab, also on the other pages, until its x button). Visitors never load it. */
(function () {
  var on = /[?&]edit(=|&|$)/.test(location.search);
  try { if (on) sessionStorage.setItem("orbit-edit-on", "1"); on = on || sessionStorage.getItem("orbit-edit-on") === "1"; } catch (e) {}
  if (!on) return;
  var s = document.createElement("script"); s.src = "js/word-editor.js"; document.head.appendChild(s);
})();
(function () {
  "use strict";
  var doc = document, nav = doc.querySelector("[data-nav]");
  var story = doc.querySelector("[data-story]");
  var results = doc.getElementById("examples");
  var contact = doc.getElementById("contact");
  var cta = doc.querySelector("[data-stick-cta]");
  var sent = false, contactSeen = false;

  function tick() {
    var navBottom = 76;
    if (nav) {
      // over the 3D story the scan may show through; after it, page text scrolls under the bar
      var solid = story ? story.getBoundingClientRect().bottom < navBottom : scrollY > 8;
      nav.classList.toggle("is-solid", solid);
    }
    if (cta) {
      var h = innerHeight;
      var fromResults = results ? results.getBoundingClientRect().top < h * 0.6 : scrollY > h;
      var atContact = contact ? contact.getBoundingClientRect().top < h * 0.85 : false;
      if (atContact) contactSeen = true;
      cta.classList.toggle("is-on", fromResults && !atContact);
    }
    if (results && results.getBoundingClientRect().top < innerHeight * 0.5) deep = Math.max(deep, 10);
    if (contact && contact.getBoundingClientRect().top < innerHeight * 0.7) deep = Math.max(deep, 11);
    var s = window.OrbitStory && window.OrbitStory.state;
    if (s && typeof s.P === "number") deep = Math.max(deep, Math.floor(s.P));
  }
  var queued = false, deep = 0;
  function onScroll() { if (!queued) { queued = true; requestAnimationFrame(function () { queued = false; tick(); }); } }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  tick();

  /* ---- 3. anonymous visit counts ---- */
  var ENDPOINT = "https://orbit-stats.jamesenjacks.workers.dev/visit";
  if (!/(^|\.)orbit3d\.nl$/.test(location.hostname)) return;   // only the real site counts
  var page = (doc.body.getAttribute("data-page") || "home").replace(/[^a-z0-9-]/g, "").slice(0, 30) || "home";
  var sid = "";
  try {
    var a = new Uint8Array(12); crypto.getRandomValues(a);
    for (var i = 0; i < a.length; i++) sid += ("0" + a[i].toString(16)).slice(-2);
  } catch (e) { return; }
  var t0 = Date.now(), booked = "";
  var ref = "";
  try { ref = doc.referrer ? new URL(doc.referrer).hostname : ""; if (ref === location.hostname) ref = ""; } catch (e) { ref = ""; }
  doc.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("[data-book-open]");
    if (b) booked = booked || ("open-" + b.getAttribute("data-book-open"));
  }, true);
  doc.addEventListener("submit", function () { booked = "sent"; }, true);
  function send() {
    var rec = {
      sid: sid, scan: "website-" + page, t0: t0, secs: Math.round((Date.now() - t0) / 1000),
      site: "story", page: page, deepest: deep, phone: innerWidth < 900,
      lang: doc.documentElement.lang || "en", from: ref.slice(0, 80), contact: contactSeen, form: booked
    };
    var body = JSON.stringify(rec);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }))) return;
    } catch (e) { /* fall through */ }
    try { fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, mode: "cors", credentials: "omit" }); } catch (e) { /* ignore */ }
  }
  setTimeout(function () { if (!sent) { sent = true; send(); } }, 4000);   // a visit that bounces in 4 s still counts once
  doc.addEventListener("visibilitychange", function () { if (doc.visibilityState === "hidden") send(); });
  addEventListener("pagehide", send);
})();
/* 5. (12 Nov 2026, James) HubSpot marketing data, ONLY after the visitor says yes (Dutch cookie rule,
   Telecommunicatiewet art. 11.7a + GDPR: tracking cookies need consent first). A small question at the bottom
   asks once; "No thanks" is just as big as "Accept". The choice is kept in localStorage "orbit-consent"
   ("yes" / "no" + date) and asked again after 12 months. Any element with data-consent-open (privacy page)
   opens the question again. HubSpot only loads on the real site (orbit3d.nl), or on the test server with
   ?hstest, so tests do not pollute the marketing data. privacy.html sections 2, 3 and 4 describe this;
   change both together. Do NOT also switch on HubSpot's own cookie banner in the HubSpot account (two banners). */
(function () {
  "use strict";
  var KEY = "orbit-consent", HS_SRC = "https://js-eu1.hs-scripts.com/149754969.js", MAX_AGE = 365 * 864e5;
  var doc = document, box = null;
  var live = /(^|\.)orbit3d\.nl$/.test(location.hostname) || /[?&]hstest(=|&|$)/.test(location.search);
  var T = {
    en: { q: "Can we use cookies from HubSpot to see how visitors use this site, so we can improve it?",
          yes: "Accept", no: "No thanks", more: "Privacy" },
    nl: { q: "Mogen we cookies van HubSpot gebruiken om te zien hoe bezoekers deze site gebruiken, zodat we hem kunnen verbeteren?",
          yes: "Akkoord", no: "Nee, bedankt", more: "Privacy" },
    // (14 Nov 2026) Russian, from the language drop-down; the privacy page itself stays English for Russian visitors
    ru: { q: "Можно ли нам использовать cookie HubSpot, чтобы видеть, как посетители пользуются сайтом, и улучшать его?",
          yes: "Принять", no: "Нет, спасибо", more: "Конфиденциальность" }
  };
  function read() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || "null");
      if (v && (v.c === "yes" || v.c === "no") && Date.now() - v.t < MAX_AGE) return v.c; } catch (e) {}
    return "";
  }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify({ c: c, t: Date.now() })); } catch (e) {} }
  function loadHubSpot() {
    if (!live || doc.getElementById("hs-script-loader")) return;
    var s = doc.createElement("script");
    s.id = "hs-script-loader"; s.async = true; s.defer = true; s.src = HS_SRC;
    doc.head.appendChild(s);
  }
  function lang() { var l = (doc.documentElement.lang || "en").slice(0, 2); return T[l] ? l : "en"; }
  function privacyHref() { return lang() === "nl" ? "privacyverklaring.html" : "privacy.html"; }
  function fill() {
    if (!box) return;
    var t = T[lang()];
    box.querySelector("[data-c-q]").textContent = t.q;
    box.querySelector("[data-c-yes]").textContent = t.yes;
    box.querySelector("[data-c-no]").textContent = t.no;
    var a = box.querySelector("[data-c-more]"); a.textContent = t.more; a.href = privacyHref();
  }
  function close() { if (box) { box.remove(); box = null; doc.documentElement.classList.remove("has-consent-q"); } }
  function choose(c) {
    var before = read();
    save(c); close();
    if (c === "yes") loadHubSpot();
    else if (before === "yes") location.reload();   // stop a HubSpot that already runs on this page
  }
  function ask() {
    if (box) return;
    box = doc.createElement("div");
    box.className = "consent"; box.setAttribute("role", "region"); box.setAttribute("aria-label", "Cookies");
    box.innerHTML = '<p class="consent__q" data-c-q></p><div class="consent__row">' +
      '<button type="button" class="consent__btn" data-c-no></button>' +
      '<button type="button" class="consent__btn consent__btn--yes" data-c-yes></button>' +
      '<a class="consent__more" data-c-more></a></div>';
    box.querySelector("[data-c-yes]").addEventListener("click", function () { choose("yes"); });
    box.querySelector("[data-c-no]").addEventListener("click", function () { choose("no"); });
    fill();
    doc.body.appendChild(box);
    doc.documentElement.classList.add("has-consent-q");
  }
  // follow the EN | NL switch while the question is open
  try { new MutationObserver(fill).observe(doc.documentElement, { attributes: true, attributeFilter: ["lang"] }); } catch (e) {}
  doc.addEventListener("click", function (e) {
    var o = e.target && e.target.closest && e.target.closest("[data-consent-open]");
    if (o) { e.preventDefault(); ask(); }
  });
  var c = read();
  if (c === "yes") loadHubSpot();
  else if (c !== "no") ask();
})();
