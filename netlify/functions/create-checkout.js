/* =========================================================
   MADE IN ITALY STREET — CREATE STRIPE CHECKOUT SESSION
   Netlify Function (Node.js 18+, fetch global).
   - Lookup prix dans catalog.json (anti-tampering)
   - Sanitisation stricte des inputs
   - Pickup code crypto-random 6 chars (alphabet sans ambiguite)
   - Stripe Checkout via REST API (pas de dep stripe-node)
   - CORS lock sur ALLOWED_ORIGINS
   - Rate-limit IP en memoire (10 req/min)
========================================================= */
'use strict';

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

// ---------- Configuration ----------
var ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3456')
  .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
var MAX_ITEMS = 60;
var MAX_QTY_PER_ITEM = 50;
var MAX_TOTAL_EUR = 999;
// Alphabet sans caracteres ambigus (pas de I, L, O, 0, 1)
var PICKUP_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
var PICKUP_CODE_LEN = 6;

// In-memory rate limit (warm-instances seulement)
var rateBucket = new Map();
var RATE_WINDOW_MS = 60 * 1000;
var RATE_MAX_REQS = 10;

// ---------- Catalogue ----------
var CATALOG_MAP = null;
function loadCatalog() {
  if (CATALOG_MAP) return CATALOG_MAP;
  var file = path.join(__dirname, 'catalog.json');
  var raw = fs.readFileSync(file, 'utf-8');
  var arr = JSON.parse(raw);
  var map = new Map();
  for (var i = 0; i < arr.length; i++) map.set(arr[i].id, arr[i]);
  CATALOG_MAP = map;
  return map;
}

// ---------- Utils ----------
function jsonResponse(statusCode, body, origin) {
  var headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
  if (origin && ALLOWED_ORIGINS.indexOf(origin) !== -1) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '600';
  }
  return { statusCode: statusCode, headers: headers, body: JSON.stringify(body) };
}

// Strip ASCII control chars (0x00-0x1F, 0x7F)
var CTRL_RE = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');
function sanitizeStr(s, max) {
  if (typeof s !== 'string') s = String(s == null ? '' : s);
  return s.replace(CTRL_RE, '').trim().slice(0, max);
}
function sanitizeInt(n, min, max) {
  n = Number(n);
  if (!Number.isFinite(n)) return min;
  n = Math.floor(n);
  return Math.max(min, Math.min(max, n));
}

// Telephone FR : 0X XX XX XX XX ou +33 X XX XX XX XX
var PHONE_RE = /^(?:\+?33[\s.-]?[1-9]|0[1-9])(?:[\s.-]?\d{2}){4}$/;
var NAME_RE = /^[A-Za-zÀ-ÿ' -]{2,60}$/;
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function genPickupCode() {
  var bytes = crypto.randomBytes(PICKUP_CODE_LEN);
  var out = '';
  for (var i = 0; i < PICKUP_CODE_LEN; i++) {
    out += PICKUP_CODE_ALPHABET[bytes[i] % PICKUP_CODE_ALPHABET.length];
  }
  // Format XXX-XXX pour lisibilite
  return out.slice(0, 3) + '-' + out.slice(3);
}

function checkRate(ip) {
  var now = Date.now();
  var bucket = rateBucket.get(ip) || { count: 0, until: now + RATE_WINDOW_MS };
  if (bucket.until < now) { bucket.count = 0; bucket.until = now + RATE_WINDOW_MS; }
  bucket.count++;
  rateBucket.set(ip, bucket);
  if (rateBucket.size > 5000) {
    var keys = Array.from(rateBucket.keys());
    for (var k = 0; k < keys.length; k++) {
      var v = rateBucket.get(keys[k]);
      if (v && v.until < now) rateBucket.delete(keys[k]);
    }
  }
  return bucket.count <= RATE_MAX_REQS;
}

// ---------- Handler ----------
exports.handler = async function (event) {
  var origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';

  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(204, {}, origin);
  }
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' }, origin);
  }

  if (ALLOWED_ORIGINS.length && ALLOWED_ORIGINS.indexOf(origin) === -1) {
    return jsonResponse(403, { error: 'Origin non autorisee' }, origin);
  }

  var ipRaw = (event.headers && (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || '')) || '';
  var ip = String(ipRaw).split(',')[0].trim() || 'unknown';
  if (!checkRate(ip)) {
    return jsonResponse(429, { error: 'Trop de requetes, reessaie dans 1 min' }, origin);
  }

  var STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_KEY) {
    return jsonResponse(500, { error: 'Stripe non configure (STRIPE_SECRET_KEY manquante)' }, origin);
  }

  var payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (_) {
    return jsonResponse(400, { error: 'JSON invalide' }, origin);
  }

  var name = sanitizeStr(payload.name, 60);
  var phoneRaw = sanitizeStr(payload.phone, 25);
  var slot = sanitizeStr(payload.slot, 80);
  var notes = sanitizeStr(payload.notes || '', 300);
  var email = sanitizeStr(payload.email || '', 120);
  var honeypot = sanitizeStr(payload.website || '', 50);

  if (honeypot) return jsonResponse(400, { error: 'Detection spam' }, origin);
  if (!NAME_RE.test(name)) return jsonResponse(400, { error: 'Nom invalide' }, origin);
  if (!PHONE_RE.test(phoneRaw)) return jsonResponse(400, { error: 'Telephone invalide' }, origin);
  if (!slot) return jsonResponse(400, { error: 'Creneau manquant' }, origin);
  if (email && !EMAIL_RE.test(email)) return jsonResponse(400, { error: 'Email invalide' }, origin);

  if (!Array.isArray(payload.items) || !payload.items.length) {
    return jsonResponse(400, { error: 'Panier vide' }, origin);
  }
  if (payload.items.length > MAX_ITEMS) {
    return jsonResponse(400, { error: 'Trop de lignes dans le panier' }, origin);
  }

  var catalog;
  try { catalog = loadCatalog(); }
  catch (e) {
    console.error('catalog load failed', e);
    return jsonResponse(500, { error: 'Erreur catalogue' }, origin);
  }

  var totalCents = 0;
  var stripeParams = new URLSearchParams();
  for (var idx = 0; idx < payload.items.length; idx++) {
    var item = payload.items[idx];
    var id = sanitizeStr(item && item.id, 80);
    var qty = sanitizeInt(item && item.qty, 1, MAX_QTY_PER_ITEM);
    if (!id) return jsonResponse(400, { error: 'ID produit manquant' }, origin);
    // Support combo variants: "combo-classico--burger-italiano" → lookup "combo-classico"
    var catalogId = id.indexOf('--') !== -1 ? id.split('--')[0] : id;
    var product = catalog.get(catalogId);
    if (!product) return jsonResponse(400, { error: 'Produit inconnu : ' + catalogId }, origin);
    var unitCents = Math.round(product.price * 100);
    totalCents += unitCents * qty;
    // Display name: prefer client-provided name (sanitized) so combo choices appear in Stripe
    var displayName = (item && typeof item.name === 'string' && item.name.trim())
      ? sanitizeStr(item.name, 120) : product.name;
    stripeParams.append('line_items[' + idx + '][price_data][currency]', 'eur');
    stripeParams.append('line_items[' + idx + '][price_data][unit_amount]', String(unitCents));
    stripeParams.append('line_items[' + idx + '][price_data][product_data][name]', displayName);
    if (product.desc) {
      stripeParams.append('line_items[' + idx + '][price_data][product_data][description]', product.desc.slice(0, 200));
    }
    stripeParams.append('line_items[' + idx + '][quantity]', String(qty));
  }

  if (totalCents <= 0) return jsonResponse(400, { error: 'Total invalide' }, origin);
  if (totalCents > MAX_TOTAL_EUR * 100) {
    return jsonResponse(400, { error: 'Total depasse la limite (' + MAX_TOTAL_EUR + ' EUR)' }, origin);
  }

  var pickupCode = genPickupCode();
  var SITE_URL = (process.env.SITE_URL || origin || ALLOWED_ORIGINS[0]).replace(/\/$/, '');
  var successUrl = SITE_URL + '/success.html?session_id={CHECKOUT_SESSION_ID}';
  var cancelUrl  = SITE_URL + '/cancel.html';

  stripeParams.append('mode', 'payment');
  stripeParams.append('payment_method_types[]', 'card');
  stripeParams.append('success_url', successUrl);
  stripeParams.append('cancel_url', cancelUrl);
  stripeParams.append('locale', 'fr');
  if (email) stripeParams.append('customer_email', email);
  stripeParams.append('metadata[pickup_code]', pickupCode);
  stripeParams.append('metadata[customer_name]', name);
  stripeParams.append('metadata[customer_phone]', phoneRaw);
  stripeParams.append('metadata[pickup_slot]', slot);
  if (notes) stripeParams.append('metadata[notes]', notes.slice(0, 200));
  stripeParams.append('payment_intent_data[description]', 'Code retrait ' + pickupCode + ' - ' + slot);
  stripeParams.append('payment_intent_data[metadata][pickup_code]', pickupCode);

  var stripeResp;
  try {
    stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2024-06-20'
      },
      body: stripeParams.toString()
    });
  } catch (e) {
    console.error('Stripe fetch failed', e);
    return jsonResponse(502, { error: 'Connexion Stripe impossible' }, origin);
  }

  var data;
  try { data = await stripeResp.json(); } catch (_) { data = {}; }
  if (!stripeResp.ok) {
    console.error('Stripe error', data);
    var msg = (data && data.error && data.error.message) || 'Erreur Stripe';
    return jsonResponse(stripeResp.status, { error: msg }, origin);
  }

  return jsonResponse(200, {
    url: data.url,
    session_id: data.id,
    pickup_code: pickupCode,
    total_eur: (totalCents / 100).toFixed(2)
  }, origin);
};
