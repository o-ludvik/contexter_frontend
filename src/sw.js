// Service worker. The precache list and cache version are filled in at build time (see vite.config.ts).
const PRECACHE = __PRECACHE__;
const CACHE = 'contexter-__VERSION__';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('contexter-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only same-origin GETs. GitHub API calls go straight to the network.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // auth.json: network first so a re-encrypted token is picked up, cache as offline fallback.
  if (url.pathname.endsWith('/auth.json')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || Response.error())),
    );
    return;
  }

  // App navigations (any route, incl. share-target URLs with query strings) -> cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(new URL('./', self.registration.scope).href).then((r) => r || fetch(req)),
    );
    return;
  }

  event.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
