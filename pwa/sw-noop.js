/* MoorishSW noop — kill switch.
 *
 * If the live service worker ever misbehaves, repin the `mt-pwa` Cloudflare
 * zone worker to serve THIS file at /sw.js. Every reader's browser replaces
 * the old worker with this empty one on its next update check: no fetch
 * handler means the browser goes straight to the network again.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
