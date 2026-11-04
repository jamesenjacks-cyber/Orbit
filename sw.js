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
var DATA = PRE + "data-b1a1015e1a";
var CODE = PRE + "code-20261104-194958";
var BIG = /^(assets\/(scans|stage|space|fonts|brand|posters|howto|partners)|vendor)\/|\.(webp|jpe?g|png|svg|woff2|wasm|mp4|webm)$/i;

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(PRE) === 0 && k !== DATA && k !== CODE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function keep(cacheName, req, res) {
  if (res && res.ok && res.status === 200 && res.type === "basic") {
    var copy = res.clone();
    caches.open(cacheName).then(function (c) { return c.put(req, copy); }).catch(function () { /* phone storage full: just skip */ });
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
      return c.match(req).then(function (hit) { return hit || fetch(req).then(function (res) { return keep(DATA, req, res); }); });
    }));
    return;
  }
  // network first, the saved copy only without internet
  e.respondWith(fetch(req).then(function (res) { return keep(CODE, req, res); }).catch(function () {
    return caches.open(CODE).then(function (c) { return c.match(req, { ignoreSearch: true }); }).then(function (hit) { return hit || Response.error(); });
  }));
});
