import { useState } from 'react'
import { Icons } from './Icons.jsx'

export function MediaCard({ item, onClick, style }) {
  const [imgErr, setImgErr] = useState(false)

  return (
    <div className="media-card" onClick={() => onClick(item)} style={style}>
      <div className="media-card-img-wrap">
        {item.image && !imgErr
          ? <img src={item.image} alt={item.title} onError={() => setImgErr(true)} loading="lazy" />
          : <div className="media-card-placeholder"><span style={{ width: 28, height: 28, opacity: 0.3 }}><Icons.Film /></span></div>}
        <div className="media-card-overlay">
          <div className="play-btn"><Icons.Play /></div>
        </div>
      </div>
      <div className="media-card-info">
        <p className="media-card-title">{item.title}</p>
        {item.provider && <p className="media-card-sub">{item.provider}</p>}
      </div>
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div style={{ flex: '0 0 160px' }}>
      <div className="skeleton" style={{ width: '100%', aspectRatio: '2/3', borderRadius: 12 }} />
      <div className="skeleton" style={{ height: 11, marginTop: 8, width: '75%', borderRadius: 6 }} />
    </div>
  )
}
