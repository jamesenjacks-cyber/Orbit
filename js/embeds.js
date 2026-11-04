/* =====================================================================
   ORBIT 3D WEBSITE - THE ONLY FILE YOU NEED TO EDIT FOR 3D CONTENT
   =====================================================================

   EASIEST WAY (once the dashboard has a "Website" page):
     Paste the website feed link from the Orbit dashboard after  feed:
     at the bottom of this file. The site then fills itself from the
     dashboard (hero model, showcase, all previews). Nothing else to do.

   BY HAND (works today):
     1. Find the window's name below (for example  hero ).
     2. Paste the Orbit embed code (an <iframe ...> code) OR just the
        viewer link (for example https://orbit-viewer.pages.dev/xyz)
        between the two backticks after  embed:
     3. Optional but recommended: put a still picture in assets/posters/
        and write its file name after  poster:  (fast first view on phones).
     4. Save and refresh the page.

   Empty  embed:  = the window shows a placeholder.
   No place names or floor names are shown on the website on purpose.
   alt = a short description for blind visitors, e.g. "Living room scan".
   ===================================================================== */

window.ORBIT_EMBEDS = {

  /* The big model visitors see first. It starts playing by itself
     (an Orbit model spins slowly when left alone). Best: a 3D house model. */
  hero:     { kind: "model",    alt: "3D house model", poster: "", embed: `` },

  /* The multi-model showcase: ONE embed that holds several models with a
     switcher (made on the dashboard's Website page). Also plays by itself. */
  showcase: { kind: "model",    alt: "Several 3D models", poster: "", embed: `` },

  /* Inside / Outside switch. */
  inside:   { kind: "interior", alt: "Interior scan", poster: "", embed: `` },
  outside:  { kind: "exterior", alt: "Exterior drone scan", poster: "", embed: `` },

  /* House model + the scan / model slider (two stills of the same view). */
  model:           { kind: "model",    alt: "3D house model", poster: "", embed: `` },
  "compare-scan":  { kind: "interior", alt: "Room, scan",     poster: "", embed: `` },
  "compare-model": { kind: "model",    alt: "Room, 3D model", poster: "", embed: `` },

  /* Design tools inside the viewer. */
  "design-furniture": { kind: "model", alt: "Changing the furniture", poster: "", embed: `` },
  "design-paint":     { kind: "model", alt: "Painting walls",         poster: "", embed: `` },
  "design-light":     { kind: "model", alt: "Real light",             poster: "", embed: `` },
  "tour-360":         { kind: "tour",  alt: "360 photo tour",         poster: "", embed: `` },
  "stats":            { kind: "stats", alt: "Visitor heat map",       poster: "", embed: `` },

  /* Inside the phone frame. */
  phone: { kind: "interior", alt: "Walking on a phone", poster: "", embed: `` }
};

/* PREVIEW WALL: as many as you like. One line per preview.
   kind  = interior | exterior | model | tour
   poster = still picture, loop = optional short silent video (.mp4/.webm)
   that plays while the preview is on screen, embed = what opens on tap. */
window.ORBIT_PREVIEWS = [
  { kind: "model",    alt: "House model",         poster: "", loop: "", embed: `` },
  { kind: "interior", alt: "Living room",         poster: "", loop: "", embed: `` },
  { kind: "exterior", alt: "Building from the air", poster: "", loop: "", embed: `` },
  { kind: "interior", alt: "Kitchen",             poster: "", loop: "", embed: `` },
  { kind: "model",    alt: "Floor model",         poster: "", loop: "", embed: `` },
  { kind: "interior", alt: "Bedroom",             poster: "", loop: "", embed: `` },
  { kind: "tour",     alt: "360 photo tour",      poster: "", loop: "", embed: `` },
  { kind: "exterior", alt: "Street front",        poster: "", loop: "", embed: `` },
  { kind: "interior", alt: "Hall",                poster: "", loop: "", embed: `` },
  { kind: "model",    alt: "Furnished model",     poster: "", loop: "", embed: `` },
  { kind: "interior", alt: "Bathroom",            poster: "", loop: "", embed: `` },
  { kind: "exterior", alt: "Courtyard",           poster: "", loop: "", embed: `` }
];

/* Site settings. */
window.ORBIT_SITE = {
  /* Website feed from the Orbit dashboard (leave empty until it exists). */
  feed: "",
  /* Streamed real splats (CONTRACT 7.1): each url is a SOG LOD folder in the scan's OWN frame.
     toModel / toStudio = world = scale * R(quat x,y,z,w) * scan + t. Numbers: work/S7/NOTES.md.
     finest = the sharpest level it may download (0 = full detail; each step halves the download).
     Left out = computer 1, phone 2. Add ?lod=full to the address to see full detail. */
  scans: {
    aerial: { url: "assets/scans/aerial/lod-meta.json",
      toModel: { scale: 28.62457149, quat: [-0.72905274, -0.01153943, -0.68362362, 0.03174408], t: [25.7562, -2.78826, 5.77724] },
      budget: { desktop: 3500000, phone: 1200000 }, finest: { desktop: 1, phone: 1 } },
    /* 29 Oct: James uses only the newest house scan now (assets/scans/home/); the old v2 (assets/scans/house/,
       toModel scale 1.19, quat [1,0,0,0], t [7.854,0,2.142]) is no longer streamed anywhere */
    house:  { url: "assets/scans/home/lod-meta.json",
      toModel: { scale: 1.41564623, quat: [0.70868808, -0.00024143, -0.70552032, 0.00149097], t: [6.57457, -0.47278, 3.43426] },
      budget: { desktop: 3500000, phone: 1200000 } },
    /* 29 Oct: the hero's own scan (the same newest house scan, 1.5M splats, own frame registered onto the house scan, ICP) */
    hero:   { url: "assets/scans/home/lod-meta.json",
      toModel: { scale: 1.41564623, quat: [0.70868808, -0.00024143, -0.70552032, 0.00149097], t: [6.57457, -0.47278, 3.43426] },
      budget: { desktop: 3500000, phone: 1200000 }, finest: { desktop: 0, phone: 1 } },   /* round 8: the third scan is retired (work/retired-r8/assets/scans/), nothing streams it */
    /* 3 Nov 2026: "Look around, or move through." [3D scan] (js/sections/compare.js), on the page's own stage.
       Made with: python tools/make_sog.py "<scan>.ply" assets/scans/room --tail 150000 (1.5M / 750k / 350k / 150k).
       start = where the visitor stands and looks (world metres), floor = floor height, reach = how far they
       may walk from the start (metres). Desktop full detail, phone one level lighter. */
    compare: { url: "assets/scans/room/lod-meta.json",
      toModel: { scale: 1, quat: [1, 0, 0, 0], t: [0, 0, 0] },
      /* area = the open floor between the windows and the black kitchen block [x0, z0, x1, z1] */
      start: { eye: [0.3, 1.55, -0.6], look: [-1.6, 1.3, 4.0] }, floor: -0.05, area: [-2.3, -3.6, 0.55, 3.0],
      budget: { desktop: 3500000, phone: 1200000 }, finest: { desktop: 0, phone: 1 } }
  },
  /* Round 8: the Orbit viewer (v74 or newer) that the site embeds in "Look around, or move
     through." and "This is what you get." Embeds load only when a visitor taps them, one at a time.
     ref = the record's opaque reference from the Orbit viewer (no place name in the page). */
  viewer: {
    base: "https://orbit-viewer.pages.dev/viewer.html",
    lib: "https://pub-fedb6cdf9f5d40e39a37c4ae7284f3fe.r2.dev/library.json",
    params: "ui=0"   /* viewer v74: ui=0 hides every name and all viewer buttons, and does not count stats */
  },
  /* refs from the Orbit dashboard v74, Website page ("Copy link"). They work once viewer v74 is uploaded. */
  compare: {
    tour:  { ref: "8818d1a3a4", alt: "360 photo tour" },               /* the 360 photo tour record */
    splat: { ref: "a73b7ad7c9", alt: "3D scan you can walk through" }  /* the matching Gaussian splat record */
  },
  /* "Results? Take a look" (3 Nov 2026, James: "just show our product there"): up to FOUR large frames of
     finished work, no step texts. Each frame takes ONE of:
       embed  = a live Orbit viewer link (https://orbit-viewer.pages.dev/...). It loads only when the visitor
                taps "Step inside" (one live viewer on the page at a time); poster = the still shown before that.
       media  = a picture (.jpg .webp .png) or a silent looping video (.mp4 .webm), poster = optional still.
     alt = what it shows (for screen readers, no place names). Empty frame = hidden online (a dashed box only on
     your own test server). */
  howto: [
    /* (4 Nov 2026, James) first frame: ref c6c1bdd9bc, starts outside, no poster yet */
    { embed: "https://orbit-viewer.pages.dev/viewer.html?lib=https%3A%2F%2Fpub-fedb6cdf9f5d40e39a37c4ae7284f3fe.r2.dev%2Flibrary.json&ref=c6c1bdd9bc&names=0&start=outside&move=still",
      poster: "", alt: "A finished Orbit result you can look around in 3D, seen from outside." },
    /* (4 Nov 2026, James) the new result, shown above the studio + kitchen one */
    { embed: "https://orbit-viewer.pages.dev/viewer.html?lib=https%3A%2F%2Fpub-fedb6cdf9f5d40e39a37c4ae7284f3fe.r2.dev%2Flibrary.json&ref=0d8a130e9d&names=0&start=real&move=still",
      poster: "assets/howto/example-2.webp", alt: "A finished Orbit result you can look around in 3D." },
    { embed: "https://orbit-viewer.pages.dev/viewer.html?lib=https%3A%2F%2Fpub-fedb6cdf9f5d40e39a37c4ae7284f3fe.r2.dev%2Flibrary.json&id=kasteelplein-55-breda-2",
      poster: "assets/howto/example-3.webp", alt: "A finished Orbit scan: walk through a studio and kitchen in 3D." },
    /* (4 Nov 2026, James) fourth frame; names=0 added so the viewer shows no place name (site rule) */
    { embed: "https://orbit-viewer.pages.dev/viewer.html?lib=https%3A%2F%2Fpub-fedb6cdf9f5d40e39a37c4ae7284f3fe.r2.dev%2Flibrary.json&id=de-bnb&names=0",
      poster: "", alt: "A finished Orbit result you can look around in 3D." }
  ],
  /* no longer used (the old three demo cards, before 30 Oct late night) */
  demos: [
    { alt: "", poster: "", embed: `` },
    { alt: "", poster: "", embed: `` },
    { alt: "", poster: "", embed: `` }
  ],
  /* Partners bar, just above "Contact us" (30 Oct 2026). One line per partner, in the order shown.
     logo = a picture in assets/partners/ (a transparent .png or .svg works best; it is shown in white),
     name = the partner's name (read out to blind visitors; shown as text when there is no logo),
     url  = optional link to their website (opens in a new tab).
     Example:  { name: "Partner name", logo: "assets/partners/partner.svg", url: "https://example.com" },
     Empty list = the bar is hidden on the real site (on the local test server you see 5 empty boxes). */
  partners: [
  ],
  /* Portfolio page (portfolio.html): one card per project. No place names or addresses.
     title = short and general ("Family home"), what = what was made, poster = a still picture,
     link  = where "Look around" goes (a part of the main page, or a full Orbit viewer link). */
  portfolio: [
    { title: "Family home", what: "3D scan you can walk through + 3D model", poster: "assets/stage/hero-interior.jpg", alt: "Kitchen and garden doors of a family home, scanned in 3D", link: "index.html#walk" },
    { title: "Studio", what: "360 photo tour + 3D scan", poster: "assets/stage/still-compare.webp", alt: "A bright room with a tall window, scanned in 3D", link: "index.html#compare" }
  ],
  /* Legal company details (4 Nov 2026, James): shown in every footer and on legal.html / privacy.html.
     address = the business address as registered at KvK (street + number, postcode + town). Dutch law asks for
     it on the website. While it is empty, the address line stays hidden (fill it in before going public). */
  company: { address: "" },
  email: "Jack@orbit3d.nl",   /* customer contact = Jack (James, 3 Nov 2026). James@orbit3d.nl only on About us */
  emailCc: "James@orbit3d.nl", /* copy of every form email (James, 4 Nov 2026); used by the email-app fallback in js/book.js */
  /* "Book a call / Via email" form (js/book.js). endpoint = the calendar's booking address (https) once it is
     set up; while empty, Send opens an email to the address above with everything filled in.
     times = stand-in call times shown after a day is picked (the calendar's free times replace them later). */
  /* live: false = the buttons are greyed out and do nothing, with "For now, contact us via <lockedEmail>" under
     them (James, 4 Nov 2026, until the booking is set up). Set to true to switch the form on again. */
  lockedEmail: "James@orbit3d.nl",
  /* (4 Nov 2026, James) Jack set up the Google part (backend/booking/SETUP.md): live again, with his web app address */
  booking: { live: true, endpoint: "https://script.google.com/macros/s/AKfycby3q9ZCfGQ3WQBuOMAO0KfO8LJmiEh1O-m9wX8R_HW_dWgbGcdnvyuRbmaZjtuLTOpj/exec", times: ["09:30", "11:00", "13:30", "15:00", "16:30"], days: 10 },
  /* true = empty windows show which name to fill in (handy while building).
     Set to false before the site goes public. */
  showSlotHints: false
};
