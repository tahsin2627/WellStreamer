import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { getStream } from '../lib/providers.js'
import { groupStreamsByQuality, extractAudioLangs, formatTime } from '../lib/contentUtils.js'

// ─────────────────────────────────────────────────────────────────────────────
// SVG icons
// ─────────────────────────────────────────────────────────────────────────────
const I = {
  Back:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={20} height={20}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>,
  Play:     () => <svg viewBox="0 0 24 24" fill="currentColor" width={28} height={28}><path d="M8 5v14l11-7z"/></svg>,
  Pause:    () => <svg viewBox="0 0 24 24" fill="currentColor" width={28} height={28}><rect x={6} y={4} width={4} height={16}/><rect x={14} y={4} width={4} height={16}/></svg>,
  Replay:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={22} height={22}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>,
  Forward:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={22} height={22}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
  Vol:      () => <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path fill="none" stroke="currentColor" strokeWidth={2} d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>,
  Mute:     () => <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth={2}/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth={2}/></svg>,
  FS:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/></svg>,
  ExitFS:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3"/></svg>,
  Settings: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><circle cx={12} cy={12} r={3}/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  Next:     () => <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><path d="M5 4l10 8-10 8V4zM19 5h2v14h-2z"/></svg>,
  Bright:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><circle cx={12} cy={12} r={5}/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  Aspect:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><rect x={2} y={4} width={20} height={16} rx={2}/><path d="M9 15l-3-3 3-3M15 9l3 3-3 3"/></svg>,
  Skip:     () => <svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14}><path d="M5 4l10 8-10 8V4zM19 4h2v16h-2z"/></svg>,
}

// ─────────────────────────────────────────────────────────────────────────────
// PlayerPage
// ─────────────────────────────────────────────────────────────────────────────
export default function PlayerPage({ params, navigate }) {
  const {
    kind, title, episodeTitle, episodeIdx = 0,
    link, directLinks, allEpisodes = [], allQualities = [],
    qualityLabel, seasonTitle, providerValue,
  } = params

  const videoRef      = useRef(null)
  const hlsRef        = useRef(null)
  const containerRef  = useRef(null)
  const progressRef   = useRef(null)
  const hideTimer     = useRef(null)
  const introTimer    = useRef(null)

  // Stream state
  const [groups,    setGroups]    = useState([])
  const [selQ,      setSelQ]      = useState(null)
  const [selSrv,    setSelSrv]    = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [fetchErr,  setFetchErr]  = useState(null)
  const [videoErr,  setVideoErr]  = useState(null)

  // Playback state
  const [playing,   setPlaying]   = useState(false)
  const [progress,  setProgress]  = useState(0)
  const [buffered,  setBuffered]  = useState(0)
  const [currentT,  setCurrentT]  = useState(0)
  const [duration,  setDuration]  = useState(0)
  const [muted,     setMuted]     = useState(false)
  const [volume,    setVolume]    = useState(1)
  const [fullscreen,setFullscreen]= useState(false)
  const [brightness,setBrightness]= useState(100)     // CSS filter brightness %
  const [aspectMode,setAspectMode]= useState('contain') // contain | cover | fill

  // UI state
  const [showUI,      setShowUI]      = useState(true)
  const [showSettings,setShowSettings]= useState(false)
  const [showEpList,  setShowEpList]  = useState(false)
  const [showSkipIntro, setShowSkipIntro] = useState(false)
  const [autoplay,    setAutoplay]    = useState(true)
  const [audioLangs,  setAudioLangs]  = useState([])
  const [curEpIdx,    setCurEpIdx]    = useState(episodeIdx)

  // ── fetch streams ─────────────────────────────────────────────────────────
  const fetchStreams = useCallback(async (streamLink) => {
    setLoading(true); setFetchErr(null); setVideoErr(null)
    try {
      const data = await getStream({
        providerValue,
        link: streamLink,
        type: kind,
        signal: new AbortController().signal,
      })
      const valid = (data || []).filter(s => s?.link)
      const g = groupStreamsByQuality(valid)
      setGroups(g)
      setAudioLangs(extractAudioLangs(valid))
      if (g.length) { setSelQ(g[0].quality); setSelSrv(0) }
      else setFetchErr('No streams available. Try a different episode or provider.')
    } catch(e) {
      setFetchErr(e.message || 'Stream fetch failed.')
    } finally {
      setLoading(false)
    }
  }, [providerValue, kind])

  useEffect(() => {
    const streamLink = kind === 'movie'
      ? (directLinks?.[0]?.link || link)
      : link
    fetchStreams(streamLink)
  }, [link, kind])

  // ── mount HLS ─────────────────────────────────────────────────────────────
  const curGroup  = groups.find(g => g.quality === selQ)
  const curStream = curGroup?.streams[selSrv] || null

  useEffect(() => {
    if (!curStream || !videoRef.current) return
    const v = videoRef.current
    setVideoErr(null); setProgress(0); setCurrentT(0); setDuration(0); setPlaying(false)
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    const url   = curStream.link
    const isHLS = curStream.type === 'hls' || url.includes('.m3u8')

    const onFatalErr = () => {
      if (curGroup && selSrv < curGroup.streams.length - 1) {
        setVideoErr(`Server ${selSrv+1} unavailable — switching…`)
        setSelSrv(i => i + 1)
      } else {
        setVideoErr('All servers failed for this quality.')
      }
    }

    if (isHLS && Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 120,
        maxMaxBufferLength: 300,
        enableWorker: true,
        startLevel: -1, // auto
        xhrSetup(xhr) {
          if (curStream.headers) {
            Object.entries(curStream.headers).forEach(([k,v]) => {
              try { xhr.setRequestHeader(k,v) } catch {}
            })
          }
        },
      })
      hls.loadSource(url)
      hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED, () => { v.play().catch(()=>{}) })
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) onFatalErr() })
      hlsRef.current = hls
    } else if (isHLS && v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = url; v.play().catch(()=>{})
    } else {
      v.src = url; v.play().catch(()=>{})
    }
    v.onerror = onFatalErr
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [curStream])

  // ── video events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current; if (!v) return
    const onPlay  = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onTime  = () => {
      setCurrentT(v.currentTime); setDuration(v.duration || 0)
      setProgress(v.duration ? v.currentTime / v.duration : 0)
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length-1) / (v.duration||1))
      // Show skip intro hint between 30s – 120s
      setShowSkipIntro(kind === 'series' && v.currentTime > 30 && v.currentTime < 120)
    }
    const onEnded = () => {
      if (autoplay && kind === 'series' && curEpIdx < allEpisodes.length - 1) {
        setTimeout(() => playNext(), 3000)
      }
    }
    const onFS = () => setFullscreen(!!document.fullscreenElement)

    v.addEventListener('play',        onPlay)
    v.addEventListener('pause',       onPause)
    v.addEventListener('timeupdate',  onTime)
    v.addEventListener('ended',       onEnded)
    document.addEventListener('fullscreenchange', onFS)
    return () => {
      v.removeEventListener('play',       onPlay)
      v.removeEventListener('pause',      onPause)
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('ended',      onEnded)
      document.removeEventListener('fullscreenchange', onFS)
    }
  }, [autoplay, curEpIdx, allEpisodes, kind])

  // ── Android back button ───────────────────────────────────────────────────
  useEffect(() => {
    const onPop = () => navigate('info', params)
    window.addEventListener('popstate', onPop)
    window.history.pushState({ page: 'player' }, '')
    return () => window.removeEventListener('popstate', onPop)
  }, [navigate, params])

  // ── auto-hide UI ──────────────────────────────────────────────────────────
  const showAndReset = useCallback(() => {
    setShowUI(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowUI(false)
    }, 3500)
  }, [])

  // ── player actions ────────────────────────────────────────────────────────
  const togglePlay = useCallback((e) => {
    e?.stopPropagation()
    const v = videoRef.current; if (!v) return
    playing ? v.pause() : v.play().catch(()=>{})
    showAndReset()
  }, [playing, showAndReset])

  const seek = useCallback((e) => {
    const v = videoRef.current; if (!v || !v.duration) return
    const rect = progressRef.current.getBoundingClientRect()
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    v.currentTime = pct * v.duration
    showAndReset()
  }, [showAndReset])

  const skip = useCallback((s) => {
    const v = videoRef.current; if (!v) return
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + s))
    showAndReset()
  }, [showAndReset])

  const toggleMute = () => {
    const v = videoRef.current; if (!v) return
    v.muted = !v.muted; setMuted(!muted)
  }
  const changeVol = (val) => {
    const v = videoRef.current; if (!v) return
    v.volume = val; setVolume(val); if (val > 0) { v.muted = false; setMuted(false) }
  }
  const toggleFS = () => {
    const el = containerRef.current; if (!el) return
    fullscreen ? document.exitFullscreen() : el.requestFullscreen?.()
    showAndReset()
  }
  const cycleAspect = () => {
    setAspectMode(m => m === 'contain' ? 'cover' : m === 'cover' ? 'fill' : 'contain')
  }
  const skipIntro = () => {
    const v = videoRef.current; if (!v) return
    v.currentTime = 120; setShowSkipIntro(false)
  }

  const playNext = useCallback(() => {
    const nextIdx = curEpIdx + 1
    if (nextIdx >= allEpisodes.length) return
    const nextEp = allEpisodes[nextIdx]
    setCurEpIdx(nextIdx)
    setShowEpList(false)
    navigate('player', {
      ...params,
      episodeTitle: nextEp.title || `Episode ${nextIdx + 1}`,
      episodeIdx:   nextIdx,
      link:         nextEp.link,
    })
  }, [curEpIdx, allEpisodes, navigate, params])

  const playEpisode = (ep, idx) => {
    navigate('player', {
      ...params,
      episodeTitle: ep.title || `Episode ${idx + 1}`,
      episodeIdx:   idx,
      link:         ep.link,
    })
  }

  const pickQuality = (q) => { setSelQ(q); setSelSrv(0); setVideoErr(null); setShowSettings(false) }
  const pickServer  = (i) => { setSelSrv(i); setVideoErr(null); setShowSettings(false) }

  // Computed
  const displayTitle  = title || ''
  const displaySub    = episodeTitle || ''
  const objectFitMap  = { contain: 'contain', cover: 'cover', fill: 'fill' }
  const aspectLabel   = { contain: 'Fit', cover: 'Crop', fill: 'Stretch' }

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background:'#000', minHeight:'100vh', display:'flex', flexDirection:'column',
      fontFamily:"'DM Sans',sans-serif", userSelect:'none' }}>

      {/* ════════════════════════ VIDEO CONTAINER ════════════════════════ */}
      <div
        ref={containerRef}
        style={{ position:'relative', background:'#000', width:'100%', aspectRatio:'16/9',
          maxHeight: fullscreen ? '100vh' : 'calc(100vw * 9/16)',
          overflow:'hidden', flexShrink:0 }}
        onMouseMove={showAndReset}
        onTouchStart={showAndReset}
        onTouchMove={showAndReset}
        onClick={() => { setShowSettings(false); setShowEpList(false); }}
      >
        {/* Video element */}
        <video
          ref={videoRef}
          playsInline
          style={{
            width:'100%', height:'100%', display:'block', background:'#000',
            objectFit: objectFitMap[aspectMode],
            filter: `brightness(${brightness}%)`,
          }}
        />

        {/* Loading */}
        {loading && (
          <div style={S.overlay}>
            <div style={S.spinContainer}>
              <div style={S.spinner} />
              <p style={{ color:'rgba(255,255,255,.5)', fontSize:13, marginTop:14 }}>Loading streams…</p>
            </div>
          </div>
        )}

        {/* Fetch error */}
        {fetchErr && !loading && (
          <div style={S.overlay}>
            <div style={{ textAlign:'center', padding:'0 24px' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>⚠️</div>
              <p style={{ color:'#f87171', fontSize:14, lineHeight:1.6, marginBottom:20 }}>{fetchErr}</p>
              <button onClick={() => navigate('home')} style={S.errBtn}>← Go Back</button>
            </div>
          </div>
        )}

        {/* Video error */}
        {videoErr && !fetchErr && (
          <div style={S.notice}>{videoErr}</div>
        )}

        {/* Skip intro button */}
        {showSkipIntro && !loading && (
          <button
            onClick={skipIntro}
            style={{ position:'absolute', bottom:80, right:20, zIndex:15,
              background:'rgba(0,0,0,.8)', backdropFilter:'blur(10px)',
              border:'2px solid rgba(255,255,255,.3)', color:'#fff',
              borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:700,
              cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}
          >
            <I.Skip /> Skip Intro
          </button>
        )}

        {/* Autoplay next countdown */}
        {autoplay && kind === 'series' && !playing && currentT > 0 && currentT >= (duration - 5) && curEpIdx < allEpisodes.length - 1 && (
          <div style={{ position:'absolute', bottom:80, right:20, zIndex:15,
            background:'rgba(0,0,0,.9)', border:'1px solid rgba(255,255,255,.15)',
            borderRadius:10, padding:'12px 16px', textAlign:'center' }}>
            <p style={{ color:'rgba(255,255,255,.6)', fontSize:12, marginBottom:6 }}>Next episode in 3s</p>
            <button onClick={playNext} style={{ ...S.errBtn, padding:'7px 16px', fontSize:13 }}>
              <I.Next /> Play Next
            </button>
          </div>
        )}

        {/* ── CONTROLS OVERLAY ─────────────────────────────────────── */}
        <div style={{ ...S.ctrlOverlay,
          opacity: showUI ? 1 : 0,
          pointerEvents: showUI ? 'auto' : 'none',
          transition:'opacity .35s ease' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Gradient */}
          <div style={{ position:'absolute', inset:0, pointerEvents:'none',
            background:'linear-gradient(to bottom, rgba(0,0,0,.7) 0%, transparent 28%, transparent 65%, rgba(0,0,0,.88) 100%)' }} />

          {/* TOP BAR */}
          <div style={{ position:'relative', display:'flex', alignItems:'center', padding:'12px 16px 0', gap:12, zIndex:2 }}>
            <button style={S.iconBtn} onClick={() => navigate('home')}>
              <I.Back />
            </button>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ color:'#fff', fontFamily:"'Bebas Neue',sans-serif", fontSize:17, letterSpacing:1,
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {displayTitle}
              </div>
              {displaySub && (
                <div style={{ color:'rgba(255,255,255,.6)', fontSize:12, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {displaySub}
                </div>
              )}
            </div>
            {/* Settings toggle */}
            <button style={S.iconBtn} onClick={() => { setShowSettings(p=>!p); setShowEpList(false) }}>
              <I.Settings />
            </button>
            {/* Episode list toggle (series only) */}
            {kind === 'series' && allEpisodes.length > 0 && (
              <button style={S.iconBtn} onClick={() => { setShowEpList(p=>!p); setShowSettings(false) }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}>
                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                  <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
              </button>
            )}
          </div>

          {/* CENTRE skip zones + play button */}
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', zIndex:1, pointerEvents:'none' }}>
            {/* Skip -10 zone */}
            <div style={{ ...S.skipZone, left:0 }}
              onDoubleClick={(e)=>{ e.stopPropagation(); skip(-10) }}
              style={{ position:'absolute', top:0, left:0, width:'35%', height:'100%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'auto' }}>
              <div style={S.skipHint} id="skip-back">
                <I.Replay /><span>10s</span>
              </div>
            </div>
            {/* Centre play/pause */}
            <button style={S.bigPlay} onClick={togglePlay}>
              {playing ? <I.Pause /> : <I.Play />}
            </button>
            {/* Skip +10 zone */}
            <div style={{ position:'absolute', top:0, right:0, width:'35%', height:'100%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'auto' }}
              onDoubleClick={(e)=>{ e.stopPropagation(); skip(10) }}>
              <div style={S.skipHint} id="skip-fwd">
                <I.Forward /><span>10s</span>
              </div>
            </div>
          </div>

          {/* BOTTOM CONTROLS */}
          <div style={{ position:'relative', zIndex:2, padding:'0 16px 12px' }}>
            {/* Progress bar */}
            <div ref={progressRef} style={S.progressWrap}
              onClick={seek}
              onMouseMove={e => { if (e.buttons === 1) seek(e) }}
              onTouchMove={e => {
                const t = e.touches[0]
                const rect = progressRef.current.getBoundingClientRect()
                const pct = Math.max(0,Math.min(1,(t.clientX-rect.left)/rect.width))
                if (videoRef.current?.duration) videoRef.current.currentTime = pct * videoRef.current.duration
              }}
            >
              <div style={S.progressTrack}>
                <div style={{ ...S.progressBuf, width:`${buffered*100}%` }} />
                <div style={{ ...S.progressFill, width:`${progress*100}%` }} />
                <div style={{ ...S.progressThumb, left:`${progress*100}%` }} />
              </div>
            </div>

            {/* Controls row */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:4 }}>
              <div style={{ display:'flex', alignItems:'center', gap:2 }}>
                <button style={S.iconBtn} onClick={() => skip(-10)} title="-10s"><I.Replay /></button>
                <button style={{ ...S.iconBtn, width:44, height:44 }} onClick={togglePlay}>
                  {playing ? <I.Pause /> : <I.Play />}
                </button>
                <button style={S.iconBtn} onClick={() => skip(10)} title="+10s"><I.Forward /></button>
                {kind === 'series' && curEpIdx < allEpisodes.length - 1 && (
                  <button style={S.iconBtn} onClick={playNext} title="Next episode"><I.Next /></button>
                )}
                {/* Time */}
                <span style={{ color:'rgba(255,255,255,.8)', fontSize:12, marginLeft:6, whiteSpace:'nowrap' }}>
                  {formatTime(currentT)} / {formatTime(duration)}
                </span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:2 }}>
                <button style={S.iconBtn} onClick={toggleMute}>
                  {muted || volume === 0 ? <I.Mute /> : <I.Vol />}
                </button>
                <input type="range" min={0} max={1} step={0.05} value={muted?0:volume}
                  onChange={e => changeVol(parseFloat(e.target.value))}
                  style={{ width:56, accentColor:'var(--accent)', cursor:'pointer' }} />
                <button style={S.iconBtn} onClick={cycleAspect} title={`Aspect: ${aspectLabel[aspectMode]}`}>
                  <I.Aspect />
                </button>
                <button style={S.iconBtn} onClick={toggleFS}>
                  {fullscreen ? <I.ExitFS /> : <I.FS />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── SETTINGS PANEL ──────────────────────────────────────── */}
        {showSettings && (
          <div style={S.sidePanel} onClick={e=>e.stopPropagation()}>
            {/* Quality */}
            <p style={S.panelLabel}>Quality</p>
            {groups.map(g => (
              <button key={g.quality} style={{ ...S.panelOption, background: selQ===g.quality ? 'var(--accent)' : 'transparent', color: selQ===g.quality ? '#fff' : 'rgba(255,255,255,.8)' }}
                onClick={() => pickQuality(g.quality)}>
                {selQ===g.quality && '✓ '}{g.quality}
              </button>
            ))}

            {/* Server */}
            {curGroup?.streams.length > 1 && (
              <>
                <p style={{ ...S.panelLabel, marginTop:16 }}>Server</p>
                {curGroup.streams.map((_, i) => (
                  <button key={i} style={{ ...S.panelOption, background: selSrv===i ? 'rgba(var(--accent-rgb),.3)' : 'transparent', color: selSrv===i ? '#fff' : 'rgba(255,255,255,.7)' }}
                    onClick={() => pickServer(i)}>
                    {selSrv===i && '✓ '}Server {i+1}
                  </button>
                ))}
              </>
            )}

            {/* Brightness */}
            <p style={{ ...S.panelLabel, marginTop:16 }}>Brightness</p>
            <div style={{ display:'flex', alignItems:'center', gap:10, paddingLeft:12 }}>
              <I.Bright />
              <input type="range" min={30} max={150} value={brightness}
                onChange={e => setBrightness(Number(e.target.value))}
                style={{ flex:1, accentColor:'var(--accent)' }} />
              <span style={{ color:'rgba(255,255,255,.6)', fontSize:12, minWidth:36 }}>{brightness}%</span>
            </div>

            {/* Aspect mode */}
            <p style={{ ...S.panelLabel, marginTop:16 }}>Screen Mode</p>
            {['contain','cover','fill'].map(m => (
              <button key={m} style={{ ...S.panelOption, background: aspectMode===m ? 'rgba(255,255,255,.12)':'transparent', color:'rgba(255,255,255,.8)' }}
                onClick={() => { setAspectMode(m); setShowSettings(false) }}>
                {aspectMode===m && '✓ '}{aspectLabel[m]}
              </button>
            ))}

            {/* Autoplay toggle */}
            {kind === 'series' && (
              <>
                <p style={{ ...S.panelLabel, marginTop:16 }}>Auto-play Next</p>
                <button style={{ ...S.panelOption, background: autoplay ? 'rgba(var(--accent-rgb),.3)':'transparent', color:'rgba(255,255,255,.8)' }}
                  onClick={() => setAutoplay(p=>!p)}>
                  {autoplay ? '✓ ON' : 'OFF'}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── EPISODE LIST PANEL ──────────────────────────────────── */}
        {showEpList && kind === 'series' && (
          <div style={{ ...S.sidePanel, maxHeight:'70%', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
            <p style={S.panelLabel}>Episodes</p>
            {allEpisodes.map((ep, i) => (
              <button
                key={ep.link || i}
                onClick={() => playEpisode(ep, i)}
                style={{ ...S.panelOption,
                  background: i === curEpIdx ? 'rgba(255,255,255,.12)' : 'transparent',
                  color: i === curEpIdx ? '#fff' : 'rgba(255,255,255,.75)',
                  fontWeight: i === curEpIdx ? 700 : 400,
                  padding:'10px 12px',
                }}>
                <span style={{ color:'var(--accent2)', marginRight:8, fontSize:13, fontFamily:"'Bebas Neue',sans-serif" }}>
                  {String(i+1).padStart(2,'0')}
                </span>
                {ep.title || `Episode ${i+1}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ════════════════════════ INFO BELOW VIDEO ════════════════════════ */}
      {!loading && !fetchErr && (
        <div style={{ background:'var(--surface)', flex:1, padding:'14px 18px', borderTop:'1px solid rgba(255,255,255,.06)' }}>
          <p style={{ color:'var(--text)', fontFamily:"'Bebas Neue',sans-serif", fontSize:18, letterSpacing:1 }}>{displayTitle}</p>
          {displaySub && <p style={{ color:'var(--text2)', fontSize:13, marginTop:2 }}>{displaySub}</p>}
          {videoErr && <p style={{ color:'#fbbf24', fontSize:12, marginTop:8 }}>{videoErr}</p>}
          {/* Audio language chips */}
          {audioLangs.length > 0 && (
            <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
              {audioLangs.map(l => (
                <span key={l} style={{ padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600,
                  background:'rgba(255,255,255,.08)', color:'rgba(255,255,255,.6)', border:'1px solid rgba(255,255,255,.1)' }}>
                  🎧 {l}
                </span>
              ))}
            </div>
          )}
          {/* Next episode button */}
          {kind === 'series' && curEpIdx < allEpisodes.length - 1 && (
            <button onClick={playNext} style={{ marginTop:12, display:'inline-flex', alignItems:'center', gap:6,
              padding:'8px 16px', borderRadius:10, background:'var(--surface2)', border:'1px solid var(--glass-bdr)',
              color:'var(--text)', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              <I.Next /> Next Episode
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Style constants
// ─────────────────────────────────────────────────────────────────────────────
const S = {
  overlay:       { position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.85)', zIndex:20 },
  spinContainer: { display:'flex', flexDirection:'column', alignItems:'center' },
  spinner:       { width:44, height:44, border:'3px solid rgba(255,255,255,.1)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'playerSpin .8s linear infinite' },
  notice:        { position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,.9)', color:'#fbbf24', fontSize:12, padding:'6px 16px', borderRadius:8, whiteSpace:'nowrap', zIndex:15, pointerEvents:'none' },
  errBtn:        { background:'var(--accent)', color:'#fff', border:'none', borderRadius:10, padding:'10px 22px', fontSize:14, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6 },
  ctrlOverlay:   { position:'absolute', inset:0, zIndex:10, display:'flex', flexDirection:'column', justifyContent:'space-between' },
  iconBtn:       { background:'none', border:'none', cursor:'pointer', padding:'8px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, color:'white', transition:'background .15s', width:38, height:38 },
  bigPlay:       { width:68, height:68, borderRadius:'50%', background:'rgba(0,0,0,.6)', backdropFilter:'blur(8px)', border:'2px solid rgba(255,255,255,.2)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'white', position:'relative', zIndex:2 },
  skipHint:      { display:'flex', flexDirection:'column', alignItems:'center', gap:4, color:'rgba(255,255,255,.0)', fontSize:11, fontWeight:700, transition:'color .2s' },
  progressWrap:  { height:28, display:'flex', alignItems:'center', cursor:'pointer', touchAction:'none' },
  progressTrack: { position:'relative', width:'100%', height:4, background:'rgba(255,255,255,.2)', borderRadius:4 },
  progressBuf:   { position:'absolute', left:0, top:0, height:'100%', background:'rgba(255,255,255,.3)', borderRadius:4 },
  progressFill:  { position:'absolute', left:0, top:0, height:'100%', background:'var(--accent)', borderRadius:4, transition:'width .1s' },
  progressThumb: { position:'absolute', top:'50%', width:14, height:14, borderRadius:'50%', background:'#fff', transform:'translate(-50%,-50%)', boxShadow:'0 0 8px rgba(0,0,0,.5)', transition:'left .1s' },
  sidePanel:     { position:'absolute', top:0, right:0, bottom:0, width:200, background:'rgba(10,10,10,.97)', backdropFilter:'blur(20px)', borderLeft:'1px solid rgba(255,255,255,.08)', zIndex:20, padding:16, display:'flex', flexDirection:'column', gap:2 },
  panelLabel:    { color:'rgba(255,255,255,.4)', fontSize:10, fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', marginBottom:4, paddingLeft:12 },
  panelOption:   { display:'block', width:'100%', padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, textAlign:'left', transition:'background .15s' },
}
