const CACHE_NAME = 'letters-v1';
const urlsToCache = ['/letters-app/', '/letters-app/index.html'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Letters', {
      body: data.body || '',
      icon: '/letters-app/icon-192.png',
      badge: '/letters-app/icon-192.png'
    })
  );
});
