self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'Letters ✉';
  const options = {
    body: data.body || 'Tu as reçu une nouvelle lettre.',
    icon: '/letters-app/icon-192.png',
    badge: '/letters-app/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || 'https://letters-app.xyz' },
    actions: [{ action: 'open', title: 'Lire la lettre →' }]
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || 'https://letters-app.xyz';
  e.waitUntil(clients.matchAll({ type: 'window' }).then(wcs => {
    for (const wc of wcs) {
      if (wc.url === url && 'focus' in wc) return wc.focus();
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
