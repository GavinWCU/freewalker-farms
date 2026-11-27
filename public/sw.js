// Offline support.
// - The page itself (index.html) is network-first: online players always get the
//   newest version right after a deploy; the cached copy is only used offline.
//   (Serving a stale page first breaks the game after an update, because the old
//   page points at JS files the new deploy has removed.)
// - Everything else (hashed JS/CSS/fonts, icons) is cache-first, saved as it loads.
const CACHE = 'freewalker-farms-v2';
self.addEventListener('install', (e) => {
  const scope = self.registration.scope;
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([scope, scope + 'manifest.webmanifest']).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.registration.scope)) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const save = (r) => { if (r.ok) c.put(e.request, r.clone()); return r; };
    if (e.request.mode === 'navigate') {
      try { return save(await fetch(e.request)); }
      catch { return (await c.match(e.request, { ignoreSearch: true })) || (await c.match(self.registration.scope)) || Response.error(); }
    }
    return (await c.match(e.request)) || fetch(e.request).then(save);
  }));
});
