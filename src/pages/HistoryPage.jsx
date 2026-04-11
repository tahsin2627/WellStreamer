import { useState } from 'react'
import { historyStorage } from '../lib/storage.js'
import { MediaCard } from '../components/MediaCard.jsx'
import { Icons } from '../components/Icons.jsx'

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function HistoryPage({ navigate, user }) {
  const [items, setItems] = useState(() => historyStorage.get(user.username))

  const clearAll = () => {
    if (!confirm('Clear all watch history?')) return
    historyStorage.clear(user.username)
    setItems([])
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Watch History</h1>
          <p className="page-sub">{items.length} title{items.length !== 1 ? 's' : ''} watched</p>
        </div>
        {items.length > 0 && <button className="btn btn-glass" onClick={clearAll}><Icons.Trash /> Clear History</button>}
      </div>
      {items.length === 0 && <div className="empty-state"><div className="empty-icon"><Icons.Clock /></div><h2>No history yet</h2><p>Titles you watch appear here automatically.</p></div>}
      <div className="media-grid">
        {items.map(item => (
          <div key={item.link + item.watchedAt} style={{ position: 'relative' }}>
            <MediaCard item={item} onClick={() => navigate('info', { item, providerValue: item.provider })} />
            {item.watchedAt && <div className="history-badge">{timeAgo(item.watchedAt)}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
