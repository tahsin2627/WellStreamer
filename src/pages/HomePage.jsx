import { useState, useEffect, useRef, useCallback } from 'react'
import { getCatalog, getPosts } from '../lib/providers.js'
import { historyStorage } from '../lib/storage.js'
import { useAuth } from '../lib/auth.js'
import { MediaCard, SkeletonCard } from '../components/MediaCard.jsx'
import { ProviderTabs } from '../components/ProviderTabs.jsx'
import { Icons } from '../components/Icons.jsx'

export default function HomePage({ navigate, installed }) {
  const { user } = useAuth()
  const [active, setActive]   = useState(null)
  const [rows, setRows]       = useState([])
  const [hero, setHero]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const abortRef              = useRef(null)

  useEffect(() => {
    if (installed.length && !active) setActive(installed[0])
  }, [installed])

  useEffect(() => {
    if (!active) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true); setRows([]); setHero(null); setError(null)
    ;(async () => {
      try {
        const { catalog } = await getCatalog(active.value)
        const settled = await Promise.allSettled(
          catalog.slice(0, 5).map(cat =>
            getPosts({ providerValue: active.value, filter: cat.filter, page: 1, signal: ctrl.signal })
              .then(posts => ({ title: cat.title, posts: posts || [] }))
          )
        )
        if (ctrl.signal.aborted) return
        const filled = settled.filter(r => r.status === 'fulfilled' && r.value.posts.length).map(r => r.value)
        setRows(filled)
        const pool = filled.flatMap(r => r.posts).filter(p => p.image)
        if (pool.length) setHero(pool[Math.floor(Math.random() * Math.min(pool.length, 12))])
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e.message)
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    })()
    return () => ctrl.abort()
  }, [active])

  const goInfo = useCallback((item) => {
    navigate('info', { item, providerValue: active?.value })
  }, [active, navigate])

  const history = user ? historyStorage.get(user.username).slice(0, 10) : []

  return (
    <div className="page fade-in">
      <div className="hero">
        <div className="hero-bg" />
        {hero?.image && <img className="hero-img" src={hero.image} alt="" />}
        <div className="hero-grad" />
        <div className="hero-grad-side" />
        <div className="hero-content">
          {hero ? (
            <>
              <span className="badge">⚡ Featured</span>
              <h1 className="hero-title">{hero.title}</h1>
              <p className="hero-desc">Watch now — ad-free, multi-server streaming.</p>
              <div className="hero-actions">
                <button className="btn btn-primary" onClick={() => goInfo(hero)}><Icons.Play /> Play Now</button>
                <button className="btn btn-glass" onClick={() => goInfo(hero)}><Icons.Plus /> Watchlist</button>
              </div>
            </>
          ) : (
            <h1 className="hero-title" style={{ opacity: 0.15, fontSize: 'clamp(32px,7vw,80px)' }}>WELLSTREAMER</h1>
          )}
        </div>
      </div>

      <div className="home-body">
        <ProviderTabs providers={installed} active={active} onChange={setActive} />

        {!installed.length && !loading && (
          <div className="empty-state">
            <div className="empty-icon"><Icons.Puzzle /></div>
            <h2>No Providers Installed</h2>
            <p>Browse and install providers to start streaming.</p>
            <button className="btn btn-primary" onClick={() => navigate('providers')}><Icons.Download /> Browse Providers</button>
          </div>
        )}

        {error && <div className="error-banner">⚠ {error} — try a different provider or check your connection.</div>}

        {history.length > 0 && (
          <section className="row-section">
            <div className="row-header"><h2 className="row-title">Continue Watching</h2></div>
            <div className="row-scroller">
              {history.map(item => <MediaCard key={item.link} item={item} onClick={goInfo} />)}
            </div>
          </section>
        )}

        {loading && [1, 2, 3].map(i => (
          <section key={i} className="row-section">
            <div className="skeleton" style={{ height: 20, width: 160, marginBottom: 14, borderRadius: 6 }} />
            <div className="row-scroller">{[...Array(7)].map((_, j) => <SkeletonCard key={j} />)}</div>
          </section>
        ))}

        {rows.map(row => (
          <section key={row.title} className="row-section">
            <div className="row-header"><h2 className="row-title">{row.title}</h2></div>
            <div className="row-scroller">
              {row.posts.map(item => <MediaCard key={item.link} item={item} onClick={goInfo} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
