const CACHE = "toy-story-v16";
const ASSETS = [
  "./",
  "./index.html",
  "./pong.html",
  "./jumper.html",
  "./style.css",
  "./pong.js",
  "./jumper.js",
  "./snake.html",
  "./snake.js",
  "./manifest.webmanifest",
  "./service-worker.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).catch(() => caches.match("./index.html"));
    })
  );
});
