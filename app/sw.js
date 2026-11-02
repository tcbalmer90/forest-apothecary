// Service worker: keeps a copy of the app on the phone so it works offline.
// Change VERSION whenever any app file changes, so phones fetch the new copy.
const VERSION = 'v10';
const CACHE = `apothecary-${VERSION}`;

const FILES = [
  './',
  'index.html',
  'styles.css',
  'js/app.js',
  'js/db.js',
  'js/state.js',
  'js/util.js',
  'js/sheet.js',
  'js/bottle.js',
  'js/flows.js',
  'js/today.js',
  'js/history.js',
  'js/settings.js',
  'js/stock.js',
  'manifest.webmanifest',
  'fonts/im-fell-english.woff2',
  'fonts/im-fell-english-italic.woff2',
  'fonts/karla.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

// First visit: save every app file
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // 'reload' skips GitHub's 10-minute copy so a new version never saves old files
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// New version: throw away the old saved copy
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page asks which version is running, to show in Settings
self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source.postMessage({ version: VERSION });
});

// Every request: use the saved copy first, fall back to the internet
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then((hit) => hit || fetch(event.request))
  );
});
