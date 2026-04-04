// src/main.jsx — kills SW + caches every load (fixes blank in old browser)
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

if ('serviceWorker' in navigator)
  navigator.serviceWorker.getRegistrations().then(r => r.forEach(sw => sw.unregister()))
if ('caches' in window)
  caches.keys().then(keys => keys.forEach(k => caches.delete(k)))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App/></React.StrictMode>
)
