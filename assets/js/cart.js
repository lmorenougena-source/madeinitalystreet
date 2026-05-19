/* =========================================================
   MADE IN ITALY STREET — CART ENGINE
   Vanilla, zero deps. Click & Collect frontend complet.
   - State persiste en localStorage avec version key
   - Sanitisation stricte (textContent only)
   - Cap qte max 50 / cap total panier 999 EUR
   - Honeypot anti-bot + rate-limit 30s
   - Event bus pour UI
   - Soumission par WhatsApp (wa.me) + fallback mailto
========================================================= */
(function () {
  'use strict';

  /* ---------- Configuration ---------- */
  var CONFIG = {
    storageKey: 'mis-cart-v1',
    rateLimitKey: 'mis-cart-rate',
    rateLimitMs: 30 * 1000,
    maxQtyPerItem: 50,
    maxTotalEuros: 999,
    leadTimeMinutes: 20,
    slotIntervalMinutes: 15,
    hours: {
      lunch:  { start: '11:30', end: '14:30' },
      dinner: { start: '18:30', end: '22:30' }
    },
    contact: {
      whatsapp: '33695286059',
      email: 'contact@madeinitalystreet.fr',
      restaurant: 'Made in Italy Street — Lourdes'
    }
  };

  /* ---------- Utils ---------- */
  var ESC_MAP = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '&': '&amp;' };
  var ESC_RE = /[<>"'`&]/g;
  // Strip ASCII control chars (0x00-0x1F, 0x7F)
  var CTRL_RE = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');
  // Combining diacritical marks (U+0300 to U+036F)
  var DIACR_RE = new RegExp('[\\u0300-\\u036F]', 'g');

  function safeStr(input, max) {
    if (typeof max !== 'number') max = 200;
    if (typeof input !== 'string') input = String(input == null ? '' : input);
    input = input.replace(CTRL_RE, '').trim();
    if (input.length > max) input = input.slice(0, max);
    return input;
  }
  function escapeHtml(s) {
    return safeStr(s).replace(ESC_RE, function (c) { return ESC_MAP[c]; });
  }
  function safeNum(n, min, max) {
    n = Number(n);
    if (!Number.isFinite(n)) return min;
    n = Math.floor(n);
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }
  function safePrice(n) {
    n = Number(n);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100) / 100;
  }
  function parsePriceText(txt) {
    if (!txt) return 0;
    var m = String(txt).replace(/\s/g, '').replace(',', '.').match(/(\d+(?:\.\d+)?)/);
    return m ? safePrice(parseFloat(m[1])) : 0;
  }
  function formatPrice(n) {
    return (safePrice(n)).toFixed(2).replace('.', ',') + ' €';
  }
  function slugify(s) {
    var base = safeStr(s, 80).toLowerCase().normalize('NFD').replace(DIACR_RE, '');
    base = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return base || 'item-' + Date.now().toString(36);
  }

  /* ---------- Event bus ---------- */
  var listeners = [];
  function emit() {
    var snap = getSnapshot();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](snap); } catch (_) {}
    }
  }
  function on(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function off() {
      var idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  /* ---------- State + persistance ---------- */
  var state = { items: [] };

  function loadState() {
    try {
      var raw = localStorage.getItem(CONFIG.storageKey);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items)) return;
      var items = [];
      for (var i = 0; i < parsed.items.length; i++) {
        var it = parsed.items[i];
        if (!it || typeof it !== 'object') continue;
        var clean = {
          id: safeStr(it.id, 80),
          name: safeStr(it.name, 100),
          price: safePrice(it.price),
          qty: safeNum(it.qty, 1, CONFIG.maxQtyPerItem)
        };
        if (clean.id && clean.name && clean.qty > 0) items.push(clean);
      }
      state.items = items;
    } catch (e) {
      try { localStorage.removeItem(CONFIG.storageKey); } catch (_) {}
    }
  }

  function saveState() {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify({ v: 1, items: state.items }));
    } catch (e) { /* quota — on garde en memoire */ }
  }

  function getSnapshot() {
    var items = [];
    var count = 0;
    var total = 0;
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      items.push({ id: it.id, name: it.name, price: it.price, qty: it.qty });
      count += it.qty;
      total += it.price * it.qty;
    }
    return { items: items, count: count, total: safePrice(total) };
  }

  /* ---------- API publique ---------- */
  function findItem(id) {
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === id) return state.items[i];
    }
    return null;
  }

  function addItem(product) {
    if (!product || typeof product !== 'object') return false;
    var id = safeStr(product.id, 80) || slugify(product.name);
    var name = safeStr(product.name, 100);
    var price = safePrice(product.price);
    var addQty = safeNum(product.qty || 1, 1, CONFIG.maxQtyPerItem);
    if (!id || !name) return false;

    var existing = findItem(id);
    if (existing) {
      existing.qty = safeNum(existing.qty + addQty, 1, CONFIG.maxQtyPerItem);
      existing.price = price;
      existing.name = name;
    } else {
      if (state.items.length >= 60) return false;
      state.items.push({ id: id, name: name, price: price, qty: addQty });
    }
    if (getSnapshot().total > CONFIG.maxTotalEuros) {
      if (existing) existing.qty = Math.max(1, existing.qty - addQty);
      else state.items.pop();
      return false;
    }
    saveState(); emit();
    return true;
  }

  function updateQty(id, qty) {
    id = safeStr(id, 80);
    var it = findItem(id);
    if (!it) return false;
    qty = safeNum(qty, 0, CONFIG.maxQtyPerItem);
    if (qty === 0) {
      var idx = state.items.indexOf(it);
      if (idx >= 0) state.items.splice(idx, 1);
    } else {
      it.qty = qty;
    }
    saveState(); emit();
    return true;
  }

  function removeItem(id) { return updateQty(id, 0); }

  function clear() {
    state.items = [];
    saveState(); emit();
  }

  /* ---------- Creneaux retrait ---------- */
  function parseHM(s) {
    var p = s.split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }
  function fmtHM(min) {
    var h = String(Math.floor(min / 60)); if (h.length < 2) h = '0' + h;
    var m = String(min % 60); if (m.length < 2) m = '0' + m;
    return h + ':' + m;
  }
    /* Statut ouverture en temps reel : isOpen + label humain + prochaine bascule */
  function openStatus(now) {
    now = now || new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var lunchStart  = parseHM(CONFIG.hours.lunch.start);
    var lunchEnd    = parseHM(CONFIG.hours.lunch.end);
    var dinnerStart = parseHM(CONFIG.hours.dinner.start);
    var dinnerEnd   = parseHM(CONFIG.hours.dinner.end);

    var isOpen = false;
    var closesAtMin = null;
    var opensAtMin = null;
    var currentService = null;

    if (nowMin >= lunchStart && nowMin < lunchEnd) {
      isOpen = true; closesAtMin = lunchEnd; currentService = 'lunch';
    } else if (nowMin >= dinnerStart && nowMin < dinnerEnd) {
      isOpen = true; closesAtMin = dinnerEnd; currentService = 'dinner';
    } else if (nowMin < lunchStart) {
      opensAtMin = lunchStart;
    } else if (nowMin < dinnerStart) {
      opensAtMin = dinnerStart;
    } else {
      // Apres dinner end → rouvre demain au midi (lunchStart + 24h)
      opensAtMin = lunchStart + 24 * 60;
    }

    var minutesUntilNext = isOpen ? (closesAtMin - nowMin) : (opensAtMin - nowMin);
    var opensTomorrow = opensAtMin != null && opensAtMin >= 24 * 60;
    var opensAtStr = opensAtMin != null ? fmtHM(opensAtMin % (24 * 60)) : null;
    var closesAtStr = closesAtMin != null ? fmtHM(closesAtMin) : null;

    function fmtDuration(min) {
      if (min < 60) return 'dans ' + min + ' min';
      var h = Math.floor(min / 60);
      var m = min % 60;
      return 'dans ' + h + 'h' + (m < 10 ? '0' + m : m);
    }

       var label, shortLabel;
    if (isOpen) {
      label = 'Ouvert · Ferme à ' + closesAtStr;
      shortLabel = 'Ouvert';
    } else if (opensTomorrow) {
      label = 'Fermé · Rouvre demain à ' + opensAtStr;
      shortLabel = 'Fermé';
    } else {
      label = 'Fermé · Rouvre à ' + opensAtStr + ' (' + fmtDuration(minutesUntilNext) + ')';
      shortLabel = 'Fermé';
    }

    return {
      isOpen: isOpen,
      currentService: currentService,
      closesAt: closesAtStr,
      opensAt: opensAtStr,
      opensTomorrow: opensTomorrow,
      minutesUntilNext: minutesUntilNext,
      label: label,
      shortLabel: shortLabel,
      hours: {
        lunch:  { start: CONFIG.hours.lunch.start,  end: CONFIG.hours.lunch.end },
        dinner: { start: CONFIG.hours.dinner.start, end: CONFIG.hours.dinner.end }
      }
    };
  }

  function pickupSlots(now) {
    now = now || new Date();
    var slots = [];
    var todayMin = now.getHours() * 60 + now.getMinutes();
    var earliest = todayMin + CONFIG.leadTimeMinutes;

    function pushRange(date, startStr, endStr, label) {
      var start = parseHM(startStr);
      var end = parseHM(endStr);
      var isToday = date.toDateString() === now.toDateString();
      var t = start;
      if (isToday && earliest > start) {
        t = Math.ceil(earliest / CONFIG.slotIntervalMinutes) * CONFIG.slotIntervalMinutes;
      }
      while (t <= end) {
        var dt = new Date(date);
        dt.setHours(Math.floor(t / 60), t % 60, 0, 0);
        slots.push({
          iso: dt.toISOString(),
          label: label + ' · ' + fmtHM(t),
          time: fmtHM(t)
        });
        t += CONFIG.slotIntervalMinutes;
        if (slots.length >= 18) return;
      }
    }

    var todayLabel = "Aujourd'hui";
    pushRange(now, CONFIG.hours.lunch.start, CONFIG.hours.lunch.end, todayLabel);
    pushRange(now, CONFIG.hours.dinner.start, CONFIG.hours.dinner.end, todayLabel);

    if (slots.length < 6) {
      var tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      var dayName = tomorrow.toLocaleDateString('fr-FR', { weekday: 'long' });
      var label = 'Demain (' + dayName + ')';
      pushRange(tomorrow, CONFIG.hours.lunch.start, CONFIG.hours.lunch.end, label);
      pushRange(tomorrow, CONFIG.hours.dinner.start, CONFIG.hours.dinner.end, label);
    }
    return slots;
  }

  /* ---------- Validation form ---------- */
  var PHONE_RE = /^(?:\+?33[\s.-]?[1-9]|0[1-9])(?:[\s.-]?\d{2}){4}$/;
  var NAME_RE = /^[A-Za-zÀ-ÿ' -]{2,60}$/;

  function validateOrder(data) {
    data = data || {};
    var errors = {};
    var name = safeStr(data.name, 60);
    var rawPhone = safeStr(data.phone, 25);
    var phoneNorm = rawPhone.replace(/[^\d+]/g, '');
    var slot = safeStr(data.slot, 80);
    var notes = safeStr(data.notes, 300);
    var honeypot = safeStr(data.website || '', 50);

    if (honeypot) errors._spam = 'Spam detected';
    if (!NAME_RE.test(name)) errors.name = 'Nom invalide (2 a 60 lettres)';
    if (!PHONE_RE.test(rawPhone)) errors.phone = 'Numero invalide (ex : 06 12 34 56 78)';
    if (!slot) errors.slot = 'Choisis un creneau de retrait';
    if (!state.items.length) errors.cart = 'Panier vide';

    try {
      var last = parseInt(localStorage.getItem(CONFIG.rateLimitKey) || '0', 10);
      if (Date.now() - last < CONFIG.rateLimitMs) {
        errors._rate = 'Patiente quelques secondes avant de renvoyer';
      }
    } catch (_) {}

    var hasErr = false;
    for (var k in errors) { if (Object.prototype.hasOwnProperty.call(errors, k)) { hasErr = true; break; } }
    return { ok: !hasErr, errors: errors, clean: { name: name, phone: phoneNorm, slot: slot, notes: notes } };
  }

  /* ---------- Generation message + lien WhatsApp ---------- */
  function pad2(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
  function genOrderId() {
    var d = new Date();
    var stamp = d.getFullYear().toString().slice(-2) + pad2(d.getMonth() + 1) + pad2(d.getDate())
      + '-' + pad2(d.getHours()) + pad2(d.getMinutes());
    var rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
    return 'MIS-' + stamp + '-' + rnd;
  }
  function buildOrderMessage(clean, orderId) {
    var snap = getSnapshot();
    var lines = [];
    lines.push('NOUVELLE COMMANDE — ' + CONFIG.contact.restaurant);
    lines.push('Ref : ' + orderId);
    lines.push('');
    lines.push('Client : ' + clean.name);
    lines.push('Telephone : ' + clean.phone);
    lines.push('Retrait : ' + clean.slot);
    lines.push('');
    lines.push('Commande :');
    for (var i = 0; i < snap.items.length; i++) {
      var it = snap.items[i];
      lines.push('- ' + it.qty + 'x ' + it.name + ' — ' + formatPrice(it.price * it.qty));
    }
    lines.push('');
    lines.push('TOTAL : ' + formatPrice(snap.total));
    if (clean.notes) { lines.push(''); lines.push('Notes : ' + clean.notes); }
    lines.push('');
    lines.push('Envoye depuis madeinitalystreet.fr');
    return lines.join('\n');
  }
  function buildWhatsAppLink(message) {
    return 'https://wa.me/' + CONFIG.contact.whatsapp + '?text=' + encodeURIComponent(message);
  }
  function buildMailtoLink(message, orderId) {
    var subject = 'Commande Click & Collect ' + orderId;
    return 'mailto:' + CONFIG.contact.email
      + '?subject=' + encodeURIComponent(subject)
      + '&body=' + encodeURIComponent(message);
  }

  /* ---------- Submit ---------- */
  function submit(formData) {
    var v = validateOrder(formData);
    if (!v.ok) return { ok: false, errors: v.errors };
    var orderId = genOrderId();
    var message = buildOrderMessage(v.clean, orderId);
    var waLink = buildWhatsAppLink(message);
    var mailLink = buildMailtoLink(message, orderId);
    try { localStorage.setItem(CONFIG.rateLimitKey, String(Date.now())); } catch (_) {}
    return {
      ok: true,
      orderId: orderId,
      message: message,
      waLink: waLink,
      mailLink: mailLink,
      clean: v.clean,
      snapshot: getSnapshot()
    };
  }

  /* ---------- Boot ---------- */
  loadState();

  /* ---------- Expose API ---------- */
  window.MISCart = Object.freeze({
    addItem: addItem,
    updateQty: updateQty,
    removeItem: removeItem,
        clear: clear,
    snapshot: getSnapshot,
    on: on,
    pickupSlots: pickupSlots,
    openStatus: openStatus,
    submit: submit,
    formatPrice: formatPrice,
    escapeHtml: escapeHtml,
    parsePriceText: parsePriceText,
    slugify: slugify,
    config: Object.freeze(JSON.parse(JSON.stringify(CONFIG)))
  });
})();
