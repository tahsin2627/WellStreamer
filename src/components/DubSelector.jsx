// src/components/DubSelector.jsx
export default function DubSelector({ langs, selected, onSelect, style = {} }) {
  if (!langs?.length) return null
  return (
    <div style={style}>
      <p style={labelStyle}>🎧 Audio</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {langs.map(lang => (
          <button
            key={lang}
            onClick={() => onSelect(lang)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              border: `1.5px solid ${selected === lang ? 'var(--accent)' : 'rgba(255,255,255,0.12)'}`,
              background: selected === lang ? 'var(--accent-dim)' : 'transparent',
              color: selected === lang ? 'var(--accent2)' : 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {lang}
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
