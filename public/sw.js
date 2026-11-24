self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open("mealwise-v4")
      .then((cache) =>
        cache.addAll([
          "/",
          "/manifest.webmanifest",
          "/icon.svg",
          "/apple-touch-icon.png",
          "/icon-192.png",
          "/icon-512.png",
          "/plate.svg",
          "/fonts/jakarta-regular.ttf",
          "/fonts/jakarta-semibold.ttf",
          "/fonts/jakarta-extrabold.ttf",
        ]),
      ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.delete("meal-ai-v1"),
      caches.delete("mealwise-v2"),
      caches.delete("mealwise-v3"),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  const isAsset = url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/") || /\.(svg|png|webmanifest)$/.test(url.pathname);
  if (!isAsset && event.request.mode !== "navigate") return;
  event.respondWith((async () => {
    const cache = await caches.open("mealwise-v4");
    if (isAsset) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
    }
    try {
      const response = await fetch(event.request);
      if (response.ok) event.waitUntil(cache.put(event.request.mode === "navigate" ? "/" : event.request, response.clone()).catch(() => undefined));
      return response;
    } catch {
      return await cache.match(event.request.mode === "navigate" ? "/" : event.request) || Response.error();
    }
  })());
});
