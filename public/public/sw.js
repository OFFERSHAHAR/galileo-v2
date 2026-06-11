const CACHE = "galileo-v2-cache-v8";
const STATIC = [
  "/",
  "/index.html",
  "/src/main.jsx",
  "/src/App.jsx",
];

// Install — cache static files
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {})
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener("fetch", e => {
  // Skip Google Apps Script calls — always online
  if (e.request.url.includes("script.google.com")) return;
  if (e.request.url.includes("googleapis.com")) return;
  if (e.request.url.includes("wa.me")) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful responses
        if (res.ok && e.request.method === "GET") {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => {
        // Offline fallback
        return caches.match(e.request)
          .then(cached => cached || caches.match("/index.html"));
      })
  );
});
