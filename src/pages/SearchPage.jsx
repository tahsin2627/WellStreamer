// src/pages/SearchPage.jsx
// MoviesDrive primary search, Multistream secondary fallback

import { useState, useEffect, useRef, useCallback } from 'react'
import { searchPosts } from '../lib/providers.js'
import { Icons } from '../components/Icons.jsx'

// ── Tiny poster card ──────────────────────────────────────────────────────────
function Card({ item, onClick }) {
  const [err, setErr] = useState(false)
  return (
    <div
      onClick={() => onClick(item)}
      style={{
        cursor: 'pointer', borderRadius: 10, overflow: 'hidden',
        background: '#1a1a1a', border: '1px solid rgba(255,255,255,.06)',
        transition: 'transform .2s, border-color .2s',
      }}
      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
    >
      <div style={{ aspectRatio: '2/3', background: '#111', overflow: 'hidden', position: 'relative' }}>
        {item.image && !err
          ? <img src={item.image} alt={item.title} onError={() => setErr(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'rgba(255,255,255,.2)' }}>🎬</div>}
        {item.provider && (
          <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,.8)', color: '#e50914', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: .5 }}>
            {item.provider}
          </div>
        )}
      </div>
      <div style={{ padding: '7px 8px' }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
          {item.title}
        </p>
      </div>
    </div>
  )
}

export default function SearchPage({ navigate, installed, user }) {
  const [query,      setQuery]      = useState('')
  const [results,    setResults]    = useState([])
  const [loading,    setLoading]    = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error,      setError]      = useState(null)
  const [selProv,    setSelProv]    = useState(null)
  const abortRef = useRef(null)
  const inputRef = useRef(null)

  // Primary = MoviesDrive, secondary = Multistream
  const primary   = installed?.find(p => p.value.toLowerCase().includes('moviesdrive'))
  const secondary = installed?.find(p => p.value.toLowerCase().includes('multistream') || p.value.toLowerCase().includes('multi'))

  // Default selected provider
  useEffect(() => {
    if (!selProv && installed?.length) {
      setSelProv(primary || installed[0])
    }
  }, [installed])

  const doSearch = useCallback(async (q) => {
    if (!q.trim() || q.trim().length < 2) { setResults([]); return }

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true); setError(null); setResults([])

    const activeProv = selProv || primary || installed?.[0]
    if (!activeProv) { setLoading(false); return }

    setLoadingMsg(`Searching ${activeProv.display_name}…`)

    try {
      const data = await searchPosts({
        providerValue: activeProv.value,
        searchQuery: q.trim(),
        page: 1,
        signal: ctrl.signal,
      })
      if (ctrl.signal.aborted) return

      const tagged = (data || []).map(item => ({ ...item, provider: activeProv.display_name }))
      setResults(tagged)

      // If primary returned few results AND secondary exists AND different from active, fetch from secondary too
      const isPrimary = activeProv.value === primary?.value
      if (isPrimary && tagged.length < 5 && secondary && secondary.value !== activeProv.value) {
        setLoadingMsg(`Also checking ${secondary.display_name}…`)
        try {
          const data2 = await searchPosts({
            providerValue: secondary.value,
            searchQuery: q.trim(),
            page: 1,
            signal: ctrl.signal,
          })
          if (!ctrl.signal.aborted && data2?.length) {
            const tagged2 = (data2).map(item => ({ ...item, provider: secondary.display_name }))
            // Merge, deduplicate by title
            const seen = new Set(tagged.map(i => i.title.toLowerCase()))
            const merged = [...tagged, ...tagged2.filter(i => !seen.has(i.title.toLowerCase()))]
            setResults(merged)
          }
        } catch (_) {}
      }
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setError(e.message || 'Search failed')
      }
    } finally {
      if (!ctrl.signal.aborted) {
        setLoading(false); setLoadingMsg('')
      }
    }
  }, [selProv, primary, secondary, installed])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim().length >= 2) doSearch(query)
      else if (query.trim().length === 0) setResults([])
    }, 500)
    return () => clearTimeout(t)
  }, [query, doSearch])

  const goInfo = (item) => {
    const prov = installed?.find(p => p.display_name === item.provider) || selProv || primary || installed?.[0]
    navigate('info', { item, providerValue: prov?.value })
  }

  return (
    <div style={{ background: '#000', minHeight: '100vh', paddingBottom: 80 }}>
      {/* Search bar */}
      <div style={{ padding: '16px 16px 0', position: 'sticky', top: 0, background: '#000', zIndex: 10, paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,.3)', pointerEvents: 'none', display: 'flex' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><circle cx={11} cy={11} r={8}/><path d="M21 21l-4.35-4.35"/></svg>
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search movies, series…"
            autoFocus
            style={{
              width: '100%', padding: '12px 42px 12px 44px', borderRadius: 12,
              background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)',
              color: '#fff', fontSize: 15, fontFamily: "'DM Sans',sans-serif", outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={e => { e.target.style.borderColor = '#e50914'; e.target.style.background = 'rgba(255,255,255,.09)' }}
            onBlur={e  => { e.target.style.borderColor = 'rgba(255,255,255,.1)'; e.target.style.background = 'rgba(255,255,255,.07)' }}
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>
              ✕
            </button>
          )}
        </div>

        {/* Provider selector tabs */}
        {installed?.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {installed.map(p => (
              <button key={p.value} onClick={() => { setSelProv(p); if (query.trim().length >= 2) doSearch(query) }}
                style={{
                  flexShrink: 0, padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: `1.5px solid ${selProv?.value === p.value ? '#e50914' : 'rgba(255,255,255,.15)'}`,
                  background: selProv?.value === p.value ? 'rgba(229,9,20,.15)' : 'transparent',
                  color: selProv?.value === p.value ? '#e50914' : 'rgba(255,255,255,.6)',
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}>
                {p.display_name}
                {p.value === primary?.value && <span style={{ fontSize: 9, marginLeft: 4, opacity: .7 }}>★</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '32px 16px' }}>
          <div style={{ width: 20, height: 20, border: '2.5px solid rgba(255,255,255,.1)', borderTopColor: '#e50914', borderRadius: '50%', animation: '_sspin .7s linear infinite' }} />
          <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 14 }}>{loadingMsg}</span>
          <style>{'@keyframes _sspin{to{transform:rotate(360deg)}}'}</style>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{ textAlign: 'center', padding: '32px 24px', color: '#f87171', fontSize: 14 }}>
          ⚠️ {error}
          <br />
          <button onClick={() => doSearch(query)} style={{ marginTop: 12, background: '#e50914', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && query.trim().length < 2 && (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: 'rgba(255,255,255,.3)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <p style={{ fontSize: 15, fontWeight: 500 }}>Search for anything</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>Movies, series, and more</p>
        </div>
      )}

      {/* No results */}
      {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: 'rgba(255,255,255,.3)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>😶</div>
          <p style={{ fontSize: 15, fontWeight: 500 }}>No results for "{query}"</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>Try a different spelling or provider</p>
        </div>
      )}

      {/* Results grid */}
      {results.length > 0 && (
        <div style={{ padding: '8px 16px 0' }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginBottom: 12 }}>
            {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {results.map((item, i) => (
              <Card key={item.link || i} item={item} onClick={goInfo} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
