/* ANU service worker — caches the app shell so ANU opens offline.
   Bump CACHE whenever you change any file, so phones pick up the update. */
const CACHE = 'anu-shell-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css',
  './main.js',
  './core-util.js',
  './core-db.js',
  './core-ui.js',
  './core-router.js',
  './core-auth.js',
  './core-lockscreen.js',
  './core-backup.js',
  './core-home.js',
  './app-kaasu.js',
  './app-journal.js',
  './app-dumplings.js',
  './app-steps.js',
  './app-health.js',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Stale-while-revalidate: answer from cache instantly, refresh in the background.
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      if (cached) { e.waitUntil(network); return cached; }
      const res = await network;
      if (res) return res;
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    })
  );
});
