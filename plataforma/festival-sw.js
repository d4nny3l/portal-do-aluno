const CACHE_NAME = "salta-festival-shell-v1";
const SHELL_FILES = [
  "./festival-consciencia-negra.html",
  "../salta-theme.css?v=festival-1",
  "./assets/brasao-escola.svg",
  "./assets/voces-da-ancestralidade-africa.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(
    SHELL_FILES.map(path => new URL(path, self.registration.scope).href)
  )).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("salta-festival-shell-") && key !== CACHE_NAME).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(request, { ignoreSearch: true }) || Response.error();
  }));
});
