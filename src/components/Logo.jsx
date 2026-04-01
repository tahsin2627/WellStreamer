// src/components/Logo.jsx
export default function Logo({ size = 'md', onClick, style = {} }) {
  const sizes = { sm: 18, md: 22, lg: 32, xl: 42 }
  const fs = sizes[size] || 22
  return (
    <div
      onClick={onClick}
      style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: fs,
        letterSpacing: 2,
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        lineHeight: 1,
        ...style,
      }}
    >
      <span style={{ color: '#f0f0f0' }}>WELL</span>
      <span style={{ color: 'var(--accent2, #4d94ff)' }}>STREAMER</span>
    </div>
  )
}
