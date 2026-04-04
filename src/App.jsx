// src/App.jsx
import { useState, useEffect, useCallback } from 'react'
import { AuthProvider } from './lib/auth.jsx'
import { providerStorage } from './lib/storage.js'
import { Navbar } from './components/Navbar.jsx'
import { Icons } from './components/Icons.jsx'

import HomePage      from './pages/HomePage.jsx'
import SearchPage    from './pages/SearchPage.jsx'
import InfoPage      from './pages/InfoPage.jsx'
import PlayerPage    from './pages/PlayerPage.jsx'
import WatchlistPage from './pages/WatchlistPage.jsx'
import HistoryPage   from './pages/HistoryPage.jsx'

import './styles.css'

// ── Only these providers work reliably ───────────────────────────────────
const WORKING_PROVIDERS = [
  { value: 'MultiStream',   display_name: 'MultiStream',   type: 'global', icon: '' },
  { value: 'VegaMovies',    display_name: 'VegaMovies',    type: 'global', icon: '' },
  { value: 'MultiMovies',   display_name: 'MultiMovies',   type: 'global', icon: '' },
  { value: 'HindiLinks4u',  display_name: 'HindiLinks4u',  type: 'global', icon: '' },
]

const ANON = { username: 'guest' }
const NAVBAR = ['home', 'search', 'watchlist', 'history']
const stack = []  // navigation history

function Shell() {
  const [page,      setPage]      = useState('home')
  const [params,    setParams]    = useState({})
  const [providers, setProviders] = useState(WORKING_PROVIDERS)

  // Auto-install working providers on first load
  useEffect(() => {
    providerStorage.setInstalled(WORKING_PROVIDERS)
    setProviders(WORKING_PROVIDERS)
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
              style={{ background:'none', border:'none', color: page===id ? 'var(--accent2)' : 'var(--muted)',
                display:'flex', flexDirection:'column', alignItems:'center',
                padding:'4px 16px', cursor:'pointer', fontFamily:'var(--font-body)' }}>
              <span style={{ width:22, height:22 }}><Icon /></span>
            </button>
          ))}
        </nav>
      )}

      <main className={showNav ? 'with-navbar' : ''}>
        {page==='home'      && <HomePage      navigate={navigate} installed={providers} user={ANON} />}
        {page==='search'    && <SearchPage    navigate={navigate} installed={providers} user={ANON} />}
        {page==='info'      && <InfoPage      navigate={navigate} params={params}       user={ANON} goBack={goBack} />}
        {page==='player'    && <PlayerPage    navigate={navigate} params={params}                    goBack={goBack} />}
        {page==='watchlist' && <WatchlistPage navigate={navigate} user={ANON} />}
        {page==='history'   && <HistoryPage   navigate={navigate} user={ANON} />}
      </main>
    </div>
  )
}

export default function App() {
  return <AuthProvider><Shell /></AuthProvider>
}
