import { useState } from 'react'
import { watchlistStorage } from '../lib/storage.js'
import { useAuth } from '../lib/auth.jsx'
import { MediaCard } from '../components/MediaCard.jsx'
import { Icons } from '../components/Icons.jsx'

export default function WatchlistPage({ navigate }) {
  const { user } = useAuth()
  const [items, setItems] = useState(() => user ? watchlistStorage.get(user.username) : [])

  const remove = (link) => {
    watchlistStorage.toggle(user.username, { link })
    setItems(watchlistStorage.get(user.username))
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Watchlist</h1>
          <p className="page-sub">{items.length} title{items.length !== 1 ? 's' : ''} saved</p>
        </div>
        {items.length > 0 && (
          <button className="btn btn-glass" style={{ fontSize: 12 }} onClick={() => {
            if (confirm('Clear your entire watchlist?')) {
              items.forEach(i => watchlistStorage.toggle(user.username, { link: i.link }))
              setItems([])
            }
          }}>
            <Icons.Trash /> Clear All
          </button>
        )}
      </div>

      {items.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon"><Icons.Heart /></div>
          <h2>Watchlist is empty</h2>
          <p>Hit the + Watchlist button on any title to save it here.</p>
        </div>
      )}

      <div className="media-grid">
        {items.map(item => (
          <div key={item.link} style={{ position: 'relative' }}>
            <MediaCard
              item={item}
              onClick={() => navigate('info', { item, providerValue: item.provider })}
            />
            <button
              className="remove-btn"
              onClick={e => { e.stopPropagation(); remove(item.link) }}
              title="Remove"
            >
              <Icons.X />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
