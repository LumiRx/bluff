/* The whole game is one file with no dependencies, so the service worker has an
   easy job: cache the shell, serve it instantly, and quietly fetch a newer copy
   in the background. Bump CACHE on every release -- old caches are dropped on
   activate, so a stale build can never outlive a deploy. */
const CACHE = 'bluff-v1.1.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // stale-while-revalidate: the game opens instantly offline, and the next
  // launch has whatever shipped since.
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req).then(hit => {
        const net = fetch(req)
          .then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; })
          .catch(() => hit);
        return hit || net;
      })
    )
  );
});
