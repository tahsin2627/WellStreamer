// src/App.jsx
// MoviesDrive (primary) + Multistream (secondary) ONLY
// Fetches exact provider names from manifest so no more 404s

import { useState, useEffect, useCallback } from 'react'
import { AuthProvider } from './lib/auth.jsx'
import { providerStorage } from './lib/storage.js'
import { fetchManifest } from './lib/providers.js'
import { Navbar } from './components/Navbar.jsx'
import { Icons } from './components/Icons.jsx'

import HomePage      from './pages/HomePage.jsx'
import SearchPage    from './pages/SearchPage.jsx'
import InfoPage      from './pages/InfoPage.jsx'
import PlayerPage    from './pages/PlayerPage.jsx'
import WatchlistPage from './pages/WatchlistPage.jsx'
import HistoryPage   from './pages/HistoryPage.jsx'

import './styles.css'

// ── Target provider display names (case-insensitive match against manifest) ───
// MoviesDrive = primary, Multistream = secondary
const TARGET_NAMES = ['MoviesDrive', 'Multistream']

const NAVBAR = ['home', 'search', 'watchlist', 'history']
const ANON = { username: 'guest' }
const stack = []

function Shell() {
  const [page,      setPage]      = useState('home')
  const [params,    setParams]    = useState({})
  const [providers, setProviders] = useState([])
  const [provReady, setProvReady] = useState(false)

  // On mount: fetch manifest, resolve exact provider values, auto-install
  useEffect(() => {
    ;(async () => {
      try {
        const manifest = await fetchManifest()

        // Find exact provider entries from manifest (case-insensitive)
        const resolved = TARGET_NAMES
          .map(name => manifest.find(p =>
            p.value.toLowerCase() === name.toLowerCase() ||
            p.display_name?.toLowerCase() === name.toLowerCase()
          ))
          .filter(Boolean)
          .map(p => ({
            value:        p.value,
            display_name: p.display_name || p.value,
            type:         p.type || 'global',
            icon:         p.icon || '',
          }))

        if (resolved.length > 0) {
          console.log('[App] Resolved providers:', resolved.map(p => p.value))
          providerStorage.setInstalled(resolved)
          setProviders(resolved)
        } else {
          // Manifest fetch failed or providers not found — use safe fallback names
          // These are guesses; if wrong the module fetch will 404 but won't crash
          console.warn('[App] Could not resolve from manifest, using fallback names')
          const fallback = [
            { value: 'MoviesDrive', display_name: 'MoviesDrive', type: 'global', icon: '' },
            { value: 'Multistream', display_name: 'Multistream', type: 'global', icon: '' },
          ]
          providerStorage.setInstalled(fallback)
          setProviders(fallback)
        }
      } catch (e) {
        console.error('[App] Provider init failed:', e)
        // Still show app even if providers fail
        setProviders([])
      } finally {
        setProvReady(true)
      }
    })()
  }, [])

  const navigate = useCallback((p, ps = {}) => {
    stack.push({ page, params })
    setPage(p); setParams(ps)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.history.pushState({ p }, '')
  }, [page, params])

  const goBack = useCallback(() => {
    if (stack.length > 0) {
      const prev = stack.pop()
      setPage(prev.page); setParams(prev.params)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else { setPage('home'); setParams({}) }
  }, [])

  // Android back button
  useEffect(() => {
    window.history.pushState({ p: 'home' }, '')
    const onPop = () => { goBack(); window.history.pushState({ p: page }, '') }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [goBack, page])

  const showNav = NAVBAR.includes(page)

  // Show loading state while resolving providers
  if (!provReady) {
    return (
      <div style={{ background: '#000', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, letterSpacing: 3, color: '#fff' }}>
          WELL<span style={{ color: '#e50914' }}>STREAMER</span>
        </div>
        <div style={{ width: 36, height: 36, border: '3px solid rgba(255,255,255,.1)', borderTopColor: '#e50914', borderRadius: '50%', animation: '_appspin .8s linear infinite' }} />
        <style>{'@keyframes _appspin{to{transform:rotate(360deg)}}'}</style>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="ambient-orb orb-1" />
      <div className="ambient-orb orb-2" />

      {showNav && <Navbar page={page} navigate={navigate} />}

      {showNav && (
        <nav className="bottom-nav">
          {[
            { id: 'home',      Icon: Icons.Home   },
            { id: 'search',    Icon: Icons.Search },
            { id: 'watchlist', Icon: Icons.Heart  },
            { id: 'history',   Icon: Icons.Clock  },
          ].map(({ id, Icon }) => (
            <button key={id} onClick={() => navigate(id)}
              style={{ background: 'none', border: 'none',
                color: page === id ? 'var(--accent2)' : 'var(--muted)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '4px 16px', cursor: 'pointer',
                fontFamily: 'var(--font-body)' }}>
              <span style={{ width: 22, height: 22 }}><Icon /></span>
            </button>
          ))}
        </nav>
      )}

      <main className={showNav ? 'with-navbar' : ''}>
        {page === 'home'      && <HomePage      navigate={navigate} installed={providers} user={ANON} />}
        {page === 'search'    && <SearchPage    navigate={navigate} installed={providers} user={ANON} />}
        {page === 'info'      && <InfoPage      navigate={navigate} params={params}       user={ANON} goBack={goBack} />}
        {page === 'player'    && <PlayerPage    navigate={navigate} params={params}                    goBack={goBack} />}
        {page === 'watchlist' && <WatchlistPage navigate={navigate} user={ANON} />}
        {page === 'history'   && <HistoryPage   navigate={navigate} user={ANON} />}
      </main>
    </div>
  )
}

export default function App() {
  return <AuthProvider><Shell /></AuthProvider>
}
