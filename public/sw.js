// Selah Live service worker: caches the app shell so it opens offline.
const CACHE = "selah-shell-v2";
const SHELL = ["/", "/app/scripture", "/login", "/icons/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.allSettled(
        SHELL.map((url) =>
          fetch(url, { credentials: "same-origin" }).then((res) => {
            if (res.ok && !res.redirected) return c.put(url, res);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/ops-") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !res.redirected && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("/app/scripture")))
  );
});
