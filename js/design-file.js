/* Orbit design files (4 Nov 2026, James: "Already designed?" + the "View your design" page).
   A visitor saves their furniture / paint design in the Orbit viewer (v87, "Save to file") as a small .json.
   The file holds the house's own viewer link. This file checks such a file in the browser only (nothing is
   uploaded anywhere) and hands it from the results card on the main page to view-design.html.
   Rules (the v87 design-file contract between the Orbit viewer and this site, section 4):
   - max 2 MB, JSON, orbit === "design", v === 1, link is a string;
   - only a link on the Orbit viewer (https://orbit-viewer.pages.dev) is opened; http://127.0.0.1 / localhost
     viewers only while this site itself runs on 127.0.0.1 / localhost (the test bed);
   - when the link names a library (lib=), that library must be the site's own (ORBIT_SITE.viewer.lib) or
     sit on the viewer itself, so a made-up file cannot show someone else's pictures inside this page;
   - (security check QC-20261104-0903) only the address parts a house link needs are kept (KEEP below): the viewer
     can also load scans or photos from other parameters (splat=, tour=, tourbase=, ...), and those are dropped;
   - the file's text and name never go into the page (no names on the site, textContent only). */
(function () {
  "use strict";
  var MAX = 2 * 1024 * 1024;
  var KEY = "orbit.site.design.v1";          // sessionStorage: { text, at } from the results card to the page
  var KEEP_MS = 30 * 60 * 1000;              // a hand-over older than 30 minutes is not used
  var LIVE = "https://orbit-viewer.pages.dev";
  var LOCAL_HOST = /^(127\.0\.0\.1|localhost)$/;
  var pageIsLocal = LOCAL_HOST.test(location.hostname) && /^https?:$/.test(location.protocol);

  // The words a visitor can see (English; js/language.js puts the Dutch from wording/nl.json on them).
  var SAY = {
    notDesign: "This is not an Orbit design file. Choose the .json file you saved in Orbit.",
    tooBig: "This file is too big for an Orbit design file.",
    unreadable: "This file could not be read. Try again.",
    foreign: "This design belongs to a house that cannot be opened here."
  };

  function libOk(viewer) {
    var lib = viewer.searchParams.get("lib");
    if (lib === null) return true;
    var u;
    try { u = new URL(lib, viewer.href); } catch (e) { return false; }
    if (u.username || u.password) return false;
    if (u.origin === viewer.origin) return true;
    var own = "";
    try { own = new URL(((window.ORBIT_SITE || {}).viewer || {}).lib || "").origin; } catch (e) { own = ""; }
    if (own && u.protocol === "https:" && u.origin === own) return true;
    return pageIsLocal && u.protocol === "http:" && LOCAL_HOST.test(u.hostname);
  }

  // The only parts of a house link that are kept: which library, which place, which floor, language.
  var KEEP = ["lib", "id", "ref", "floor", "lang"];

  // The viewer address to frame (link + start=design + names=0), or "" when the link may not be opened.
  function viewerUrl(link) {
    var u;
    try { u = new URL(String(link)); } catch (e) { return ""; }
    if (u.username || u.password) return "";
    var ok = (u.protocol === "https:" && u.origin === LIVE) ||
             (pageIsLocal && u.protocol === "http:" && LOCAL_HOST.test(u.hostname));
    if (!ok || !libOk(u)) return "";
    var keys = [];
    u.searchParams.forEach(function (v, k) { if (keys.indexOf(k) < 0) keys.push(k); });
    keys.forEach(function (k) { if (KEEP.indexOf(k) < 0) u.searchParams.delete(k); });
    u.hash = "";
    u.searchParams.set("start", "design");
    u.searchParams.set("names", "0");         // the site never shows place names (viewer v74+: no names anywhere)
    return u.href;
  }

  // text -> { ok: true, text, url, origin } or { ok: false, error }
  function check(text) {
    if (typeof text !== "string" || !text) return { ok: false, error: SAY.notDesign };
    if (text.length > MAX) return { ok: false, error: SAY.tooBig };
    var d;
    try { d = JSON.parse(text); } catch (e) { return { ok: false, error: SAY.notDesign }; }
    if (!d || typeof d !== "object" || d.orbit !== "design" || d.v !== 1 || typeof d.link !== "string" ||
        !d.floors || typeof d.floors !== "object") return { ok: false, error: SAY.notDesign };
    var url = viewerUrl(d.link);
    if (!url) return { ok: false, error: SAY.foreign };
    return { ok: true, text: text, url: url, origin: new URL(url).origin };
  }

  // File -> Promise of the same result as check()
  function read(file) {
    if (!file) return Promise.resolve({ ok: false, error: SAY.notDesign });
    if (file.size > MAX) return Promise.resolve({ ok: false, error: SAY.tooBig });
    if (file.name && !/\.json$/i.test(file.name) && file.type && !/json/i.test(file.type)) {
      return Promise.resolve({ ok: false, error: SAY.notDesign });
    }
    var get = file.text ? file.text() : new Promise(function (ok, no) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result || "")); };
      r.onerror = function () { no(r.error); };
      r.readAsText(file);
    });
    return get.then(check, function () { return { ok: false, error: SAY.unreadable }; });
  }

  function stash(text) {
    try { sessionStorage.setItem(KEY, JSON.stringify({ text: text, at: Date.now() })); return true; }
    catch (e) { return false; }
  }
  function take() {
    try {
      var raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o.text !== "string" || !(Date.now() - o.at < KEEP_MS)) { sessionStorage.removeItem(KEY); return null; }
      return o.text;
    } catch (e) { return null; }
  }
  function clear() { try { sessionStorage.removeItem(KEY); } catch (e) { /* nothing kept */ } }

  // The first file of a drop or a file input
  function firstFile(list) { return list && list.length ? list[0] : null; }

  window.OrbitDesignFile = { MAX: MAX, SAY: SAY, check: check, read: read, viewerUrl: viewerUrl,
    stash: stash, take: take, clear: clear, firstFile: firstFile, local: pageIsLocal };
})();
