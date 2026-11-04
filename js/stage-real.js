/* ROUND 8 (CONTRACT 8.1 "Retired", builder E, 29 Oct 2026): the scenes of this file are retired.
   - "real-split" (a 360 photo | splat slider of a second scan): that scan is no longer used, so
     NOTHING here loads or streams it any more (download cap). Step 5 shows the real Orbit viewer instead.
   - "real-top" (the house model from above, tap a room): replaced by js/stage.js "floor" (F1).
   The round 7 code is kept in work/E8/backup/stage-real.js (and work/backup-r7/). What stays is the old
   API object, so a stale caller never breaks: every call is a no-op, ready stays false, no event fires. */
(function () {
  "use strict";
  var api = window.OrbitStage = window.OrbitStage || {};
  var noop = function () {};
  api.real = {
    ready: false, topReady: false,
    split: noop, look: noop, enter: noop,
    rooms: function () { return []; },
    on: function () { return noop; },
    _debug: function () { return { retired: true }; }
  };
})();
