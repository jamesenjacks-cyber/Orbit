/* Website feed from the Orbit dashboard ("Website" page).
   If ORBIT_SITE.feed is set, the site reads that JSON and uses it instead of
   the hand-filled entries in embeds.js. Format (version 1):
   {
     "version": 1,
     "hero":     { "kind": "model", "alt": "...", "poster": "url", "embed": "url" },
     "showcase": { ...same... },
     "slots":    { "inside": {...}, "outside": {...}, ... }   (optional, any slot key)
     "previews": [ { "kind": "interior|exterior|model|tour", "alt": "...",
                     "poster": "url", "loop": "url (optional)", "embed": "url" } ]
   }
   When it has loaded, every 3D window is rebuilt and the event
   "orbit:feed" fires on document (the preview wall listens for it). */
(function () {
  "use strict";
  var url = ((window.ORBIT_SITE || {}).feed || "").trim();
  if (!url || !window.fetch) return;

  function clean(o) {
    if (!o || typeof o !== "object") return null;
    var s = function (v) { return typeof v === "string" ? v.trim() : ""; };
    return { kind: s(o.kind), alt: s(o.alt), poster: s(o.poster), loop: s(o.loop), embed: s(o.embed) };
  }

  fetch(url, { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (f) {
      var E = window.ORBIT_EMBEDS = window.ORBIT_EMBEDS || {};
      ["hero", "showcase"].forEach(function (k) { var c = clean(f[k]); if (c && c.embed) E[k] = c; });
      if (f.slots && typeof f.slots === "object") {
        Object.keys(f.slots).forEach(function (k) { var c = clean(f.slots[k]); if (c && c.embed) E[k] = c; });
      }
      if (Array.isArray(f.previews) && f.previews.length) {
        window.ORBIT_PREVIEWS = f.previews.map(clean).filter(function (p) { return p && (p.embed || p.poster); });
      }
      if (window.OrbitSlots) window.OrbitSlots.refresh();
      document.dispatchEvent(new CustomEvent("orbit:feed"));
    })
    .catch(function (e) {
      // Keep the hand-filled embeds.js content if the feed cannot be read.
      if (window.console) console.warn("Orbit website feed not loaded:", e && e.message);
    });
})();
