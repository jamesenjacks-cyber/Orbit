/* Story site extras (7 Nov 2026, James: "make the site real" list). Loaded at the end of every story page.
   1. Top bar backing: .nav gets .is-solid once page content (not the 3D story) scrolls under it.
   2. Phones: the "Book a call" button at the bottom (.stick-cta) shows from the results until the contact
      section is in view.
   3. Anonymous visit counts, without cookies: one small record per page view goes to our own Orbit stats Worker
      (the one the Orbit viewer uses), as "scan" website-<page>. A fresh random id per page view, nothing is saved
      on the device, no IP or browser fingerprint is stored by the Worker. Sent only on the real site (orbit3d.nl),
      not on the test server. privacy.html section 2 describes it; change both together. */
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
