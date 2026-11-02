// Keeps the app working with no signal (venues rarely have any).
// Always tries the network first so a new version shows up straight away.

const CACHE = 'guestlist-v1';
const NETWORK_WAIT = 2500;
const CORE = [
  '/',
  '/css/app.css',
  '/js/app.js',
  '/js/parse.js',
  '/js/store.js',
  '/js/share.js',
  '/js/wreath.js',
  '/js/pdf.js',
  '/vendor/jspdf.umd.min.js',
  '/fonts/cormorant.woff2',
  '/fonts/cormorant-italic.woff2',
  '/fonts/jost.woff2',
  '/fonts/pdf/cormorant-medium.ttf',
  '/fonts/pdf/cormorant-semibold.ttf',
  '/fonts/pdf/cormorant-italic.ttf',
  '/fonts/pdf/jost-regular.ttf',
  '/fonts/pdf/jost-medium.ttf',
  '/icons/icon.svg',
  '/manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  const fallback = () => caches.match(request, { ignoreSearch: true }).then((hit) => hit || (request.mode === 'navigate' ? caches.match('/') : undefined));

  e.respondWith(
    (async () => {
      const network = fetch(request).then(async (res) => {
        if (res.ok) (await caches.open(CACHE)).put(request, res.clone());
        return res;
      });
      network.catch(() => {});
      const slow = new Promise((resolve) => setTimeout(resolve, NETWORK_WAIT));
      const first = await Promise.race([network.catch(() => null), slow]);
      if (first) return first;
      return (await fallback()) || network;
    })()
  );
});
