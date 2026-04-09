import { useState, useEffect, useRef, useCallback } from 'react'
import { searchPosts } from '../lib/providers.js'
import { MediaCard, SkeletonCard } from '../components/MediaCard.jsx'
import { ProviderTabs } from '../components/ProviderTabs.jsx'
import { Icons } from '../components/Icons.jsx'

export default function SearchPage({ navigate, installed }) {
  const [query, setQuery]     = useState('')
  const [active, setActive]   = useState(null)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const abortRef              = useRef(null)
  const inputRef              = useRef(null)

  useEffect(() => {
    if (installed.length && !active) setActive(installed[0])
  }, [installed])

  useEffect(() => { inputRef.current?.focus() }, [])

  const doSearch = useCallback(async (q, prov) => {
    if (!q?.trim() || !prov) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true); setResults([]); setSearched(false)
    try {
      const data = await searchPosts({
        providerValue: prov.value,
        searchQuery: q.trim(),
        page: 1,
        signal: ctrl.signal,
      })
      if (!ctrl.signal.aborted) { setResults(data || []); setSearched(true) }
    } catch (e) {
      if (!ctrl.signal.aborted) { setResults([]); setSearched(true) }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [])

  // Debounce
  useEffect(() => {
    if (query.length < 2) { setResults([]); setSearched(false); return }
    const t = setTimeout(() => doSearch(query, active), 500)
    return () => clearTimeout(t)
  }, [query, active, doSearch])

  const goInfo = (item) => navigate('info', { item, providerValue: active?.value })

  return (
    <div className="page fade-in">
      <div className="search-hero">
        <h1 className="search-heading">Search</h1>
        <div className="search-bar-wrap">
          <span className="search-icon"><Icons.Search /></span>
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Movies, shows, anime…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-clear" onClick={() => { setQuery(''); setResults([]); setSearched(false) }}>
              <Icons.X />
            </button>
          )}
        </div>
        <ProviderTabs providers={installed} active={active} onChange={p => { setActive(p); if (query.length >= 2) doSearch(query, p) }} />
      </div>

      {loading && (
        <div className="search-grid">
          {[...Array(12)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon"><Icons.Search /></div>
          <h2>No Results</h2>
          <p>Try a different term or switch provider.</p>
        </div>
      )}

      {!loading && !searched && (
        <div className="empty-state">
          <div className="empty-icon"><Icons.Search /></div>
          <h2>Find Anything</h2>
          <p>Movies, TV series, anime — all in one place.</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="search-grid">
          {results.map(item => (
            <MediaCard key={item.link} item={item} onClick={goInfo} />
          ))}
        </div>
      )}
    </div>
  )
}
