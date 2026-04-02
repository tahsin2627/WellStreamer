// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// ── Register Service Worker (PWA) ─────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(reg => {
        console.log('[PWA] Service Worker registered:', reg.scope)

        // Check for updates every 60 minutes
        setInterval(() => reg.update(), 60 * 60 * 1000)

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available — could show a toast here
              console.log('[PWA] New version available')
            }
          })
        })
      })
      .catch(err => console.warn('[PWA] SW registration failed:', err))
  })
}

// ── PWA install prompt ────────────────────────────────────────────────────
let deferredPrompt = null
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  deferredPrompt = e
  // Dispatch custom event so components can show install button
  window.dispatchEvent(new CustomEvent('pwa-installable', { detail: e }))
})

window.addEventListener('appinstalled', () => {
  deferredPrompt = null
  console.log('[PWA] App installed successfully')
})

// Export for use in components
export function showInstallPrompt() {
  if (deferredPrompt) {
    deferredPrompt.prompt()
    deferredPrompt.userChoice.then(result => {
      deferredPrompt = null
      return result.outcome
    })
  }
}
