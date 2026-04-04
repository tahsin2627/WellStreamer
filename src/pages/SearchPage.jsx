// src/pages/SearchPage.jsx — MoviesDrive search via /api/stream
import { useState, useEffect, useRef, useCallback } from 'react'
import { searchPosts } from '../lib/providers.js'

function Card({ item, onClick }) {
  const [err, setErr] = useState(false)
  return (
    <div onClick={() => onClick(item)} style={{
      cursor: 'pointer', borderRadius: 10, overflow: 'hidden',
      background: '#1a1a1a', border: '1px solid rgba(255,255,255,.06)',
      transition: 'transform .2s',
    }}
      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
    >
      <div style={{ aspectRatio: '2/3', background: '#111', overflow: 'hidden' }}>
        {item.image && !err
          ? <img src={item.image} alt={item.title} onError={() => setErr(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'rgba(255,255,255,.15)' }}>🎬</div>}
      </div>
      <div style={{ padding: '7px 8px' }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,.85)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
          {item.title}
        </p>
      </div>
    </div>
  )
}

const PROVIDER = { value: 'MoviesDrive', display_name: 'MoviesDrive' }

export default function SearchPage({ navigate, installed, user }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg,     setMsg]     = useState('')
  const [error,   setError]   = useState(null)
  const abortRef = useRef(null)
  const inputRef = useRef(null)

  const doSearch = useCallback(async (q) => {
    const trimmed = q.trim()
    if (trimmed.length < 2) { setResults([]); setError(null); return }

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true); setError(null); setResults([])
    setMsg('Searching MoviesDrive…')

    try {
      const data = await searchPosts({
        providerValue: PROVIDER.value,
        searchQuery: trimmed,
        page: 1,
        signal: ctrl.signal,
      })
      if (ctrl.signal.aborted) return
      setResults(Array.isArray(data) ? data : [])
      if (!data?.length) setMsg(`No results for "${trimmed}" on MoviesDrive`)
      else setMsg('')
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setError(e.message || 'Search failed. Check connection.')
        setMsg('')
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [])

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 600)
    return () => clearTimeout(t)
  }, [query, doSearch])

  const goInfo = (item) => navigate('info', { item, providerValue: PROVIDER.value })

  return (
    <div style={{ background: '#000', minHeight: '100vh', paddingBottom: 80 }}>
      {/* Search input */}
      <div style={{ padding: '16px 16px 12px', position: 'sticky', top: 0, background: 'rgba(0,0,0,.95)', backdropFilter: 'blur(12px)', zIndex: 10 }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            color: loading ? '#e50914' : 'rgba(255,255,255,.3)', pointerEvents: 'none', display: 'flex', transition: 'color .3s' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}>
              <circle cx={11} cy={11} r={8}/><path d="M21 21l-4.35-4.35"/>
            </svg>
          </span>
          <input ref={inputRef} value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search movies, series on MoviesDrive…"
            autoFocus
            style={{
              width: '100%', padding: '13px 40px 13px 44px', borderRadius: 12,
              background: 'rgba(255,255,255,.07)',
              border: `1.5px solid ${query ? '#e50914' : 'rgba(255,255,255,.1)'}`,
              color: '#fff', fontSize: 15, fontFamily: "'DM Sans',sans-serif",
              outline: 'none', boxSizing: 'border-box', transition: 'border-color .2s',
            }}
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); setMsg(''); inputRef.current?.focus() }}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'rgba(255,255,255,.4)',
                cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>
              ✕
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
            background: '#e50914', color: '#fff', padding: '3px 10px', borderRadius: 20 }}>
            MoviesDrive
          </span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.3)' }}>primary source</span>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 16px' }}>
          <div style={{ width: 22, height: 22, border: '2.5px solid rgba(255,255,255,.1)',
            borderTopColor: '#e50914', borderRadius: '50%', animation: '_spin .7s linear infinite' }} />
          <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 14 }}>{msg}</span>
          <style>{'@keyframes _spin{to{transform:rotate(360deg)}}'}</style>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <p style={{ color: '#f87171', fontSize: 14, marginBottom: 16 }}>{error}</p>
          <button onClick={() => doSearch(query)} style={{
            background: '#e50914', color: '#fff', border: 'none', borderRadius: 10,
            padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {/* Empty/idle */}
      {!loading && !error && query.trim().length < 2 && (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: 'rgba(255,255,255,.25)' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>🔍</div>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Search MoviesDrive</p>
          <p style={{ fontSize: 13 }}>Find Bollywood, Hollywood & more</p>
          <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {['Avengers', 'KGF', 'Pathaan', 'RRR', 'Pushpa'].map(s => (
              <button key={s} onClick={() => setQuery(s)} style={{
                background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
                color: 'rgba(255,255,255,.6)', borderRadius: 20, padding: '6px 14px',
                fontSize: 13, cursor: 'pointer' }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No results */}
      {!loading && !error && query.trim().length >= 2 && results.length === 0 && msg && (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: 'rgba(255,255,255,.3)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>😶</div>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{msg}</p>
          <p style={{ fontSize: 12 }}>MoviesDrive has Bollywood/Hollywood. Try English or Hindi titles.</p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && !loading && (
        <div style={{ padding: '4px 16px 0' }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', marginBottom: 12 }}>
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
