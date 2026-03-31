import { useState, useEffect, useCallback } from 'react'
import { getMeta, getEpisodes } from '../lib/providers.js'
import { watchlistStorage, historyStorage } from '../lib/storage.js'
import { analyzeContent } from '../lib/contentUtils.js'
import { useAuth } from '../lib/auth.jsx'

// ── Icons (inline SVG) ────────────────────────────────────────────────────
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><path d="M8 5v14l11-7z"/></svg>
)
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={16} height={16}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
)
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={16} height={16}><polyline points="20 6 9 17 4 12"/></svg>
)
const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={20} height={20}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
)
const ChevronR = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><polyline points="9 18 15 12 9 6"/></svg>
)

// ── Component ─────────────────────────────────────────────────────────────
export default function InfoPage({ params, navigate }) {
  const { item, providerValue } = params
  const { user } = useAuth()

  const [info,       setInfo]       = useState(null)
  const [content,    setContent]    = useState(null)   // analyzeContent result
  const [episodes,   setEpisodes]   = useState([])
  const [activeSzIdx,setActiveSzIdx]= useState(0)
  const [epLoading,  setEpLoading]  = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [imgErr,     setImgErr]     = useState(false)
  const [inWL,       setInWL]       = useState(
    () => user ? watchlistStorage.has(user.username, item.link) : false
  )

  // Load meta
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
        // Auto-load first season episodes for series
        if (c.kind === 'series' && c.seasons.length > 0) {
          await loadSeason(c.seasons[0], cancelled)
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [item.link, providerValue])

  // Back button — Android hardware back
  useEffect(() => {
    const onPop = () => navigate('home')
    window.addEventListener('popstate', onPop)
    // Push a dummy state so back doesn't exit the app
    window.history.pushState({ page: 'info' }, '')
    return () => window.removeEventListener('popstate', onPop)
  }, [navigate])

  const loadSeason = async (season, cancelled = false) => {
    setEpLoading(true); setEpisodes([])
    try {
      const eps = await getEpisodes({ providerValue, url: season.episodesLink })
      if (!cancelled) setEpisodes(eps || [])
    } catch {
      if (!cancelled) setEpisodes([])
    } finally {
      if (!cancelled) setEpLoading(false)
    }
  }

  const switchSeason = async (idx) => {
    setActiveSzIdx(idx)
    if (content?.seasons[idx]) await loadSeason(content.seasons[idx])
  }

  const toggleWL = () => {
    if (!user) return
    const added = watchlistStorage.toggle(user.username, {
      title: info?.title || item.title,
      link:  item.link,
      image: info?.image || item.image,
      provider: providerValue,
    })
    setInWL(added)
  }

  const addHistory = useCallback(() => {
    if (user) historyStorage.add(user.username, {
      title: info?.title || item.title,
      link:  item.link,
      image: info?.image || item.image,
      provider: providerValue,
    })
  }, [user, info, item, providerValue])

  // Navigate to player
  const playMovie = (qualityItem) => {
    addHistory()
    navigate('player', {
      kind:         'movie',
      title:        info?.title || item.title,
      providerValue,
      // Pass all direct links for this quality so player can pick servers
      directLinks:  qualityItem.directLinks,
      qualityLabel: qualityItem.label,
      allQualities: content?.qualities || [],
    })
  }

  const playEpisode = (ep, epIdx) => {
    addHistory()
    navigate('player', {
      kind:         'series',
      title:        info?.title || item.title,
      episodeTitle: ep.title || `Episode ${epIdx + 1}`,
      episodeIdx:   epIdx,
      providerValue,
      link:         ep.link,
      // Pass all episodes so player can show next-episode list
      allEpisodes:  episodes,
      seasonTitle:  content?.seasons[activeSzIdx]?.title || `Season ${activeSzIdx + 1}`,
    })
  }

  const poster = info?.image || item.image

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', fontFamily:"'DM Sans',sans-serif", position:'relative' }}>

      {/* ── Backdrop ── */}
      <div style={{ position:'fixed', top:0, left:0, right:0, height:'65vh', zIndex:0, overflow:'hidden', pointerEvents:'none' }}>
        {poster && !imgErr && (
          <img src={poster} alt="" onError={()=>setImgErr(true)}
            style={{ width:'100%', height:'100%', objectFit:'cover', opacity:.18, filter:'blur(3px)', transform:'scale(1.06)' }} />
        )}
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, var(--bg) 0%, rgba(10,10,10,.55) 50%, transparent 100%)' }} />
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(to right, var(--bg) 0%, transparent 55%)' }} />
      </div>

      {/* Back button */}
      <button
        onClick={() => navigate('home')}
        style={{ position:'fixed', top:72, left:16, zIndex:50, width:38, height:38, borderRadius:'50%',
          background:'rgba(10,10,10,.85)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,.1)',
          color:'var(--text)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}
      >
        <BackIcon />
      </button>

      {/* ── Body ── */}
      <div style={{ position:'relative', zIndex:10, maxWidth:860, margin:'0 auto', padding:'80px 20px 60px' }}>

        {loading && <div className="spinner" style={{ marginTop:120 }} />}
        {error && !loading && (
          <div style={{ color:'var(--error)', padding:'12px 16px', borderRadius:10, background:'rgba(255,68,85,.07)',
            border:'1px solid rgba(255,68,85,.2)', marginTop:80 }}>⚠ {error}</div>
        )}

        {!loading && info && content && (
          <>
            {/* ── TOP: poster + core info ── */}
            <div style={{ display:'flex', gap:24, marginBottom:24, alignItems:'flex-start' }}>
              <div style={{ flexShrink:0, width:140, borderRadius:14, overflow:'hidden',
                boxShadow:'0 20px 60px rgba(0,0,0,.7), 0 0 30px var(--accent-glow)',
                border:'1px solid rgba(255,255,255,.08)' }}>
                {poster && !imgErr
                  ? <img src={poster} alt={info.title||item.title} onError={()=>setImgErr(true)} style={{ width:'100%', display:'block' }} />
                  : <div style={{ aspectRatio:'2/3', background:'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:40 }}>🎬</div>}
              </div>

              <div style={{ flex:1, minWidth:0, paddingTop:4 }}>
                <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'clamp(24px,5vw,50px)',
                  letterSpacing:1, lineHeight:1.05, marginBottom:10 }}>
                  {info.title || item.title}
                </h1>

                {/* Meta chips */}
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                  {info.rating && (
                    <span style={chipStyle('#ffc800', 'rgba(255,200,0,.12)', 'rgba(255,200,0,.2)')}>
                      ⭐ {info.rating}
                    </span>
                  )}
                  <span style={chipStyle('var(--text2)','var(--surface3)','var(--glass-bdr)')}>
                    {content.kind === 'series' ? '📺 Series' : '🎬 Movie'}
                  </span>
                  {content.kind === 'series' && (
                    <span style={chipStyle('var(--text2)','var(--surface3)','var(--glass-bdr)')}>
                      {content.seasons.length} Season{content.seasons.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {content.kind === 'movie' && content.qualities.length > 0 && (
                    <span style={chipStyle('var(--accent2)','var(--accent-dim)','var(--accent-bdr)')}>
                      {content.qualities.map(q=>q.label).join(' · ')}
                    </span>
                  )}
                </div>

                {/* Genre tags */}
                {info.tags?.length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
                    {info.tags.slice(0,5).map(t => (
                      <span key={t} style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600,
                        background:'var(--accent-dim)', color:'var(--accent2)', border:'1px solid var(--accent-bdr)' }}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Watchlist */}
                <button onClick={toggleWL} style={{
                  display:'inline-flex', alignItems:'center', gap:7, padding:'9px 16px', borderRadius:10,
                  background: inWL ? 'var(--accent-dim)' : 'var(--glass2)',
                  border: `1px solid ${inWL ? 'var(--accent)' : 'var(--glass-bdr)'}`,
                  color: inWL ? 'var(--accent2)' : 'var(--text)',
                  fontSize:13, fontWeight:600, cursor:'pointer', transition:'all .2s',
                  backdropFilter:'blur(12px)'
                }}>
                  {inWL ? <CheckIcon /> : <PlusIcon />}
                  {inWL ? 'In Watchlist' : '+ Watchlist'}
                </button>
              </div>
            </div>

            {/* Synopsis */}
            {info.synopsis && info.synopsis !== 'No synopsis available.' && (
              <p style={{ color:'var(--text2)', fontSize:14, lineHeight:1.7, marginBottom:16 }}>
                {info.synopsis}
              </p>
            )}
            {info.cast?.length > 0 && (
              <p style={{ fontSize:13, color:'var(--muted)', marginBottom:24 }}>
                <span style={{ color:'var(--text2)', fontWeight:600 }}>Cast </span>
                {info.cast.slice(0,5).join(' · ')}
              </p>
            )}

            {/* ════════════════════════════════════════
                MOVIE FLOW
                ════════════════════════════════════════ */}
            {content.kind === 'movie' && (
              <section>
                <SectionHeader>Choose Quality</SectionHeader>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {content.qualities.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => playMovie(q)}
                      style={{
                        display:'flex', alignItems:'center', gap:14, padding:'14px 18px',
                        borderRadius:12, background:'var(--surface2)', border:'1px solid var(--glass-bdr)',
                        cursor:'pointer', transition:'all .2s', textAlign:'left', width:'100%',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background='var(--accent-dim)'; e.currentTarget.style.borderColor='var(--accent)' }}
                      onMouseLeave={e => { e.currentTarget.style.background='var(--surface2)'; e.currentTarget.style.borderColor='var(--glass-bdr)' }}
                    >
                      <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:'var(--accent2)', minWidth:56 }}>
                        {q.label}
                      </span>
                      <span style={{ flex:1, fontSize:13, color:'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {q.rawTitle}
                      </span>
                      <span style={{ color:'var(--accent)', flexShrink:0 }}><PlayIcon /></span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ════════════════════════════════════════
                SERIES FLOW
                ════════════════════════════════════════ */}
            {content.kind === 'series' && (
              <>
                {/* Play first episode button */}
                {episodes.length > 0 && (
                  <button
                    onClick={() => playEpisode(episodes[0], 0)}
                    style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 24px',
                      borderRadius:12, background:'var(--accent)', border:'none', color:'#fff',
                      fontSize:15, fontWeight:700, cursor:'pointer', marginBottom:24,
                      boxShadow:'0 0 24px var(--accent-glow)', transition:'all .2s' }}
                  >
                    <PlayIcon /> Play S{activeSzIdx+1} E1
                  </button>
                )}

                {/* Season tabs */}
                {content.seasons.length > 1 && (
                  <div style={{ marginBottom:20 }}>
                    <SectionHeader>Season</SectionHeader>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {content.seasons.map((sz, i) => (
                        <button
                          key={i}
                          onClick={() => switchSeason(i)}
                          style={{
                            padding:'8px 18px', borderRadius:20, fontSize:13, fontWeight:600,
                            border: `2px solid ${activeSzIdx===i ? 'var(--accent)' : 'var(--glass-bdr)'}`,
                            background: activeSzIdx===i ? 'var(--accent)' : 'var(--surface2)',
                            color: activeSzIdx===i ? '#fff' : 'var(--text2)',
                            cursor:'pointer', transition:'all .2s',
                            boxShadow: activeSzIdx===i ? '0 0 14px var(--accent-glow)' : 'none',
                          }}
                        >
                          {sz.title || `Season ${i + 1}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Episode list */}
                <div>
                  <SectionHeader>
                    Episodes {episodes.length > 0 && <span style={{ color:'var(--muted)', fontSize:13, fontWeight:400 }}>({episodes.length})</span>}
                  </SectionHeader>
                  {epLoading && <div className="spinner" style={{ margin:'20px auto' }} />}
                  {!epLoading && episodes.length === 0 && (
                    <p style={{ color:'var(--muted)', fontSize:13 }}>No episodes found.</p>
                  )}
                  <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:'60vh', overflowY:'auto' }}>
                    {episodes.map((ep, i) => (
                      <div
                        key={ep.link || i}
                        onClick={() => playEpisode(ep, i)}
                        style={{
                          display:'flex', alignItems:'center', gap:14, padding:'13px 16px',
                          borderRadius:12, background:'var(--surface2)', border:'1px solid var(--glass-bdr)',
                          cursor:'pointer', transition:'all .2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background='var(--accent-dim)'; e.currentTarget.style.borderColor='var(--accent)' }}
                        onMouseLeave={e => { e.currentTarget.style.background='var(--surface2)'; e.currentTarget.style.borderColor='var(--glass-bdr)' }}
                      >
                        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:'var(--accent2)', minWidth:32 }}>
                          {String(i+1).padStart(2,'0')}
                        </span>
                        <span style={{ flex:1, fontSize:14, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {ep.title || `Episode ${i+1}`}
                        </span>
                        <span style={{ color:'var(--accent)', flexShrink:0 }}><ChevronR /></span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────
function chipStyle(color, bg, border) {
  return {
    padding:'3px 10px', borderRadius:6, fontSize:12, fontWeight:500,
    color, background:bg, border:`1px solid ${border}`,
  }
}

function SectionHeader({ children }) {
  return (
    <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, letterSpacing:1,
      color:'var(--text2)', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
      {children}
    </h3>
  )
}
