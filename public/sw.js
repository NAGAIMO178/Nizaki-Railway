// Service Worker for Kanzaki Railway Web Push Notifications
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle push event (Web Push payload)
self.addEventListener('push', (event) => {
  let data = {
    title: '神埼線 運行情報',
    body: '神埼線で約10分の遅延が発生しています。',
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: './icon.png',
    badge: './icon.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'kanzaki-push',
    renotify: true,
    data: {
      url: data.url || './',
      timestamp: Date.now(),
    },
    actions: [
      { action: 'open', title: '詳細を確認' },
      { action: 'close', title: '閉じる' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./');
      }
    })
  );
});
