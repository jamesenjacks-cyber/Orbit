/* The shared camera poses of the film, in MODEL metres (the 3D house's own
   coordinates: Y up, floor at y = 0). Read by js/space.js (the points) and
   js/stage.js / js/stage-real.js (the solid house), so a point and its wall
   meet on screen. Builders may tune the numbers; the shape stays.
   eye = where the camera is, target = what it looks at, fov = vertical degrees.
   Round 6 (P1): the house, a long house (about 21 x 6 m) with the patio in the middle,
   the living room west of it. Poses checked in work/P1 (shots/, points/). */
window.ORBIT_FILM = {
  poses: {
    /* hero: the points draw the house outline here, 3/4 from above (south-east), below the title */
    heroOutline: { eye: [24.0, 13.0, 17.0], target: [10.7, 0.8, 3.25], fov: 40 },
    /* section 2 (P2): the first aerial orbit view, 3/4 from above (south-east); = assets/stage/aerial.json orbit
       (target, dist 38, yaw0 0.70, pitch0 0.58). Exterior points and aerial splat share this model frame.
       Round 6 (H): pulled back along the same direction (dist 38 -> 68.4, x1.8, inside maxDist 75) and a
       wider fov (40 -> 55) so the building sits in the subject column with air around it
       (was P2's eye [31.177, 23.325, 27.511], fov 40). */
    aerial: { eye: [47.559, 39.985, 46.960], target: [10.7, 2.5, 3.2], fov: 55 },
    /* #walk: where the walk-in lands in the garden, standing eye height (= patioViews[0]).
       Round 9 (E): looks a little lower, so the dark glass wall (not the pale sky) is behind the words;
       `tall` = the framing on phones (js/stage-aerial.js poseView, picked at 390 x 844, work/R9/E/NOTES.md). */
    patioArrive: { eye: [11.1, 1.6, 3.95], target: [6.6, 0.7, 2.3], fov: 60, tall: { eye: [11.1, 1.6, 3.95], target: [6.6, 0.45, 2.3], fov: 60 } },
    /* #walk, the garden stops (round 9, E): 1 = the arrival (look around), 2 = right up to the glass wall of the
       living room, 3 = turn around to the sofa corner and the house wall. Each has a tiny caption in 04-walk.html.
       Picked by rendering the full streamed scan on its training camera lanes (work/E7/NOTES.md, work/R9/E/NOTES.md);
       keep them within about 0.6 m of a lane or the splat goes soft. */
    patioViews: [
      { eye: [11.1, 1.6, 3.95], target: [6.6, 0.7, 2.3], fov: 60, tall: { eye: [11.1, 1.6, 3.95], target: [6.6, 0.45, 2.3], fov: 60 } },
      { eye: [9.2, 1.5, 2.7], target: [6.2, 0.8, 2.7], fov: 60, tall: { eye: [9.2, 1.5, 2.7], target: [6.2, 0.5, 2.7], fov: 60 } },
      { eye: [8.3, 1.5, 2.0], target: [11.8, 0.8, 3.6], fov: 60, tall: { eye: [8.2, 1.5, 1.8], target: [11.8, 0.6, 3.4], fov: 60 } }
    ],
    /* section 3: from the patio the camera rises to this cutaway, looking down into the play room
       (= living room). Round 7 (F): the 3/4 dollhouse start of "Make it yours." (same direction as
       roomPlay: 30 deg east of south, 52 deg down, 12 m from the room middle), so the patio-model
       scene (E) hands over on the play camera's own line; js/stage.js then only fits the distance
       and moves the room into the free part of the screen. Was eye [7.6, 6.0, 6.6] target [3.3, 0.5, 3.2] fov 45. */
    roomView: { eye: [7.06, 10.16, 9.65], target: [3.37, 0.7, 3.25], fov: 40 },
    /* section 3, play: only the DIRECTION (eye - target) and fov are used; the aim is the play room's
       own middle and the distance is fitted to the whole room (js/stage.js homeFit, zoom 0.42x..1.5x) */
    roomPlay: { eye: [7.06, 10.16, 9.65], target: [3.37, 0.7, 3.25], fov: 40 },
    /* section 4 studio slider: unused by the house (the other place has its own camera and frame) */
    realEye: { eye: [1.6, 1.5, 7.3], target: [3.0, 1.4, 7.3], fov: 70 },
    /* section 4, the whole house from above, 3/4 view */
    top: { eye: [16.5, 22.0, 19.0], target: [10.7, 0.4, 3.25], fov: 40 },
    /* round 8 (F1, js/stage-tour.js): the station tour of #design (overview = roomView, fitted to the
       living room) and the whole floor of #floor. Stations are used as they are (phones: a wider lens and
       a step back); floorRef gives the direction and lens, the distance is fitted to the whole floor.
       Checked by rendering at 390x844 and 1440x900 (work/F18/NOTES.md). */
    tourTv: { eye: [3.9, 2.05, 5.2], target: [2.6, 1.0, 0.9], fov: 50 },
    /* round 9 (F, review A10): tall screens (phones) see the TV wall from the back of the room, looking
       down a little more, so the TV, its cabinet and the floor fill the screen (no black band on top) */
    /* 31 Oct (phone audit, QA8 M2): one step back to the room's back wall, a wider lens and a steeper look, so the
       whole TV, its cabinet and the painted wall around it fit above the sheet (was eye [3.5, 2.35, 5.65],
       target [2.75, 0.0, 1.4], fov 50: the TV filled the phone). Picked from 6 renders at 390 x 844. */
    tourTvPhone: { eye: [3.5, 2.3, 5.85], target: [2.75, -0.6, 1.4], fov: 60 },
    tourCouch: { eye: [3.4, 4.9, 0.3], target: [2.5, 0.2, 3.8], fov: 52 },
    tourKitchen: { eye: [15.5, 2.0, 5.4], target: [13.6, 1.1, 2.0], fov: 55 },
    /* 29 Oct (lamp switches): tall screens see the kitchen from the back wall, so all three lamps fit */
    tourKitchenPhone: { eye: [13.0, 2.0, 5.0], target: [14.0, 1.2, 1.8], fov: 55 },
    floorRef: { eye: [16.5, 22.0, 19.0], target: [10.7, 0.4, 3.25], fov: 40 },
    /* round 8 (F1): the same whole floor on tall screens (phones), looking along the long house */
    floorRefPhone: { eye: [23.85, 21.1, 8.03], target: [10.7, 0.4, 3.25], fov: 40 }
  },
  room: {
    /* the room visitors play in (house.json rooms[].id); no names are shown */
    id: "living_room"
  }
};
