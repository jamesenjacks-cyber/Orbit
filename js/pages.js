/* The pages of their own (Portfolio, Pricing, About us): draws the portfolio cards from
   ORBIT_SITE.portfolio (js/embeds.js). The top bar and email links are done by js/main.js. */
(function () {
  "use strict";
  var list = document.querySelector("[data-folio]");
  if (!list) return;
  var items = ((window.ORBIT_SITE || {}).portfolio || []).filter(function (p) { return p && p.title; });
  var safe = function (u) { return /^(https?:\/\/|index\.html|#|[\w\-]+\.html)/i.test(u || "") ? u : ""; };
  items.forEach(function (p, i) {
    var li = document.createElement("li");
    li.className = "folio__item";
    var link = safe(p.link);
    var card = document.createElement(link ? "a" : "div");
    card.className = "folio__card";
    if (link) {
      card.href = link;
      if (/^https?:/i.test(link)) { card.target = "_blank"; card.rel = "noopener"; }
    }
    var frame = document.createElement("div");
    frame.className = "folio__frame bezel";
    var core = document.createElement("div");
    core.className = "folio__pic bezel__core";
    if (p.poster) {
      var img = document.createElement("img");
      img.src = p.poster; img.alt = p.alt || ""; img.loading = i < 2 ? "eager" : "lazy"; img.decoding = "async";
      core.appendChild(img);
    }
    frame.appendChild(core);
    var t = document.createElement("h2"); t.className = "folio__title"; t.textContent = p.title;
    var w = document.createElement("p"); w.className = "folio__what"; w.textContent = p.what || "";
    card.appendChild(frame); card.appendChild(t); card.appendChild(w);
    if (link) {
      var go = document.createElement("span"); go.className = "folio__go"; go.textContent = "Look around";
      card.appendChild(go);
    }
    li.appendChild(card);
    list.appendChild(li);
  });
})();
