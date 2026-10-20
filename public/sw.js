// Echo Shelf's service worker.
//
// Two jobs:
//   1. Make the app installable, so it can sit on a home screen and be treated by
//      the OS as a media app rather than a browser tab.
//   2. Keep the shell available offline.
//
// It is deliberately conservative. Navigations go to the network first and only
// fall back to the cached shell; Next.js build output and API calls are never
// cached, so a new deploy cannot be served stale. Only the large immutable assets
// (the PDF worker, the OCR engine and icons) are cached first.

const CACHE = 'echo-shelf-v2';
const SHELL = ['/', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/icon.svg'];
/** Big, versioned files that never change under the same URL. */
const IMMUTABLE = ['/pdf.worker.min.mjs', '/ocr/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Never cache the app's build output or API responses.
  if (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/', copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached || Response.error())),
    );
    return;
  }

  if (IMMUTABLE.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
            }
            return response;
          }),
      ),
    );
  }
});
