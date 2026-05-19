/* =========================================================
   MADE IN ITALY STREET — I18N ENGINE
   Vanilla, zero deps. Charge translations.js AVANT ce fichier.
   - Detecte langue navigateur, persiste choix en localStorage
   - data-i18n="key" → textContent
   - data-i18n-html="key" → innerHTML (uniquement clés safe definies dans translations.js)
   - data-i18n-attr="attr:key,attr2:key2" → setAttribute (placeholder, aria-label, title, alt)
   - <html lang> mis a jour dynamiquement
   - Sélecteur de langue auto-monté dans [data-mis-lang-switcher]
   - Event bus : window.addEventListener('mis:langchange', ...)
========================================================= */
(function () {
  'use strict';

  var SUPPORTED = ['fr', 'en', 'es', 'it', 'pt', 'de'];
  var DEFAULT_LANG = 'fr';
  var STORAGE_KEY = 'mis-lang';

  var DICT = (window.MIS_TRANSLATIONS && typeof window.MIS_TRANSLATIONS === 'object')
    ? window.MIS_TRANSLATIONS : {};

  /* ---------- Detection langue ---------- */
  function detectLang() {
    // 1. localStorage
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
    } catch (_) {}

    // 2. URL ?lang=xx
    try {
      var m = /[?&]lang=([a-z]{2})/i.exec(location.search || '');
      if (m && SUPPORTED.indexOf(m[1].toLowerCase()) !== -1) return m[1].toLowerCase();
    } catch (_) {}

    // 3. navigator
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    var code = String(nav || '').slice(0, 2).toLowerCase();
    if (SUPPORTED.indexOf(code) !== -1) return code;

    return DEFAULT_LANG;
  }

  var currentLang = detectLang();

  /* ---------- API ---------- */
  function t(key, vars) {
    var lang = currentLang;
    var pack = DICT[lang] || DICT[DEFAULT_LANG] || {};
    var val = pack[key];
    if (val == null) {
      // fallback FR
      val = (DICT[DEFAULT_LANG] || {})[key];
      if (val == null) return key;
    }
    if (vars && typeof val === 'string') {
      val = val.replace(/\{(\w+)\}/g, function (_m, k) {
        return (vars[k] != null) ? String(vars[k]) : '{' + k + '}';
      });
    }
    return val;
  }

  function getLang() { return currentLang; }

  function setLang(lang) {
    if (SUPPORTED.indexOf(lang) === -1) return false;
    currentLang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
    document.documentElement.setAttribute('lang', lang);
    applyAll(document);
    updateSwitchers();
    try {
      window.dispatchEvent(new CustomEvent('mis:langchange', { detail: { lang: lang } }));
    } catch (_) {
      // IE fallback
      var ev = document.createEvent('CustomEvent');
      ev.initCustomEvent('mis:langchange', false, false, { lang: lang });
      window.dispatchEvent(ev);
    }
    return true;
  }

  /* ---------- Application sur le DOM ---------- */
  function applyAll(root) {
    if (!root) root = document;

    // textContent
    var nodes = root.querySelectorAll ? root.querySelectorAll('[data-i18n]') : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute('data-i18n');
      if (!key) continue;
      el.textContent = t(key);
    }

    // innerHTML (clés contenant du HTML safe : <strong>, <em>, <a>, <br>)
    var htmlNodes = root.querySelectorAll ? root.querySelectorAll('[data-i18n-html]') : [];
    for (var j = 0; j < htmlNodes.length; j++) {
      var elh = htmlNodes[j];
      var keyh = elh.getAttribute('data-i18n-html');
      if (!keyh) continue;
      elh.innerHTML = t(keyh);
    }

    // attributs
    var attrNodes = root.querySelectorAll ? root.querySelectorAll('[data-i18n-attr]') : [];
    for (var k = 0; k < attrNodes.length; k++) {
      var ela = attrNodes[k];
      var spec = ela.getAttribute('data-i18n-attr');
      if (!spec) continue;
      var pairs = spec.split(',');
      for (var p = 0; p < pairs.length; p++) {
        var seg = pairs[p].split(':');
        if (seg.length !== 2) continue;
        var attrName = seg[0].trim();
        var attrKey = seg[1].trim();
        if (attrName && attrKey) ela.setAttribute(attrName, t(attrKey));
      }
    }

    // title de page (meta)
    var titleNode = root.querySelector ? root.querySelector('[data-i18n-title]') : null;
    if (titleNode) {
      var tkey = titleNode.getAttribute('data-i18n-title');
      if (tkey) {
        var newTitle = t(tkey);
        titleNode.textContent = newTitle;
        document.title = newTitle;
      }
    }

    // meta description
    var metaDesc = document.querySelector('meta[name="description"][data-i18n-content]');
    if (metaDesc) {
      var mkey = metaDesc.getAttribute('data-i18n-content');
      if (mkey) metaDesc.setAttribute('content', t(mkey));
    }
  }

  /* ---------- Sélecteur de langue (drapeaux) ---------- */
  var FLAGS = {
    fr: '🇫🇷',
    en: '🇬🇧',
    es: '🇪🇸',
    it: '🇮🇹',
    pt: '🇵🇹',
    de: '🇩🇪'
  };
  var LABELS = {
    fr: 'Français',
    en: 'English',
    es: 'Español',
    it: 'Italiano',
    pt: 'Português',
    de: 'Deutsch'
  };

  function buildSwitcher(host) {
    if (!host || host._misBuilt) return;
    host._misBuilt = true;
    host.classList.add('mis-lang-switcher');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mis-lang-toggle';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', t('ls.aria'));
    btn.innerHTML =
      '<span class="mis-lang-flag" aria-hidden="true">' + FLAGS[currentLang] + '</span>' +
      '<span class="mis-lang-code">' + (currentLang.toUpperCase()) + '</span>' +
      '<svg class="mis-lang-caret" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">' +
      '<path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

    var list = document.createElement('ul');
    list.className = 'mis-lang-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', t('ls.aria'));
    list.hidden = true;

    for (var i = 0; i < SUPPORTED.length; i++) {
      var lang = SUPPORTED[i];
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mis-lang-item';
      b.setAttribute('data-lang', lang);
      b.setAttribute('aria-selected', lang === currentLang ? 'true' : 'false');
      if (lang === currentLang) b.classList.add('is-active');
      b.innerHTML =
        '<span class="mis-lang-flag" aria-hidden="true">' + FLAGS[lang] + '</span>' +
        '<span class="mis-lang-name">' + LABELS[lang] + '</span>';
      b.addEventListener('click', function (ev) {
        var l = ev.currentTarget.getAttribute('data-lang');
        setLang(l);
        list.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      });
      li.appendChild(b);
      list.appendChild(li);
    }

    btn.addEventListener('click', function () {
      var isOpen = !list.hidden;
      list.hidden = isOpen;
      btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    });

    // close on outside click
    document.addEventListener('click', function (ev) {
      if (!host.contains(ev.target)) {
        list.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    // close on Escape
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        list.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    host.appendChild(btn);
    host.appendChild(list);
  }

  function updateSwitchers() {
    var hosts = document.querySelectorAll('.mis-lang-switcher');
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      var btn = host.querySelector('.mis-lang-toggle');
      if (btn) {
        var flag = btn.querySelector('.mis-lang-flag');
        var code = btn.querySelector('.mis-lang-code');
        if (flag) flag.textContent = FLAGS[currentLang] || '';
        if (code) code.textContent = currentLang.toUpperCase();
        btn.setAttribute('aria-label', t('ls.aria'));
      }
      var items = host.querySelectorAll('.mis-lang-item');
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        var lang = it.getAttribute('data-lang');
        var active = (lang === currentLang);
        it.setAttribute('aria-selected', active ? 'true' : 'false');
        it.classList.toggle('is-active', active);
      }
    }
  }

  function mountSwitchers() {
    var hosts = document.querySelectorAll('[data-mis-lang-switcher]');
    for (var i = 0; i < hosts.length; i++) buildSwitcher(hosts[i]);
  }

  /* ---------- Boot ---------- */
  function boot() {
    document.documentElement.setAttribute('lang', currentLang);
    applyAll(document);
    mountSwitchers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* ---------- Expose API ---------- */
  window.MISI18n = Object.freeze({
    t: t,
    getLang: getLang,
    setLang: setLang,
    apply: applyAll,
    mountSwitchers: mountSwitchers,
    supported: SUPPORTED.slice(),
    flags: Object.freeze(Object.assign({}, FLAGS)),
    labels: Object.freeze(Object.assign({}, LABELS))
  });
})();
