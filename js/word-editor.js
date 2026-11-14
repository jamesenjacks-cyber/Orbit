/* Word editor for the Orbit 3D story site (10 Nov 2026, James: "a program that shows the site exactly how it is,
   with all the scrolling and animations, but with an option to change all the wording. When I toggle English or
   Dutch at the top, I change the words of that version. When done, it saves a download that I give to you").
   Made for James's business partner.

   How it starts: add ?edit to the address (for example http://127.0.0.1:5193/?edit or https://orbit3d.nl/?edit).
   js/site-extras.js then loads this file. Normal visitors never download it.

   How it works:
   - The site's words live in one dictionary (js/translations.js + js/story-nl.js): every text has an entry with an
     English and a Dutch version, and js/language.js shows the version that matches EN | NL. A change here changes
     that dictionary entry IN THIS BROWSER ONLY, for the language that is showing, and the page is drawn again. So
     the change shows everywhere that text is used, also on other pages, and the other language stays as it was.
   - A text without an entry (rare) gets a new one here, marked "new" in the download.
   - Changes are kept on this device (localStorage) until removed, so a reload or another page keeps them.
   - "Download" saves one .json file with every change (page, language, old words, new words, dictionary key).
     James gives that file to Claude Code, which writes the changes into the real site files.
   - Nothing is ever sent anywhere: no server, no upload. Words are put on the page as plain text only.
   The editor's own buttons live in a shadow root (data-orbit-editor), so the site's styles and the EN | NL
   translation never touch them. */
(function () {
  "use strict";
  if (window.OrbitWordEditor) return;
  var API = window.OrbitWordEditor = {};   // filled below (used by the tests)
  var doc = document, STORE = "orbit-word-edits", FLAG = "orbit-edit-on", HELP = "orbit-edit-help-seen";
  var L = null, dict = null, ORIG = {}, edits = {}, mode = "edit", host, root, ui = {}, current = null;
  var ID_OK = /^[A-Za-z0-9_-]{1,80}$/;

  function norm(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function hash(s) {   // short stable key for a text that has no dictionary entry yet
    var h1 = 0x811c9dc5, h2 = 0x12345;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 + c, 2654435761); }
    return "ed" + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
  }
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function langName(l) { return l === "nl" ? "Dutch" : "English"; }
  function pageName() {
    var f = location.pathname.split("/").pop().replace(/\.html$/, "");
    return doc.body.getAttribute("data-page") || (f === "" || f === "index" || f === "en" || f === "nl" ? "home" : f);
  }

  /* ---------- the dictionary side ---------- */
  function original(id, lang, source) {
    var o = ORIG[id];
    return o && typeof o[lang] === "string" ? o[lang] : source;
  }
  function applyOne(e) {
    if (!Object.prototype.hasOwnProperty.call(dict, e.id)) {
      if (!e.made) return false;
      L.define(e.id, { en: e.source, nl: e.source });
    }
    dict[e.id][e.lang] = e.after;
    return true;
  }
  function undoOne(e) {
    if (dict[e.id]) dict[e.id][e.lang] = original(e.id, e.lang, e.source);
  }
  function save() { store(STORE, JSON.stringify({ version: 1, edits: edits })); }
  function list() {
    return Object.keys(edits).map(function (k) { return edits[k]; })
      .sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
  }
  function clean(e) {   // anything read back from storage or a file: plain strings only, known shapes only
    if (!e || typeof e !== "object") return null;
    if (!ID_OK.test(String(e.id || "")) || (e.lang !== "en" && e.lang !== "nl")) return null;
    // (QC-20261114-1721 L1) never a built-in name like __proto__: only the dictionary's own entries count
    if (/^(__proto__|constructor|prototype)$/.test(e.id)) return null;
    if (dict[e.id] && !Object.prototype.hasOwnProperty.call(dict, e.id)) return null;
    if (typeof e.after !== "string" || e.after.length > 5000) return null;
    var s = typeof e.source === "string" ? e.source.slice(0, 5000) : "";
    if (!dict[e.id] && !(e.made && s)) return null;
    return { id: e.id, lang: e.lang, after: e.after, source: s, made: !!e.made && !ORIG[e.id],
      before: typeof e.before === "string" ? e.before.slice(0, 5000) : original(e.id, e.lang, s),
      page: String(e.page || "").slice(0, 40), where: String(e.where || "").slice(0, 120), at: +e.at || Date.now() };
  }
  function restore(raw) {
    var n = 0, data;
    try { data = JSON.parse(raw); } catch (err) { return -1; }
    var items = data && (Array.isArray(data.changes) ? data.changes : data.edits && typeof data.edits === "object"
      ? Object.keys(data.edits).map(function (k) { return data.edits[k]; }) : null);
    if (!items) return -1;
    items.forEach(function (raw) {
      var e = clean(raw);
      if (e && applyOne(e)) { edits[e.lang + "|" + e.id] = e; n++; }
    });
    return n;
  }

  /* ---------- finding the text under the finger / mouse ---------- */
  function seen(el) {
    var cs = getComputedStyle(el);
    if (cs.visibility === "hidden") return 0;
    var o = 1;
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
      o *= parseFloat(getComputedStyle(e).opacity) || 0;
      if (o < 0.15) return 0;
    }
    return o;
  }
  var range = doc.createRange();
  function textAt(x, y) {
    var best = null, bestO = 0, bestBox = null;
    var w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
    for (var n = w.nextNode(); n; n = w.nextNode()) {
      if (!/\S/.test(n.nodeValue)) continue;
      var el = n.parentElement;
      if (!el || el.closest("script,style,noscript,template,[data-orbit-editor],.language-switch,.sr-only")) continue;
      // quick skip: the first parent with a real box (the site's <orbit-text> wrappers have none of their own)
      var bx = el;
      while (bx && getComputedStyle(bx).display === "contents") bx = bx.parentElement;
      if (!bx) continue;
      var r = bx.getBoundingClientRect();
      if (x < r.left - 4 || x > r.right + 4 || y < r.top - 4 || y > r.bottom + 4) continue;
      range.selectNodeContents(n);
      var rects = range.getClientRects(), hit = null;
      for (var i = 0; i < rects.length; i++) {
        var q = rects[i];
        if (q.width && x >= q.left - 3 && x <= q.right + 3 && y >= q.top - 3 && y <= q.bottom + 3) { hit = q; break; }
      }
      if (!hit) continue;
      var o = seen(el);
      if (o && o >= bestO) { best = n; bestO = o; bestBox = range.getBoundingClientRect(); }
    }
    if (best) {
      var key = best.parentElement.closest("[data-i18n]");
      if (key && dict[key.dataset.i18n]) {
        range.selectNodeContents(key);
        return { el: key, key: key.dataset.i18n, box: range.getBoundingClientRect() };
      }
      return { node: best, box: bestBox };
    }
    // an empty form field: its grey example text (placeholder)
    var f = doc.elementFromPoint(x, y);
    if (f && /^(INPUT|TEXTAREA)$/.test(f.tagName) && f.getAttribute("placeholder") && !f.value && !f.closest("[data-orbit-editor]"))
      return { node: f, attr: "placeholder", box: f.getBoundingClientRect() };
    return null;
  }
  function whereOf(el) {
    var bits = [pageName()];
    var w = el.closest && el.closest("[data-words]");
    if (w) bits.push("story chapter " + w.getAttribute("data-words"));
    else {
      var s = el.closest && el.closest("section[id], [id]");
      if (s) bits.push("#" + s.id);
    }
    bits.push(el.tagName ? el.tagName.toLowerCase() : "text");
    return bits.join(" / ");
  }
  function describe(pick) {
    var lang = L.lang(), id, source, now, made = false, multi = false, el;
    if (pick.key) {
      id = pick.key; el = pick.el; multi = true;
      source = original(id, "en", dict[id].en);
      now = typeof dict[id][lang] === "string" ? dict[id][lang] : String(dict[id].en || "");
    } else {
      el = pick.attr ? pick.node : pick.node.parentElement;
      source = norm(L.sourceOf(pick.node, pick.attr));
      id = L.entryOf(source);
      now = norm(pick.attr ? pick.node.getAttribute(pick.attr) : pick.node.nodeValue);
      if (id && dict[id] && typeof dict[id][lang] === "string" && norm(dict[id][lang]) === now) now = dict[id][lang];
      if (!id) { id = hash(source); made = true; }
      else if (!ORIG[id]) made = true;   // an entry this editor made earlier
      multi = now.indexOf("\n") > -1;
    }
    if (!ID_OK.test(id)) return null;
    var e = edits[lang + "|" + id];
    return { id: id, lang: lang, source: source, made: made, multi: multi, now: now,
      before: e ? e.before : (made ? now : original(id, lang, now)), el: el, where: whereOf(el) };
  }

  /* ---------- the editor's own look ---------- */
  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box;font-family:Geist,system-ui,-apple-system,'Segoe UI',sans-serif}",
    ".bar{position:fixed;left:50%;bottom:max(14px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:3;display:flex;align-items:center;gap:6px;",
    "  padding:6px;border-radius:22px;background:rgba(17,19,22,.92);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);",
    "  box-shadow:0 10px 40px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.12);color:#f2f2f2;max-width:calc(100vw - 32px);flex-wrap:wrap;justify-content:center}",
    ".tag{display:flex;align-items:center;gap:8px;padding:0 10px 0 8px;font-size:13px;font-weight:600;white-space:nowrap}",
    ".dot{width:9px;height:9px;border-radius:50%;background:#ff5a2a;box-shadow:0 0 0 4px rgba(255,90,42,.25)}",
    ".lang{padding:3px 8px;border-radius:10px;background:rgba(255,255,255,.1);font:600 11px/1.2 ui-monospace,Menlo,monospace;letter-spacing:.06em}",
    "button{appearance:none;border:0;cursor:pointer;min-height:40px;padding:0 14px;border-radius:16px;background:rgba(255,255,255,.08);color:#f2f2f2;font-size:13px;font-weight:500;white-space:nowrap}",
    "button:hover{background:rgba(255,255,255,.16)}",
    "button:focus-visible,textarea:focus-visible{outline:2px solid #ff8a5c;outline-offset:2px}",
    "button.go{background:#ff5a2a;color:#111316;font-weight:600}button.go:hover{background:#ff7448}",
    "button.x{width:40px;padding:0;font-size:18px}",
    ".seg{display:flex;padding:3px;border-radius:18px;background:rgba(255,255,255,.07)}",
    ".seg button{min-height:34px;border-radius:14px;background:none;padding:0 12px}",
    ".seg button[aria-pressed=true]{background:#f2f2f2;color:#111316}",
    ".n{display:inline-block;min-width:20px;margin-left:6px;padding:1px 6px;border-radius:9px;background:rgba(255,90,42,.9);color:#111316;font-size:11px;font-weight:700}",
    ".box{position:fixed;z-index:1;pointer-events:none;border:2px dashed #ff8a5c;border-radius:10px;background:rgba(255,90,42,.08);opacity:0;transition:opacity .12s}",
    ".box.on{opacity:1}",
    ".shade{position:fixed;inset:0;z-index:4;background:rgba(5,6,8,.45);display:none;align-items:center;justify-content:center;padding:16px}",
    ".shade.on{display:flex}",
    ".card{width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;border-radius:26px;padding:22px;background:rgba(20,22,26,.97);color:#f2f2f2;",
    "  box-shadow:0 24px 80px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,255,255,.12)}",
    "h3{margin:0 0 4px;font-size:19px;font-weight:600;letter-spacing:-.01em}",
    ".sub{margin:0 0 14px;color:#b7bac0;font-size:13px;line-height:1.45}",
    ".was{margin:0 0 12px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.05);color:#b7bac0;font-size:13px;line-height:1.45;white-space:pre-wrap}",
    ".was b{display:block;margin-bottom:2px;color:#8d9096;font:600 10px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase}",
    "textarea{width:100%;min-height:96px;resize:vertical;padding:12px 14px;border-radius:16px;border:0;background:#0b0c0e;color:#fff;font-size:16px;line-height:1.45;",
    "  box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}",
    ".row{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:14px}",
    ".row .left{margin-right:auto}",
    ".note{margin:10px 0 0;color:#8d9096;font-size:12px;line-height:1.45}",
    ".item{padding:12px 0;border-top:1px solid rgba(255,255,255,.08);display:grid;grid-template-columns:1fr auto;gap:4px 12px;align-items:start}",
    ".item .meta{grid-column:1/-1;color:#8d9096;font:600 10px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase}",
    ".item .old{color:#8d9096;text-decoration:line-through;font-size:13px;white-space:pre-wrap;word-break:break-word}",
    ".item .new{color:#fff;font-size:14px;white-space:pre-wrap;word-break:break-word}",
    ".item button{min-height:34px;grid-row:2/4;grid-column:2}",
    ".empty{color:#8d9096;font-size:14px;padding:12px 0}",
    ".toast{position:fixed;left:50%;top:84px;transform:translate(-50%,-8px);z-index:5;padding:10px 16px;border-radius:16px;background:#f2f2f2;color:#111316;",
    "  font-size:13px;font-weight:600;opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;max-width:calc(100vw - 32px);text-align:center}",
    ".toast.on{opacity:1;transform:translate(-50%,0)}",
    "ol{margin:0 0 6px;padding-left:20px;color:#d6d8dc;font-size:14px;line-height:1.6}",
    ".hide{display:none!important}",
    ".dl .short{display:none}",
    "@media (max-width:560px){.bar{left:16px;right:16px;transform:none;max-width:none;gap:4px;flex-wrap:nowrap;justify-content:space-between}.tag{display:none}",
    "  button{padding:0 9px}.seg button{padding:0 9px}.n{margin-left:4px}.help{display:none}.dl{width:40px;padding:0;font-size:18px}.dl .long{display:none}.dl .short{display:inline}.shade{align-items:flex-end;padding:0}",
    "  .card{border-radius:26px 26px 0 0;max-height:85vh;padding:20px 16px max(20px,env(safe-area-inset-bottom))}}",
    "@media (prefers-reduced-motion:reduce){.box,.toast{transition:none}}"
  ].join("\n");

  function h(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(text, cls, fn) { var b = h("button", cls, text); b.type = "button"; b.addEventListener("click", fn); return b; }

  function buildUI() {
    host = doc.createElement("div");
    host.setAttribute("data-orbit-editor", "");
    host.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000";
    doc.body.appendChild(host);
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var st = h("style"); st.textContent = CSS; root.appendChild(st);

    ui.box = h("div", "box"); root.appendChild(ui.box);

    var bar = h("div", "bar"); bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Word editor");
    var tag = h("div", "tag"); tag.appendChild(h("span", "dot"));
    tag.appendChild(h("span", "t", "Editing words")); ui.lang = h("span", "lang", "NL"); tag.appendChild(ui.lang);
    bar.appendChild(tag);
    var seg = h("div", "seg");
    ui.mEdit = btn("Edit", "", function () { setMode("edit"); });
    ui.mUse = btn("Use site", "", function () { setMode("use"); });
    ui.mEdit.title = "Tap a text to change it"; ui.mUse.title = "Buttons and links work normally (to open a menu or panel first)";
    seg.appendChild(ui.mEdit); seg.appendChild(ui.mUse); bar.appendChild(seg);
    ui.listBtn = btn("Changes", "", openList); ui.count = h("span", "n", "0"); ui.listBtn.appendChild(ui.count);
    bar.appendChild(ui.listBtn);
    var dl = btn("", "go dl", download); dl.setAttribute("aria-label", "Download");
    dl.appendChild(h("span", "long", "Download")); dl.appendChild(h("span", "short", "↓"));
    bar.appendChild(dl);
    var help = btn("?", "x help", openHelp); help.setAttribute("aria-label", "How it works"); bar.appendChild(help);
    var close = btn("×", "x", quit); close.setAttribute("aria-label", "Stop editing"); close.title = "Stop editing (your changes stay saved on this device)";
    bar.appendChild(close);
    root.appendChild(bar);

    // the edit card
    ui.shade = h("div", "shade"); ui.shade.addEventListener("click", function (e) { if (e.target === ui.shade) closeCard(); });
    ui.card = h("div", "card"); ui.card.setAttribute("role", "dialog"); ui.card.setAttribute("aria-modal", "true");
    ui.shade.appendChild(ui.card); root.appendChild(ui.shade);

    ui.toast = h("div", "toast"); ui.toast.setAttribute("role", "status"); root.appendChild(ui.toast);
    ui.file = h("input"); ui.file.type = "file"; ui.file.accept = ".json,application/json"; ui.file.className = "hide";
    ui.file.addEventListener("change", loadFile); root.appendChild(ui.file);

    root.addEventListener("keydown", function (e) { if (e.key === "Escape" && ui.shade.classList.contains("on")) { e.stopPropagation(); closeCard(); } });
  }

  var toastT;
  function say(text) {
    ui.toast.textContent = text; ui.toast.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(function () { ui.toast.classList.remove("on"); }, 2600);
  }
  function update() {
    var lang = L.lang();
    ui.lang.textContent = lang.toUpperCase();
    ui.lang.title = "You are changing the " + langName(lang) + " words. Switch with EN | NL at the top.";
    var n = Object.keys(edits).length;
    ui.count.textContent = String(n);
    ui.mEdit.setAttribute("aria-pressed", String(mode === "edit"));
    ui.mUse.setAttribute("aria-pressed", String(mode === "use"));
  }
  function setMode(m) { mode = m; hideBox(); update(); say(m === "edit" ? "Tap any text to change it" : "The site works normally now. Tap Edit to change words again"); }

  function openCard(build) {
    ui.card.replaceChildren(); build(ui.card);
    ui.shade.classList.add("on"); hideBox();
  }
  function closeCard() { ui.shade.classList.remove("on"); current = null; }

  function openEdit(info) {
    current = info;
    openCard(function (c) {
      c.appendChild(h("h3", "", "Change the " + langName(info.lang) + " words"));
      c.appendChild(h("p", "sub", info.lang === "nl"
        ? "This changes the Dutch version only. Switch to EN at the top to change the English words."
        : "This changes the English version only. Switch to NL at the top to change the Dutch words."));
      var was = h("div", "was"); was.appendChild(h("b", "", "Words on the live site")); was.appendChild(doc.createTextNode(info.before));
      c.appendChild(was);
      var ta = h("textarea"); ta.value = info.now; ta.setAttribute("aria-label", "New words"); ta.spellcheck = true;
      ta.lang = info.lang; c.appendChild(ta);
      c.appendChild(h("p", "note", (info.multi ? "A new line here is a new line on the site. " : "") +
        "Enter saves" + (info.multi ? " (Shift + Enter for a new line)" : "") + ". The same words elsewhere on the site change with it."));
      var row = h("div", "row");
      var back = btn("Back to the live words", "left", function () { commit(info, info.before); });
      if (norm(info.now) === norm(info.before)) back.classList.add("hide");
      row.appendChild(back);
      row.appendChild(btn("Cancel", "", closeCard));
      row.appendChild(btn("Save", "go", function () { commit(info, ta.value); }));
      c.appendChild(row);
      ta.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); commit(info, ta.value); }
      });
      setTimeout(function () { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 30);
    });
  }
  function commit(info, text) {
    var after = info.multi ? text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : norm(text);
    var k = info.lang + "|" + info.id;
    if (!after) { say("Empty words are not allowed. Type something, or press Cancel"); return; }
    if (norm(after) === norm(info.before)) {
      if (edits[k]) { undoOne(edits[k]); delete edits[k]; }
      if (info.made && dict[info.id]) dict[info.id][info.lang] = info.before;
      say("Back to the live words");
    } else {
      var e = { id: info.id, lang: info.lang, after: after, source: info.source, made: info.made, before: info.before,
        page: (edits[k] && edits[k].page) || pageName(), where: (edits[k] && edits[k].where) || info.where, at: (edits[k] && edits[k].at) || Date.now() };
      applyOne(e); edits[k] = e;
      say("Saved. " + Object.keys(edits).length + " change" + (Object.keys(edits).length === 1 ? "" : "s") + " so far");
    }
    save(); closeCard(); L.refresh(); update();
  }

  function openList() {
    openCard(function (c) {
      var all = list();
      c.appendChild(h("h3", "", "Your changes (" + all.length + ")"));
      c.appendChild(h("p", "sub", "Kept on this device. When you are done, press Download and send the file to James."));
      if (!all.length) c.appendChild(h("div", "empty", "No changes yet. Tap Edit, then tap any text on the site."));
      all.forEach(function (e) {
        var it = h("div", "item");
        it.appendChild(h("div", "meta", (e.lang === "nl" ? "NL" : "EN") + " · " + (e.where || e.page)));
        it.appendChild(h("div", "old", e.before));
        it.appendChild(h("div", "new", e.after));
        it.appendChild(btn("Undo", "", function () {
          undoOne(e); delete edits[e.lang + "|" + e.id]; save(); L.refresh(); update(); openList();
        }));
        c.appendChild(it);
      });
      var row = h("div", "row");
      row.appendChild(btn("Open a saved file", "left", function () { ui.file.click(); }));
      row.appendChild(btn("How it works", "", openHelp));
      if (all.length) row.appendChild(btn("Remove all", "", function () {
        if (!confirm("Remove all " + all.length + " changes? The site goes back to the live words.")) return;
        all.forEach(undoOne); edits = {}; save(); L.refresh(); update(); openList();
      }));
      row.appendChild(btn("Close", "", closeCard));
      if (all.length) row.appendChild(btn("Download", "go", download));
      c.appendChild(row);
    });
  }
  function openHelp() {
    store(HELP, "1");
    openCard(function (c) {
      c.appendChild(h("h3", "", "Change the words of the site"));
      var ol = h("ol");
      ["Pick EN or NL at the top. You change the words of the language that is showing.",
       "Scroll the site as normal. Tap (or click) any text, change it, press Save. The page shows it at once.",
       "To reach a text inside a menu or panel: tap \"Use site\", open it, then tap \"Edit\" again.",
       "Your changes stay on this device, also after closing the page. \"Changes\" shows the list, with Undo.",
       "Done? Press Download and send the file to James. He gives it to Claude, who puts the words on the real site."
      ].forEach(function (t) { ol.appendChild(h("li", "", t)); });
      c.appendChild(ol);
      c.appendChild(h("p", "note", "Nothing you type here goes online. Only the file you send counts."));
      var row = h("div", "row"); row.appendChild(btn("Start", "go", closeCard)); c.appendChild(row);
    });
  }

  function stamp() {
    var d = new Date(), p = function (n) { return ("0" + n).slice(-2); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + "." + p(d.getMinutes());
  }
  function download() {
    var all = list();
    if (!all.length) { say("No changes yet"); return; }
    var data = {
      file: "Orbit 3D website: wording changes",
      howToUse: "James: give this file to Claude Code (/orbit3dlite) and ask to apply these wording changes.",
      made: new Date().toISOString(), version: 1, count: all.length,
      changes: all.map(function (e) {
        return { language: e.lang === "nl" ? "Dutch" : "English", lang: e.lang, page: e.page, where: e.where,
          before: e.before, after: e.after, id: e.id, made: e.made || undefined, source: e.source,
          englishOfThisText: e.lang === "nl" ? (dict[e.id] ? dict[e.id].en : e.source) : undefined };
      })
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = doc.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "Orbit wording changes " + stamp() + ".json";
    doc.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    say("Downloaded. Send that file to James");
  }
  function loadFile() {
    var f = ui.file.files && ui.file.files[0];
    ui.file.value = "";
    if (!f) return;
    if (f.size > 2e6) { say("That file is too big to be a wording file"); return; }
    var r = new FileReader();
    r.onload = function () {
      var n = restore(String(r.result));
      if (n < 0) { say("That is not a wording file"); return; }
      save(); L.refresh(); update(); openList();
      say(n + " change" + (n === 1 ? "" : "s") + " loaded");
    };
    r.readAsText(f);
  }
  function quit() {
    store(FLAG, null);
    try { sessionStorage.removeItem(FLAG); } catch (e) {}
    var u = new URL(location.href); u.searchParams.delete("edit");
    location.href = u.href;   // reload without the editor: the live words again (changes stay saved here)
  }

  /* ---------- page clicks and the hover outline ---------- */
  function hideBox() { ui.box.classList.remove("on"); }
  function showBox(b) {
    var s = ui.box.style;
    s.left = (b.left - 4) + "px"; s.top = (b.top - 3) + "px"; s.width = (b.width + 8) + "px"; s.height = (b.height + 6) + "px";
    ui.box.classList.add("on");
  }
  function ours(e) { return e.composedPath && e.composedPath().indexOf(host) > -1; }
  function passes(e) {   // the EN | NL switch always works, so the partner can change language while editing
    var t = e.target;
    return ours(e) || (t && t.closest && t.closest(".language-switch,[data-language]"));
  }
  function onClick(e) {
    if (mode !== "edit" || ui.shade.classList.contains("on") || passes(e)) return;
    if (!e.isTrusted || (e.detail === 0 && !e.clientX && !e.clientY)) return;   // keyboard "clicks" act normally
    var pick = textAt(e.clientX, e.clientY);
    if (!pick) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    var info = describe(pick);
    if (info) openEdit(info);
  }
  var hoverQ = false, hx = 0, hy = 0;
  function onMove(e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    hx = e.clientX; hy = e.clientY;
    if (hoverQ) return;
    hoverQ = true;
    setTimeout(function () {
      hoverQ = false;
      if (mode !== "edit" || ui.shade.classList.contains("on")) { hideBox(); return; }
      var t = doc.elementFromPoint(hx, hy);
      if (t && (t === host || (t.closest && t.closest(".language-switch")))) { hideBox(); return; }
      var pick = textAt(hx, hy);
      if (pick) showBox(pick.box); else hideBox();
    }, 70);
  }
  function blockUp(e) {   // the story's own drag / tap handlers should not fire on a text being picked
    if (mode !== "edit" || ui.shade.classList.contains("on") || passes(e)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (textAt(e.clientX, e.clientY)) { e.stopPropagation(); }
  }

  API.textAt = function (x, y) { return textAt(x, y); };
  API.mode = function () { return mode; };
  function start() {
    L = window.OrbitLanguage; dict = window.ORBIT_TRANSLATIONS;
    if (!L || !L.entryOf || !dict) { setTimeout(start, 120); return; }
    Object.keys(dict).forEach(function (id) { ORIG[id] = { en: dict[id].en, nl: dict[id].nl }; });
    var raw = load(STORE);
    if (raw) restore(raw);
    buildUI();
    L.refresh();
    update();
    addEventListener("click", onClick, true);
    addEventListener("pointerdown", blockUp, true);
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("scroll", hideBox, { passive: true });
    doc.addEventListener("orbit:language", function () { if (host) update(); });
    if (!load(HELP)) openHelp();
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();
})();
