/* ============================================================
   SWEEASK Service Worker — sw.js
   Offline-first PWA caching strategy
   ============================================================ */

var CACHE_NAME = 'sweeask-v1.1.0';
var RUNTIME_CACHE = 'sweeask-runtime-v1.1.0';

// Core files to cache on install (app shell)
var PRECACHE_URLS = [
  '/',
  '/index.html',
  '/app.html',
  '/about.html',
  '/support.html',
  '/updates.html',
  '/style.css',
  '/manifest.json',
  '/favicon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png'
];

// External CDN resources to cache
var CDN_URLS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Outfit:wght@400;600;700;800;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
];

/* ── INSTALL — cache core app shell ── */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[SW] Pre-caching app shell');
        // Cache local files
        var localPromise = cache.addAll(PRECACHE_URLS).catch(function(err) {
          console.warn('[SW] Some local files failed to cache:', err);
        });
        // Cache CDN files individually (don't fail if CDN is offline)
        var cdnPromises = CDN_URLS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] CDN cache failed for:', url, err);
          });
        });
        return Promise.all([localPromise].concat(cdnPromises));
      })
      .then(function() {
        console.log('[SW] Install complete');
        return self.skipWaiting();
      })
  );
});

/* ── ACTIVATE — clean up old caches ── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(cacheNames) {
        return Promise.all(
          cacheNames
            .filter(function(name) {
              return name !== CACHE_NAME && name !== RUNTIME_CACHE;
            })
            .map(function(name) {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(function() {
        console.log('[SW] Activate complete — claiming clients');
        return self.clients.claim();
      })
  );
});

/* ── FETCH — Cache-first for assets, Network-first for HTML ── */
self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = new URL(request.url);

  // Skip non-GET requests and chrome-extension URLs
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Strategy: Cache-first for static assets (CSS, JS, images, fonts)
  var isStaticAsset = (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  );

  if (isStaticAsset) {
    event.respondWith(cacheFirst(request));
  } else {
    // Network-first for HTML pages (keeps content fresh when online)
    event.respondWith(networkFirst(request));
  }
});

/* Cache-first strategy */
function cacheFirst(request) {
  return caches.match(request).then(function(cached) {
    if (cached) return cached;
    return fetch(request).then(function(response) {
      if (response && response.status === 200) {
        var responseClone = response.clone();
        caches.open(RUNTIME_CACHE).then(function(cache) {
          cache.put(request, responseClone);
        });
      }
      return response;
    }).catch(function() {
      // Return offline fallback for images
      if (request.destination === 'image') {
        return new Response(
          '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#1E1438"/><text x="50" y="55" text-anchor="middle" fill="#7C3AED" font-size="14">Offline</text></svg>',
          { headers: { 'Content-Type': 'image/svg+xml' } }
        );
      }
    });
  });
}

/* Network-first strategy */
function networkFirst(request) {
  return fetch(request).then(function(response) {
    if (response && response.status === 200) {
      var responseClone = response.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(request, responseClone);
      });
    }
    return response;
  }).catch(function() {
    // Fall back to cache when offline
    return caches.match(request).then(function(cached) {
      if (cached) return cached;
      // Final fallback: serve app.html for any navigation
      if (request.mode === 'navigate') {
        return caches.match('/app.html');
      }
      return new Response('Offline — please connect to the internet', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
      });
    });
  });
}

/* ── PUSH NOTIFICATIONS (future) ── */
self.addEventListener('push', function(event) {
  if (!event.data) return;
  var data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Sweeask', {
      body: data.body || 'You have a new notification',
      icon: '/pwa-192x192.png',
      badge: '/favicon.png',
      tag: 'sweeask-notif',
      renotify: true
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/app.html')
  );
});

console.log('[SW] Sweeask Service Worker v1.1.0 loaded');
