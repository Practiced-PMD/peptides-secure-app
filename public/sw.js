// Service worker: caches the app shell so it installs and works offline.
// Locked section bodies are fetched at runtime from /api/get-content (never precached here).
const CACHE = 'peptides-practiced-v50';
const ASSETS = [
  './',
  './index.html',
  './library-data.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png'
];

// Sign-in note: the license token and device id live in localStorage, which this
// service worker never touches. Bumping CACHE only swaps this app's cached files.

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // only clear OUR old app-shell caches (peptides-practiced-vNN), nothing else
      .then(keys => Promise.all(keys.filter(k => k.startsWith('peptides-practiced-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Pages and the content index are fetched NETWORK-FIRST, so an update shows up the next
// time the app is opened (no need to delete and re-add the app, or clear site data, which
// WOULD sign the user out). The cached copy is used only when offline or the network stalls.
const NETWORK_TIMEOUT_MS = 4000;
function isAppShell(req) {
  if (req.mode === 'navigate') return true;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return false;
  const p = u.pathname;
  return p === '/' || p.endsWith('.html') || p.endsWith('/') || p.endsWith('/library-data.js') || p.endsWith('/manifest.json');
}
function putInCache(req, resp) {
  if (resp && resp.status === 200 && req.url.startsWith(self.location.origin)) {
    const copy = resp.clone();
    caches.open(CACHE).then(c => c.put(req, copy));
  }
  return resp;
}
function networkFirst(req) {
  const net = fetch(req).then(resp => putInCache(req, resp));
  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS));
  const fromCache = () => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
  return Promise.race([net.catch(() => undefined), timeout])
    .then(resp => resp || fromCache())
    .then(resp => resp || net);   // nothing cached yet: wait for the network after all
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Never cache the licensed API — always go to network so auth + device checks run live.
  if (e.request.url.includes('/api/')) return;
  if (isAppShell(e.request)) { e.respondWith(networkFirst(e.request)); return; }
  // Icons and other static files: cache-first.
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => putInCache(e.request, resp)))
      .catch(() => caches.match('./index.html'))
  );
});
