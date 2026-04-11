import { useState, useEffect } from 'react'
import { getMeta, getEpisodes } from '../lib/providers.js'
import { watchlistStorage, historyStorage } from '../lib/storage.js'
import { Icons } from '../components/Icons.jsx'

export default function InfoPage({ params, navigate, user }) {
  const { item, providerValue } = params
  const [info, setInfo]         = useState(null)
  const [episodes, setEpisodes] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [inWL, setInWL]         = useState(() => watchlistStorage.has(user.username, item.link))
  const [imgErr, setImgErr]     = useState(false)

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
    const added = watchlistStorage.toggle(user.username, {
      title: item.title, link: item.link,
      image: info?.image || item.image, provider: providerValue,
    })
    setInWL(added)
  }

  const watchNow = (epLink, epTitle) => {
    historyStorage.add(user.username, {
      title: item.title, link: item.link,
      image: info?.image || item.image, provider: providerValue,
    })
    navigate('player', {
      link: epLink || item.link,
      title: epTitle || info?.title || item.title,
      type: episodes.length ? 'series' : 'movie',
      providerValue,
    })
  }

  const poster = info?.image || item.image

  return (
    <div className="info-page fade-in">
      <div className="info-backdrop">
        {poster && !imgErr && <img src={poster} alt="" onError={() => setImgErr(true)} />}
        <div className="info-backdrop-grad" />
      </div>

      <button className="info-back-btn" onClick={() => navigate('home')}>
        <Icons.Back />
      </button>

      {loading && <div className="info-loading"><div className="spinner" /></div>}

      {!loading && (
        <div className="info-content">
          <div className="info-top">
            <div className="info-poster-wrap">
              {poster && !imgErr
                ? <img className="info-poster-img" src={poster} alt={item.title} onError={() => setImgErr(true)} />
                : <div className="info-poster-placeholder"><Icons.Film /></div>}
            </div>
            <div className="info-details">
              <h1 className="info-title">{info?.title || item.title}</h1>
              <div className="info-meta-row">
                {info?.rating && <span className="meta-pill">⭐ {info.rating}</span>}
                {info?.type   && <span className="meta-pill">{info.type}</span>}
                {episodes.length > 0 && <span className="meta-pill">{episodes.length} Episodes</span>}
              </div>
              {info?.tags?.length > 0 && (
                <div className="info-tags">{info.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
              )}
              <p className="info-synopsis">{info?.synopsis || 'No synopsis available.'}</p>
              {info?.cast?.length > 0 && (
                <p className="info-cast"><strong>Cast:</strong> {info.cast.slice(0, 5).join(', ')}</p>
              )}
              <div className="info-actions">
                {episodes.length === 0 && (
                  <button className="btn btn-hero-play" onClick={() => watchNow()}>
                    <Icons.Play /> Watch Now
                  </button>
                )}
                <button className={`btn ${inWL ? 'btn-wl-active' : 'btn-glass'}`} onClick={toggleWatchlist}>
                  {inWL ? <><Icons.Check /> Saved</> : <><Icons.Plus /> Watchlist</>}
                </button>
              </div>
            </div>
          </div>

          {episodes.length > 0 && (
            <div className="info-episodes-section">
              <h2 className="info-section-title">Episodes</h2>
              <div className="episodes-list">
                {episodes.map((ep, i) => (
                  <div key={ep.link || i} className="episode-row" onClick={() => watchNow(ep.link, ep.title)}>
                    <span className="ep-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="ep-title">{ep.title || `Episode ${i + 1}`}</span>
                    <span className="ep-play"><Icons.Play /></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
