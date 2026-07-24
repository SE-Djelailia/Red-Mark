// Custom service worker source (vite-plugin-pwa `injectManifest` strategy).
// Replaces the fully auto-generated `generateSW` output so we have a place
// to add push/notificationclick handlers later — this file currently
// reproduces that generated output's behavior exactly (precache + cleanup,
// SPA navigation fallback, the two runtime-caching rules) with no
// functional change, so it can be tested in isolation before any push code
// is added.
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  type PrecacheEntry,
} from "workbox-precaching";
import { clientsClaim } from "workbox-core";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

declare global {
  interface ServiceWorkerGlobalScope {
    __WB_MANIFEST: Array<PrecacheEntry | string>;
  }
}

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

registerRoute(
  /^https:\/\/images\.unsplash\.com\/.*/i,
  new CacheFirst({
    cacheName: "unsplash-images",
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
  "GET",
);

registerRoute(
  /\/api\/.*/i,
  new NetworkFirst({
    cacheName: "api-cache",
    networkTimeoutSeconds: 10,
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 5 })],
  }),
  "GET",
);
