import { useState, useEffect } from 'react'
import { getMeta, getEpisodes } from '../lib/providers.js'
import { watchlistStorage, historyStorage } from '../lib/storage.js'
import { generateAISummary } from '../lib/ai.js'
import { useAuth } from '../lib/auth.jsx'
import { Icons } from '../components/Icons.jsx'

export default function InfoPage({ params, navigate }) {
  const { item, providerValue } = params
  const { user } = useAuth()

  const [info, setInfo]           = useState(null)
  const [linkList, setLinkList]   = useState([])   // all quality/season options
  const [activeLinkIdx, setActiveLinkIdx] = useState(0)
  const [episodes, setEpisodes]   = useState([])
  const [epLoading, setEpLoading] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [inWL, setInWL]           = useState(() => user ? watchlistStorage.has(user.username, item.link) : false)
  const [imgErr, setImgErr]       = useState(false)
  const [aiSummary, setAiSummary] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiDone, setAiDone]       = useState(false)

  // Detect if this is a movie (directLinks) vs series (episodesLink)
  const isMovie = linkList.length > 0 && !linkList[0]?.episodesLink && linkList[0]?.directLinks?.length > 0 && linkList[0]?.directLinks[0]?.type === 'movie'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const meta = await getMeta({ providerValue, link: item.link })
        if (cancelled) return
        setInfo(meta)
        const ll = meta?.linkList || []
        setLinkList(ll)
        // Auto-load episodes for first link
        if (ll.length > 0) await loadEpisodes(ll[0], cancelled)
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [item.link, providerValue])

  const loadEpisodes = async (linkItem, cancelled = false) => {
    if (!linkItem) return
    setEpLoading(true)
    setEpisodes([])
    try {
      if (linkItem.episodesLink) {
        // Series — fetch episode list
        const eps = await getEpisodes({ providerValue, url: linkItem.episodesLink })
        if (!cancelled) setEpisodes(eps || [])
      } else if (linkItem.directLinks?.length) {
        // Movie with direct links — show as single play buttons
        if (!cancelled) setEpisodes(linkItem.directLinks)
      }
    } catch {
      if (!cancelled) setEpisodes([])
    } finally {
      if (!cancelled) setEpLoading(false)
    }
  }

  const switchLink = async (idx) => {
    setActiveLinkIdx(idx)
    await loadEpisodes(linkList[idx])
  }

  const toggleWatchlist = () => {
    if (!user) return
    const added = watchlistStorage.toggle(user.username, {
      title: item.title, link: item.link,
      image: info?.image || item.image,
      provider: providerValue,
    })
    setInWL(added)
  }

  const watchNow = (epLink, epTitle) => {
    if (user) historyStorage.add(user.username, {
      title: item.title, link: item.link,
      image: info?.image || item.image,
      provider: providerValue,
    })
    navigate('player', {
      link: epLink || item.link,
      title: epTitle ? `${info?.title || item.title} — ${epTitle}` : (info?.title || item.title),
      type: isMovie ? 'movie' : 'series',
      providerValue,
    })
  }

  const generateAI = async () => {
    setAiLoading(true)
    try {
      const result = await generateAISummary({
        title: info?.title || item.title,
        synopsis: info?.synopsis,
        imdbId: info?.imdbId,
      })
      setAiSummary(result)
    } catch {
      setAiSummary({ hook: 'Could not generate summary.', tags: [] })
    }
    setAiLoading(false); setAiDone(true)
  }

  const poster = info?.image || item.image

  return (
    <div className="page fade-in">
      <button className="btn btn-glass btn-back" onClick={() => navigate('home')}>
        <Icons.Back /> Back
      </button>

      <div className="info-backdrop">
        {poster && !imgErr && <img src={poster} alt="" onError={() => setImgErr(true)} />}
        <div className="info-backdrop-grad" />
        <div className="info-backdrop-grad-side" />
      </div>

      {loading && <div className="spinner" style={{ marginTop: 120 }} />}
      {error && !loading && <div className="error-banner" style={{ marginTop: 80 }}>⚠ {error}</div>}

      {!loading && (
        <div className="info-layout">
          {/* Poster */}
          <div className="info-poster glass">
            {poster && !imgErr
              ? <img src={poster} alt={item.title} onError={() => setImgErr(true)} />
              : <div className="poster-placeholder"><Icons.Film /></div>}
          </div>

          {/* Details */}
          <div className="info-details">
            <h1 className="info-title">{info?.title || item.title}</h1>

            <div className="info-meta-row">
              {info?.rating && <span className="meta-chip">⭐ {info.rating}</span>}
              {info?.type   && <span className="meta-chip">{info.type}</span>}
              {!isMovie && episodes.length > 0 && <span className="meta-chip">{episodes.length} Episodes</span>}
            </div>

            {info?.tags?.length > 0 && (
              <div className="tags-row">
                {info.tags.map(t => <span key={t} className="tag">{t}</span>)}
              </div>
            )}

            <p className="info-synopsis">{info?.synopsis || 'No synopsis available.'}</p>
            {info?.cast?.length > 0 && (
              <p className="info-cast"><strong>Cast:</strong> {info.cast.slice(0, 5).join(', ')}</p>
            )}

            {/* Actions */}
            <div className="info-actions">
              {/* Movie: Watch Now button */}
              {isMovie && (
                <button className="btn btn-primary" onClick={() => watchNow(episodes[0]?.link, episodes[0]?.title)}>
                  <Icons.Play /> Watch Now
                </button>
              )}
              {/* Series with no episodes yet loaded */}
              {!isMovie && episodes.length === 0 && !epLoading && (
                <button className="btn btn-primary" onClick={() => watchNow()}>
                  <Icons.Play /> Watch Now
                </button>
              )}
              <button className={`btn ${inWL ? 'btn-glass active-wl' : 'btn-glass'}`} onClick={toggleWatchlist}>
                {inWL ? <><Icons.Check /> In Watchlist</> : <><Icons.Plus /> Watchlist</>}
              </button>
            </div>

            {/* Season / Quality selector — shown when multiple linkList items */}
            {linkList.length > 1 && (
              <div className="season-selector">
                <p className="season-label">
                  {linkList[0]?.episodesLink ? 'Season' : 'Quality'}
                </p>
                <div className="season-chips">
                  {linkList.map((ll, i) => (
                    <button
                      key={i}
                      className={`season-chip ${activeLinkIdx === i ? 'active' : ''}`}
                      onClick={() => switchLink(i)}
                    >
                      {ll.title || (ll.quality ? `${ll.quality}p` : `Option ${i + 1}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* AI Summary */}
            {!aiDone && !aiLoading && (
              <button className="btn btn-ai" onClick={generateAI} style={{ marginTop: 16 }}>
                <Icons.Sparkle /> ✨ Generate AI Summary
              </button>
            )}
            {aiLoading && (
              <div className="ai-box" style={{ marginTop: 16 }}>
                <div className="ai-label"><Icons.Sparkle /> Generating…</div>
                <div className="ai-dots"><span /><span /><span /></div>
              </div>
            )}
            {aiDone && aiSummary && (
              <div className="ai-box fade-in" style={{ marginTop: 16 }}>
                <div className="ai-label"><Icons.Sparkle /> AI Summary</div>
                <p className="ai-text">{aiSummary.hook}</p>
                {aiSummary.tags?.length > 0 && (
                  <div className="tags-row" style={{ marginTop: 10 }}>
                    {aiSummary.tags.map(t => <span key={t} className="tag tag-ai">{t}</span>)}
                  </div>
                )}
              </div>
            )}

            {/* Episodes (series only) */}
            {!isMovie && (
              <div className="episodes-section">
                <h2 className="section-title">Episodes</h2>
                {epLoading && <div className="spinner" style={{ margin: '20px auto' }} />}
                {!epLoading && episodes.length === 0 && (
                  <p style={{ color: 'var(--muted)', fontSize: 13 }}>No episodes found.</p>
                )}
                <div className="episodes-list">
                  {episodes.map((ep, i) => (
                    <div key={ep.link || i} className="episode-row glass2" onClick={() => watchNow(ep.link, ep.title)}>
                      <span className="ep-num">{String(i + 1).padStart(2, '0')}</span>
                      <span className="ep-title">{ep.title || `Episode ${i + 1}`}</span>
                      <span className="ep-arrow"><Icons.ChevronR /></span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Movie quality links */}
            {isMovie && episodes.length > 1 && (
              <div className="episodes-section">
                <h2 className="section-title">Quality Options</h2>
                <div className="episodes-list">
                  {episodes.map((ep, i) => (
                    <div key={ep.link || i} className="episode-row glass2" onClick={() => watchNow(ep.link, ep.title)}>
                      <span className="ep-num"><Icons.Play /></span>
                      <span className="ep-title">{ep.title || `Option ${i + 1}`}</span>
                      <span className="ep-arrow"><Icons.ChevronR /></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
