import { Icons } from './Icons.jsx'
import { useAuth } from '../lib/auth.jsx'

const NAV = [
  { id: 'home',      label: 'Home',      Icon: Icons.Home },
  { id: 'search',    label: 'Search',    Icon: Icons.Search },
  { id: 'watchlist', label: 'Watchlist', Icon: Icons.Heart },
  { id: 'history',   label: 'History',   Icon: Icons.Clock },
  { id: 'providers', label: 'Providers', Icon: Icons.Puzzle },
]

export function Navbar({ page, navigate, theme, toggleTheme }) {
  const { user, logout } = useAuth()
  const isDark = theme === 'dark'

  return (
    <nav className="navbar">
      <div className="navbar-logo" onClick={() => navigate('home')}>
        WELL<span>STREAMER</span>
      </div>

      <div className="navbar-links">
        {NAV.map(({ id, label, Icon }) => (
          <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => navigate(id)}>
            <span className="nav-item-icon"><Icon /></span>
            <span className="nav-item-label">{label}</span>
          </button>
        ))}
      </div>

      <div className="navbar-user">
        {/* Theme toggle */}
        <button className="theme-toggle" onClick={toggleTheme} title="Switch theme">
          {isDark ? '☀️' : '🌙'}
        </button>

        <div className="user-avatar" title={user?.username}>
          {user?.username?.[0]?.toUpperCase()}
        </div>
        <button className="nav-item" onClick={logout} title="Sign out" style={{ padding: '8px 10px' }}>
          <span className="nav-item-icon"><Icons.Logout /></span>
        </button>
      </div>
    </nav>
  )
}
