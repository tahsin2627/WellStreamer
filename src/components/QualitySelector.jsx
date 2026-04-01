// src/components/QualitySelector.jsx
export default function QualitySelector({ groups, selected, onSelect, style = {} }) {
  if (!groups?.length) return null
  return (
    <div style={style}>
      <p style={labelStyle}>Quality</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {groups.map(g => (
          <button
            key={g.quality}
            onClick={() => onSelect(g.quality)}
            style={{
              padding: '8px 18px',
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 700,
              border: `2px solid ${selected === g.quality ? 'var(--accent)' : 'rgba(255,255,255,0.15)'}`,
              background: selected === g.quality ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
              color: selected === g.quality ? '#fff' : 'rgba(255,255,255,0.75)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: selected === g.quality ? '0 0 12px var(--accent-glow)' : 'none',
            }}
          >
            {g.quality}
          </button>
        ))}
      </div>
    </div>
  )
}

const labelStyle = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1.4,
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.4)',
  marginBottom: 8,
}
