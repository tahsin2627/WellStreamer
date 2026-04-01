// src/components/Controls.jsx
// Bottom control bar for the player

export function ProgressBar({ progress, buffered, onSeek, progressRef }) {
  return (
    <div
      ref={progressRef}
      style={{
        height: 28,
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
        touchAction: 'none',
        padding: '0 2px',
      }}
      onClick={onSeek}
      onMouseMove={e => { if (e.buttons === 1) onSeek(e) }}
      onTouchMove={e => {
        const t = e.touches[0]
        const rect = progressRef.current?.getBoundingClientRect()
        if (!rect) return
        const pct = Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width))
        onSeek({ clientX: t.clientX, currentTarget: e.currentTarget, _pct: pct })
      }}
    >
      <div style={{ position: 'relative', width: '100%', height: 4, background: 'rgba(255,255,255,0.18)', borderRadius: 4 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${buffered * 100}%`, background: 'rgba(255,255,255,0.28)', borderRadius: 4 }} />
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progress * 100}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width 0.1s' }} />
        <div style={{ position: 'absolute', top: '50%', left: `${progress * 100}%`, width: 14, height: 14, borderRadius: '50%', background: '#fff', transform: 'translate(-50%,-50%)', boxShadow: '0 0 8px rgba(0,0,0,0.5)', transition: 'left 0.1s' }} />
      </div>
    </div>
  )
}

export function BrightnessSlider({ value, onChange, style = {} }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, ...style }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={2} width={16} height={16}>
        <circle cx={12} cy={12} r={5}/>
        <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
      <input
        type="range" min={30} max={150} step={5} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer', height: 4 }}
      />
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', minWidth: 38 }}>{value}%</span>
    </div>
  )
}

export function ScreenModeSelector({ mode, onChange, style = {} }) {
  const modes = [
    { id: 'contain', label: 'Fit' },
    { id: 'cover',   label: 'Crop' },
    { id: 'fill',    label: 'Stretch' },
  ]
  return (
    <div style={style}>
      <div style={{ display: 'flex', gap: 6 }}>
        {modes.map(m => (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            style={{
              flex: 1,
              padding: '7px 0',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              border: `1.5px solid ${mode === m.id ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}`,
              background: mode === m.id ? 'var(--accent-dim)' : 'transparent',
              color: mode === m.id ? 'var(--accent2)' : 'rgba(255,255,255,0.55)',
              cursor: 'pointer',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}
