self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'CROSSWORDS';
  const options = {
    body: data.body || "Today's daily challenge is live!",
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'daily-challenge',
    renotify: true,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});
