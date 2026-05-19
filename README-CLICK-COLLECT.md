# Made in Italy Street — Click & Collect avec paiement Stripe

Système de commande en ligne avec paiement carte sécurisé, code de retrait à 6 caractères + QR code, et identification au comptoir.

---

## Architecture

```
[Navigateur client]
    │  ➊ panier (cart.js, localStorage)
    │
    ▼
[Frontend statique]                  ↘ ➍ Stripe Checkout (hébergé) ─┐
  index.html, carte.html               │  paiement carte / Apple Pay  │
  cart.js + cart-ui.js                 │  Aucun n° de carte ne touche │
                                       │  ton site (PCI-compliant)    │
    │ ➋ POST /api/create-checkout      │                              │
    ▼                                  │                              │
[Netlify Functions]                    │                              │
  create-checkout.js  ─────────────────┘                              │
  get-order.js                                                        │
    │  ↑ ➎ redirect /success.html?session_id=XXX                      │
    │  └ ➏ GET /api/get-order ──────► fetch Stripe Session ───────────┘
    ▼
[Stripe Dashboard]
  Voir les commandes payées
  Le code retrait est dans "metadata.pickup_code"
```

**Sécurité clé :**
- Le détail carte n'arrive **jamais** sur ton site (Stripe Checkout = page Stripe)
- Les prix sont **vérifiés côté serveur** depuis `catalog.json` (impossible de bidouiller les prix)
- Le code retrait est **cryptographiquement aléatoire** (6 chars d'un alphabet sans ambiguïté, ~10⁹ combinaisons)
- CSP + SRI + headers durcis
- Honeypot anti-bot + rate-limit IP (10 req/min)

---

## Déploiement en 10 minutes (Netlify + Stripe)

### 1. Crée un compte Stripe (gratuit)
- https://dashboard.stripe.com/register
- Récupère tes clés API : https://dashboard.stripe.com/apikeys
  - `Secret key` (commence par `sk_test_` en mode test) → tu vas l'utiliser sur Netlify
  - **Ne partage jamais cette clé !**

### 2. Push ce repo sur GitHub
- Tu l'as déjà fait apparemment ✅

### 3. Connecte Netlify
- https://app.netlify.com → **Add new site** → **Import from Git**
- Choisis GitHub → ton repo `made-in-italy-street`
- **Build settings** : laisse vide, Netlify détecte `netlify.toml`
- Clique **Deploy**

### 4. Configure les variables d'environnement
- Sur Netlify : **Site Settings → Environment variables**
- Ajoute :

| Clé | Valeur |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_xxx...` (copié depuis Stripe) |
| `ALLOWED_ORIGINS` | `https://TON-SITE.netlify.app` (l'URL Netlify, puis ton domaine perso quand tu l'auras) |
| `SITE_URL` | `https://TON-SITE.netlify.app` |

- Re-deploy : **Deploys → Trigger deploy → Deploy site**

### 5. Teste en mode TEST
- Va sur ton site Netlify, ajoute des produits, clique « Payer & retirer »
- Sur la page Stripe, utilise la **carte test** :
  - Numéro : `4242 4242 4242 4242`
  - Date : n'importe quelle date future
  - CVC : 3 chiffres au hasard
  - ZIP : 12345
- Tu seras redirigé sur `/success.html?session_id=cs_test_...`
- Tu vois ton **code retrait** + **QR code**
- Va sur ton **Stripe Dashboard → Payments** : tu retrouves la commande avec le code dans la metadata

### 6. Passe en LIVE quand tu es prêt
- Sur Stripe Dashboard : active le mode **Live** (en haut à droite)
- Récupère ta clé `sk_live_xxx`
- Sur Netlify : remplace `STRIPE_SECRET_KEY` par la clé live
- Re-deploy

⚠️ Avant le mode live, Stripe demande quelques infos légales (compte bancaire pour les virements, SIRET, etc.). Compte 10-20 min.

---

## Workflow équipe au comptoir

1. Le client arrive et donne son **code à 6 caractères** (ou montre son QR/écran)
2. Dans le tableau de bord Stripe (ou ton CRM si tu en as un) :
   - **Payments → Succeeded → trouver la commande**
   - Le code apparaît dans `metadata.pickup_code` + dans la description du paiement
3. Tu vois le **détail items**, le **créneau**, le **téléphone client**
4. Tu prépares + remets la commande

💡 **Astuce** : crée un dashboard Notion / Google Sheet pour suivre les commandes du jour avec leurs codes. Ou utilise Zapier (Stripe → Slack / Sheet) gratuit.

---

## Tester en local

```bash
# 1. Installe la CLI Netlify (une fois)
npm install -g netlify-cli

# 2. Crée un .env à partir du template
cp .env.example .env
# Édite .env avec ta clé sk_test_

# 3. Lance le dev server (Netlify Dev simule les Functions en local)
netlify dev
# → ouvre http://localhost:8888
```

Ou sans Netlify Dev (UI uniquement, le paiement ne marchera pas) :
```bash
python3 -m http.server 3456
# → http://localhost:3456
```

---

## Fichiers ajoutés / modifiés

| Fichier | Rôle |
|---|---|
| `netlify/functions/create-checkout.js` | Crée la Stripe Checkout Session (avec validation prix serveur) |
| `netlify/functions/get-order.js` | Récupère la commande après paiement (validation post-success) |
| `netlify/functions/catalog.json` | Catalogue produit serveur (source unique de vérité prix) |
| `success.html` + `assets/js/success.js` | Page confirmation post-paiement (code + QR) |
| `cancel.html` | Page d'annulation |
| `assets/js/qrcode.min.js` | QR encoder vendoré (MIT, Kazuhiko Arase, zero CDN) |
| `assets/js/cart.js` | Engine panier (inchangé) |
| `assets/js/cart-ui.js` | UI panier — flow paiement Stripe + fallback WhatsApp |
| `assets/css/cart.css` | Styles drawer + checkout |
| `netlify.toml` | Config redirects + headers sécurité |
| `package.json` | Métadonnées projet |
| `.env.example` | Template variables d'env |
| `.gitignore` | Exclut .env, node_modules… |

---

## Quand mettre à jour le catalogue serveur

Quand tu ajoutes / modifies / supprimes un produit dans `carte.html`, tu dois régénérer `netlify/functions/catalog.json`. Sinon le serveur rejettera les nouveaux produits ou utilisera les anciens prix.

Commande pour régénérer automatiquement depuis `carte.html` :

```bash
python3 << 'EOF'
import re, json
html = open('carte.html', encoding='utf-8').read()
catalog = []
for sec in re.finditer(r'<section id="([^"]+)"[\s\S]*?</section>', html):
    cat = sec.group(1); block = sec.group(0)
    for art in re.finditer(
        r'<article class="street-menu-card" data-product-id="([^"]+)" data-product-name="([^"]+)">'
        r'[\s\S]*?<span class="street-menu-card-price">([^<]+)</span>'
        r'[\s\S]*?<p class="street-menu-card-desc">([^<]+)</p>',
        block):
        pid,name,price,desc = art.groups()
        m = re.search(r'(\d+(?:[.,]\d+)?)', price.replace('\xa0',' '))
        catalog.append({'id':pid,'name':name.strip(),'desc':desc.strip(),
                        'price':float(m.group(1).replace(',','.')) if m else 0,
                        'category':cat})
open('netlify/functions/catalog.json','w',encoding='utf-8').write(json.dumps(catalog,ensure_ascii=False,indent=2))
print('OK:', len(catalog), 'produits')
EOF
```

---

## Sécurité — checklist

- [x] Aucune donnée carte ne transite par ton site
- [x] SRI sur les CDN externes (Lenis, GSAP)
- [x] CSP stricte (script-src whitelist, frame-ancestors 'none')
- [x] CORS lock sur ALLOWED_ORIGINS (CSRF protection)
- [x] Rate-limit IP (10 req/min)
- [x] Validation serveur des prix (anti-tampering)
- [x] Honeypot anti-bot
- [x] Code retrait crypto-random (crypto.randomBytes)
- [x] Pas de PII dans l'URL (session_id de Stripe uniquement)
- [x] HSTS, X-Frame-Options, X-Content-Type-Options
- [x] Cache headers stricts (no-store pour endpoints sensibles)

---

## Coûts

- **Stripe** : 1,5 % + 0,25 € par transaction européenne (pas d'abonnement)
- **Netlify** : free tier suffit (100 GB bande passante / mois, 125k invocations Functions)

Pour 100 commandes/mois × 15 € = 1 500 € → Stripe prend ~47 € → 1 453 € net
