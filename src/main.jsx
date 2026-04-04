// src/main.jsx
// Kills stale service workers + old caches on EVERY load
// This permanently fixes "works in incognito but not regular browser"

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// ── Kill ALL stale service workers synchronously before React renders ─────────
// Root cause of "blank in old browser": old SW cached broken JS bundle
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => {
      r.unregister()
      console.log('[SW] Unregistered:', r.scope)
    })
  })
}

// ── Clear ALL caches ──────────────────────────────────────────────────────────
if ('caches' in window) {
  caches.keys().then(keys => {
    keys.forEach(k => {
      caches.delete(k)
      console.log('[Cache] Deleted:', k)
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
