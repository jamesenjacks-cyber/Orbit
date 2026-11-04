/* Page copy and live viewer messages share one language preference. */
(function () {
  'use strict';
  var entries = window.ORBIT_TRANSLATIONS || {};
  var normalize = function (s) { return s.replace(/\s+/g, ' ').trim(); };
  var exact = new Map(), folded = new Map(), patterns = [], cache = new WeakMap();
  Object.keys(entries).forEach(function (id) {
    var entry = entries[id];
    [entry.was, entry.en, entry.nl].filter(Boolean).forEach(function (source) {
      var key = normalize(source);
      if (!exact.has(key)) exact.set(key, entry);
      if (!folded.has(key.toLowerCase())) folded.set(key.toLowerCase(), entry);
      // Some viewer panels copy textContent, which joins the text around <br>.
      if (source.includes('\n')) exact.set(normalize(source.replace(/\n/g, '')), entry);
      if (/\[[^\]]+\]/.test(source)) {
        var names = [], parts = key.split(/(\[[^\]]+\])/g);
        var regex = parts.map(function (p) {
          if (/^\[/.test(p)) { names.push(p); return '(.+?)'; }
          return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('');
        patterns.push({ regex: new RegExp('^' + regex + '$'), names: names, entry: entry });
      }
    });
  });
  var lang = 'en';
  try { lang = localStorage.getItem('orbit-language') === 'nl' ? 'nl' : 'en'; } catch (_) {}
  var requested = new URLSearchParams(location.search).get('lang');
  if (requested === 'en' || requested === 'nl') lang = requested;

  function translate(source, depth) {
    var key = normalize(source), entry = exact.get(key) || folded.get(key.toLowerCase());
    if (entry) return entry[lang];
    if (!depth) {
      for (var i = 0; i < patterns.length; i++) {
        var p = patterns[i], match = key.match(p.regex);
        var slot = 0;
        if (match) return p.entry[lang].replace(/\[[^\]]+\]/g, function (name) {
          var n = p.names.indexOf(name);
          if (n < 0) n = slot;
          slot++;
          return n < 0 ? name : translate(match[n + 1], 1);
        });
      }
    }
    // Subpage document titles include the brand after the translated page name.
    if (key.endsWith(' | Orbit 3D')) return translate(key.slice(0, -11), 1) + ' | Orbit 3D';
    return source;
  }
  function updateValue(node, attr) {
    var value = attr ? node.getAttribute(attr) : node.nodeValue;
    if (!value || !value.trim()) return;
    var state = cache.get(node) || {}, k = attr || '#text', old = state[k];
    var source = old && value === old.rendered ? old.source : value;
    var translated = translate(source, 0);
    // Preserve spacing around inline runs and icons.
    var output = source.match(/^\s*/)[0] + translated.trim() + source.match(/\s*$/)[0];
    if (output !== value) {
      if (attr) node.setAttribute(attr, output); else node.nodeValue = output;
    }
    state[k] = { source: source, rendered: output }; cache.set(node, state);
  }
  function renderKey(el) {
    var entry = entries[el.dataset.i18n];
    if (!entry) return;
    var value = entry[lang];
    if (el.dataset.renderedLanguage === lang) return;
    el.replaceChildren();
    value.split('\n').forEach(function (line, i) {
      if (i) el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(line));
    });
    el.dataset.renderedLanguage = lang;
  }
  var attrs = ['aria-label', 'aria-roledescription', 'alt', 'title', 'placeholder', 'data-name'];
  function visit(node) {
    if (node.nodeType === 3) {
      if (!node.parentElement || node.parentElement.closest('script,style,[data-i18n],.language-switch')) return;
      updateValue(node); return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 9) return;
    if (node.nodeType === 1) {
      if (node.matches('script,style,.language-switch')) return;
      attrs.forEach(function (a) { if (node.hasAttribute(a)) updateValue(node, a); });
      if (node.matches('meta[name="description"]')) updateValue(node, 'content');
      if (node.hasAttribute('data-i18n')) { renderKey(node); return; }
    }
    Array.from(node.childNodes).forEach(visit);
  }
  var observer = new MutationObserver(function (records) {
    observer.disconnect();
    var targets = new Set();
    records.forEach(function (r) {
      if (r.type === 'childList') r.addedNodes.forEach(function (n) { targets.add(n); });
      else targets.add(r.target);
    });
    targets.forEach(function (n) { if (n.isConnected) visit(n); });
    observe();
  });
  function observe() {
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: attrs.concat(['content']) });
  }
  function select(next, persist) {
    lang = next === 'nl' ? 'nl' : 'en';
    observer.disconnect();
    document.documentElement.lang = lang;
    visit(document.documentElement);
    document.querySelectorAll('[data-language]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.language === lang));
    });
    if (persist) {
      try { localStorage.setItem('orbit-language', lang); } catch (_) {}
      var url = new URL(location.href); url.searchParams.set('lang', lang);
      history.replaceState(null, '', url);
    }
    // Carry the preference even where browser storage is unavailable.
    document.querySelectorAll('a[href]').forEach(function (a) {
      var raw = a.getAttribute('href');
      if (!raw || raw[0] === '#' || /^(mailto:|tel:|javascript:)/i.test(raw)) return;
      var url = new URL(raw, location.href);
      if (url.origin === location.origin && /\/(index|about|pricing|portfolio|view-design|privacy|legal)\.html$/.test(url.pathname)) {
        url.searchParams.set('lang', lang); a.href = url.href;
      }
    });
    observe();
    document.dispatchEvent(new CustomEvent('orbit:language', { detail: { language: lang } }));
  }
  // (4 Nov 2026, James) No instant jump: the old words fade out and the new ones fade in (css/motion.css,
  // View Transitions; the EN | NL glider slides live meanwhile). Browsers without it, reduced motion or a
  // hidden tab: instant, as before.
  var swapping = false;
  function smoothSelect(next) {
    next = next === 'nl' ? 'nl' : 'en';
    if (next === lang || swapping) return;
    var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || still || document.hidden) { select(next, true); return; }
    swapping = true;
    try {
      var t = document.startViewTransition(function () { select(next, true); });
      t.finished.then(function () { swapping = false; }, function () { swapping = false; });
    } catch (_) { swapping = false; select(next, true); }
  }
  document.querySelectorAll('[data-language]').forEach(function (button) {
    button.addEventListener('click', function () { smoothSelect(button.dataset.language); });
  });
  window.OrbitLanguage = { text: function (s) { return translate(s, 0); }, set: function (l) { smoothSelect(l); } };
  select(lang, false);
})();
