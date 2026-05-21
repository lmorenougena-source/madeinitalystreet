/* =========================================================
   MADE IN ITALY STREET — STRIPE WEBHOOK
   Reçoit checkout.session.completed → envoie email de confirmation
   via Resend (https://resend.com)

   Vercel Serverless Function (Node 20+).

   Variables d'environnement requises (Vercel Dashboard → Settings → Env Vars) :
   - STRIPE_WEBHOOK_SECRET  : créé dans Stripe Dashboard → Developers → Webhooks
   - RESEND_API_KEY         : créé sur https://resend.com (3000 emails/mois gratuit)
   - RESEND_FROM_EMAIL      : ex. "Made in Italy Street <commandes@madeinitalystreet.fr>"
   - STRIPE_SECRET_KEY      : déjà utilisé pour create-checkout

   Configuration côté Stripe (à faire 1 fois) :
   1. Dashboard → Developers → Webhooks → Add endpoint
   2. URL : https://madeinitalystreet.fr/api/stripe-webhook
   3. Events : checkout.session.completed
   4. Copier le "Signing secret" → variable STRIPE_WEBHOOK_SECRET
========================================================= */
'use strict';

var crypto = require('crypto');

// Désactiver le bodyParser automatique de Vercel (on a besoin du body brut pour vérifier la signature)
module.exports.config = {
  api: { bodyParser: false }
};

// ---------- Helpers ----------
function getRawBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  var parts = sigHeader.split(',').reduce(function (acc, p) {
    var kv = p.split('=');
    acc[kv[0]] = kv[1];
    return acc;
  }, {});
  var timestamp = parts.t;
  var sig = parts.v1;
  if (!timestamp || !sig) return false;

  // Tolérance 5 min contre les replay attacks
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false;

  var signedPayload = timestamp + '.' + rawBody.toString('utf8');
  var expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch (_) {
    return false;
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtPriceCents(cents, currency) {
  var amount = (cents / 100).toFixed(2).replace('.', ',');
  return amount + ' ' + ((currency || 'eur').toUpperCase() === 'EUR' ? '€' : currency.toUpperCase());
}

// ---------- Email template (inline HTML — clients mail ne supportent pas <link>) ----------
function buildEmailHtml(data) {
  var lineItemsHtml = (data.lineItems || []).map(function (it) {
    return '<tr>' +
      '<td style="padding:8px 0;border-bottom:1px solid #eee;color:#0E0E0F;">' + escapeHtml(it.description) + ' <span style="color:#666;">× ' + it.quantity + '</span></td>' +
      '<td style="padding:8px 0;border-bottom:1px solid #eee;color:#0E0E0F;text-align:right;white-space:nowrap;">' + fmtPriceCents(it.amount_total, data.currency) + '</td>' +
      '</tr>';
  }).join('');

  return '<!doctype html>' +
'<html lang="fr"><head><meta charset="utf-8"><title>Commande confirmée</title></head>' +
'<body style="margin:0;padding:0;background:#F4E9D6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#0E0E0F;">' +
'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4E9D6;padding:32px 16px;">' +
'<tr><td align="center">' +
'<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 30px rgba(0,0,0,.08);">' +

// Header tricolore
'<tr><td style="background:linear-gradient(90deg,#008C45 0%,#008C45 33%,#F4E9D6 33%,#F4E9D6 66%,#C8102E 66%,#C8102E 100%);height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>' +

// Titre
'<tr><td style="padding:32px 32px 8px;text-align:center;background:#0E0E0F;color:#F4E9D6;">' +
'<h1 style="margin:0;font-family:Impact,sans-serif;font-size:28px;letter-spacing:.04em;text-transform:uppercase;">Made in Italy Street</h1>' +
'<p style="margin:6px 0 0;font-size:13px;opacity:.7;">Italian Street Food &amp; Smash Burgers · Lourdes</p>' +
'</td></tr>' +

// Big check + thanks
'<tr><td style="padding:36px 32px 16px;text-align:center;background:#0E0E0F;color:#F4E9D6;">' +
'<div style="width:64px;height:64px;border-radius:50%;background:#008C45;display:inline-block;line-height:64px;text-align:center;font-size:32px;color:#fff;font-weight:bold;">✓</div>' +
'<h2 style="margin:18px 0 6px;font-family:Impact,sans-serif;font-size:24px;letter-spacing:.02em;text-transform:uppercase;">Commande confirmée</h2>' +
'<p style="margin:0;font-size:14px;opacity:.78;">Merci ' + escapeHtml(data.customerName) + ' ! On prépare ta commande.</p>' +
'</td></tr>' +

// Code retrait
'<tr><td style="padding:24px 32px 0;text-align:center;">' +
'<p style="margin:0 0 6px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#666;font-weight:600;">Code de retrait</p>' +
'<div style="display:inline-block;padding:14px 24px;border:2px dashed #C8102E;border-radius:10px;font-family:Menlo,Monaco,monospace;font-size:32px;font-weight:bold;letter-spacing:.12em;color:#C8102E;">' + escapeHtml(data.pickupCode) + '</div>' +
'<p style="margin:10px 0 0;font-size:12px;color:#666;">Présente ce code (ou ce mail) au comptoir.</p>' +
'</td></tr>' +

// Créneau
(data.pickupSlot ? ('<tr><td style="padding:20px 32px 0;text-align:center;">' +
'<p style="margin:0;font-size:14px;color:#0E0E0F;"><strong>Créneau de retrait :</strong> ' + escapeHtml(data.pickupSlot) + '</p>' +
'</td></tr>') : '') +

// Récap commande
'<tr><td style="padding:24px 32px 8px;">' +
'<h3 style="margin:0 0 12px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#666;font-weight:700;">Ta commande</h3>' +
'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:14px;">' +
lineItemsHtml +
'<tr><td style="padding:14px 0 0;font-weight:bold;font-size:15px;color:#0E0E0F;">Total payé</td>' +
'<td style="padding:14px 0 0;font-weight:bold;font-size:15px;color:#C8102E;text-align:right;">' + fmtPriceCents(data.total, data.currency) + '</td></tr>' +
'</table>' +
'</td></tr>' +

// Adresse
'<tr><td style="padding:24px 32px;">' +
'<div style="padding:18px;background:#F4E9D6;border-radius:10px;text-align:center;">' +
'<p style="margin:0 0 8px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#666;font-weight:700;">À récupérer ici</p>' +
'<p style="margin:0;font-size:15px;font-weight:600;color:#0E0E0F;">102 rue de la Grotte, 65100 Lourdes</p>' +
'<p style="margin:6px 0 12px;font-size:13px;color:#666;">Tél. : <a href="tel:+33695286059" style="color:#C8102E;text-decoration:none;font-weight:600;">+33 6 95 28 60 59</a></p>' +
'<a href="https://www.google.com/maps/place/Made+in+Italy+-+Street+Food" style="display:inline-block;padding:10px 18px;background:#008C45;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Itinéraire Google Maps</a>' +
'</div></td></tr>' +

// Notes
(data.notes ? ('<tr><td style="padding:0 32px 16px;">' +
'<p style="margin:0;padding:12px;background:#fef9e7;border-left:3px solid #F5B335;font-size:13px;color:#666;border-radius:4px;"><strong>Tes notes :</strong> ' + escapeHtml(data.notes) + '</p>' +
'</td></tr>') : '') +

// Footer
'<tr><td style="padding:24px 32px;background:#0E0E0F;color:#F4E9D6;text-align:center;font-size:12px;opacity:.7;">' +
'<p style="margin:0 0 6px;">Made in Italy Street — Fatto con amore 🤌</p>' +
'<p style="margin:0;">Un souci ? <a href="tel:+33695286059" style="color:#F5B335;">Appelle-nous</a></p>' +
'</td></tr>' +

'</table></td></tr></table></body></html>';
}

// ---------- Récupérer line_items via API Stripe ----------
async function fetchLineItems(sessionId, stripeKey) {
  try {
    var r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + sessionId + '/line_items?limit=100', {
      headers: { 'Authorization': 'Bearer ' + stripeKey }
    });
    var data = await r.json();
    return (data.data || []).map(function (it) {
      return {
        description: it.description || (it.price && it.price.product && it.price.product.name) || 'Article',
        quantity: it.quantity,
        amount_total: it.amount_total
      };
    });
  } catch (e) {
    console.error('fetchLineItems error:', e);
    return [];
  }
}

// ---------- Envoi email via Resend ----------
async function sendEmail(to, subject, html, fromEmail, resendKey) {
  if (!resendKey || !fromEmail) {
    console.error('RESEND_API_KEY ou RESEND_FROM_EMAIL manquant');
    return { ok: false, error: 'missing_config' };
  }
  try {
    var r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + resendKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: subject,
        html: html,
        reply_to: 'contact@madeinitalystreet.fr'
      })
    });
    var data = await r.json();
    if (!r.ok) {
      console.error('Resend error:', data);
      return { ok: false, error: data };
    }
    return { ok: true, id: data.id };
  } catch (e) {
    console.error('Resend fetch error:', e);
    return { ok: false, error: e.message };
  }
}

// ---------- Handler ----------
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  var STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  var RESEND_KEY = process.env.RESEND_API_KEY;
  var FROM = process.env.RESEND_FROM_EMAIL;

  if (!SECRET || !STRIPE_KEY) {
    console.error('STRIPE_WEBHOOK_SECRET ou STRIPE_SECRET_KEY manquant');
    return res.status(500).json({ error: 'Config serveur manquante' });
  }

  // Lire le body brut (obligatoire pour vérifier la signature)
  var rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (e) {
    return res.status(400).json({ error: 'Body illisible' });
  }

  // Vérifier la signature Stripe
  var sig = req.headers['stripe-signature'];
  if (!verifyStripeSignature(rawBody, sig, SECRET)) {
    return res.status(400).json({ error: 'Signature invalide' });
  }

  // Parser l'event
  var event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    return res.status(400).json({ error: 'JSON invalide' });
  }

  // Ne traiter que les paiements complétés
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, ignored: event.type });
  }

  var session = event.data.object;
  var meta = session.metadata || {};
  var email = session.customer_email || (session.customer_details && session.customer_details.email);

  if (!email) {
    console.warn('Pas d\'email client sur la session', session.id);
    return res.status(200).json({ received: true, no_email: true });
  }

  // Récupérer les line_items
  var lineItems = await fetchLineItems(session.id, STRIPE_KEY);

  // Construire l'email
  var emailData = {
    customerName: meta.customer_name || 'à toi',
    pickupCode: meta.pickup_code || '—',
    pickupSlot: meta.pickup_slot || '',
    notes: meta.notes || '',
    lineItems: lineItems,
    total: session.amount_total,
    currency: session.currency
  };
  var html = buildEmailHtml(emailData);
  var subject = 'Ta commande est confirmée · Code ' + emailData.pickupCode + ' · Made in Italy Street';

  var result = await sendEmail(email, subject, html, FROM, RESEND_KEY);

  return res.status(200).json({
    received: true,
    email_sent: result.ok,
    email_id: result.id || null
  });
};
