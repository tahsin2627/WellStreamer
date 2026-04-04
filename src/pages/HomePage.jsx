// src/pages/HomePage.jsx
// Professional streaming app homepage — Stremio/Vega style
import { useState, useEffect, useRef, useCallback } from 'react'
import { getCatalog, getPosts } from '../lib/providers.js'
import { historyStorage } from '../lib/storage.js'
import { useAuth } from '../lib/auth.jsx'

const ACCENT = '#e50914'

// ── Tiny card component ───────────────────────────────────────────────────
function PosterCard({ item, onClick }) {
  const [err, setErr] = useState(false)
  return (
    <div
      onClick={() => onClick(item)}
      style={{
        flexShrink: 0,
        width: 110,
        cursor: 'pointer',
        borderRadius: 10,
        overflow: 'hidden',
        background: '#1a1a1a',
        transition: 'transform .2s',
        border: '1px solid rgba(255,255,255,.06)',
      }}
      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
    >
      <div style={{ aspectRatio: '2/3', background: '#222', overflow: 'hidden', position: 'relative' }}>
        {item.image && !err
          ? <img src={item.image} alt={item.title} onError={() => setErr(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 32 }}>🎬</div>}
      </div>
      <div style={{ padding: '6px 8px' }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,.8)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
          {item.title}
        </p>
      </div>
    </div>
  )
}

// ── Horizontal scroll row ─────────────────────────────────────────────────
function ContentRow({ title, posts, onCardClick, loading }) {
  const rowRef = useRef(null)
  if (!loading && !posts?.length) return null
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 19, letterSpacing: 1,
        color: 'rgba(255,255,255,.85)', marginBottom: 12, paddingLeft: 16 }}>
        {title}
      </h2>
      <div ref={rowRef} style={{ display: 'flex', gap: 10, overflowX: 'auto',
        paddingLeft: 16, paddingRight: 16, paddingBottom: 6, scrollbarWidth: 'none' }}>
        {loading
          ? [...Array(8)].map((_, i) => (
              <div key={i} style={{ flexShrink: 0, width: 110, borderRadius: 10,
                background: '#1a1a1a', border: '1px solid rgba(255,255,255,.06)' }}>
                <div style={{ aspectRatio: '2/3', background: 'linear-gradient(90deg,#1a1a1a 25%,#2a2a2a 50%,#1a1a1a 75%)',
                  backgroundSize: '200% 100%', animation: '_sh 1.5s infinite' }} />
                <div style={{ padding: '6px 8px', height: 28 }} />
              </div>
            ))
          : posts.map((p, i) => <PosterCard key={p.link || i} item={p} onClick={onCardClick} />)}
      </div>
    </div>
  )
}

// ── Hero banner ───────────────────────────────────────────────────────────
function Hero({ item, onPlay, onInfo }) {
  const [err, setErr] = useState(false)
  if (!item) return (
    <div style={{ height: 280, background: 'linear-gradient(to bottom, #1a0000, #000)',
      display: 'flex', alignItems: 'flex-end', padding: '0 16px 24px' }}>
      <div>
        <p style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 42, letterSpacing: 2,
          opacity: .1 }}>WELLSTREAMER</p>
      </div>
    </div>
  )

  return (
    <div style={{ position: 'relative', height: 320, overflow: 'hidden', marginBottom: 8 }}>
      {/* Backdrop */}
      {item.image && !err && (
        <img src={item.image} alt="" onError={() => setErr(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', opacity: .35, filter: 'blur(1px)' }} />
      )}
      <div style={{ position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, #000 0%, rgba(0,0,0,.3) 60%, transparent 100%)' }} />
      <div style={{ position: 'absolute', inset: 0,
        background: 'linear-gradient(to right, rgba(0,0,0,.8) 0%, transparent 60%)' }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 2, height: '100%',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 16px 20px' }}>
        <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(26px, 6vw, 48px)',
          letterSpacing: 1.5, lineHeight: 1.05, marginBottom: 10, maxWidth: 280 }}>
          {item.title}
        </h1>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => onPlay(item)} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px',
            borderRadius: 8, background: '#fff', color: '#000',
            border: 'none', fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            ▶ PLAY
          </button>
          <button onClick={() => onInfo(item)} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
            borderRadius: 8, background: 'rgba(255,255,255,.18)', color: '#fff',
            border: '1px solid rgba(255,255,255,.3)', fontFamily: "'DM Sans',sans-serif",
            fontSize: 15, fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
            ⓘ More Info
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function HomePage({ navigate, installed, user }) {
  const [rows,    setRows]    = useState([])  // [{title, posts}]
  const [hero,    setHero]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const abortRef = useRef(null)

  // Load content from ALL installed providers, merge into rows
  useEffect(() => {
    if (!installed?.length) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true); setRows([]); setHero(null); setError(null)

    ;(async () => {
      try {
        // Use first provider for catalog structure, then fetch from all
        const primary = installed[0]
        const { catalog } = await getCatalog(primary.value)
        const rowDefs = catalog.slice(0, 6)

        // Fetch each row from the primary provider
        const settled = await Promise.allSettled(
          rowDefs.map(cat =>
            getPosts({ providerValue: primary.value, filter: cat.filter, page: 1, signal: ctrl.signal })
              .then(posts => ({ title: cat.title, filter: cat.filter, posts: posts || [] }))
          )
        )
        if (ctrl.signal.aborted) return

        const filled = settled
          .filter(r => r.status === 'fulfilled' && r.value.posts.length > 0)
          .map(r => r.value)

        setRows(filled)

        // Pick hero from first row that has images
        const pool = filled.flatMap(r => r.posts).filter(p => p.image)
        if (pool.length) setHero(pool[Math.floor(Math.random() * Math.min(pool.length, 8))])
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e.message)
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    })()
    return () => ctrl.abort()
  }, [installed])

  const goInfo = useCallback((item) => {
    navigate('info', { item, providerValue: installed?.[0]?.value })
  }, [installed, navigate])

  const goPlay = useCallback((item) => {
    navigate('info', { item, providerValue: installed?.[0]?.value })
  }, [installed, navigate])

  const history = user ? historyStorage.get(user.username).slice(0, 10) : []

  return (
    <div style={{ background: '#000', minHeight: '100vh', paddingBottom: 80 }}>
      <style>{`
        @keyframes _sh { 0%,100% { background-position: 200% 0 } }
        ::-webkit-scrollbar { display: none }
      `}</style>

      {/* Hero */}
      <Hero item={hero} onPlay={goPlay} onInfo={goInfo} />

      {/* Continue watching */}
      {history.length > 0 && (
        <ContentRow
          title="Continue Watching"
          posts={history}
          onCardClick={goInfo}
          loading={false}
        />
      )}

      {/* Content rows */}
      {loading && !rows.length && (
        <>
          <ContentRow title="Trending" posts={[]} onCardClick={goInfo} loading />
          <ContentRow title="Latest Movies" posts={[]} onCardClick={goInfo} loading />
          <ContentRow title="Web Series" posts={[]} onCardClick={goInfo} loading />
        </>
      )}

      {error && !rows.length && (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'rgba(255,255,255,.5)', fontSize: 14 }}>
          Could not load content. Check your connection.
        </div>
      )}

      {rows.map(row => (
        <ContentRow
          key={row.filter}
          title={row.title}
          posts={row.posts}
          onCardClick={goInfo}
          loading={false}
        />
      ))}
    </div>
  )
}
