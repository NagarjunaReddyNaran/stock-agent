// Bump this version on every deploy to force cache invalidation
const CACHE_VERSION = 'algo-trade-v5'

self.addEventListener('install', e => {
  // Skip waiting so new SW activates immediately
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  // Delete ALL old caches on activation
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  // Always go network-first for everything
  // Fall back to cache only when offline
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful GET responses for offline fallback
        if (e.request.method === 'GET' && res.status === 200) {
          const clone = res.clone()
          caches.open(CACHE_VERSION).then(c => c.put(e.request, clone))
        }
        return res
      })
      .catch(() => caches.match(e.request))
  )
})
