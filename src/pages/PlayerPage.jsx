// src/pages/PlayerPage.jsx — STABLE FIXED VERSION
// Fixes: black screen crash, panel closes bug, iOS blank screen

import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { getStream } from '../lib/providers.js'

// ── iOS detection ─────────────────────────────────────────────────────────
const IS_IOS = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
)

// ── Quality utils ─────────────────────────────────────────────────────────
const QP_ORDER = ['4K','2160p','1440p','1080p','720p','480p','360p','Auto']

function getStreamQuality(s) {
  if (s.quality) {
    const q = String(s.quality)
    return q.endsWith('p') ? q : (q === '2160' || q === '4K' ? '4K' : q + 'p')
  }
  const t = `${s.server || ''} ${s.link || ''}`
  const m = t.match(/\b(2160|4K|1440|1080|720|480|360)\b/i)
  if (!m) return 'Auto'
  const n = m[1].toUpperCase()
  return (n === '2160' || n === '4K') ? '4K' : n + 'p'
}

function groupByQuality(streams) {
  const map = {}
  streams.forEach((s, i) => {
    const q = getStreamQuality(s)
    if (!map[q]) map[q] = []
    map[q].push({ ...s, _idx: i })
  })
  return Object.entries(map)
    .map(([quality, streams]) => ({ quality, streams }))  // ← "streams" not "servers"
    .sort((a, b) => {
      const ai = QP_ORDER.indexOf(a.quality), bi = QP_ORDER.indexOf(b.quality)
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    })
}

function extractAudioLangs(streams) {
  const langs = new Set()
  streams?.forEach(s => {
    const t = `${s.server || ''} ${s.link || ''}`
    if (/hindi/i.test(t))         langs.add('Hindi')
    if (/english/i.test(t))       langs.add('English')
    if (/tamil/i.test(t))         langs.add('Tamil')
    if (/telugu/i.test(t))        langs.add('Telugu')
    if (/bengali|bangla/i.test(t)) langs.add('Bengali')
    if (/kannada/i.test(t))       langs.add('Kannada')
    if (/malayalam/i.test(t))     langs.add('Malayalam')
    if (/korean/i.test(t))        langs.add('Korean')
    if (/japanese/i.test(t))      langs.add('Japanese')
  })
  return [...langs]
}

function fmt(sec) {
  if (!sec || isNaN(sec)) return '0:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

// ── SVG icons (inline, no deps) ───────────────────────────────────────────
const Ic = {
  Back:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={20} height={20}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>,
  Play:  () => <svg viewBox="0 0 24 24" fill="currentColor" width={30} height={30}><path d="M8 5v14l11-7z"/></svg>,
  Pause: () => <svg viewBox="0 0 24 24" fill="currentColor" width={30} height={30}><rect x={6} y={4} width={4} height={16}/><rect x={14} y={4} width={4} height={16}/></svg>,
  Rew:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={22} height={22}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>,
  Fwd:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={22} height={22}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
  Vol:   () => <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path fill="none" stroke="currentColor" strokeWidth={2} d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>,
  Mute:  () => <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth={2}/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth={2}/></svg>,
  FS:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/></svg>,
  ExFS:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3"/></svg>,
  Gear:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><circle cx={12} cy={12} r={3}/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  List:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  Next:  () => <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><path d="M5 4l10 8-10 8V4zM19 5h2v14h-2z"/></svg>,
}

// ── Style constants ────────────────────────────────────────────────────────
const RED = '#e50914'
const iBtn = { background:'none', border:'none', cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, padding:8, WebkitTapHighlightColor:'transparent', width:38, height:38 }
const overlay = { position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.9)', zIndex:20 }
const spinStyle = { width:44, height:44, margin:'0 auto', border:'3px solid rgba(255,255,255,0.1)', borderTopColor:RED, borderRadius:'50%', animation:'_wspin 0.8s linear infinite' }
const errBtn = { background:RED, color:'#fff', border:'none', borderRadius:10, padding:'10px 22px', fontSize:14, fontWeight:700, cursor:'pointer' }

// ── Tiny sub-components ────────────────────────────────────────────────────
function Logo() {
  return <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, letterSpacing:2, pointerEvents:'none' }}>WELL<span style={{ color:RED }}>STREAMER</span></span>
}

function PanelRow({ label, active, onClick }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'11px 16px', cursor:'pointer',
        background: active ? 'rgba(229,9,20,0.15)' : 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <span style={{ fontSize:14, color: active ? '#fff' : 'rgba(255,255,255,0.7)', fontWeight: active ? 700 : 400 }}>
        {label}
      </span>
      {active && (
        <svg viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={3} width={14} height={14}>
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
    </div>
  )
}

function PanelSection({ title, children }) {
  return (
    <div style={{ marginBottom:4 }}>
      <p style={{ fontSize:10, fontWeight:700, letterSpacing:1.3, textTransform:'uppercase', color:'rgba(255,255,255,0.3)', padding:'14px 16px 6px' }}>
        {title}
      </p>
      {children}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function PlayerPage({ params, navigate }) {
  const {
    link,
    title        = '',
    type,
    kind,
    episodeTitle = '',
    episodeIdx   = 0,
    providerValue,
    directLinks,
    allEpisodes  = [],
    seasonTitle  = '',
    image,
  } = params

  const contentKind = kind || type || 'movie'

  // Refs
  const videoRef     = useRef(null)
  const hlsRef       = useRef(null)
  const containerRef = useRef(null)
  const progressRef  = useRef(null)
  const hideTimer    = useRef(null)
  const nextTimer    = useRef(null)
  const panelRef     = useRef(null)  // ← for click-outside detection

  // Stream state
  const [groups,   setGroups]   = useState([])
  const [selQ,     setSelQ]     = useState(null)
  const [selSrv,   setSelSrv]   = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [fetchErr, setFetchErr] = useState(null)
  const [videoErr, setVideoErr] = useState(null)

  // Playback state
  const [playing,   setPlaying]   = useState(false)
  const [progress,  setProgress]  = useState(0)
  const [buffered,  setBuffered]  = useState(0)
  const [currentT,  setCurrentT]  = useState(0)
  const [duration,  setDuration]  = useState(0)
  const [muted,     setMuted]     = useState(false)
  const [volume,    setVolume]    = useState(1)
  const [fullscreen,setFullscreen]= useState(false)

  // UI state
  const [brightness,  setBrightness]  = useState(100)
  const [screenMode,  setScreenMode]  = useState('contain')
  const [showUI,      setShowUI]      = useState(true)
  const [panel,       setPanel]       = useState(null) // 'settings' | 'episodes' | null
  const [showSkip,    setShowSkip]    = useState(false)
  const [autoplay,    setAutoplay]    = useState(true)
  const [countdown,   setCountdown]   = useState(null)
  const [audioLangs,  setAudioLangs]  = useState([])
  const [selLang,     setSelLang]     = useState(null)
  const [curEpIdx,    setCurEpIdx]    = useState(episodeIdx)
  const [tapHint,     setTapHint]     = useState(false)

  // ── iOS: set webkit attrs imperatively after mount ───────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    // React doesn't pass these to DOM — must be set manually
    v.setAttribute('playsinline', '')
    v.setAttribute('webkit-playsinline', '')
    v.setAttribute('x-webkit-airplay', 'allow')
  }, [])

  // ── Fetch streams ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const sl = contentKind === 'movie'
      ? (directLinks?.[0]?.link || link)
      : link

    if (!sl) {
      setFetchErr('No stream link provided.')
      setLoading(false)
      return
    }
    setLoading(true); setFetchErr(null); setVideoErr(null)

    ;(async () => {
      try {
        const data = await getStream({
          providerValue, link: sl, type: contentKind,
          signal: new AbortController().signal,
        })
        if (cancelled) return
        const valid = (data || []).filter(s => s?.link)
        const g = groupByQuality(valid)
        const langs = extractAudioLangs(valid)
        setGroups(g)
        setAudioLangs(langs)
        if (langs.length) setSelLang(langs[0])
        if (g.length) { setSelQ(g[0].quality); setSelSrv(0) }
        else setFetchErr('No streams found. Try another provider.')
      } catch (e) {
        if (!cancelled) setFetchErr(e.message || 'Stream fetch failed.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [link, contentKind, providerValue])

  // ── Mount HLS / MP4 — iOS-safe ──────────────────────────────────────
  const curGroup  = groups.find(g => g.quality === selQ)
  const curStream = curGroup?.streams[selSrv] || null  // ← "streams" not "servers"

  useEffect(() => {
    if (!curStream || !videoRef.current) return
    const v = videoRef.current

    setVideoErr(null); setProgress(0); setCurrentT(0); setDuration(0)
    setPlaying(false); setTapHint(false)

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    const url   = curStream.link
    const isHLS = curStream.type === 'hls' || url.includes('.m3u8')

    const onFatal = () => {
      if (curGroup && selSrv < curGroup.streams.length - 1) {
        setVideoErr(`Server ${selSrv + 1} failed — trying next…`)
        setTimeout(() => setSelSrv(i => i + 1), 800)
      } else {
        setVideoErr('All servers failed. Try another quality.')
      }
    }

    if (isHLS && Hls.isSupported()) {
      // ── Android / Desktop ─────────────────────────────────────────────
      const hls = new Hls({
        maxBufferLength: 120,
        maxMaxBufferLength: 300,
        enableWorker: true,
        startLevel: -1,
        xhrSetup(xhr) {
          xhr.withCredentials = false
          if (curStream.headers) {
            Object.entries(curStream.headers).forEach(([k, val]) => {
              try { xhr.setRequestHeader(k, val) } catch {}
            })
          }
        },
      })
      hls.loadSource(url)
      hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}))
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) onFatal() })
      hlsRef.current = hls

    } else if (isHLS && v.canPlayType('application/vnd.apple.mpegurl')) {
      // ── iOS Safari native HLS — all 5 steps required ──────────────────
      v.setAttribute('playsinline', '')
      v.setAttribute('webkit-playsinline', '')
      v.removeAttribute('crossorigin')     // Step 1: no CORS preflight
      if (image) v.poster = image          // Step 2: poster prevents blank
      v.src = url                          // Step 3: set src
      v.load()                             // Step 4: explicit load() call — THE KEY FIX
      // Step 5: wait for metadata BEFORE playing
      const onMeta = () => {
        setDuration(v.duration || 0)
        setTapHint(false)
        v.play().catch(() => setTapHint(true))
      }
      v.addEventListener('loadedmetadata', onMeta, { once: true })
      v.addEventListener('error', onFatal, { once: true })
      return () => {
        v.removeEventListener('loadedmetadata', onMeta)
        v.removeEventListener('error', onFatal)
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      }

    } else {
      // ── Direct MP4 ────────────────────────────────────────────────────
      v.removeAttribute('crossorigin')
      v.src = url
      v.load()
      v.play().catch(() => setTapHint(true))
    }

    v.onerror = () => onFatal()
    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [curStream])

  // ── Video events ──────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current; if (!v) return
    const onPlay  = () => { setPlaying(true); setTapHint(false) }
    const onPause = () => setPlaying(false)
    const onTime  = () => {
      const ct = v.currentTime, dur = v.duration || 0
      setCurrentT(ct); setDuration(dur)
      setProgress(dur > 0 ? ct / dur : 0)
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1) / (dur || 1))
      setShowSkip(contentKind === 'series' && ct > 15 && ct < 90)
      if (autoplay && contentKind === 'series' && dur > 0 && ct >= dur - 10 && curEpIdx < allEpisodes.length - 1)
        setCountdown(Math.max(1, Math.ceil(dur - ct)))
      else setCountdown(null)
    }
    const onEnded = () => {
      setPlaying(false)
      if (autoplay && contentKind === 'series' && curEpIdx < allEpisodes.length - 1) {
        clearTimeout(nextTimer.current)
        nextTimer.current = setTimeout(playNext, 2000)
      }
    }
    const onDur = () => setDuration(v.duration || 0)
    const onFS  = () => setFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement))

    v.addEventListener('play',           onPlay)
    v.addEventListener('pause',          onPause)
    v.addEventListener('timeupdate',     onTime)
    v.addEventListener('ended',          onEnded)
    v.addEventListener('durationchange', onDur)
    document.addEventListener('fullscreenchange',       onFS)
    document.addEventListener('webkitfullscreenchange', onFS)
    return () => {
      v.removeEventListener('play',           onPlay)
      v.removeEventListener('pause',          onPause)
      v.removeEventListener('timeupdate',     onTime)
      v.removeEventListener('ended',          onEnded)
      v.removeEventListener('durationchange', onDur)
      document.removeEventListener('fullscreenchange',       onFS)
      document.removeEventListener('webkitfullscreenchange', onFS)
    }
  }, [autoplay, curEpIdx, allEpisodes, contentKind])

  // ── Auto-hide controls ────────────────────────────────────────────────
  const showAndReset = useCallback(() => {
    setShowUI(true)
    clearTimeout(hideTimer.current)
    if (videoRef.current && !videoRef.current.paused) {
      hideTimer.current = setTimeout(() => setShowUI(false), 3500)
    }
  }, [])

  // ── Player actions ────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return
    v.paused ? v.play().catch(() => {}) : v.pause()
    showAndReset()
  }, [showAndReset])

  const seek = useCallback((e) => {
    const v = videoRef.current; if (!v?.duration) return
    const rect = progressRef.current?.getBoundingClientRect(); if (!rect) return
    const clientX = e.touches?.[0]?.clientX ?? e.clientX
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
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
    v.muted = !v.muted; setMuted(v.muted)
  }

  const changeVol = (val) => {
    const v = videoRef.current; if (!v) return
    const n = parseFloat(val); v.volume = n; setVolume(n)
    if (n > 0) { v.muted = false; setMuted(false) }
  }

  const toggleFS = () => {
    const el = containerRef.current; if (!el) return
    if (!fullscreen) {
      ;(el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)
    } else {
      ;(document.exitFullscreen || document.webkitExitFullscreen)?.call(document)
    }
    showAndReset()
  }

  const playNext = useCallback(() => {
    clearTimeout(nextTimer.current); setCountdown(null)
    const ni = curEpIdx + 1
    if (ni >= allEpisodes.length) return
    navigate('player', {
      ...params,
      episodeTitle: allEpisodes[ni].title || `Episode ${ni + 1}`,
      episodeIdx: ni,
      link: allEpisodes[ni].link,
    })
  }, [curEpIdx, allEpisodes, navigate, params])

  const playEpisode = (ep, i) => {
    setPanel(null)
    setCurEpIdx(i)
    navigate('player', {
      ...params,
      episodeTitle: ep.title || `Episode ${i + 1}`,
      episodeIdx: i,
      link: ep.link,
    })
  }

  // ── FIX: handle video area click — don't close panel, don't toggle play ──
  const handleVideoAreaClick = useCallback((e) => {
    // If click is inside the panel, do nothing (panel handles its own clicks)
    if (panelRef.current && panelRef.current.contains(e.target)) return
    // If a panel is open and click is outside it, close the panel
    if (panel) { setPanel(null); return }
    // Otherwise toggle play
    togglePlay()
  }, [panel, togglePlay])

  const handleTouchStart = useCallback((e) => {
    if (panelRef.current && panelRef.current.contains(e.target)) return
    if (panel) { setPanel(null); return }
    showAndReset()
  }, [panel, showAndReset])

  const displaySub = episodeTitle || seasonTitle || ''

  return (
    <div style={{ background:'#000', minHeight:'100dvh', display:'flex', flexDirection:'column', fontFamily:"'DM Sans',sans-serif", color:'#fff' }}>

      {/* ═══════════ VIDEO CONTAINER ═══════════ */}
      <div
        ref={containerRef}
        style={{
          position:'relative', background:'#000', width:'100%',
          aspectRatio:'16/9',
          maxHeight: fullscreen ? '100dvh' : 'min(100vw * 9/16, 60vh)',
          overflow:'hidden', flexShrink:0,
        }}
        onMouseMove={showAndReset}
        onTouchStart={handleTouchStart}
        onClick={handleVideoAreaClick}
      >
        {/* ── VIDEO ELEMENT ── */}
        <video
          ref={videoRef}
          playsInline
          poster={image || undefined}
          style={{
            width:'100%', height:'100%', display:'block', background:'#000',
            objectFit: screenMode,
            filter: `brightness(${brightness}%)`,
          }}
        />

        {/* Loading overlay */}
        {loading && (
          <div style={overlay}>
            <div style={{ textAlign:'center' }}>
              <div style={spinStyle} />
              <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, marginTop:14 }}>Finding streams…</p>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {fetchErr && !loading && (
          <div style={overlay}>
            <div style={{ textAlign:'center', padding:'0 24px' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>⚠️</div>
              <p style={{ color:'#f87171', fontSize:14, lineHeight:1.6, marginBottom:20 }}>{fetchErr}</p>
              <button onClick={() => navigate('home')} style={errBtn}>← Go Back</button>
            </div>
          </div>
        )}

        {/* iOS tap-to-play */}
        {tapHint && !loading && !fetchErr && (
          <div
            style={overlay}
            onClick={(e) => { e.stopPropagation(); videoRef.current?.play().catch(() => {}) }}
          >
            <div style={{ textAlign:'center' }}>
              <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', border:'2px solid rgba(255,255,255,0.3)' }}>
                <Ic.Play />
              </div>
              <p style={{ fontSize:13, color:'rgba(255,255,255,0.7)' }}>Tap to play</p>
              {IS_IOS && <p style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:4 }}>iOS requires a tap to start</p>}
            </div>
          </div>
        )}

        {/* Video error toast */}
        {videoErr && !fetchErr && (
          <div style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,0.9)', color:'#fbbf24', fontSize:12, padding:'7px 18px', borderRadius:8, whiteSpace:'nowrap', zIndex:20, pointerEvents:'none' }}>
            {videoErr}
          </div>
        )}

        {/* Skip intro button */}
        {showSkip && !loading && !fetchErr && (
          <button
            onClick={(e) => { e.stopPropagation(); const v = videoRef.current; if (v) v.currentTime = 90; setShowSkip(false) }}
            style={{ position:'absolute', bottom:72, right:14, zIndex:25, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(8px)', border:'1.5px solid rgba(255,255,255,0.3)', color:'#fff', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:7, WebkitTapHighlightColor:'transparent' }}
          >
            ▶| Skip Intro
          </button>
        )}

        {/* Autoplay countdown */}
        {countdown !== null && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position:'absolute', bottom:72, right:14, zIndex:25, background:'rgba(0,0,0,0.92)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:12, padding:'12px 16px', textAlign:'center', minWidth:160 }}
          >
            <p style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:10 }}>Next episode in {countdown}s</p>
            <button onClick={(e) => { e.stopPropagation(); playNext() }} style={{ ...errBtn, width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <Ic.Next /> Play Now
            </button>
          </div>
        )}

        {/* ═══ CONTROLS OVERLAY ═══ */}
        <div
          style={{
            position:'absolute', inset:0, zIndex:10,
            display:'flex', flexDirection:'column', justifyContent:'space-between',
            background: showUI
              ? 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 30%, transparent 65%, rgba(0,0,0,0.88) 100%)'
              : 'transparent',
            opacity: showUI ? 1 : 0,
            pointerEvents: showUI ? 'auto' : 'none',
            transition: 'opacity 0.3s ease',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top bar */}
          <div style={{ display:'flex', alignItems:'center', padding:'10px 12px 0', gap:8 }}>
            <button style={iBtn} onClick={() => navigate('home')}><Ic.Back /></button>
            <div style={{ flex:1, display:'flex', justifyContent:'center' }}><Logo /></div>
            <button
              style={{ ...iBtn, background: panel === 'settings' ? 'rgba(255,255,255,0.15)' : 'none' }}
              onClick={(e) => { e.stopPropagation(); setPanel(p => p === 'settings' ? null : 'settings') }}
            >
              <Ic.Gear />
            </button>
            {contentKind === 'series' && allEpisodes.length > 0 && (
              <button
                style={{ ...iBtn, background: panel === 'episodes' ? 'rgba(255,255,255,0.15)' : 'none' }}
                onClick={(e) => { e.stopPropagation(); setPanel(p => p === 'episodes' ? null : 'episodes') }}
              >
                <Ic.List />
              </button>
            )}
          </div>

          {/* Centre — big play/pause + skip zones */}
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', pointerEvents:'none' }}>
            <button
              style={{ ...iBtn, width:70, height:70, borderRadius:'50%', background:'rgba(0,0,0,0.55)', backdropFilter:'blur(8px)', border:'2px solid rgba(255,255,255,0.22)', pointerEvents:'auto' }}
              onClick={(e) => { e.stopPropagation(); togglePlay() }}
            >
              {playing ? <Ic.Pause /> : <Ic.Play />}
            </button>
            <div style={{ position:'absolute', left:0, top:0, width:'35%', height:'100%', pointerEvents:'auto' }} onDoubleClick={(e) => { e.stopPropagation(); skip(-10) }} />
            <div style={{ position:'absolute', right:0, top:0, width:'35%', height:'100%', pointerEvents:'auto' }} onDoubleClick={(e) => { e.stopPropagation(); skip(10) }} />
          </div>

          {/* Bottom controls */}
          <div style={{ padding:'0 12px 10px' }}>
            <div
              ref={progressRef}
              style={{ height:28, display:'flex', alignItems:'center', cursor:'pointer', touchAction:'none' }}
              onClick={(e) => { e.stopPropagation(); seek(e) }}
              onTouchStart={(e) => { e.stopPropagation(); seek(e) }}
              onTouchMove={(e) => { e.stopPropagation(); seek(e) }}
            >
              <div style={{ position:'relative', width:'100%', height:4, background:'rgba(255,255,255,0.2)', borderRadius:4 }}>
                <div style={{ position:'absolute', left:0, top:0, height:'100%', width:`${buffered*100}%`, background:'rgba(255,255,255,0.28)', borderRadius:4 }} />
                <div style={{ position:'absolute', left:0, top:0, height:'100%', width:`${progress*100}%`, background:RED, borderRadius:4 }} />
                <div style={{ position:'absolute', top:'50%', left:`${progress*100}%`, width:16, height:16, borderRadius:'50%', background:'#fff', transform:'translate(-50%,-50%)', boxShadow:'0 0 8px rgba(0,0,0,0.6)' }} />
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:0 }}>
                <button style={iBtn} onClick={(e) => { e.stopPropagation(); skip(-10) }}><Ic.Rew /></button>
                <button style={{ ...iBtn, width:44, height:44 }} onClick={(e) => { e.stopPropagation(); togglePlay() }}>
                  {playing ? <Ic.Pause /> : <Ic.Play />}
                </button>
                <button style={iBtn} onClick={(e) => { e.stopPropagation(); skip(10) }}><Ic.Fwd /></button>
                {contentKind === 'series' && curEpIdx < allEpisodes.length - 1 && (
                  <button style={iBtn} onClick={(e) => { e.stopPropagation(); playNext() }}><Ic.Next /></button>
                )}
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginLeft:6, whiteSpace:'nowrap' }}>
                  {fmt(currentT)} / {fmt(duration)}
                </span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:2 }}>
                <button style={iBtn} onClick={(e) => { e.stopPropagation(); toggleMute() }}>
                  {muted || volume === 0 ? <Ic.Mute /> : <Ic.Vol />}
                </button>
                <input
                  type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
                  onChange={(e) => changeVol(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width:52, accentColor:RED, cursor:'pointer' }}
                />
                <button style={iBtn} onClick={(e) => { e.stopPropagation(); toggleFS() }}>
                  {fullscreen ? <Ic.ExFS /> : <Ic.FS />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ SETTINGS PANEL ═══ */}
        {panel === 'settings' && (
          <div
            ref={panelRef}
            style={{ position:'absolute', top:0, right:0, bottom:0, width:220, background:'rgba(6,6,6,0.97)', backdropFilter:'blur(20px)', borderLeft:'1px solid rgba(255,255,255,0.08)', zIndex:30, display:'flex', flexDirection:'column' }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
              <p style={{ fontSize:11, fontWeight:700, letterSpacing:1.3, textTransform:'uppercase', color:'rgba(255,255,255,0.4)' }}>Settings</p>
            </div>
            <div style={{ flex:1, overflowY:'auto' }}>
              <PanelSection title="Quality">
                {groups.map(g => (
                  <PanelRow key={g.quality} label={g.quality} active={selQ === g.quality}
                    onClick={() => { setSelQ(g.quality); setSelSrv(0); setVideoErr(null) }} />
                ))}
              </PanelSection>
              {curGroup?.streams.length > 1 && (
                <PanelSection title="Server">
                  {curGroup.streams.map((_, i) => (
                    <PanelRow key={i} label={`Server ${i + 1}`} active={selSrv === i}
                      onClick={() => { setSelSrv(i); setVideoErr(null) }} />
                  ))}
                </PanelSection>
              )}
              {audioLangs.length > 0 && (
                <PanelSection title="🎧 Audio">
                  {audioLangs.map(l => (
                    <PanelRow key={l} label={l} active={selLang === l} onClick={() => setSelLang(l)} />
                  ))}
                </PanelSection>
              )}
              <PanelSection title="Brightness">
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 16px 12px' }}>
                  <input
                    type="range" min={30} max={150} step={5} value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                    style={{ flex:1, accentColor:RED }}
                  />
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)', minWidth:38 }}>{brightness}%</span>
                </div>
              </PanelSection>
              <PanelSection title="Screen Mode">
                <PanelRow label="Fit"     active={screenMode === 'contain'} onClick={() => setScreenMode('contain')} />
                <PanelRow label="Crop"    active={screenMode === 'cover'}   onClick={() => setScreenMode('cover')} />
                <PanelRow label="Stretch" active={screenMode === 'fill'}    onClick={() => setScreenMode('fill')} />
              </PanelSection>
              {contentKind === 'series' && (
                <PanelSection title="Auto-play Next">
                  <PanelRow label={autoplay ? 'Enabled' : 'Disabled'} active={autoplay} onClick={() => setAutoplay(p => !p)} />
                </PanelSection>
              )}
            </div>
          </div>
        )}

        {/* ═══ EPISODE PANEL ═══ */}
        {panel === 'episodes' && contentKind === 'series' && (
          <div
            ref={panelRef}
            style={{ position:'absolute', top:0, right:0, bottom:0, width:240, background:'rgba(6,6,6,0.97)', backdropFilter:'blur(20px)', borderLeft:'1px solid rgba(255,255,255,0.08)', zIndex:30, display:'flex', flexDirection:'column' }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
              <p style={{ fontSize:11, fontWeight:700, letterSpacing:1.3, textTransform:'uppercase', color:'rgba(255,255,255,0.4)' }}>Episodes</p>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'8px 10px' }}>
              {allEpisodes.map((ep, i) => {
                const cur = i === curEpIdx
                return (
                  <div
                    key={ep.link || i}
                    onClick={(e) => { e.stopPropagation(); playEpisode(ep, i) }}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, marginBottom:6, background: cur ? `${RED}22` : 'rgba(255,255,255,0.04)', border:`1px solid ${cur ? RED + '55' : 'transparent'}`, cursor:'pointer' }}
                  >
                    <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color: cur ? RED : 'rgba(255,255,255,0.35)', minWidth:28 }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ flex:1, fontSize:13, color: cur ? '#fff' : 'rgba(255,255,255,0.7)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight: cur ? 600 : 400 }}>
                      {ep.title || `Episode ${i + 1}`}
                    </span>
                    {cur && <span style={{ fontSize:10, color:RED, fontWeight:700 }}>▶ NOW</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════ INFO PANEL (below video) ═══════════ */}
      {!loading && !fetchErr && (
        <div style={{ background:'#0f0f0f', flex:1, padding:'14px 18px 32px', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
          <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:3 }}>{title}</h2>
          {displaySub && <p style={{ color:'rgba(255,255,255,0.45)', fontSize:13, marginBottom:12 }}>{displaySub}</p>}
          {videoErr && <p style={{ color:'#fbbf24', fontSize:12, marginBottom:10 }}>{videoErr}</p>}

          {/* Audio language chips */}
          {audioLangs.length > 0 && (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
              {audioLangs.map(l => (
                <span
                  key={l}
                  onClick={() => setSelLang(l)}
                  style={{ padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:600, background: selLang === l ? `${RED}20` : 'rgba(255,255,255,0.07)', color: selLang === l ? RED : 'rgba(255,255,255,0.5)', border:`1px solid ${selLang === l ? RED + '55' : 'rgba(255,255,255,0.1)'}`, cursor:'pointer' }}
                >
                  🎧 {l}
                </span>
              ))}
            </div>
          )}

          {/* Next episode button */}
          {contentKind === 'series' && curEpIdx < allEpisodes.length - 1 && (
            <button
              onClick={playNext}
              style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'10px 18px', borderRadius:10, marginBottom:20, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}
            >
              <Ic.Next /> Next Episode
            </button>
          )}

          {/* Inline episode list */}
          {contentKind === 'series' && allEpisodes.length > 0 && (
            <div>
              <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, letterSpacing:1, color:'rgba(255,255,255,0.35)', marginBottom:12 }}>EPISODES</h3>
              <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:'50vh', overflowY:'auto' }}>
                {allEpisodes.map((ep, i) => {
                  const cur = i === curEpIdx
                  return (
                    <div
                      key={ep.link || i}
                      onClick={() => playEpisode(ep, i)}
                      style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 14px', borderRadius:12, background: cur ? `${RED}18` : 'rgba(255,255,255,0.04)', border:`1px solid ${cur ? RED + '44' : 'rgba(255,255,255,0.07)'}`, cursor:'pointer' }}
                    >
                      <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color: cur ? RED : 'rgba(255,255,255,0.28)', minWidth:32 }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span style={{ flex:1, fontSize:14, fontWeight: cur ? 600 : 400, color: cur ? '#fff' : 'rgba(255,255,255,0.65)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {ep.title || `Episode ${i + 1}`}
                      </span>
                      {cur
                        ? <span style={{ fontSize:11, color:RED, fontWeight:700 }}>▶ NOW</span>
                        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14} style={{ color:'rgba(255,255,255,0.25)', flexShrink:0 }}><polyline points="9 18 15 12 9 6"/></svg>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes _wspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
