// src/pages/InfoPage.jsx
// Cinematic info page — matches the screenshot style
import { useState, useEffect, useCallback } from 'react'
import { getMeta, getEpisodes } from '../lib/providers.js'
import { watchlistStorage, historyStorage } from '../lib/storage.js'

const ACCENT = '#e50914'

function extractQuality(str) {
  if (!str) return null
  const m = str.match(/\b(4K|2160p?|1080p?|720p?|480p?|360p?)\b/i)
  if (!m) return null
  const r = m[1].toUpperCase().replace(/P$/, '')
  return (r === '2160' || r === '4K') ? '4K' : r + 'p'
}

function analyzeContent(meta) {
  const ll = meta?.linkList || []
  if (!ll.length) return { kind: 'unknown', seasons: [], qualities: [] }
  const realSeasons = ll.filter(l => Boolean(l.episodesLink))
  if (realSeasons.length > 0) return { kind: 'series', seasons: realSeasons, qualities: [] }
  const qualities = ll.map((l, i) => ({
    label: extractQuality(l.title) || `Option ${i + 1}`,
    rawTitle: l.title || '',
    directLinks: l.directLinks || [],
    link: l.link || '', idx: i,
  }))
  return { kind: 'movie', seasons: [], qualities }
}

export default function InfoPage({ params, navigate, user, goBack }) {
  const { item, providerValue } = params

  const [info,       setInfo]       = useState(null)
  const [content,    setContent]    = useState(null)
  const [episodes,   setEpisodes]   = useState([])
  const [activeSz,   setActiveSz]   = useState(0)
  const [epLoad,     setEpLoad]     = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [imgErr,     setImgErr]     = useState(false)
  const [inWL,       setInWL]       = useState(false)
  const [expanded,   setExpanded]   = useState(false)

  const username = user?.username || 'guest'

  useEffect(() => {
    setInWL(watchlistStorage.has(username, item.link))
  }, [item.link, username])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const meta = await getMeta({ providerValue, link: item.link })
        if (cancelled) return
        setInfo(meta)
        const c = analyzeContent(meta)
        setContent(c)
        if (c.kind === 'series' && c.seasons.length > 0) {
          await loadSeason(c.seasons[0], false)
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [item.link, providerValue])

  const loadSeason = async (season, cancelled) => {
    setEpLoad(true); setEpisodes([])
    try {
      const eps = await getEpisodes({ providerValue, url: season.episodesLink })
      if (!cancelled) setEpisodes(eps || [])
    } catch { if (!cancelled) setEpisodes([]) }
    finally { if (!cancelled) setEpLoad(false) }
  }

  const switchSeason = async (idx) => {
    setActiveSz(idx)
    if (content?.seasons[idx]) await loadSeason(content.seasons[idx], false)
  }

  const toggleWL = () => {
    const added = watchlistStorage.toggle(username, {
      title: info?.title || item.title, link: item.link,
      image: info?.image || item.image, provider: providerValue,
    })
    setInWL(added)
  }

  const playMovie = (qualityItem) => {
    if (user) historyStorage.add(username, { title: info?.title || item.title, link: item.link, image: info?.image || item.image, provider: providerValue })
    navigate('player', {
      kind: 'movie', title: info?.title || item.title, providerValue,
      link: qualityItem.directLinks?.[0]?.link || qualityItem.link,
      allQualities: content?.qualities || [],
      image: info?.image || item.image,
    })
  }

  const playEpisode = (ep, epIdx) => {
    if (user) historyStorage.add(username, { title: info?.title || item.title, link: item.link, image: info?.image || item.image, provider: providerValue })
    navigate('player', {
      kind: 'series', title: info?.title || item.title,
      episodeTitle: ep.title || `Episode ${epIdx + 1}`,
      episodeIdx: epIdx, providerValue, link: ep.link,
      allEpisodes: episodes, seasonTitle: content?.seasons[activeSz]?.title || `Season ${activeSz + 1}`,
      image: info?.image || item.image,
    })
  }

  const poster = info?.image || item.image
  const synopsis = info?.synopsis || ''
  const shortSynopsis = synopsis.length > 200 ? synopsis.slice(0, 200) + '…' : synopsis

  return (
    <div style={{ background: '#000', minHeight: '100vh', fontFamily: "'DM Sans',sans-serif", color: '#fff' }}>

      {/* ── HERO BACKDROP ── */}
      <div style={{ position: 'relative', height: 360, overflow: 'hidden' }}>
        {poster && !imgErr && (
          <img src={poster} alt="" onError={() => setImgErr(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: .5 }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #000 0%, rgba(0,0,0,.3) 60%, rgba(0,0,0,.5) 100%)' }} />

        {/* Back button */}
        <button onClick={() => goBack?.()} style={{ position: 'absolute', top: 16, left: 16, zIndex: 10,
          background: 'rgba(0,0,0,.6)', border: '1px solid rgba(255,255,255,.2)', color: '#fff',
          borderRadius: '50%', width: 38, height: 38, display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={18} height={18}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>

        {/* Watchlist button */}
        <button onClick={toggleWL} style={{ position: 'absolute', top: 16, right: 16, zIndex: 10,
          background: 'rgba(0,0,0,.6)', border: `1px solid ${inWL ? ACCENT : 'rgba(255,255,255,.2)'}`,
          color: inWL ? ACCENT : '#fff', borderRadius: '50%', width: 38, height: 38,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          backdropFilter: 'blur(8px)' }}>
          <svg viewBox="0 0 24 24" fill={inWL ? ACCENT : 'none'} stroke="currentColor" strokeWidth={2} width={18} height={18}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        </button>
      </div>

      {/* ── DETAIL BODY ── */}
      <div style={{ padding: '0 16px 80px', marginTop: -60, position: 'relative', zIndex: 2 }}>

        {loading && <div style={{ textAlign: 'center', padding: '60px 0' }}><div style={spin} /></div>}
        {error && !loading && <p style={{ color: '#f87171', fontSize: 14, padding: '20px 0' }}>⚠ {error}</p>}

        {!loading && info && content && (
          <>
            {/* ── Poster + title row ── */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 16 }}>
              <div style={{ flexShrink: 0, width: 110, borderRadius: 12, overflow: 'hidden',
                boxShadow: '0 20px 40px rgba(0,0,0,.8)', border: '1px solid rgba(255,255,255,.08)' }}>
                {poster && !imgErr
                  ? <img src={poster} alt="" onError={() => setImgErr(true)} style={{ width: '100%', display: 'block' }} />
                  : <div style={{ aspectRatio: '2/3', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🎬</div>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'clamp(22px,5vw,36px)',
                  letterSpacing: 1, lineHeight: 1.1, marginBottom: 8 }}>
                  {info.title || item.title}
                </h1>
                {/* Meta row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {info.rating && <span style={chip('#ffc800','rgba(255,200,0,.15)')}> ⭐ {info.rating}</span>}
                  <span style={chip('rgba(255,255,255,.6)','rgba(255,255,255,.08)')}>{content.kind === 'series' ? '📺 Series' : '🎬 Movie'}</span>
                  {content.kind === 'series' && <span style={chip('rgba(255,255,255,.6)','rgba(255,255,255,.08)')}>{content.seasons.length} Season{content.seasons.length !== 1 ? 's' : ''}</span>}
                </div>
                {/* Genre tags */}
                {info.tags?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {info.tags.slice(0, 4).map(t => <span key={t} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: 'rgba(229,9,20,.15)', color: ACCENT, border: `1px solid ${ACCENT}44` }}>{t}</span>)}
                  </div>
                )}
              </div>
            </div>

            {/* ── Play button (movie) ── */}
            {content.kind === 'movie' && content.qualities.length > 0 && (
              <button onClick={() => playMovie(content.qualities[0])} style={{
                width: '100%', padding: '14px', borderRadius: 10, background: '#fff',
                color: '#000', border: 'none', fontFamily: "'DM Sans',sans-serif",
                fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                ▶ PLAY
              </button>
            )}

            {/* ── Play first episode (series) ── */}
            {content.kind === 'series' && episodes.length > 0 && (
              <button onClick={() => playEpisode(episodes[0], 0)} style={{
                width: '100%', padding: '14px', borderRadius: 10, background: '#fff',
                color: '#000', border: 'none', fontFamily: "'DM Sans',sans-serif",
                fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                ▶ PLAY S1 E1
              </button>
            )}

            {/* Synopsis */}
            {synopsis && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,.75)', lineHeight: 1.7 }}>
                  {expanded ? synopsis : shortSynopsis}
                  {synopsis.length > 200 && (
                    <button onClick={() => setExpanded(e => !e)} style={{ background: 'none', border: 'none', color: ACCENT, cursor: 'pointer', fontSize: 14, marginLeft: 4 }}>
                      {expanded ? 'Less' : 'More'}
                    </button>
                  )}
                </p>
              </div>
            )}

            {/* Cast */}
            {info.cast?.length > 0 && (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', marginBottom: 20 }}>
                <span style={{ color: 'rgba(255,255,255,.6)', fontWeight: 600 }}>Cast  </span>
                {info.cast.slice(0, 4).join(' · ')}
              </p>
            )}

            {/* ── MOVIE: quality options ── */}
            {content.kind === 'movie' && content.qualities.length > 1 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={sectionTitle}>Choose Quality</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {content.qualities.map((q, i) => (
                    <button key={i} onClick={() => playMovie(q)} style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px',
                      borderRadius: 10, background: '#1a1a1a', border: '1px solid rgba(255,255,255,.08)',
                      cursor: 'pointer', textAlign: 'left', transition: 'background .15s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(229,9,20,.1)'}
                      onMouseLeave={e => e.currentTarget.style.background = '#1a1a1a'}
                    >
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#4d94ff', minWidth: 48 }}>{q.label}</span>
                      <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.rawTitle}</span>
                      <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16} style={{ color: ACCENT, flexShrink: 0 }}><path d="M8 5v14l11-7z"/></svg>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── SERIES: season tabs ── */}
            {content.kind === 'series' && content.seasons.length > 1 && (
              <div style={{ marginBottom: 16 }}>
                <h3 style={sectionTitle}>Season</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {content.seasons.map((sz, i) => (
                    <button key={i} onClick={() => switchSeason(i)} style={{
                      padding: '8px 18px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                      border: `2px solid ${activeSz === i ? ACCENT : 'rgba(255,255,255,.15)'}`,
                      background: activeSz === i ? ACCENT : 'transparent',
                      color: activeSz === i ? '#fff' : 'rgba(255,255,255,.7)', cursor: 'pointer',
                    }}>
                      {sz.title || `Season ${i + 1}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── SERIES: episode list ── */}
            {content.kind === 'series' && (
              <div>
                <h3 style={sectionTitle}>Episodes {episodes.length > 0 && <span style={{ fontSize: 13, color: 'rgba(255,255,255,.4)', fontWeight: 400 }}>({episodes.length})</span>}</h3>
                {epLoad && <div style={{ textAlign: 'center', padding: '20px 0' }}><div style={spin} /></div>}
                {!epLoad && episodes.length === 0 && <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 13 }}>No episodes found.</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
                  {episodes.map((ep, i) => (
                    <div key={ep.link || i} onClick={() => playEpisode(ep, i)}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px',
                        borderRadius: 12, background: '#1a1a1a', border: '1px solid rgba(255,255,255,.07)',
                        cursor: 'pointer', transition: 'all .15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(229,9,20,.12)'; e.currentTarget.style.borderColor = ACCENT + '55' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#1a1a1a'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)' }}
                    >
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#4d94ff', minWidth: 32 }}>{String(i + 1).padStart(2, '0')}</span>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.title || `Episode ${i + 1}`}</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14} style={{ color: 'rgba(255,255,255,.3)', flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────
const spin = { width: 36, height: 36, border: '3px solid rgba(255,255,255,.1)', borderTopColor: '#e50914', borderRadius: '50%', animation: '_sp .8s linear infinite', margin: '0 auto', display: 'block' }
const sectionTitle = { fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 1, color: 'rgba(255,255,255,.7)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }
function chip(color, bg) { return { padding: '3px 9px', borderRadius: 6, fontSize: 12, fontWeight: 500, color, background: bg } }
