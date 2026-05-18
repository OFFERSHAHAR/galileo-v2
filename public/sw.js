try {
  importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
} catch (e) {}

const CACHE = "galileo-v2-cache-v6";
const STATIC = [
  "/",
  "/index.html",
  "/src/main.jsx",
  "/src/App.jsx",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.url.includes("script.google.com")) return;
  if (e.request.url.includes("googleapis.com")) return;
  if (e.request.url.includes("wa.me")) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && e.request.method === "GET") {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(cached => cached || caches.match("/index.html")))
  );
});
