/**
 * Service worker — rend le jeu jouable hors-ligne.
 *
 * Stratégie : cache-first sur une liste figée de fichiers. Le jeu n'a
 * aucune donnée distante, donc rien ne justifie d'aller sur le réseau
 * une fois l'app installée.
 *
 * IMPORTANT : incrémenter CACHE_VERSION à chaque déploiement, sinon les
 * téléphones qui ont déjà l'app continueront de servir l'ancienne
 * version depuis leur cache.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `undercover-${CACHE_VERSION}`;

const ASSETS = [
  '.',
  'index.html',
  'style.css',
  'app.js',
  'core.js',
  'words.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;

      return fetch(event.request).catch(() =>
        // Navigation hors-ligne vers une URL non cachée : on retombe sur
        // la page du jeu plutôt que sur l'écran d'erreur du navigateur.
        event.request.mode === 'navigate' ? caches.match('index.html') : Response.error(),
      );
    }),
  );
});
