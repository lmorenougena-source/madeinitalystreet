/* =========================================================
   MADE IN ITALY STREET — GET ORDER (post-paiement)
   Netlify Function. Recupere une Stripe Checkout Session,
   verifie qu'elle est payee, renvoie un payload safe pour
   la page success.html (pickup_code, slot, items, total).
   - Lock CORS sur ALLOWED_ORIGINS
   - Cache 5 min in-memory pour eviter le poll abuse
   - Ne renvoie JAMAIS de donnees Stripe sensibles (no card)
========================================================= */
'use strict';

var ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3456')
  .split(',').map(function (s) { return s.trim(); }).filter(Boolean);

var orderCache = new Map(); // session_id -> { payload, until }
var CACHE_TTL_MS = 5 * 60 * 1000;

function jsonResponse(statusCode, body, origin) {
  var headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'private, max-age=60',
    'Vary': 'Origin'
  };
  if (origin && ALLOWED_ORIGINS.indexOf(origin) !== -1) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '600';
  }
  return { statusCode: statusCode, headers: headers, body: JSON.stringify(body) };
}

function sanitizeSessionId(id) {
  if (typeof id !== 'string') return '';
  // cs_test_xxx ou cs_live_xxx, alphanumeric + _
  return /^cs_(test|live)_[A-Za-z0-9_]{16,200}$/.test(id) ? id : '';
}

exports.handler = async function (event) {
  var origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';

  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, {}, origin);
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' }, origin);
  }
  if (ALLOWED_ORIGINS.length && ALLOWED_ORIGINS.indexOf(origin) === -1) {
    return jsonResponse(403, { error: 'Origin non autorisee' }, origin);
  }

  var STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_KEY) {
    return jsonResponse(500, { error: 'Stripe non configure' }, origin);
  }

  var sessionId = sanitizeSessionId((event.queryStringParameters || {}).session_id || '');
  if (!sessionId) return jsonResponse(400, { error: 'session_id invalide' }, origin);

  // Cache check
  var now = Date.now();
  var cached = orderCache.get(sessionId);
  if (cached && cached.until > now) {
    return jsonResponse(200, cached.payload, origin);
  }

  // Retrieve Session + expand line_items
  var url = 'https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sessionId)
          + '?expand[]=line_items';
  var resp;
  try {
    resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_KEY,
        'Stripe-Version': '2024-06-20'
      }
    });
  } catch (e) {
    console.error('Stripe fetch failed', e);
    return jsonResponse(502, { error: 'Connexion Stripe impossible' }, origin);
  }

  var data;
  try { data = await resp.json(); } catch (_) { data = {}; }
  if (!resp.ok) {
    return jsonResponse(resp.status, { error: (data && data.error && data.error.message) || 'Erreur Stripe' }, origin);
  }

  if (data.payment_status !== 'paid') {
    return jsonResponse(402, { error: 'Paiement non confirme', status: data.payment_status }, origin);
  }

  var meta = data.metadata || {};
  var items = [];
  if (data.line_items && Array.isArray(data.line_items.data)) {
    items = data.line_items.data.map(function (li) {
      return {
        name: li.description || (li.price && li.price.product && li.price.product.name) || 'Article',
        qty: li.quantity || 0,
        amount: (li.amount_total || 0) / 100
      };
    });
  }

  var payload = {
    pickup_code: meta.pickup_code || '',
    customer_name: meta.customer_name || '',
    customer_phone: meta.customer_phone || '',
    pickup_slot: meta.pickup_slot || '',
    notes: meta.notes || '',
    total: (data.amount_total || 0) / 100,
    currency: (data.currency || 'eur').toUpperCase(),
    items: items,
    email: data.customer_details && data.customer_details.email || '',
    payment_status: data.payment_status
  };

  orderCache.set(sessionId, { payload: payload, until: now + CACHE_TTL_MS });

  // garbage-collect occasional
  if (orderCache.size > 1000) {
    var keys = Array.from(orderCache.keys());
    for (var k = 0; k < keys.length; k++) {
      var v = orderCache.get(keys[k]);
      if (v && v.until < now) orderCache.delete(keys[k]);
    }
  }

  return jsonResponse(200, payload, origin);
};
