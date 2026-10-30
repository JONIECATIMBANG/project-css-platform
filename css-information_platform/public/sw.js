"use strict";
// Service worker: lets Chrome install the site as an app and shows a friendly page when offline.
// Data (/api, /files) is never cached, so users always see live, permission-checked content.
const CACHE = "css-platform-v6";
const SHELL = ["/offline.html", "/logo.png", "/style.css", "/css/dashboard.css", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/files/")) return; // always live
  // network first, fall back to cache, then to the offline page for page loads
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("/offline.html") : Response.error())))
  );
});
