// src/components/EpisodeList.jsx
export default function EpisodeList({
  episodes,
  currentIdx,
  onSelect,
  loading = false,
  maxHeight = '60vh',
  style = {},
}) {
  return (
    <div style={style}>
      {loading && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
          Loading episodes…
        </div>
      )}
      {!loading && episodes.length === 0 && (
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, padding: '12px 0' }}>
          No episodes found.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight, overflowY: 'auto' }}>
        {episodes.map((ep, i) => {
          const isCurrent = i === currentIdx
          return (
            <div
              key={ep.link || i}
              onClick={() => onSelect(ep, i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '13px 16px',
                borderRadius: 12,
                background: isCurrent
                  ? 'var(--accent-dim)'
                  : 'var(--surface2)',
                border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--glass-bdr)'}`,
                cursor: 'pointer',
                transition: 'all 0.18s',
              }}
              onMouseEnter={e => {
                if (!isCurrent) {
                  e.currentTarget.style.background = 'var(--accent-dim)'
                  e.currentTarget.style.borderColor = 'var(--accent)'
                }
              }}
              onMouseLeave={e => {
                if (!isCurrent) {
                  e.currentTarget.style.background = 'var(--surface2)'
                  e.currentTarget.style.borderColor = 'var(--glass-bdr)'
                }
              }}
            >
              <span style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 22,
                color: isCurrent ? 'var(--accent)' : 'var(--accent2)',
                minWidth: 34,
              }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{
                flex: 1,
                fontSize: 14,
                fontWeight: isCurrent ? 700 : 500,
                color: isCurrent ? '#fff' : 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {ep.title || `Episode ${i + 1}`}
              </span>
              {isCurrent && (
                <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>▶ NOW</span>
              )}
              {!isCurrent && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  width={14} height={14} style={{ color: 'var(--muted)', flexShrink: 0 }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
