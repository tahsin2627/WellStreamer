// src/main.jsx
// CRITICAL: Unregisters any old service workers, then renders app
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// ── Kill stale service workers immediately ────────────────────────────────
// This fixes "works in incognito but not normal browser" — old SW was caching
// broken JS. We unregister ALL service workers on every load.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(reg => {
      reg.unregister()
      console.log('[SW] Unregistered stale service worker:', reg.scope)
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
