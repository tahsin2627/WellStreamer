// src/App.jsx
// Fixed: wraps with AuthProvider (required by Navbar), no login wall, back button works
import { useState, useCallback, useEffect } from 'react'
import { AuthProvider } from './lib/auth.jsx'
import { useProviders } from './lib/useProviders.js'
import { Navbar } from './components/Navbar.jsx'
import { Icons } from './components/Icons.jsx'

import HomePage      from './pages/HomePage.jsx'
import SearchPage    from './pages/SearchPage.jsx'
import InfoPage      from './pages/InfoPage.jsx'
import PlayerPage    from './pages/PlayerPage.jsx'
import ProvidersPage from './pages/ProvidersPage.jsx'
import WatchlistPage from './pages/WatchlistPage.jsx'
import HistoryPage   from './pages/HistoryPage.jsx'

import './styles.css'

const NAVBAR_PAGES = ['home', 'search', 'watchlist', 'history', 'providers']
const pageStack = []  // back-button history

function Shell() {
  const { installed } = useProviders()
  const [page,   setPage]   = useState('home')
  const [params, setParams] = useState({})

  const navigate = useCallback((p, ps = {}) => {
    pageStack.push({ page, params })
    setPage(p)
    setParams(ps)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.history.pushState({ p }, '')
  }, [page, params])

  const goBack = useCallback(() => {
    if (pageStack.length > 0) {
      const prev = pageStack.pop()
      setPage(prev.page)
      setParams(prev.params)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      setPage('home')
      setParams({})
    }
  }, [])

  // Android hardware back button — intercept popstate
  useEffect(() => {
    window.history.pushState({ p: 'home' }, '')
    const onPop = () => {
      goBack()
      window.history.pushState({ p: page }, '')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [goBack, page])

  const showNav = NAVBAR_PAGES.includes(page)
  const ANON = { username: 'guest' }

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
            { id: 'providers', Icon: Icons.Puzzle },
          ].map(({ id, Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              style={{
                background: 'none', border: 'none',
                color: page === id ? 'var(--blue-bright)' : 'var(--muted)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '4px 12px', cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}
            >
              <span style={{ width: 22, height: 22 }}><Icon /></span>
            </button>
          ))}
        </nav>
      )}

      <main className={showNav ? 'with-navbar' : ''}>
        {page === 'home'      && <HomePage      navigate={navigate} installed={installed} user={ANON} />}
        {page === 'search'    && <SearchPage    navigate={navigate} installed={installed} user={ANON} />}
        {page === 'info'      && <InfoPage      navigate={navigate} params={params}       user={ANON} goBack={goBack} />}
        {page === 'player'    && <PlayerPage    navigate={navigate} params={params}                    goBack={goBack} />}
        {page === 'providers' && <ProvidersPage navigate={navigate} />}
        {page === 'watchlist' && <WatchlistPage navigate={navigate} user={ANON} />}
        {page === 'history'   && <HistoryPage   navigate={navigate} user={ANON} />}
      </main>
    </div>
  )
}

// AuthProvider wraps Shell so useAuth() calls in Navbar don't crash
export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
