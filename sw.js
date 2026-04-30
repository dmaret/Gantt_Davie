const CACHE_NAME = 'atelier-plan-v20260503';

const PRECACHE_URLS = [
  './index.html',
  './app.js',
  './data.js',
  './styles.css',
  './views/gantt.js',
  './views/dashboard.js',
  './views/personnes.js',
  './views/projets.js',
  './views/kanban.js',
  './views/calendrier.js',
  './views/machines.js',
  './views/lieux.js',
  './views/stock.js',
  './views/bom.js',
  './views/absences.js',
  './views/deplacements.js',
  './views/commandes.js',
  './views/capacite.js',
  './views/ressources.js',
  './views/equipes.js',
  './views/plan.js',
  './views/modeles.js',
  './views/audit.js',
  './views/whatif.js'
];

// Install: precache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: network-first for index.html, cache-first for JS/CSS assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  const isHTML = event.request.destination === 'document' ||
                 url.pathname.endsWith('.html') ||
                 url.pathname === '/' ||
                 url.pathname === '';

  if (isHTML) {
    // Network-first for HTML
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first for JS/CSS assets
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            return response;
          });
        })
    );
  }
});
