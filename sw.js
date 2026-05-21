/* =========================================================
   Service Worker — Made in Italy Street
   Cache offline minimaliste : pages statiques + assets critiques
   Stratégie : Network-first pour HTML, Cache-first pour assets
========================================================= */
'use strict';

const CACHE_VERSION = 'mis-v1-20260521';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/carte.html',
  '/assets/css/street.css',
  '/assets/css/cart.css',
  '/assets/js/street.js',
  '/assets/js/translations.js',
  '/assets/img/icon-192.png',
  '/assets/img/icon-512.png',
  '/assets/img/apple-touch-icon.png',
  '/assets/img/hero-burger.webp',
  '/assets/img/bannierelogo.webp',
  '/assets/img/logoprincipal.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // addAll échoue si une ressource manque ; on utilise add() individuel
      Promise.all(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch(() => null)
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ne JAMAIS intercepter l'API Stripe / création de session
  if (url.pathname.startsWith('/api/')) return;
  if (url.host !== self.location.host) return;
  if (req.method !== 'GET') return;

  // Navigation HTML → network-first, fallback cache
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Assets statiques → cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Cache que les réponses OK et same-origin
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
