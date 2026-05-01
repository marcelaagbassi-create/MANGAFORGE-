/* ══════════════════════════════════════════════
   MangaForge — Service Worker v1.2
   © 2026 DAVIESLAY — La forge des créateurs
   ══════════════════════════════════════════════ */

const CACHE_NAME = 'mangaforge-v1.2';
const STATIC_CACHE = 'mangaforge-static-v1.2';
const DYNAMIC_CACHE = 'mangaforge-dynamic-v1.2';
const IMAGE_CACHE = 'mangaforge-images-v1.2';

// Ressources à mettre en cache immédiatement
const STATIC_ASSETS = [
  '/mangaforge.html',
  '/manifest.json',
  '/icon.svg',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Rajdhani:wght@400;500;600;700&display=swap'
];

// ── INSTALLATION ──
self.addEventListener('install', event => {
  console.log('[MangaForge SW] Installation v1.2...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[MangaForge SW] Cache statique en cours...');
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err =>
              console.warn('[MangaForge SW] Impossible de cacher:', url, err)
            )
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATION (nettoyage anciens caches) ──
self.addEventListener('activate', event => {
  console.log('[MangaForge SW] Activation...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => ![STATIC_CACHE, DYNAMIC_CACHE, IMAGE_CACHE].includes(key))
          .map(key => {
            console.log('[MangaForge SW] Suppression ancien cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── STRATÉGIE DE FETCH ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne pas intercepter les requêtes Firebase / Cloudinary / MangaDex
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('cloudfunctions.net') ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('api.mangadex.org') ||
    url.hostname.includes('uploads.mangadex.org') ||
    request.method !== 'GET'
  ) {
    return;
  }

  // Images → Cache First (mise en cache longue durée)
  if (request.destination === 'image' || url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // Polices Google → Cache First
  if (url.hostname.includes('fonts.')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML principal → Network First (toujours récupérer la dernière version)
  if (request.destination === 'document' || url.pathname.includes('mangaforge')) {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  // Reste → Stale While Revalidate
  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
});

// ── STRATÉGIES ──

// Cache First : tente le cache, sinon réseau + mise en cache
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503, statusText: 'Hors ligne' });
  }
}

// Network First : tente le réseau, sinon cache
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Page hors ligne de secours
    return new Response(offlinePage(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

// Stale While Revalidate : retourne le cache immédiatement, met à jour en arrière-plan
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || fetchPromise;
}

// ── PAGE HORS LIGNE ──
function offlinePage() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>MangaForge — Hors ligne</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0a0e1a;color:#f0f0f0;font-family:'Segoe UI',sans-serif;
         display:flex;flex-direction:column;align-items:center;justify-content:center;
         min-height:100vh;text-align:center;padding:24px}
    .icon{font-size:72px;margin-bottom:20px;opacity:.6}
    h1{font-size:28px;font-weight:900;background:linear-gradient(135deg,#e63946,#f4a261);
       -webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:10px}
    p{color:#888;font-size:15px;line-height:1.7;max-width:320px;margin-bottom:28px}
    button{background:linear-gradient(135deg,#e63946,#c1121f);border:none;color:#fff;
           padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;
           cursor:pointer;letter-spacing:.06em}
  </style>
</head>
<body>
  <div class="icon">⛩</div>
  <h1>MANGAFORGE</h1>
  <p>Vous êtes hors ligne.<br>Reconnectez-vous pour accéder à la forge des créateurs.</p>
  <button onclick="location.reload()">↺ RÉESSAYER</button>
</body>
</html>`;
}

// ── PUSH NOTIFICATIONS ──
self.addEventListener('push', event => {
  let data = { title: 'MangaForge', body: 'Nouvelle activité sur la forge !', icon: '/icon.svg' };
  try { data = { ...data, ...event.data.json() }; } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon.svg',
      badge: '/icon.svg',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/mangaforge.html' },
      actions: [
        { action: 'open', title: '📖 Ouvrir' },
        { action: 'dismiss', title: 'Fermer' }
      ]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || '/mangaforge.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('mangaforge') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

console.log('[MangaForge SW] Service Worker v1.2 chargé ✅');
