import { useState, useCallback } from 'react'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import { useProviders } from './lib/useProviders.js'
import { Navbar } from './components/Navbar.jsx'
import { Icons } from './components/Icons.jsx'

import LoginPage from './pages/LoginPage.jsx'
import HomePage from './pages/HomePage.jsx'
import SearchPage from './pages/SearchPage.jsx'
import InfoPage from './pages/InfoPage.jsx'
import PlayerPage from './pages/PlayerPage.jsx'
import ProvidersPage from './pages/ProvidersPage.jsx'
import WatchlistPage from './pages/WatchlistPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'

import './styles.css'

const NAVBAR_PAGES = ['home', 'search', 'watchlist', 'history', 'providers']

function Shell() {
  const { user } = useAuth()
  const { installed } = useProviders()
  const [page, setPage] = useState('home')
  const [params, setParams] = useState({})

  const navigate = useCallback((p, ps = {}) => {
    setPage(p)
    setParams(ps)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  if (!user) return <LoginPage />

  const showNav = NAVBAR_PAGES.includes(page)

  return (
    <div className="app">
      <div className="ambient-orb orb-1" />
      <div className="ambient-orb orb-2" />

      {showNav && <Navbar page={page} navigate={navigate} />}

      {showNav && (
        <nav className="bottom-nav">
          {[
            { id: 'home', Icon: Icons.Home },
            { id: 'search', Icon: Icons.Search },
            { id: 'watchlist', Icon: Icons.Heart },
            { id: 'history', Icon: Icons.Clock },
            { id: 'providers', Icon: Icons.Puzzle },
          ].map(({ id, Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              style={{
                background: 'none', border: 'none',
                color: page === id ? 'var(--blue-bright)' : 'var(--muted)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '4px 12px', cursor: 'pointer', fontSize: 10,
                fontFamily: 'var(--font-body)',
              }}
            >
              <span style={{ width: 22, height: 22 }}><Icon /></span>
            </button>
          ))}
        </nav>
      )}

      <main className={showNav ? 'with-navbar' : ''}>
        {page === 'home'      && <HomePage      navigate={navigate} installed={installed} />}
        {page === 'search'    && <SearchPage    navigate={navigate} installed={installed} />}
        {page === 'info'      && <InfoPage      navigate={navigate} params={params} />}
        {page === 'player'    && <PlayerPage    navigate={navigate} params={params} />}
        {page === 'providers' && <ProvidersPage navigate={navigate} />}
        {page === 'watchlist' && <WatchlistPage navigate={navigate} />}
        {page === 'history'   && <HistoryPage   navigate={navigate} />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
