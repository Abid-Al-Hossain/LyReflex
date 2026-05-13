/**
 * LyReflex — Minimal Service Worker
 *
 * Purpose: Replace any stale cached service worker that may be
 * intercepting and breaking API requests to Pixabay, Wikipedia,
 * Giphy, Picsum, etc.
 *
 * This SW intentionally does NOT cache anything and does NOT
 * intercept any fetch requests. It simply takes control immediately
 * so the broken cached version is replaced on first load.
 */

// Take control of all clients immediately (no waiting for reload)
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Intentionally NO fetch handler — all requests go to the network natively.
// A SW with no fetch handler does NOT intercept any requests.
