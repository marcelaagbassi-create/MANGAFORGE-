// ══════════════════════════════════════════════════════
//  MANGAFORGE — Service Worker PWA
//  Version : 1.0.0
// ══════════════════════════════════════════════════════

const CACHE_NAME = 'mangaforge-v1';
const CACHE_STATIC = 'mangaforge-static-v1';
const CACHE_DYNAMIC = 'mangaforge-dynamic-v1';

// Ressources à mettre en cache au démarrage
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/icon-maskable-512x512.png',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Rajdhani:wght@400;500;600;700&display=swap'
];

// ── INSTALLATION ──
self.addEventListener('install', event => {
  console.log('[MangaForge SW] Installation...');
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => {
        console.log('[MangaForge SW] Mise en cache des ressources statiques');
        // On utilise addAll avec gestion d'erreur pour ne pas bloquer si une ressource échoue
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Cache échoué pour:', url, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATION ──
self.addEventListener('activate', event => {
  console.log('[MangaForge SW] Activation...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_STATIC && key !== CACHE_DYNAMIC)
          .map(key => {
            console.log('[MangaForge SW] Suppression ancien cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH — Stratégie Network First avec fallback cache ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-GET et les APIs Firebase/Cloudinary/Anthropic
  if (request.method !== 'GET') return;
  if (url.hostname.includes('firebaseio.com')) return;
  if (url.hostname.includes('googleapis.com') && url.pathname.includes('/identitytoolkit')) return;
  if (url.hostname.includes('firestore.googleapis.com')) return;
  if (url.hostname.includes('anthropic.com')) return;
  if (url.hostname.includes('cloudinary.com')) return;
  if (url.hostname.includes('api.mangadex.org')) return;
  if (url.hostname.includes('corsproxy.io')) return;

  // Ressources statiques de l'app → Cache First
  if (url.pathname.endsWith('.html') ||
      url.pathname.endsWith('.json') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.ico') ||
      url.pathname.endsWith('.svg')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Polices Google Fonts → Cache First
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // CDN scripts (Firebase, QRCode, etc.) → Cache First
  if (url.hostname.includes('gstatic.com') ||
      url.hostname.includes('cdnjs.cloudflare.com') ||
      url.hostname.includes('jsdelivr.net')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Tout le reste → Network First
  event.respondWith(networkFirst(request));
});

// ── Stratégie Cache First ──
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return offlineFallback();
  }
}

// ── Stratégie Network First ──
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_DYNAMIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return offlineFallback();
  }
}

// ── Page hors-ligne ──
function offlineFallback() {
  return new Response(
    `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>MangaForge — Hors ligne</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0a0e1a;color:#fff;font-family:'Segoe UI',sans-serif;
       display:flex;align-items:center;justify-content:center;
       min-height:100vh;text-align:center;padding:20px}
  .wrap{max-width:320px}
  .icon{font-size:64px;margin-bottom:20px;
        filter:drop-shadow(0 0 20px rgba(230,57,70,.6))}
  h1{font-size:22px;font-weight:900;letter-spacing:.08em;margin-bottom:8px;
     background:linear-gradient(135deg,#e63946,#f4a261);
     -webkit-background-clip:text;-webkit-text-fill-color:transparent}
  p{font-size:13px;color:rgba(255,255,255,.4);line-height:1.7;margin-bottom:24px}
  button{background:linear-gradient(135deg,#e63946,#c1121f);border:none;
         color:#fff;padding:12px 28px;border-radius:10px;font-size:14px;
         font-weight:700;letter-spacing:.08em;cursor:pointer}
</style>
</head>
<body>
<div class="wrap">
  <div class="icon">⛩</div>
  <h1>MANGAFORGE</h1>
  <p>Vous êtes hors ligne.<br/>Reconnectez-vous à internet pour accéder à l'application.</p>
  <button onclick="location.reload()">RÉESSAYER</button>
</div>
</body>
</html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    }
  );
}

// ── Notifications Push (pour plus tard) ──
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'MangaForge', {
    body: data.body || '',
    icon: './icons/icon-192x192.png',
    badge: './icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || './' }
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || './')
  );
});
