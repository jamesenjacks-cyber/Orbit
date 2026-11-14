/* Page copy and live viewer messages share one language preference. */
(function () {
  'use strict';
  var entries = window.ORBIT_TRANSLATIONS || {};
  var normalize = function (s) { return s.replace(/\s+/g, ' ').trim(); };
  var exact = new Map(), folded = new Map(), patterns = [], cache = new WeakMap(), idOf = new Map();
  function register(id) {
    var entry = entries[id];
    idOf.set(entry, id);
    [entry.was, entry.en, entry.nl, entry.ru].filter(Boolean).forEach(function (source) {
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
  }
  Object.keys(entries).forEach(register);
  /* (14 Nov 2026, James) Three languages, picked in a drop-down: Dutch (default), English, Russian. Russian has one
     file of its own, the home page ru.html (orbit3d.nl/ru); on the other pages it rides along as ?lang=ru on the
     address and the page links. Remembered in the browser. A text without a Russian entry (story/js/story-ru.js) shows in
     English. */
  var LANGS = ['nl', 'en', 'ru'], ruOpen = false;
  function known(l) { return LANGS.indexOf(l) >= 0; }
  var lang = 'en', stored = null;
  try { stored = localStorage.getItem('orbit-language'); lang = known(stored) ? stored : 'en'; } catch (_) {}
  var requested = new URLSearchParams(location.search).get('lang');
  if (known(requested)) lang = requested;
  /* (8 Nov 2026, SEO) Story site: every page also exists as a real Dutch file in the same folder (nl.html,
     prijzen.html ...; made by tools/story_seo.py), so Google can find the Dutch words. Such a page says so with
     <link rel="alternate" hreflang="nl">. There the page's own language is the start; a Dutch address always shows
     Dutch, an English one turns Dutch only for a visitor who picked NL before (or ?lang=nl). The EN | NL switch
     still swaps the words in place (no reload, the story keeps its spot) and then moves the address to the other
     language's file. Pages without those links (the big site) work exactly as before. */
  /* (10 Nov 2026, James: "set default to Dutch") The home page is Dutch now: index.html (the address orbit3d.nl)
     = Dutch, en.html = English. Other pages keep their names (pricing.html English, prijzen.html Dutch).
     Each page: [English file, Dutch file]. Same list as PAGES in tools/story_seo.py: change both together. */
  var FILES = { index: ['en', 'index'], pricing: ['pricing', 'prijzen'], about: ['about', 'over-ons'],
    'view-design': ['view-design', 'jouw-ontwerp'], privacy: ['privacy', 'privacyverklaring'], legal: ['legal', 'juridisch'] };
  var fixed = !!document.querySelector('link[rel="alternate"][hreflang="nl"]');
  function pageIn(path, to) {
    var cut = path.lastIndexOf('/') + 1, dir = path.slice(0, cut), file = path.slice(cut).replace(/\.html$/, '') || 'index';
    if (file === 'nl' || file === 'ru') file = 'index';   // the old Dutch home address (a forward) / the Russian home
    var base = null;
    Object.keys(FILES).forEach(function (k) { if (FILES[k][0] === file || FILES[k][1] === file) base = k; });
    if (!base) return null;
    if (base === 'index' && to === 'nl') return dir;   // orbit3d.nl/ itself
    if (base === 'index' && to === 'ru') return dir + 'ru.html';
    if (to === 'ru') to = 'nl';   // other pages in Russian: the Dutch file + ?lang=ru
    return dir + FILES[base][to === 'nl' ? 1 : 0] + '.html';
  }
  /* (14 Nov 2026, James) Russian is hidden: the drop-down on orbit3d.nl shows only NL and EN. The RU option appears
     only for a visitor who typed the Russian address orbit3d.nl/ru (ru.html, the home page in Russian; other pages
     then carry ?lang=ru), and stays for them (remembered in the browser like any language choice). A ru.* host name
     would work the same way (not used: James does not want a subdomain). */
  var ruHost = /^ru\./i.test(location.hostname);
  if (ruHost && !known(requested) && stored !== 'nl' && stored !== 'en') { requested = 'ru'; lang = 'ru'; }
  if (ruHost) ruOpen = true;
  if (fixed) {
    // the page's own language, unless the visitor picked the other one before (EN | NL) or the address asks (?lang=)
    var pageLang = known(document.documentElement.lang) ? document.documentElement.lang : 'en';
    // the Russian address always opens in Russian (also for someone who picked NL or EN before)
    lang = known(requested) ? requested : pageLang === 'ru' ? 'ru' : known(stored) ? stored : pageLang;
  }

  function translate(source, depth) {
    var key = normalize(source), entry = exact.get(key) || folded.get(key.toLowerCase());
    if (entry) return entry[lang] || entry.en;
    if (!depth) {
      for (var i = 0; i < patterns.length; i++) {
        var p = patterns[i], match = key.match(p.regex);
        var slot = 0;
        if (match) return (p.entry[lang] || p.entry.en).replace(/\[[^\]]+\]/g, function (name) {
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
    var value = entry[lang] || entry.en;
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
      if (!node.parentElement || node.parentElement.closest('script,style,[data-i18n],.language-switch,[data-orbit-editor]')) return;
      updateValue(node); return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 9) return;
    if (node.nodeType === 1) {
      if (node.matches('script,style,.language-switch,[data-orbit-editor]')) return;
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
    lang = known(next) ? next : 'en';
    observer.disconnect();
    document.documentElement.lang = lang;
    visit(document.documentElement);
    document.querySelectorAll('[data-language]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.language === lang));
    });
    // Russian in the list only for visitors who use Russian (see ruHost above)
    if (lang === 'ru') ruOpen = true;
    document.querySelectorAll('[data-lang-menu] [data-language="ru"]').forEach(function (b) {
      var li = b.closest('li') || b; li.hidden = !ruOpen;
    });
    // the drop-down's button shows the chosen language (NL / EN / RU)
    document.querySelectorAll('[data-language-current]').forEach(function (el) { el.textContent = lang.toUpperCase(); });
    if (persist) {
      try { localStorage.setItem('orbit-language', lang); } catch (_) {}
    }
    if (fixed) {
      // the address and the page links follow the language's own files (no ?lang needed)
      if (location.protocol !== 'file:') {
        // Russian: the home page is ru.html; other pages keep their file and get ?lang=ru
        var here = new URL(location.href), to = pageIn(here.pathname, lang);
        if (to && to.replace(/\.html$/, '') === here.pathname.replace(/\.html$/, '')) to = null;   // /ru = /ru.html
        var want = lang === 'ru' && !(to || here.pathname).match(/(^|\/)ru(\.html)?$/) ? 'ru' : null;
        if ((to && to !== here.pathname) || here.searchParams.get('lang') !== want) {
          if (to) here.pathname = to;
          if (want) here.searchParams.set('lang', want); else here.searchParams.delete('lang');
          history.replaceState(history.state, '', here);
        }
      }
      document.querySelectorAll('a[href]').forEach(function (a) {
        var raw = a.getAttribute('href');
        if (!raw || raw[0] === '#' || /^(mailto:|tel:|javascript:)/i.test(raw)) return;
        var url = new URL(raw, location.href);
        if (url.origin !== location.origin) return;
        var to = pageIn(url.pathname, lang);
        if (!to) return;
        var before = url.href;
        url.pathname = to;
        if (lang === 'ru' && !/(^|\/)ru\.html$/.test(to)) url.searchParams.set('lang', 'ru'); else url.searchParams.delete('lang');
        if (url.href !== before) a.href = url.href;
      });
    } else {
      if (persist) {
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
    }
    observe();
    document.dispatchEvent(new CustomEvent('orbit:language', { detail: { language: lang } }));
  }
  // (4 Nov 2026, James) No instant jump: the old words fade out and the new ones fade in (css/motion.css,
  // View Transitions; the EN | NL glider slides live meanwhile). Browsers without it, reduced motion or a
  // hidden tab: instant, as before.
  var swapping = false;
  function smoothSelect(next) {
    next = known(next) ? next : 'en';
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
  // (14 Nov 2026) the story site's language drop-down: open / close (click outside or Escape closes, a pick closes)
  document.querySelectorAll('[data-lang-menu]').forEach(function (box) {
    var btn = box.querySelector('[data-lang-btn]'), list = box.querySelector('.language-switch__list');
    if (!btn || !list) return;
    function show(on) { list.hidden = !on; btn.setAttribute('aria-expanded', String(on)); box.classList.toggle('is-open', on); }
    btn.addEventListener('click', function () {
      show(list.hidden);
      if (!list.hidden) { var cur = list.querySelector('[aria-pressed="true"]') || list.querySelector('button'); if (cur) cur.focus(); }
    });
    list.addEventListener('click', function (e) { if (e.target.closest('[data-language]')) { show(false); btn.focus(); } });
    list.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var items = Array.from(list.querySelectorAll('button')), i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      e.preventDefault();
    });
    document.addEventListener('click', function (e) { if (!list.hidden && !box.contains(e.target)) show(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !list.hidden) { show(false); btn.focus(); } });
  });
  window.OrbitLanguage = { text: function (s) { return translate(s, 0); }, set: function (l) { smoothSelect(l); },
    /* (10 Nov 2026) for the word editor (js/word-editor.js, only loaded with ?edit): which dictionary entry a text on
       the page comes from, add an entry, and draw the page again after an entry's words changed. */
    lang: function () { return lang; },
    sourceOf: function (node, attr) {
      var st = cache.get(node), k = attr || '#text';
      return st && st[k] ? st[k].source : (attr ? node.getAttribute(attr) : node.nodeValue);
    },
    entryOf: function (source) {
      var key = normalize(source || ''), e = exact.get(key) || folded.get(key.toLowerCase());
      return e ? idOf.get(e) : null;
    },
    define: function (id, entry) { entries[id] = entry; register(id); },
    refresh: function () {
      document.querySelectorAll('[data-i18n]').forEach(function (el) { delete el.dataset.renderedLanguage; });
      select(lang, false);
    } };
  select(lang, false);
})();
