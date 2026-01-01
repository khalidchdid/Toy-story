importScripts("./version.js");
const CACHE = "toy-story-v" + self.TOY_STORY_VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./games.html",
  "./games/pong.html",
  "./games/jumper.html",
  "./style.css",
  "./games/pong.js",
  "./games/jumper.js",
  "./games/snake.html",
  "./games/snake.js",
  "./manifest.webmanifest",
  "./service-worker.js",
  "./version.js",
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
  const req = event.request;
  const url = new URL(req.url);

  const isAppShell =
    req.mode === "navigate" ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/version.js");

  if (isAppShell) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});
