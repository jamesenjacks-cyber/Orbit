/* One shared "engage" model for the whole page (CONTRACT 8.2, research/10 section 7).
   A view that takes the visitor's input (a 3D card, a full-screen scene, an Orbit
   viewer iframe) claims it here. Only one thing is engaged at a time: claiming
   releases the previous holder. Esc (outside text fields) releases the current one.
   Events: document "orbit:engage" { kind, id, on }. */
(function () {
  "use strict";
  var cur = null; // { kind, id, release }

  function fire(kind, id, on) {
    try {
      document.dispatchEvent(new CustomEvent("orbit:engage", { detail: { kind: kind, id: id, on: on } }));
    } catch (e) { console.error(e); }
  }

  function drop() {
    if (!cur) return;
    var c = cur;
    cur = null;
    try { if (typeof c.release === "function") c.release(); } catch (e) { console.error(e); }
    fire(c.kind, c.id, false);
  }

  window.OrbitEngage = {
    claim: function (kind, id, release) {
      if (cur && cur.id === id) { cur.release = release || cur.release; return true; }
      drop();
      cur = { kind: kind, id: id, release: release };
      fire(kind, id, true);
      return true;
    },
    /* The holder ends it itself (its own Done button, scroll intent...): no release() callback. */
    release: function (id) {
      if (!cur || (id && cur.id !== id)) return;
      var c = cur;
      cur = null;
      fire(c.kind, c.id, false);
    },
    current: function () { return cur ? { kind: cur.kind, id: cur.id } : null; },
    isEngaged: function (id) { return !!cur && cur.id === id; }
  };

  document.addEventListener("keydown", function (e) {
    if (!cur || e.key !== "Escape") return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    drop();
  });
})();
