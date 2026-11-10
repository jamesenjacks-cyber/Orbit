/* Orbit 3D site: service worker (31 Oct 2026, for GitHub Pages).
   GitHub Pages tells browsers to keep files for only 10 minutes, so a visitor who comes back (or scrolls
   back up after a while) would ask again for hundreds of scan tiles. This little helper keeps them on the
   phone / computer instead:
   - the big files that never change between uploads (scan tiles, 3D packs, background points, the 3D
     engine, fonts, pictures) come from the visitor's own cache after the first time (cache first);
   - the page itself, its styles and scripts always come fresh from the internet first, so a new upload
     shows at once; only without internet the saved copy is used.
   tools/deploy.py writes the two version names below on every upload: DATA changes only when one of the big
   files changed (then they are fetched again once), CODE changes every upload.
   Only used online over https (not on the local test servers). Remove: delete this file and the
   "service worker" lines in js/main.js. */
/* (31 Oct, Codex security check QC-20261030-2345) every name carries this site's own folder (scope), because
   all of one person's GitHub sites share one origin (<name>.github.io): this site never touches another
   site's caches, and the "big file" rule looks only at the path INSIDE this site's folder. */
var SCOPE = new URL(self.registration.scope).pathname;
var PRE = "orbit3dsite:" + SCOPE + ":";
var DATA = PRE + "story-data-1b8fda92f4";
var CODE = PRE + "story-code-20261110-201250";
/* (7 Nov 2026) + assets/compare and assets/furniture and .glb: the 3D models of "Look around" (13 MB on a
   phone) were fetched again on every visit */
var BIG = /^(assets\/(scans|stage|space|fonts|brand|posters|howto|partners|compare|furniture)|vendor)\/|\.(webp|jpe?g|png|svg|woff2|wasm|glb|mp4|webm)$/i;

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(PRE) === 0 && k !== DATA && k !== CODE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function keep(cacheName, req, res, ev) {
  if (res && res.ok && res.status === 200 && res.type === "basic") {
    var copy = res.clone();
    var saving = caches.open(cacheName).then(function (c) { return c.put(req, copy); }).catch(function () { /* phone storage full: just skip */ });
    // (10 Nov 2026, Codex QC-20261110-2015) the helper stays awake until the copy is really saved
    if (ev) try { ev.waitUntil(saving); } catch (x) { /* event already finished: the copy may still be saved */ }
  }
  return res;
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf(SCOPE) !== 0) return;
  if (BIG.test(url.pathname.slice(SCOPE.length))) {
    // cache first
    e.respondWith(caches.open(DATA).then(function (c) {
      return c.match(req).then(function (hit) { return hit || fetch(req).then(function (res) { return keep(DATA, req, res, e); }); });
    }));
    return;
  }
  // network first, the saved copy only without internet
  // (10 Nov 2026, poor connections) ... or when the internet takes longer than 4 s and a saved copy exists: the visitor
  // gets the saved page at once (the fresh one is still saved for next time when it arrives)
  var net = fetch(req).then(function (res) { return keep(CODE, req, res, e); });
  e.waitUntil(net.catch(function () { /* offline */ }));
  var saved = function () { return caches.open(CODE).then(function (c) { return c.match(req, { ignoreSearch: true }); }); };
  e.respondWith(new Promise(function (ok) {
    var done = false, give = function (r) { if (!done && r) { done = true; ok(r); } };
    var t = setTimeout(function () { saved().then(give).catch(function () { /* */ }); }, 4000);
    net.then(function (r) { clearTimeout(t); give(r); }).catch(function () {
      clearTimeout(t);
      saved().then(function (hit) { give(hit || Response.error()); }).catch(function () { give(Response.error()); });
    });
  }));
});
