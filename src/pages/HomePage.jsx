import { useState, useEffect, useRef, useCallback } from 'react'
import { getCatalog, getPosts } from '../lib/providers.js'
import { historyStorage } from '../lib/storage.js'
import { useAuth } from '../lib/auth.jsx'
import { MediaCard, SkeletonCard } from '../components/MediaCard.jsx'
import { Icons } from '../components/Icons.jsx'

// ── Genre/Industry groups for the sidebar + collapsible rows ──────────────
// These map to catalog filter values from the providers
const GENRE_GROUPS = [
  { id: 'bollywood',  label: '🇮🇳 Bollywood',        filters: ['bollywood','hindi','india'] },
  { id: 'south',      label: '🌴 South Indian',       filters: ['south','telugu','tamil','malayalam','kannada'] },
  { id: 'hollywood',  label: '🎬 Hollywood',          filters: ['english','hollywood','english movies'] },
  { id: 'korean',     label: '🇰🇷 K-Drama / Korean',  filters: ['korean','kdrama'] },
  { id: 'anime',      label: '🇯🇵 Anime / Japanese',  filters: ['anime','japanese'] },
  { id: 'netflix',    label: '🔴 Netflix',            filters: ['netflix'] },
  { id: 'amazon',     label: '🔵 Amazon Prime',       filters: ['amazon','prime'] },
  { id: 'disney',     label: '⭐ Disney+ / Hotstar',  filters: ['disney','hotstar'] },
  { id: 'chinese',    label: '🇨🇳 Chinese',            filters: ['chinese','cdrama'] },
  { id: 'spanish',    label: '🇪🇸 Spanish',            filters: ['spanish'] },
]

function matchesGroup(filterTitle, group) {
  const t = filterTitle.toLowerCase()
  return group.filters.some(f => t.includes(f))
}

// ── Collapsible row ──────────────────────────────────────────────────────
function CollapsibleRow({ title, posts, onCardClick, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!posts.length) return null
  return (
    <section className="row-section">
      <div className="row-header" style={{ cursor:'pointer' }} onClick={() => setOpen(o => !o)}>
        <h2 className="row-title">{title}</h2>
        <button style={rowToggleStyle(open)}>
          {open ? 'Collapse ↑' : `Show ${posts.length} ↓`}
        </button>
      </div>
      {open && (
        <div className="row-scroller fade-in">
          {posts.map(item => (
            <MediaCard key={item.link} item={item} onClick={onCardClick} />
          ))}
        </div>
      )}
    </section>
  )
}

function rowToggleStyle(open) {
  return {
    background: open ? 'rgba(229,9,20,.12)' : 'rgba(255,255,255,.06)',
    border: `1px solid ${open ? 'rgba(229,9,20,.3)' : 'rgba(255,255,255,.1)'}`,
    color: open ? '#e50914' : 'rgba(255,255,255,.5)',
    borderRadius: 20, padding: '4px 12px', fontSize: 12,
    fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
    transition: 'all .2s',
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
export default function HomePage({ navigate, installed }) {
  const { user } = useAuth()
  const [active, setActive]     = useState(null)
  const [allPosts, setAllPosts]  = useState([])   // flat array of all posts with filter info
  const [catalog, setCatalog]   = useState([])
  const [hero, setHero]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [showPicker, setShowPicker] = useState(false)
  const abortRef = useRef(null)

  useEffect(() => {
    if (installed.length && !active) setActive(installed[0])
  }, [installed])

  useEffect(() => {
    if (!active) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true); setAllPosts([]); setHero(null); setError(null)

    ;(async () => {
      try {
        const { catalog: cat } = await getCatalog(active.value)
        setCatalog(cat)
        // Load all catalog rows in parallel
        const settled = await Promise.allSettled(
          cat.slice(0, 8).map(c =>
            getPosts({ providerValue: active.value, filter: c.filter, page: 1, signal: ctrl.signal })
              .then(posts => ({ title: c.title, filter: c.filter, posts: posts || [] }))
          )
        )
        if (ctrl.signal.aborted) return
        const rows = settled.filter(r => r.status === 'fulfilled' && r.value.posts.length).map(r => r.value)
        setAllPosts(rows)
        const pool = rows.flatMap(r => r.posts).filter(p => p.image)
        if (pool.length) setHero(pool[Math.floor(Math.random() * Math.min(pool.length, 10))])
      } catch(e) {
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

  const history = user ? historyStorage.get(user.username).slice(0, 12) : []

  // Separate "featured" rows (first 3) from the genre-mappable ones
  const featuredRows = allPosts.slice(0, 3)

  // For each genre group, find posts from matching catalog rows
  const genreRows = GENRE_GROUPS.map(group => {
    const matched = allPosts.filter(row => matchesGroup(row.filter + ' ' + row.title, group))
    const posts = matched.flatMap(r => r.posts)
    return { ...group, posts }
  }).filter(g => g.posts.length > 0)

  // Any rows that didn't match a genre group
  const matchedFilters = new Set(
    genreRows.flatMap(g =>
      allPosts.filter(row => matchesGroup(row.filter + ' ' + row.title, g)).map(r => r.filter)
    )
  )
  const otherRows = allPosts.filter(r => !matchedFilters.has(r.filter))

  return (
    <div className="page fade-in">

      {/* ── HERO ── */}
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
              <p className="hero-desc">Ad-free · Multi-server · HD quality</p>
              <div className="hero-actions">
                <button className="btn btn-primary" onClick={() => goInfo(hero)}>
                  <Icons.Play /> Play Now
                </button>
                <button className="btn btn-glass" onClick={() => goInfo(hero)}>
                  <Icons.Plus /> Watchlist
                </button>
              </div>
            </>
          ) : (
            <h1 className="hero-title" style={{ opacity:.12, fontSize:'clamp(32px,7vw,80px)' }}>WELLSTREAMER</h1>
          )}
        </div>
      </div>

      <div className="home-body">

        {/* ── PROVIDER PILL + PICKER ── */}
        <div className="provider-pill-row">
          <button className="provider-pill-btn" onClick={() => setShowPicker(p => !p)}>
            <span style={{ fontSize:16 }}>📡</span>
            <span style={{ fontWeight:600, fontSize:13 }}>{active?.display_name || 'Select Provider'}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={14} height={14}><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>

        {showPicker && (
          <div className="provider-picker-panel fade-in">
            <p className="picker-label">Switch Provider</p>
            <div className="picker-grid">
              {installed.map(p => (
                <button
                  key={p.value}
                  className={`picker-item ${active?.value === p.value ? 'active' : ''}`}
                  onClick={() => { setActive(p); setShowPicker(false) }}
                >
                  {p.display_name}
                  {active?.value === p.value && <span className="picker-check">✓</span>}
                </button>
              ))}
            </div>
            <button className="picker-manage" onClick={() => { setShowPicker(false); navigate('providers') }}>
              <Icons.Puzzle /> Manage Providers
            </button>
          </div>
        )}

        {/* No providers */}
        {!installed.length && !loading && (
          <div className="empty-state">
            <div className="empty-icon"><Icons.Puzzle /></div>
            <h2>No Providers Installed</h2>
            <p>Install providers to start streaming.</p>
            <button className="btn btn-primary" onClick={() => navigate('providers')}>
              <Icons.Download /> Browse Providers
            </button>
          </div>
        )}

        {error && <div className="error-banner">⚠ {error}</div>}

        {/* Continue Watching */}
        {history.length > 0 && (
          <section className="row-section">
            <div className="row-header">
              <h2 className="row-title">Continue Watching</h2>
            </div>
            <div className="row-scroller">
              {history.map(item => <MediaCard key={item.link} item={item} onClick={goInfo} />)}
            </div>
          </section>
        )}

        {/* Skeletons */}
        {loading && [1,2,3].map(i => (
          <section key={i} className="row-section">
            <div className="skeleton" style={{ height:20, width:160, marginBottom:14, borderRadius:6 }} />
            <div className="row-scroller">{[...Array(7)].map((_,j) => <SkeletonCard key={j} />)}</div>
          </section>
        ))}

        {/* Featured rows (open by default) */}
        {featuredRows.map(row => (
          <CollapsibleRow key={row.filter} title={row.title} posts={row.posts} onCardClick={goInfo} defaultOpen />
        ))}

        {/* Genre/Industry groups (collapsed by default) */}
        {genreRows.map(g => (
          <CollapsibleRow key={g.id} title={g.label} posts={g.posts} onCardClick={goInfo} defaultOpen={false} />
        ))}

        {/* Other rows */}
        {otherRows.map(row => (
          <CollapsibleRow key={row.filter} title={row.title} posts={row.posts} onCardClick={goInfo} defaultOpen={false} />
        ))}
      </div>
    </div>
  )
}
