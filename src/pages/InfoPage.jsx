import { useState, useEffect } from 'react'
import { getMeta, getEpisodes } from '../lib/providers.js'
import { watchlistStorage, historyStorage } from '../lib/storage.js'
import { useAuth } from '../lib/auth.jsx'
import { Icons } from '../components/Icons.jsx'

// Detect if a linkList item is a movie quality option (not a season)
function isMovieQuality(linkItem) {
  if (!linkItem) return false
  // If it has directLinks where ALL items are type 'movie', it's a movie
  if (linkItem.directLinks?.length) {
    return linkItem.directLinks.every(d => d.type === 'movie' || !d.type)
  }
  // If it has an episodesLink, it's definitely a series season
  if (linkItem.episodesLink) return false
  return false
}

function extractQuality(title) {
  if (!title) return null
  const m = title.match(/(\d{3,4}p|4K|2160p|1080p|720p|480p|360p)/i)
  return m ? m[1].toUpperCase() : null
}

export default function InfoPage({ params, navigate }) {
  const { item, providerValue } = params
  const { user } = useAuth()

  const [info, setInfo]               = useState(null)
  const [linkList, setLinkList]       = useState([])
  const [activeLinkIdx, setActiveLinkIdx] = useState(0)
  const [episodes, setEpisodes]       = useState([])
  const [epLoading, setEpLoading]     = useState(false)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [inWL, setInWL]               = useState(() => user ? watchlistStorage.has(user.username, item.link) : false)
  const [imgErr, setImgErr]           = useState(false)

  // Is this content a movie? True when all linkList items are movie quality options
  const isSeries = linkList.length > 0 && linkList.some(l => l.episodesLink)

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
        const eps = await getEpisodes({ providerValue, url: linkItem.episodesLink })
        if (!cancelled) setEpisodes(eps || [])
      } else if (linkItem.directLinks?.length) {
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
      title: info?.title || item.title,
      episodeTitle: epTitle || null,
      type: isSeries ? 'series' : 'movie',
      providerValue,
    })
  }

  const poster = info?.image || item.image
  const activeLink = linkList[activeLinkIdx]

  return (
    <div className="info-page fade-in">
      {/* Full bleed backdrop */}
      <div className="info-hero-backdrop">
        {poster && !imgErr && (
          <img src={poster} alt="" onError={() => setImgErr(true)} />
        )}
        <div className="info-hero-grad-bottom" />
        <div className="info-hero-grad-top" />
      </div>

      {/* Floating back button */}
      <button className="info-back-btn" onClick={() => navigate('home')}>
        <Icons.Back />
      </button>

      {loading && (
        <div className="info-loading">
          <div className="spinner" />
        </div>
      )}

      {error && !loading && (
        <div className="info-error">⚠ {error}</div>
      )}

      {!loading && (
        <div className="info-body">
          {/* Top section: poster + core info */}
          <div className="info-top">
            <div className="info-poster-wrap">
              {poster && !imgErr
                ? <img src={poster} alt={item.title} onError={() => setImgErr(true)} className="info-poster-img" />
                : <div className="info-poster-placeholder"><Icons.Film /></div>
              }
            </div>
            <div className="info-core">
              <h1 className="info-title">{info?.title || item.title}</h1>

              <div className="info-chips">
                {info?.rating && <span className="info-chip info-chip-star">⭐ {info.rating}</span>}
                {info?.type && <span className="info-chip">{info.type}</span>}
                {isSeries && episodes.length > 0 && (
                  <span className="info-chip">{episodes.length} Episodes</span>
                )}
              </div>

              {info?.tags?.length > 0 && (
                <div className="info-tags">
                  {info.tags.slice(0, 4).map(t => (
                    <span key={t} className="info-tag">{t}</span>
                  ))}
                </div>
              )}

              {/* Primary actions */}
              <div className="info-actions">
                {!isSeries && (
                  <button className="info-play-btn" onClick={() => watchNow(episodes[0]?.link)}>
                    <Icons.Play /> Watch Now
                  </button>
                )}
                {isSeries && episodes.length > 0 && (
                  <button className="info-play-btn" onClick={() => watchNow(episodes[0]?.link, episodes[0]?.title)}>
                    <Icons.Play /> Play E1
                  </button>
                )}
                <button
                  className={`info-wl-btn ${inWL ? 'active' : ''}`}
                  onClick={toggleWatchlist}
                >
                  {inWL ? <><Icons.Check /> Saved</> : <><Icons.Plus /> Watchlist</>}
                </button>
              </div>
            </div>
          </div>

          {/* Synopsis */}
          {(info?.synopsis && info.synopsis !== 'No synopsis available.') && (
            <p className="info-synopsis">{info.synopsis}</p>
          )}
          {info?.cast?.length > 0 && (
            <p className="info-cast">
              <span className="info-cast-label">Cast</span>
              {info.cast.slice(0, 5).join(' · ')}
            </p>
          )}

          {/* Quality / Season selector */}
          {linkList.length > 1 && (
            <div className="info-section">
              <h3 className="info-section-title">
                {isSeries ? 'Season' : 'Quality'}
              </h3>
              <div className="info-quality-list">
                {linkList.map((ll, i) => {
                  const q = extractQuality(ll.title) || ll.title || (isSeries ? `Season ${i+1}` : `Option ${i+1}`)
                  return (
                    <button
                      key={i}
                      className={`info-quality-btn ${activeLinkIdx === i ? 'active' : ''}`}
                      onClick={() => switchLink(i)}
                    >
                      {q}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Movie: direct quality options */}
          {!isSeries && episodes.length > 1 && (
            <div className="info-section">
              <h3 className="info-section-title">Choose Quality</h3>
              <div className="info-direct-list">
                {episodes.map((ep, i) => {
                  const q = extractQuality(ep.title)
                  const label = q ? `${q}` : ep.title || `Option ${i+1}`
                  // Show file size if in title
                  const sizeMatch = ep.title?.match(/\[?(\d+(?:\.\d+)?\s*(?:MB|GB))\]?/i)
                  const size = sizeMatch ? sizeMatch[1] : null
                  return (
                    <button
                      key={ep.link || i}
                      className="info-direct-btn"
                      onClick={() => watchNow(ep.link, ep.title)}
                    >
                      <span className="direct-quality">{label}</span>
                      {size && <span className="direct-size">{size}</span>}
                      <span className="direct-arrow"><Icons.Play /></span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Series: episode list */}
          {isSeries && (
            <div className="info-section">
              <h3 className="info-section-title">Episodes</h3>
              {epLoading && <div className="spinner" style={{ margin: '20px auto' }} />}
              {!epLoading && episodes.length === 0 && (
                <p className="info-empty">No episodes found.</p>
              )}
              <div className="ep-list">
                {episodes.map((ep, i) => (
                  <div
                    key={ep.link || i}
                    className="ep-item"
                    onClick={() => watchNow(ep.link, ep.title)}
                  >
                    <div className="ep-num">{String(i + 1).padStart(2, '0')}</div>
                    <div className="ep-info">
                      <div className="ep-title">
                        {ep.title || `Episode ${i + 1}`}
                      </div>
                    </div>
                    <div className="ep-icon"><Icons.Play /></div>
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
