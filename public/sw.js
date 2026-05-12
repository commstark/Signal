// Minimal service worker: PWA install + offline-queue background sync hook.
// We intentionally don't cache app shell yet (Phase 1) to avoid stale-deploy gotchas.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'signal-flush-queue') {
    event.waitUntil(notifyClientsToFlush());
  }
});

async function notifyClientsToFlush() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clients) c.postMessage({ type: 'flush-queue' });
}
