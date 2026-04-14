const CACHE_NAME = 'signbridge-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/main.css',
  './css/components.css',
  './css/animations.css',
  './js/app.js',
  './js/settings.js',
  './js/avatar.js',
  './js/gesture.js',
  './js/camera.js',
  './js/speech.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  // Stale-while-revalidate for local assets, network-first for CDNs
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          // Only cache our own assets, let browser handle CDNs naturally to avoid CORS quota issues
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Assume offline
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
