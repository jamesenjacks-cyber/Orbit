/* Orbit story site (5 Nov 2026): WHAT the story shows and WHERE the camera goes. js/story-3d.js plays it.
   One world for everything = the Orbit viewer's neighbourhood frame ("hood", metres, y up), from the
   place's hood.json (source path: see the orbit3dlite skill notes; never name the place in published files):
   - aerial scan: hood_from_splat = 180 deg about x;
   - ground floor model: hood_from_model (below, rows of a 3x4 matrix); the indoor scan hangs under it with the
     house.json align (180 deg about x, then +[2.9, 0, 6]);
   - first floor model: its own hood_from_model.
   Camera spots inside the house are written in GROUND MODEL metres (x across, y up, z from the street to the back
   of the garden) and turned into hood metres by H(). P = chapter + how far into it (see js/story.js). */
(function () {
  "use strict";
  var G = [[-0.006858, 0, 1.003824, 2.49808], [0, 1.003847, 0, -0.553197], [-1.003824, 0, -0.006858, 0.693553]];
  var F1 = [[-1.004069, 0, -0.000105, 13.843281], [0, 1.004069, 0, 2.28], [0.000105, 0, -1.004069, 0.77493]];
  var F2 = [[-1.004069, 0, -0.000105, 13.843281], [0, 1.004069, 0, 5.111473], [0.000105, 0, -1.004069, 0.77493]];   // hood.json storey 2
  function H(x, y, z) { return [0, 1, 2].map(function (r) { return G[r][0] * x + G[r][1] * y + G[r][2] * z + G[r][3]; }); }
  function K(P, pos, at, fov, o) { var k = { P: P, pos: pos, at: at, fov: fov || 50 }; if (o) for (var n in o) k[n] = o[n]; return k; }
  function M(P, pos, at, fov, o) { return K(P, H(pos[0], pos[1], pos[2]), H(at[0], at[1], at[2]), fov, o); }
  // the aerial orbit around the block (hood metres): angle around the centre, height, distance
  var C = [30, 0, -10];
  function orbit(P, deg, h, r, fov, at) { var a = deg * Math.PI / 180; return K(P, [C[0] + Math.cos(a) * r, h, C[2] + Math.sin(a) * r], at || C, fov); }
  // 5 Nov late (James: "from the front, swing around, line up square with the back yard, then fly in and land in
  // the backyard"; the first try orbited 300 degrees and came in from the side, low over the roofs = overshot):
  // 1. swing to the left round the block (about 220 degrees) to a spot high up, straight behind the gardens, on the
  //    garden's own line (ground model x = 3.2); the point it looks at slides from the middle of the block to the house;
  // 2. it slows down there, square with the backyard (stop: true);
  // 3. then flies in along that line and lands above the end of the garden (P 2.42).
  var ALIGN = { P: 1.7, pos: H(3.2, 34, 75), at: H(3.2, 1.5, 8) };
  function swing(P0, P1, n) {
    var a0 = 146, r0 = 82, h0 = 54, end = ALIGN.pos, endAt = ALIGN.at;
    var a1 = Math.atan2(end[2] - C[2], end[0] - C[0]) * 180 / Math.PI + 360;   // the square spot's angle, to the left
    var r1 = Math.hypot(end[0] - C[0], end[2] - C[2]);
    var out = [];
    for (var i = 1; i <= n; i++) {
      var u = i / n, s = u * u * (3 - 2 * u);
      var at = [C[0] + (endAt[0] - C[0]) * s, C[1] + (endAt[1] - C[1]) * s, C[2] + (endAt[2] - C[2]) * s];
      var k = orbit(P0 + (P1 - P0) * u, a0 + (a1 - a0) * u, h0 + (end[1] - h0) * u, r0 + (r1 - r0) * u, 50, at);
      if (i === n) { k.pos = end.slice(); k.stop = true; }   // exactly square, and the camera slows down here
      out.push(k);
    }
    return out;
  }

  var base = "assets/story/";
  window.STORY = {
    ambient: [0.5, 0.5, 0.52],   // as the Orbit viewer (the baked parts take no light now, only the pbr__ parts do)
    phoneFov: 1.22,      // portrait phones see a little wider
    // portrait phones, furniture chapter: look at the coffee table (k = how much) and draw the picture higher (lens shift)
    phoneAt: { at: H(2.86, 0.25, 10.06), k: [[5.2, 0], [5.4, 1], [5.97, 1], [6.15, 0]] },
    phoneFovT: [[5.2, 1.22], [5.4, 1.55], [5.97, 1.55], [6.15, 1.22]],
    phoneShift: [[5.2, 0], [5.4, -0.2], [5.97, -0.2], [6.15, 0], [6.95, 0], [7.25, -0.3], [7.97, -0.3], [8.1, 0]],
    scans: {
      // finest = the sharpest level it may fetch; computers the sharpest, phones one level lighter.
      // Sky: unchanged (level 0 = 100% not shipped; 1 = 50%, 2 = 25%, 3 = 10%). A "coarser far edges" version was
      // tried on 5 Nov night: the scan's own regions mix near and far, so it showed holes, for only ~0.4 MB. Dropped.
      // Ground: rebuilt 5 Nov night from its original PLY with 3 levels: 0 = 100%, 1 = 50%, 2 = 10% (the 25% level
      // was never the final picture: computers end at 100%, phones at 50%). See story/EXPLANATION.md.
      sky: { url: base + "scans/sky/lod-meta.json", to: { euler: [180, 0, 0] }, finest: { desktop: 1, phone: 2 } },
      ground: { url: base + "scans/ground/lod-meta.json", parent: "house", to: { euler: [180, 0, 0], t: [2.9, 0, 6] }, finest: { desktop: 0, phone: 1 },
        keepY: 2.06 }   // drag line: on the model side the scan still shows above this height (hood metres: top of the ground floor)
    },
    models: {
      house: { walls: base + "models/ground-walls.glb", furniture: base + "models/ground-furniture.glb", to: { m: G },
        hide: ["kitchen__Cooker hood chimney (upper part)", "living_room__Back door roller blind", "living_room__Back roller blinds",
          "living_room__Side roller blind", "living_room__blind_door_bar", "living_room__blind_side_bar", "living_room__blind_window_bar"],
        // the ceilings (realism__ceiling_*_kept) are shown inside, like the Orbit viewer (James 5 Nov: "a roof like the real scene")
        tops: ["realism__ceiling", "realism__roof"] },
      floor1: { walls: base + "models/floor1-walls.glb", furniture: base + "models/floor1-furniture.glb", to: { m: F1 },
        hide: ["back_bedroom__Curtain rail", "back_bedroom__Roller blind", "back_bedroom__blind_bar", "bathroom__Roller blind", "bathroom__blind_bar",
          "bathroom__blind_bar_pbr", "lego_room__Roller blind", "lego_room__blind_box", "lego_room__blind_box_pbr", "office__Curtain north",
          "office__Curtain rod", "office__Curtain south", "office__curtain_n", "office__curtain_s", "office__rod", "realism__roof_kept"],
        tops: ["realism__ceiling", "realism__roof"] },
      floor2: { walls: base + "models/floor2-walls.glb", furniture: base + "models/floor2-furniture.glb", to: { m: F2 },
        hideRe: "blind|curtain|_rod$|__rod|rail", tops: ["realism__ceiling", "realism__roof"] }
    },
    // load a part when the story is about a chapter before this range; it is not needed outside it
    need: { sky: [0, 2.85], house: [1.7, 9.99], ground: [3.0, 5.5], floor1: [8.0, 9.99], floor2: [8.0, 9.99] },

    // how much of each part shows (0..1) along P; scans fade, models switch at 0.5; *Clip = scan cut height (hood y);
    // *Tops = ceilings and roof shown (1) or lifted (0); floor1Y = extra height while it drops in
    mix: {
      sky: [[0, 1], [2.5, 1], [2.86, 0]],
      skyClip: [[2.42, 40], [2.84, -1.5], [2.9, -1.5], [2.91, 1e9]],
      // hidden while the indoor scan alone is shown (walls of both in the same place would cut into each other)
      house: [[2.4, 0], [2.45, 1], [3.98, 1], [4.0, 0], [5.2, 0], [5.22, 1]],
      // 9 Nov: the ceilings lift off and fade over a longer stretch (was 8.05 -> 8.1, a pop)
      houseTops: [[2.4, 0], [4.55, 0], [4.6, 1], [8.0, 1], [8.3, 0]],
      // the scan melts into the 3D model AFTER the turn to the sofa has arrived (5.26), not during it
      ground: [[3.25, 0], [3.4, 1], [5.26, 1], [5.44, 0]],
      floor1: [[8.38, 0], [8.4, 1]],
      floor1Tops: [[0, 0]],
      floor1Y: [[8.4, 9], [8.62, 0]],
      floor2: [[8.6, 0], [8.62, 1]],
      floor2Tops: [[0, 0]],
      floor2Y: [[8.62, 9], [8.84, 0]]
    },

    path: [
      orbit(0, 141.5, 55, 84, 50, [30, 0, -10]),
      K(1.0, orbit(0, 146, 54, 82).pos, C, 50, { stop: true }),        // stop = the orbit starts gently from here
    ].concat(swing(1.0, ALIGN.P, 11), [                                  // the swing round the block, ending square behind the gardens
      M(2.08, [3.2, 19, 45], [3.2, 0.6, 9.2], 50),                        // flying in along the garden line
      M(2.42, [3.2, 10.5, 28.5], [3.2, 0, 10], 50),                      // landed: above the end of the garden (image 5)
      M(3.0, [3.2, 10.5, 28.5], [3.2, 0, 10], 50, { hold: true }),
      M(3.38, [3.05, 1.55, 16.1], [3.0, 1.25, 12.4], 72),                // on the patio, the back doors (image 6/7)
      M(4.0, [3.0, 1.55, 15.9], [3.0, 1.25, 12.4], 72, { hold: true }),
      M(4.3, [1.95, 1.55, 14.0], [1.9, 1.35, 10.0], 72),                 // to the open door
      M(4.5, [1.9, 1.55, 12.15], [2.3, 1.3, 8.0], 72),                   // through it
      M(4.68, [3.1, 1.55, 11.6], [2.6, 1.3, 2.0], 72),                   // the length of the house (image 8)
      M(4.78, [3.1, 1.55, 11.55], [2.6, 1.3, 2.0], 72, { hold: true }),
      // turn to the sofa (image 14 -> 9). 5 Nov evening (James: "too fast, like a whiplash"): about three times longer,
      // and turn: true = the camera turns its head evenly (it used to swing the last part of the turn in one go)
      M(5.26, [1.7, 1.7, 8.6], [4.0, 0.5, 11.6], 64, { turn: true }),
      M(6.0, [1.75, 1.7, 8.55], [4.0, 0.5, 11.6], 64, { hold: true }),
      // light: from the kitchen end down the room, so all three lamps are in view (dining, front and back ceiling lamp)
      M(6.3, [2.9, 1.6, 5.0], [3.05, 1.7, 11.5], 72, { turn: true }),
      M(7.0, [2.9, 1.6, 5.05], [3.05, 1.7, 11.5], 72, { hold: true }),
      // paint: facing the TV wall, the wall in the middle of the picture (James 5 Nov)
      M(7.3, [4.3, 1.6, 8.3], [0.83, 1.25, 8.75], 66, { turn: true }),
      M(8.0, [4.3, 1.6, 8.25], [0.83, 1.25, 8.75], 66, { hold: true }),
      M(8.3, [3.0, 10.5, 18.5], [3.0, 0, 7.0], 50),                      // out and up: the ground floor as a dollhouse
      // all three floors land on top of each other (James: "why not show all 3 floors?"); stop = the camera slows down here
      M(8.9, [3.0, 14.5, 27.5], [3.0, 2.6, 7.0], 50, { stop: true }),
      M(9.99, [3.0, 14.8, 28.0], [3.0, 2.6, 7.0], 50)
    ]),
    // the three lamps of the living room (ground model metres; glow = the lamp parts that light up; James 5 Nov:
    // "click the light to turn it on or off", "the light comes from 3 areas")
    lamps: [
      { name: "Ceiling lamp", at: [3.15, 2.46, 8.6], glow: ["living_room__front_diffuser", "living_room__front_diffuser_pbr"] },
      { name: "Ceiling lamp", at: [3.06, 2.46, 11.075], glow: ["living_room__back_diffuser", "living_room__back_diffuser_pbr"] },
      { name: "Dining lamp", at: [1.91, 1.85, 6.45], glow: ["dining__pendant_diffuser", "dining__pendant_shade", "dining__pendant_cap", "dining__pendant_cap_pbr"] }
    ],
    // the coffee table can be dragged over the floor, within this part of the room (ground model metres x / z)
    tableArea: { x: [1.75, 3.45], z: [8.9, 11.0] },

    // screen spots (hood metres): the pin over the house; the coffee table box (half sizes in hood axes)
    spots: {
      house: { c: [9.14, 7.2, -2.58] },
      table: { c: H(2.86, 0.226, 10.06), half: [0.54, 0.226, 0.255] },
      sofa: { c: H(4.2, 0.4, 10.515), half: [1.705, 0.4, 1.11] }      // the corner sofa (model x 3.09-5.31, z 8.81-12.22)
    },
    designOn: "house",
    table: { node: "living_room__Coffee table", pos: [2.86, -0.002, 10.06], yaw: 90 },
    // 5 Nov night (James: "make the tabs work, no IKEA, fewer pieces"): two swappable pieces, each with its own tab.
    // nodes = the house parts a picked piece replaces (their __shadow too); room = the line under the panel title
    slots: {
      table: { name: "Coffee table", room: "In the living room. Room for 110 × 90 cm here", size: "110 × 50 cm", nodes: ["living_room__Coffee table"], drag: true },
      sofa: { name: "Sofa", room: "The corner of the living room. Room for 230 × 340 cm here", size: "220 × 340 cm",
        nodes: ["living_room__Sofa back section", "living_room__Sofa chaise", "living_room__Sofa side section"] }
    },
    lightOffDim: 0.38,   // the room with all three lamps off (daylight from the windows stays)
    paint: { nodes: ["wall__W-west-living_0_0", "wall__W-west-dining_0_0"] },
    demoPiece: "rattan",
    demoColours: ["#4f7a5a", "#c66a4a"],
    pieces: [
      // pieces from the furniture library made from our own scans (no shop brands). Tables stand where the coffee
      // table stands (and follow it when dragged); sofas: at = the middle of the piece in model metres, its corner in
      // the room's corner (5.31, 12.22), yaw = turned so the backrest is against the walls. box = half sizes, hood axes.
      { id: "rattan", slot: "table", name: "Rattan ottoman", size: "89 × 80 cm", thumb: base + "pieces/rattan-ottoman.webp", glb: base + "pieces/rattan-ottoman.glb", box: [0.445, 0.195, 0.4] },
      { id: "ctable", slot: "table", name: "Black C-table", size: "57 × 41 cm", thumb: base + "pieces/c-table.webp", glb: base + "pieces/c-table.glb", box: [0.285, 0.315, 0.205] },
      { id: "console", slot: "table", name: "Gold console", size: "68 × 26 cm", thumb: base + "pieces/gold-console.webp", glb: base + "pieces/gold-console.glb", box: [0.34, 0.31, 0.13] },
      { id: "wicker", slot: "sofa", name: "Wicker corner sofa", size: "229 × 226 cm", thumb: base + "pieces/wicker-corner.webp", glb: base + "pieces/wicker-corner.glb", at: [4.06, 0, 10.95], yaw: -90, box: [1.27, 0.415, 1.25] },
      { id: "blue", slot: "sofa", name: "Blue sofa", size: "196 × 90 cm", thumb: base + "pieces/blue-sofa.webp", glb: base + "pieces/blue-sofa.glb", at: [4.74, 0, 10.5], yaw: 180, box: [1.1, 0.455, 0.57] },
      { id: "teal", slot: "sofa", name: "Teal corner sofa", fits: false, note: "37 cm too big", thumb: base + "pieces/teal-corner.webp" }
    ],
    colours: [
      // the two demo colours sit in the first row: on phones the sheet shows one row until it is swiped up (5 Nov)
      // (7 Nov, James: "the colour would not work") Warm white looks almost the same as the real white wall, so a tap
      // on it seemed to do nothing: the first row now only holds colours that clearly change the wall
      { name: "Original", hex: null }, { name: "Forest", hex: "#4f7a5a" }, { name: "Terracotta", hex: "#c66a4a" },
      { name: "Navy", hex: "#2f4060" }, { name: "Sand", hex: "#dcc7a1" }, { name: "Blush", hex: "#e8c3b8" },
      { name: "Ochre", hex: "#d4a24a" }, { name: "Sage", hex: "#a9b89a" }, { name: "Sky", hex: "#b8cde0" },
      { name: "Warm white", hex: "#efe9df" }, { name: "Plum", hex: "#6a4560" }, { name: "Charcoal", hex: "#45484e" }
    ],
    H: H, G: G
  };
})();
