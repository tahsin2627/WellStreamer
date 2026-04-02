// WellStreamer Service Worker
// Caches app shell for offline use and fast loads

const CACHE_NAME = 'wellstreamer-v1'
const STATIC_CACHE = 'wellstreamer-static-v1'

// App shell files to cache immediately
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
]

// ── Install: cache app shell ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(APP_SHELL).catch(() => {
        // Non-fatal — continue even if some files fail
      })
    })
  )
  self.skipWaiting()
})

// ── Activate: clean old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== STATIC_CACHE)
          .map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// ── Fetch: network-first for API, cache-first for assets ──────────────────
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET and external streaming URLs (don't cache video streams)
  if (request.method !== 'GET') return
  if (url.pathname.includes('.m3u8') || url.pathname.includes('.ts') || url.pathname.includes('.mp4')) return
  if (url.hostname.includes('googleapis') || url.hostname.includes('gstatic')) return

  // API calls: network only
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } })))
    return
  }

  // GitHub raw provider files: network only (always fresh)
  if (url.hostname.includes('raw.githubusercontent.com') || url.hostname.includes('github.com')) {
    event.respondWith(fetch(request))
    return
  }

  // App shell + static assets: stale-while-revalidate
  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request)
        .then(response => {
          if (response.ok && response.status < 400) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          }
          return response
        })
        .catch(() => cached || new Response('Offline', { status: 503 }))

      return cached || networkFetch
    })
  )
})

// ── Push notifications (future use) ──────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return
  const data = event.data.json()
  self.registration.showNotification(data.title || 'WellStreamer', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
  })
})
