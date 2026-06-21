// Rethink with AI — minimal offline shell. Never touches /api/ (those are POST, skipped anyway).
const CACHE = "rethink-with-ai-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (new URL(req.url).pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(res => { put(req, res.clone()); return res; }).catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(c => c || fetch(req).then(res => { put(req, res.clone()); return res; })));
});
function put(req, res) { if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res)).catch(() => {}); }
