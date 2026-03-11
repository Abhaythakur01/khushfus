/// <reference lib="webworker" />

const CACHE_NAME = "khushfus-v1";
const APP_SHELL_URLS = ["/", "/dashboard"];

// Install: cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS)),
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

// Fetch: different strategies based on request type
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip cross-origin requests (except CDN assets)
  if (url.origin !== self.location.origin) return;

  // API calls: network first, cache fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Static assets (JS, CSS, images, fonts): cache first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // Navigation / HTML: network first, cache fallback
  event.respondWith(networkFirstStrategy(request));
});

/**
 * Network first, falling back to cache.
 * Caches successful responses for offline use.
 */
async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // For navigation requests, return cached root page
    if (request.mode === "navigate") {
      const fallback = await caches.match("/");
      if (fallback) return fallback;
    }

    return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
  }
}

/**
 * Cache first, falling back to network.
 * Best for versioned static assets.
 */
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
  }
}

/**
 * Check if a URL path is a static asset.
 */
function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)(\?.*)?$/.test(pathname) ||
    pathname.startsWith("/_next/static/");
}
