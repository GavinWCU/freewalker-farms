// Offline support: serve from cache, refresh the cache from the network in the background.
const CACHE = 'freewalker-farms-v1';
self.addEventListener('install', (e) => {
  const scope = self.registration.scope;
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([scope, scope + 'manifest.webmanifest']).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
