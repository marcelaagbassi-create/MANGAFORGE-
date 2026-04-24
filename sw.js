// ═══════════════════════════════════════════════════════════════
//  MANGAFORGE — Service Worker PWA
//  DAVIESLAY © 2026 — La forge des créateurs
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'mangaforge-v1.0.0';
const STATIC_CACHE = 'mangaforge-static-v1';
const DYNAMIC_CACHE = 'mangaforge-dynamic-v1';
const IMG_CACHE = 'mangaforge-images-v1';

// ── Ressources à mettre en cache immédiatement ──
const STATIC_ASSETS = [
  './mangaforge.html',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Rajdhani:wght@400;500;600;700&display=swap',
];

// ── Stratégies de cache ──
const CACHE_STRATEGIES = {
  // Images : Cache First (rapide, offline)
  images: ['uploads.mangadex.org', 'res.cloudinary.com', 'api.cloudinary.com'],
  // Firebase : Network First (toujours frais si possible)
  firebase: ['firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com'],
  // Fonts : Cache First (stables)
  fonts: ['fonts.googleapis.com', 'fonts.gstatic.com'],
  // MangaDex : Network First avec fallback
  mangadex: ['api.mangadex.org'],
};

// ── INSTALL ──
self.addEventListener('install', event => {
  console.log('[SW] Installing MangaForge v1.0.0...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Caching static assets...');
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Some static assets failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ──
self.addEventListener('activate', event => {
  console.log('[SW] Activating MangaForge...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== IMG_CACHE)
            .map(key => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const hostname = url.hostname;

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Chrome extensions and devtools
  if (event.request.url.startsWith('chrome-extension://')) return;

  // ── Firebase → Network First ──
  if (CACHE_STRATEGIES.firebase.some(h => hostname.includes(h))) {
    event.respondWith(networkFirst(event.request, DYNAMIC_CACHE, 3000));
    return;
  }

  // ── Images → Cache First ──
  if (
    CACHE_STRATEGIES.images.some(h => hostname.includes(h)) ||
    event.request.destination === 'image'
  ) {
    event.respondWith(cacheFirst(event.request, IMG_CACHE));
    return;
  }

  // ── Fonts → Cache First ──
  if (CACHE_STRATEGIES.fonts.some(h => hostname.includes(h))) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  // ── MangaDex API → Network First with fallback ──
  if (CACHE_STRATEGIES.mangadex.some(h => hostname.includes(h))) {
    event.respondWith(networkFirst(event.request, DYNAMIC_CACHE, 5000));
    return;
  }

  // ── Main HTML → Network First, fallback to cache ──
  if (event.request.destination === 'document') {
    event.respondWith(networkFirst(event.request, STATIC_CACHE, 3000));
    return;
  }

  // ── Default → Stale While Revalidate ──
  event.respondWith(staleWhileRevalidate(event.request, DYNAMIC_CACHE));
});

// ═══════════════════════════════════════════════════════════════
//  STRATÉGIES DE CACHE
// ═══════════════════════════════════════════════════════════════

// Cache First — sert depuis le cache, fetch si absent
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    return offlineFallback(request);
  }
}

// Network First — fetch d'abord, cache en fallback
async function networkFirst(request, cacheName, timeout = 3000) {
  const cache = await caches.open(cacheName);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return offlineFallback(request);
  }
}

// Stale While Revalidate — sert le cache immédiatement, met à jour en arrière-plan
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || fetchPromise || offlineFallback(request);
}

// ── Fallback offline ──
function offlineFallback(request) {
  if (request.destination === 'image') {
    // SVG placeholder forge
    return new Response(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
        <rect width="400" height="300" fill="#0d111f"/>
        <text x="200" y="150" text-anchor="middle" dominant-baseline="middle" font-size="48" font-family="serif" fill="#e63946" opacity="0.3">⛩</text>
        <text x="200" y="200" text-anchor="middle" font-size="12" font-family="sans-serif" fill="#444" letter-spacing="2">HORS LIGNE</text>
      </svg>`,
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
  if (request.destination === 'document') {
    return caches.match('./mangaforge.html');
  }
  return new Response('Hors ligne', { status: 503, statusText: 'Service Unavailable' });
}

// ── PUSH NOTIFICATIONS ──
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'Nouveau contenu sur MangaForge !',
    icon: data.icon || './icon-192.png',
    badge: './icon-192.png',
    tag: data.tag || 'mangaforge-notif',
    data: { url: data.url || './mangaforge.html' },
    actions: [
      { action: 'open', title: 'Ouvrir' },
      { action: 'dismiss', title: 'Ignorer' }
    ]
  };
  event.waitUntil(
    self.registration.showNotification(data.title || '⛩ MangaForge', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = (event.notification.data && event.notification.data.url) || './mangaforge.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('mangaforge') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── BACKGROUND SYNC ──
self.addEventListener('sync', event => {
  if (event.tag === 'sync-posts') {
    event.waitUntil(syncPendingPosts());
  }
});

async function syncPendingPosts() {
  console.log('[SW] Background sync: syncing pending posts...');
  // Posts en attente seraient stockés dans IndexedDB
  // Cette fonction les renverrait quand la connexion revient
}

console.log('[SW] MangaForge Service Worker loaded — DAVIESLAY © 2026');
