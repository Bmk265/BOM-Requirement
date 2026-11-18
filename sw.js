const VERSION = 'v1.0.2';
const SHELL_CACHE = `bom-shell-${VERSION}`;
const DATA_CACHE = `bom-data-${VERSION}`;

// Cache the app shell + the Excel library + the icon
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

// Install: Cache the shell and CDN
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return Promise.all(
        SHELL_URLS.map(url => cache.add(url).catch(err => console.warn('Failed to cache:', url)))
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up old versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== SHELL_CACHE && key !== DATA_CACHE).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Intercept requests
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Data files (bom.csv, bom.xlsx) -> Network First, fallback to cache
  if (/\/bom\.(csv|xlsx|xls)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  // 2. HTML navigation -> Network First so updates propagate
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirst(req, SHELL_CACHE));
    return;
  }

  // 3. CDN (xlsx) & Icons -> Cache First
  event.respondWith(cacheFirst(req, SHELL_CACHE));
});

// Strategy: Network First
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  // Strip query strings for cache keys
  const cacheKey = new Request(req.url.split('?')[0], { method: 'GET' });
  
  try {
    const fresh = await fetch(cacheKey, { cache: 'no-store' });
    if (fresh.ok) await cache.put(cacheKey, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    return new Response('Offline — resource not cached', { status: 503 });
  }
}

// Strategy: Cache First
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    return new Response('', { status: 504 });
  }
}
