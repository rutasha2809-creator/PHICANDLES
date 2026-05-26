const CACHE = 'phicandles-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/assets/css/styles.css',
  '/assets/js/base.js',
  '/assets/img/favicon.svg',
  '/assets/img/brand-wordmark.svg',
  '/assets/img/icon-192.png',
  '/data/catalog.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Стратегия: сначала сеть, при ошибке — кэш
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Не кэшируем запросы к API
  if (url.hostname === 'api.phicandles.ru') return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
