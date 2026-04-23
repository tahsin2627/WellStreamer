import { useState, useCallback } from 'react'
import { useProviders } from './lib/useProviders.js'
import { Navbar } from './components/Navbar.jsx'
import HomePage      from './pages/HomePage.jsx'
import SearchPage    from './pages/SearchPage.jsx'
import InfoPage      from './pages/InfoPage.jsx'
import PlayerPage    from './pages/PlayerPage.jsx'
import ProvidersPage from './pages/ProvidersPage.jsx'
import WatchlistPage from './pages/WatchlistPage.jsx'
import HistoryPage   from './pages/HistoryPage.jsx'
import './styles.css'

const GUEST = { username: 'guest' }
const NAVBAR_PAGES = ['home','search','watchlist','history','providers']

export default function App() {
  const { installed } = useProviders()
  const [page, setPage]     = useState('home')
  const [params, setParams] = useState({})

  const navigate = useCallback((p, ps = {}) => {
    setPage(p); setParams(ps)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const showNav = NAVBAR_PAGES.includes(page)

  return (
    <div className="app">
      <div className="ambient-orb orb-1" />
      <div className="ambient-orb orb-2" />
      {showNav && <Navbar page={page} navigate={navigate} />}
      <main className={showNav ? 'with-navbar' : ''}>
        {page==='home'      && <HomePage      navigate={navigate} installed={installed} user={GUEST} />}
        {page==='search'    && <SearchPage    navigate={navigate} installed={installed} user={GUEST} />}
        {page==='info'      && <InfoPage      navigate={navigate} params={params}       user={GUEST} />}
        {page==='player'    && <PlayerPage    navigate={navigate} params={params} />}
        {page==='providers' && <ProvidersPage navigate={navigate} />}
        {page==='watchlist' && <WatchlistPage navigate={navigate} user={GUEST} />}
        {page==='history'   && <HistoryPage   navigate={navigate} user={GUEST} />}
      </main>
    </div>
  )
}
