/* =========================================================
   MADE IN ITALY STREET — GET ORDER (post-paiement)
   Vercel Serverless Function (Node.js 18+)
   Portage de netlify/functions/get-order.js → api/
========================================================= */
'use strict';

var ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(function(s){ return s.trim(); }).filter(Boolean);

var orderCache = new Map();
var CACHE_TTL  = 5 * 60 * 1000;

function setHeaders(res, origin) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.setHeader('Vary', 'Origin');
  var allowed = !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.indexOf(origin) !== -1;
  if (origin && allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

function sanitizeSession(id) {
  if (typeof id !== 'string') return '';
  return /^cs_(test|live)_[A-Za-z0-9_]{16,200}$/.test(id) ? id : '';
}

module.exports = async function(req, res) {
  var origin = req.headers['origin'] || '';
  setHeaders(res, origin);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  if (origin && ALLOWED_ORIGINS.length && ALLOWED_ORIGINS.indexOf(origin) === -1)
    return res.status(403).json({ error: 'Origin non autorisee' });

  var STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_KEY) return res.status(500).json({ error: 'Stripe non configure' });

  var sessionId = sanitizeSession((req.query && req.query.session_id) || '');
  if (!sessionId) return res.status(400).json({ error: 'session_id invalide' });

  var now = Date.now();
  var cached = orderCache.get(sessionId);
  if (cached && cached.until > now) return res.status(200).json(cached.payload);

  var url = 'https://api.stripe.com/v1/checkout/sessions/'
    + encodeURIComponent(sessionId) + '?expand[]=line_items';
  var resp;
  try {
    resp = await fetch(url, {
      headers: {
        'Authorization':  'Bearer '+STRIPE_KEY,
        'Stripe-Version': '2024-06-20'
      }
    });
  } catch(e) {
    console.error('Stripe fetch', e);
    return res.status(502).json({ error: 'Connexion Stripe impossible' });
  }

  var data;
  try { data = await resp.json(); } catch(_){ data={}; }
  if (!resp.ok)
    return res.status(resp.status).json({ error: (data&&data.error&&data.error.message)||'Erreur Stripe' });

  if (data.payment_status !== 'paid')
    return res.status(402).json({ error: 'Paiement non confirme', status: data.payment_status });

  var meta  = data.metadata || {};
  var items = (data.line_items && Array.isArray(data.line_items.data))
    ? data.line_items.data.map(function(li){
        return {
          name:   li.description || (li.price&&li.price.product&&li.price.product.name) || 'Article',
          qty:    li.quantity || 0,
          amount: (li.amount_total||0)/100
        };
      })
    : [];

  var payload = {
    pickup_code:    meta.pickup_code    || '',
    customer_name:  meta.customer_name  || '',
    customer_phone: meta.customer_phone || '',
    pickup_slot:    meta.pickup_slot    || '',
    notes:          meta.notes          || '',
    total:          (data.amount_total||0)/100,
    currency:       (data.currency||'eur').toUpperCase(),
    items:          items,
    email:          (data.customer_details&&data.customer_details.email) || '',
    payment_status: data.payment_status
  };

  orderCache.set(sessionId, { payload: payload, until: now+CACHE_TTL });
  if (orderCache.size > 1000) {
    orderCache.forEach(function(v,k){ if(v.until<now) orderCache.delete(k); });
  }

  return res.status(200).json(payload);
};
