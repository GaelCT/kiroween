// Reader's offline application shell. Saved articles themselves remain in localStorage.
// API routes are deliberately never cached: refresh, extraction, grouping, and AI comparison need the network.

const SHELL_CACHE = "reader-shell-v1";
const RUNTIME_CACHE = "reader-runtime-v1";
const CORE_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

function assetUrls(html) {
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = new URL(match[1], self.location.origin);
    if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
      urls.add(url.href);
    }
  }
  return [...urls];
}

async function putResponse(cache, url, response) {
  if (!response.ok) throw new Error(`Could not cache ${url}: HTTP ${response.status}`);
  await cache.put(url, response);
}

async function cacheDocument(response) {
  const cache = await caches.open(SHELL_CACHE);
  const html = await response.clone().text();
  await Promise.all(assetUrls(html).map(async (url) => {
    await putResponse(cache, url, await fetch(url, { cache: "reload" }));
  }));
  // Commit the HTML last so it never points at a partially cached asset set.
  await putResponse(cache, "/", response.clone());
}

async function cacheShell() {
  const response = await fetch("/", { cache: "reload" });
  await cacheDocument(response);
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(CORE_ASSETS.map(async (url) => {
    await putResponse(cache, url, await fetch(url, { cache: "reload" }));
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await cacheShell();
    // Do not reload open clients: their article and scroll position stay untouched.
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("reader-shell-") && key !== SHELL_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function navigation(event) {
  try {
    const response = await fetch(event.request);
    if (!response.ok) throw new Error(`Navigation returned HTTP ${response.status}`);
    // Refresh the shell and its hashed assets after a deployment, without delaying this page.
    event.waitUntil(cacheDocument(response.clone()).catch(() => {}));
    return response;
  } catch {
    const cached = await caches.match("/");
    if (cached) return cached;
    return new Response("<!doctype html><title>Reader is offline</title><h1>Reader is offline</h1><p>Reconnect once to prepare this browser for offline reading.</p>", {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(navigation(event));
    return;
  }

  const cacheable = url.pathname.startsWith("/_next/static/")
    || url.pathname.startsWith("/icons/")
    || url.pathname.startsWith("/sample-feeds/")
    || url.pathname === "/manifest.webmanifest";
  if (!cacheable) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    await putResponse(cache, request, response.clone());
    return response;
  })());
});
