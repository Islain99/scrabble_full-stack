/* public/push-sw.js
 *
 * Notifications push (lot 7), importé par le service worker de la PWA
 * (vite.config.js → workbox.importScripts).
 *
 * Firebase Cloud Messaging nous envoie des messages « data » :
 *   { data: { title, body, url, tag, category } }
 * On les affiche seulement si aucune fenêtre de l'app n'est au premier plan
 * (sinon la cloche et les badges suffisent). Un appui ouvre la bonne page.
 */

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const data = payload.data || payload.notification || {};
  const title = data.title || 'Scrabble';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.some((w) => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      icon: '/icons/pwa-192.png',
      badge: '/icons/pwa-192.png',
      data: { url: data.url || '#/' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '#/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((w) => new URL(w.url).origin === self.location.origin);
    if (client) {
      await client.focus();
      client.postMessage({ type: 'push-open', url });
      return;
    }
    await self.clients.openWindow('/' + url);
  })());
});
