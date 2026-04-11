import { useState, useEffect } from 'react'
import { getMeta, getEpisodes } from '../lib/providers.js'
import { watchlistStorage, historyStorage } from '../lib/storage.js'
import { generateAISummary } from '../lib/ai.js'
import { useAuth } from '../lib/auth.js'
import { Icons } from '../components/Icons.jsx'

export default function InfoPage({ params, navigate }) {
  const { item, providerValue } = params
  const { user } = useAuth()
  const [info, setInfo]           = useState(null)
  const [episodes, setEpisodes]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [inWL, setInWL]           = useState(() => user ? watchlistStorage.has(user.username, item.link) : false)
  const [imgErr, setImgErr]       = useState(false)
  const [aiSummary, setAiSummary] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiDone, setAiDone]       = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const meta = await getMeta({ providerValue, link: item.link })
        if (cancelled) return
        setInfo(meta)
        if (meta?.linkList?.length) {
          const first = meta.linkList[0]
          if (first.episodesLink) {
            const eps = await getEpisodes({ providerValue, url: first.episodesLink })
            if (!cancelled) setEpisodes(eps || [])
          } else if (first.directLinks?.length) {
            if (!cancelled) setEpisodes(first.directLinks)
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [item.link, providerValue])

  const toggleWatchlist = () => {
    if (!user) return
    const added = watchlistStorage.toggle(user.username, { title: item.title, link: item.link, image: info?.image || item.image, provider: providerValue })
    setInWL(added)
  }

  const watchNow = (epLink, epTitle) => {
    if (user) historyStorage.add(user.username, { title: item.title, link: item.link, image: info?.image || item.image, provider: providerValue })
    navigate('player', { link: epLink || item.link, title: epTitle || info?.title || item.title, type: episodes.length ? 'series' : 'movie', providerValue })
  }

  const generateAI = async () => {
    setAiLoading(true)
    try {
      const result = await generateAISummary({ title: info?.title || item.title, synopsis: info?.synopsis, imdbId: info?.imdbId })
      setAiSummary(result)
    } catch {
      setAiSummary({ hook: 'Could not generate summary — check your API key.', tags: [] })
    }
    setAiLoading(false); setAiDone(true)
  }

  const poster = info?.image || item.image

  return (
    <div className="page fade-in">
      <button className="btn btn-glass btn-back" onClick={() => navigate('home')}><Icons.Back /> Back</button>

      <div className="info-backdrop">
        {poster && !imgErr && <img src={poster} alt="" onError={() => setImgErr(true)} />}
        <div className="info-backdrop-grad" />
        <div className="info-backdrop-grad-side" />
      </div>

      {loading && <div className="spinner" style={{ marginTop: 120 }} />}
      {error && !loading && <div className="error-banner" style={{ marginTop: 80 }}>⚠ {error}</div>}

      {!loading && (
        <div className="info-layout">
          <div className="info-poster glass">
            {poster && !imgErr ? <img src={poster} alt={item.title} onError={() => setImgErr(true)} /> : <div className="poster-placeholder"><Icons.Film /></div>}
          </div>
          <div className="info-details">
            <h1 className="info-title">{info?.title || item.title}</h1>
            <div className="info-meta-row">
              {info?.rating && <span className="meta-chip">⭐ {info.rating}</span>}
              {info?.type   && <span className="meta-chip">{info.type}</span>}
              {episodes.length > 0 && <span className="meta-chip">{episodes.length} Episodes</span>}
            </div>
            {info?.tags?.length > 0 && <div className="tags-row">{info.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>}
            <p className="info-synopsis">{info?.synopsis || 'No synopsis available.'}</p>
            {info?.cast?.length > 0 && <p className="info-cast"><strong>Cast:</strong> {info.cast.slice(0, 5).join(', ')}</p>}

            <div className="info-actions">
              {episodes.length === 0 && <button className="btn btn-primary" onClick={() => watchNow()}><Icons.Play /> Watch Now</button>}
              <button className={`btn ${inWL ? 'btn-glass active-wl' : 'btn-glass'}`} onClick={toggleWatchlist}>
                {inWL ? <><Icons.Check /> In Watchlist</> : <><Icons.Plus /> Watchlist</>}
              </button>
            </div>

            {!aiDone && !aiLoading && <button className="btn btn-ai" onClick={generateAI}><Icons.Sparkle /> ✨ Generate AI Summary</button>}
            {aiLoading && <div className="ai-box"><div className="ai-label"><Icons.Sparkle /> Generating summary…</div><div className="ai-dots"><span /><span /><span /></div></div>}
            {aiDone && aiSummary && (
              <div className="ai-box fade-in">
                <div className="ai-label"><Icons.Sparkle /> AI Summary</div>
                <p className="ai-text">{aiSummary.hook}</p>
                {aiSummary.tags?.length > 0 && <div className="tags-row" style={{ marginTop: 10 }}>{aiSummary.tags.map(t => <span key={t} className="tag tag-ai">{t}</span>)}</div>}
              </div>
            )}

            {episodes.length > 0 && (
              <div className="episodes-section">
                <h2 className="section-title">Episodes</h2>
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
          </div>
        </div>
      )}
    </div>
  )
}
