// Thread Pocket Service Worker - Offline First
const CACHE_NAME = 'thread-pocket-v2';
const APP_SHELL = [
  '/tp/',
  '/tp/index.html',
  '/tp/share.html',
  '/tp/manifest.json'
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // API calls: network-first, cache response for offline
  if (url.pathname === '/tp/threads' || url.pathname === '/threads') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone and cache the response
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);
          });
          return response;
        })
        .catch(() => {
          // Offline: return cached version
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // Static files: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Return cache, but also update in background
        fetch(event.request).then((response) => {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response);
          });
        }).catch(() => {});
        return cached;
      }
      // Not in cache: fetch and cache
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);
          });
        }
        return response;
      });
    })
  );
});
