/* Book a call / Via email (3 Nov 2026, James). The form lives in src/parts/book.html.
   Buttons with data-book-open="call" | "email" open it (a drop-down under the button row) in that mode;
   pressing the open one again closes it. Day and time chips are made here.
   Settings in js/embeds.js, ORBIT_SITE.booking:
     endpoint: ""   the Google Apps Script web app address (https://script.google.com/macros/s/.../exec, see
                    backend/booking/SETUP.md). Empty or any other address = open an email to ORBIT_SITE.email instead.
     times: [...]   stand-in times, only shown when the calendar can not be reached (then Send still checks them).
     days: 10       how many working days ahead to offer. */
(function () {
  "use strict";
  var box = document.querySelector("[data-book]");
  if (!box) return;
  var site = window.ORBIT_SITE || {};
  var cfg = site.booking || {};
  var form = box.querySelector("[data-book-form]");
  var daysEl = box.querySelector("[data-book-days]");
  var timesWrap = box.querySelector("[data-book-times]");
  var timesEl = box.querySelector("[data-book-times-row]");
  var status = box.querySelector("[data-book-status]");
  var openers = Array.prototype.slice.call(document.querySelectorAll("[data-book-open]"));
  /* (4 Nov 2026, James: "keep everything the way it is but grey it out and don't make the button work ... when I
     tell you that I already set it up you can just remove the limit") ORBIT_SITE.booking.live (js/embeds.js):
     false = the Book a call / Via email buttons stay in place but greyed out and do nothing, with a line under
     them: "For now, contact us via <ORBIT_SITE.lockedEmail>". true = the form works as before. */
  if (cfg.live !== true) {
    var mail = typeof site.lockedEmail === "string" && /^[^\s@<>"',;:?&=]+@[^\s@<>"',;:?&=]+\.[A-Za-z]{2,}$/.test(site.lockedEmail) ? site.lockedEmail : "";
    var rows = [];
    openers.forEach(function (b) {
      b.classList.add("is-locked");
      b.setAttribute("aria-disabled", "true");
      b.removeAttribute("data-magnet");
      b.addEventListener("click", function (e) { e.preventDefault(); e.stopImmediatePropagation(); }, true);
      var row = b.parentElement;
      if (row && rows.indexOf(row) < 0) rows.push(row);
    });
    if (mail) rows.forEach(function (row) {
      var p = document.createElement("p");
      p.className = "book__locked";
      p.appendChild(document.createTextNode("For now, contact us via "));
      var a = document.createElement("a");
      a.href = "mailto:" + mail;
      a.textContent = mail;
      p.appendChild(a);
      row.insertAdjacentElement("afterend", p);
    });
    box.hidden = true;
    return;
  }
  var times = Array.isArray(cfg.times) && cfg.times.length ? cfg.times : ["09:30", "11:00", "13:30", "15:00", "16:30"];
  var dayCount = Math.min(Math.max(+cfg.days || 10, 1), 30);
  var mode = "call", open = false, pickedDay = "", pickedTime = "";
  /* (4 Nov 2026) the real calendar: backend/booking/Code.gs (Google Apps Script in Jack's account).
     GET endpoint?action=slots -> { ok, days: [{ date: "yyyy-mm-dd", times: ["09:30", ...] }] }.
     slots = null (not asked / failed: the stand-in days + times show) | the free days. */
  var endpoint = typeof cfg.endpoint === "string" && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(cfg.endpoint) ? cfg.endpoint : "";
  var slots = null, slotsAsked = false;
  var T = function (s) { return window.OrbitLanguage ? window.OrbitLanguage.text(s) : s; };

  function lang() { return document.documentElement.lang === "nl" ? "nl-NL" : "en-GB"; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function timeout(ms) { return new Promise(function (_, no) { setTimeout(function () { no(new Error("timeout")); }, ms); }); }
  function getJSON(url, opts) {
    return Promise.race([fetch(url, opts).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }), timeout(15000)]);
  }
  function askSlots(force) {
    if (!endpoint || (slotsAsked && !force)) return;
    slotsAsked = true;
    daysEl.setAttribute("aria-busy", "true");
    if (!slots) note(T("Looking for free times..."));
    getJSON(endpoint + "?action=slots", { method: "GET", credentials: "omit", cache: "no-store" })
      .then(function (r) {
        if (!r || r.ok !== true || !Array.isArray(r.days)) throw new Error("bad");
        // (QC-20261104-1500 L1) only real dates (no 2026-02-31) and real times (00:00-23:59)
        slots = r.days.filter(function (d) {
          if (!d || typeof d.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Array.isArray(d.times)) return false;
          var p = d.date.split("-"), x = new Date(+p[0], +p[1] - 1, +p[2], 12);
          return iso(x) === d.date;
        }).map(function (d) {
          return { date: d.date, times: d.times.filter(function (t) { return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t); }).slice(0, 24) };
        }).filter(function (d) { return d.times.length; }).slice(0, 30);
      })
      .catch(function () { slots = null; })
      .then(function () {
        daysEl.removeAttribute("aria-busy");
        if (slots && pickedDay && !slots.some(function (d) { return d.date === pickedDay; })) { pickedDay = ""; pickedTime = ""; }
        drawDays(); drawTimes();
      });
  }
  function note(text) {
    daysEl.replaceChildren();
    var p = document.createElement("p"); p.className = "book__note"; p.textContent = text;
    daysEl.appendChild(p);
  }
  function timesFor(day) {
    if (!slots) return times;
    var d = slots.filter(function (x) { return x.date === day; })[0];
    return d ? d.times : [];
  }

  function chip(name, value, top, bottom, checked) {
    var label = document.createElement("label");
    label.className = "book__chip";
    var input = document.createElement("input");
    input.type = "radio"; input.name = name; input.value = value; input.checked = !!checked;
    input.className = "book__radio";
    var t = document.createElement("span"); t.className = "book__chip-top"; t.textContent = top;
    label.appendChild(input); label.appendChild(t);
    if (bottom) { var b = document.createElement("span"); b.className = "book__chip-sub"; b.textContent = bottom; label.appendChild(b); }
    return label;
  }

  function drawDays() {
    var wd = new Intl.DateTimeFormat(lang(), { weekday: "short" });
    var dm = new Intl.DateTimeFormat(lang(), { day: "numeric", month: "short" });
    daysEl.replaceChildren();
    if (slots) {
      if (!slots.length) { note(T("No free times in the next two weeks. Send us an email instead.")); return; }
      slots.forEach(function (s) {
        var p = s.date.split("-"), day = new Date(+p[0], +p[1] - 1, +p[2], 12);
        daysEl.appendChild(chip("day", s.date, wd.format(day), dm.format(day), s.date === pickedDay));
      });
      return;
    }
    var d = new Date(); d.setHours(12, 0, 0, 0);
    for (var n = 0; n < dayCount;) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      daysEl.appendChild(chip("day", iso(d), wd.format(d), dm.format(d), iso(d) === pickedDay)); n++;
    }
  }
  function drawTimes() {
    timesEl.replaceChildren();
    timesFor(pickedDay).forEach(function (t) { timesEl.appendChild(chip("time", String(t), String(t), "", String(t) === pickedTime)); });
    timesWrap.hidden = !pickedDay;
  }

  daysEl.addEventListener("change", function (e) {
    pickedDay = e.target.value; pickedTime = "";
    drawTimes(); say("");
  });
  timesEl.addEventListener("change", function (e) { pickedTime = e.target.value; say(""); });
  document.addEventListener("orbit:language", function () { drawDays(); });

  function setMode(m) {
    mode = m === "email" ? "email" : "call";
    box.dataset.mode = mode;
    box.querySelectorAll("[data-book-only]").forEach(function (el) {
      var on = el.getAttribute("data-book-only") === mode;
      el.hidden = !on;
      if (el.tagName === "FIELDSET") el.disabled = !on;
    });
    form.elements.message.required = mode === "email";
  }
  function setOpen(o) {
    open = o;
    box.classList.toggle("is-open", o);
    if (o) box.removeAttribute("inert"); else box.setAttribute("inert", "");
    openers.forEach(function (b) {
      var me = o && b.getAttribute("data-book-open") === mode;
      b.setAttribute("aria-expanded", me ? "true" : "false");
      b.classList.toggle("is-on", me);
    });
  }
  openers.forEach(function (b) {
    b.setAttribute("aria-controls", "book");
    b.setAttribute("aria-expanded", "false");
    b.addEventListener("click", function (e) {
      e.preventDefault();
      var m = b.getAttribute("data-book-open");
      if (open && m === mode) { setOpen(false); return; }
      setMode(m); setOpen(true); say("");
      if (mode === "call") askSlots(false);
      setTimeout(function () {
        try { form.elements.name.focus({ preventScroll: true }); } catch (_) {}
        var r = box.getBoundingClientRect();
        if (r.bottom > innerHeight) box.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
      }, 360);
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && open && box.contains(document.activeElement)) {
      setOpen(false);
      var b = openers.filter(function (x) { return x.getAttribute("data-book-open") === mode; })[0];
      if (b) b.focus();
    }
  });

  function say(text, kind) {
    status.textContent = text;
    status.className = "book__status" + (kind ? " is-" + kind : "");
  }

  function mailto(data) {
    var to = site.email || "";
    var subject = mode === "call"
      ? "Call request: " + data.name + (data.company ? " (" + data.company + ")" : "")
      : "Message from " + data.name + (data.company ? " (" + data.company + ")" : "");
    var lines = ["Name: " + data.name];
    if (data.company) lines.push("Company: " + data.company);
    lines.push("Email: " + data.email);
    if (mode === "call") lines.push("Call: " + data.day + " at " + data.time);
    if (data.message) lines.push("", data.message);
    var cc = typeof site.emailCc === "string" && /^[^\s@<>"',;:?&=]+@[^\s@<>"',;:?&=]+\.[A-Za-z]{2,}$/.test(site.emailCc) ? site.emailCc : "";
    return "mailto:" + encodeURIComponent(to).replace(/%40/g, "@") + "?" + (cc ? "cc=" + encodeURIComponent(cc).replace(/%40/g, "@") + "&" : "") + "subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(lines.join("\n"));
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (mode === "call" && (!pickedDay || !pickedTime)) {
      say(T(pickedDay ? "Pick a time for the call." : "Pick a day for the call."), "error");
      return;
    }
    var data = {
      type: mode,
      name: form.elements.name.value.trim(),
      company: form.elements.company.value.trim(),
      email: form.elements.email.value.trim(),
      message: form.elements.message.value.trim(),
      day: mode === "call" ? pickedDay : "",
      time: mode === "call" ? pickedTime : "",
      language: document.documentElement.lang === "nl" ? "nl" : "en",
      website: form.elements.website ? form.elements.website.value : ""   // hidden spam trap, people leave it empty
    };
    var send = form.querySelector(".book__send");
    if (!endpoint) {
      location.href = mailto(data);
      say(T("Your email app opens with everything filled in. Press send there."), "ok");
      return;
    }
    if (send.disabled) return;
    send.disabled = true; say(T("Sending..."));
    var sentMode = mode;
    // text/plain = a "simple" request: Google Apps Script can not answer the browser's CORS pre-check
    getJSON(endpoint, { method: "POST", credentials: "omit", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(data) })
      .then(function (r) {
        if (r && r.ok === true) {
          form.reset(); pickedDay = ""; pickedTime = ""; slots = null; slotsAsked = false; drawDays(); drawTimes();
          if (sentMode === "call") askSlots(true);
          say(T(sentMode === "call" ? "Thanks! Your call is booked. You get a confirmation by email." : "Thanks! We got your message and reply soon."), "ok");
          return;
        }
        var why = r && r.error;
        if (why === "taken") {
          pickedTime = ""; askSlots(true);
          say(T("That time was just taken. Pick another time."), "error");
        } else if (why === "invalid") {
          say(T("Please check your name, email and message."), "error");
        } else if (why === "busy") {
          say(T("Too many messages right now. Please try again in an hour, or email us."), "error");
        } else throw new Error(why || "unknown");
      })
      .catch(function () {
        location.href = mailto(data);
        say(T("Sending did not work, so your email app opens instead. Press send there."), "error");
      })
      .then(function () { send.disabled = false; });
  });

  setMode("call"); drawDays(); drawTimes();
})();
