/* Filmbook service worker — offline-first for the whole app */
const VERSION = "filmbook-v16";
const CORE = [
  "./",
  "./index.html",
  "./styles.css?v=16",
  "./app.js?v=16",
  "./data.json",
  "./manifest.webmanifest",
  "./assets/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* images: cache-first (they never change); app shell + data: network-first
   so updates land immediately while offline still works */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  const isImage = /\.(jpg|png|svg)$/.test(new URL(e.request.url).pathname);
  if (isImage) {
    e.respondWith(
      caches.match(e.request).then((hit) =>
        hit ||
        fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
          return res;
        })
      )
    );
  } else {
    /* Navigation / shell / data: always prefer the live Coolify deploy.
       Match both "/" and "/index.html" so offline fallback still works. */
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(e.request);
          if (hit) return hit;
          if (e.request.mode === "navigate") {
            return (await caches.match("./index.html")) || caches.match("./");
          }
          return undefined;
        })
    );
  }
});
