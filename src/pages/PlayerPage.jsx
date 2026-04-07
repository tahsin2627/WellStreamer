// src/pages/PlayerPage.jsx
// Complete professional player — iOS compatible, PWA ready, full controls

import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { getStream } from '../lib/providers.js'
import { groupStreamsByQuality, extractAudioLangs, formatTime } from '../lib/contentUtils.js'
import { historyStorage } from '../lib/storage.js'

// ── Inline SVG icons (no external deps) ──────────────────────────────────
const I = {
  Back:  ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={22} height={22}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>,
  Play:  ()=><svg viewBox="0 0 24 24" fill="currentColor" width={34} height={34}><path d="M8 5v14l11-7z"/></svg>,
  Pause: ()=><svg viewBox="0 0 24 24" fill="currentColor" width={34} height={34}><rect x={6} y={4} width={4} height={16}/><rect x={14} y={4} width={4} height={16}/></svg>,
  Rew:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={22} height={22}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/><text x="8" y="16" fontSize="7" fill="currentColor" fontWeight="bold">10</text></svg>,
  Fwd:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={22} height={22}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/><text x="8" y="16" fontSize="7" fill="currentColor" fontWeight="bold">10</text></svg>,
  Next:  ()=><svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20}><path d="M5 4l10 8-10 8V4zM19 5h2v14h-2z"/></svg>,
  Vol:   ()=><svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path fill="none" stroke="currentColor" strokeWidth={2} d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>,
  Mute:  ()=><svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth={2}/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth={2}/></svg>,
  FS:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={20} height={20}><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/></svg>,
  ExFS:  ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={20} height={20}><path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3"/></svg>,
  Gear:  ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={20} height={20}><circle cx={12} cy={12} r={3}/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  List:  ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={20} height={20}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  Skip:  ()=><svg viewBox="0 0 24 24" fill="currentColor" width={13} height={13}><path d="M5 4l10 8-10 8V4zM19 4h2v16h-2z"/></svg>,
  Bright:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><circle cx={12} cy={12} r={5}/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  Dub:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/></svg>,
  Check: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} width={14} height={14}><polyline points="20 6 9 17 4 12"/></svg>,
  Phone: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><rect x={5} y={2} width={14} height={20} rx={2} ry={2}/><line x1={12} y1={18} x2={12.01} y2={18}/></svg>,
}

// ── Logo component ────────────────────────────────────────────────────────
function Logo() {
  // ── Embed mode: full-page iframe (no WellStreamer player overlay) ──
  const isEmbedStream = !loading && !fetchErr && curStream && (
    curStream.type === 'embed' ||
    curStream.link?.includes('vidsrc') ||
    curStream.link?.includes('autoembed') ||
    curStream.link?.includes('multiembed') ||
    curStream.link?.includes('pixeldrain.com/u/')
  )

  if (isEmbedStream) {
    return (
      <div style={{ background: '#000', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        {/* Thin top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
          background: '#0a0a0a', borderBottom: '1px solid rgba(255,255,255,.06)', flexShrink: 0 }}>
          <button onClick={goBack || (() => navigate('home'))}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 6, display: 'flex' }}>
            <I.Back />
          </button>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: 2, flex: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            WELL<span style={{ color: '#e50914' }}>STREAMER</span>
            {title ? ` — ${title}` : ''}
          </span>
          {curGroup?.streams?.length > 1 && (
            <select value={selSrv} onChange={e => setSelSrv(Number(e.target.value))}
              style={{ background: '#222', color: '#fff', border: '1px solid rgba(255,255,255,.2)',
                borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
              {curGroup.streams.map((s, i) => (
                <option key={i} value={i}>{s.server || `Server ${i + 1}`}</option>
              ))}
            </select>
          )}
        </div>

        {/* Full iframe */}
        <div style={{ flex: 1, position: 'relative', background: '#000' }}>
          <iframe
            key={curStream.link}
            src={curStream.link}
            allowFullScreen
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
          />
        </div>

        {/* Open in browser link */}
        <div style={{ padding: '10px 16px', background: '#0a0a0a', borderTop: '1px solid rgba(255,255,255,.06)',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', flex: 1 }}>
            Tip: if ads block playback, tap Open in Browser
          </span>
          <a href={curStream.link} target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: '#e50914', textDecoration: 'none', fontWeight: 700,
              padding: '6px 14px', border: '1px solid #e50914', borderRadius: 20, whiteSpace: 'nowrap' }}>
            ↗ Open
          </a>
        </div>
      </div>
    )
  }

  return (
    <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, letterSpacing:2, pointerEvents:'none' }}>
      WELL<span style={{ color:'#e50914' }}>STREAMER</span>
    </span>
  )
}

// ── Shared button style ───────────────────────────────────────────────────
const btn = { background:'none', border:'none', cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, padding:8, WebkitTapHighlightColor:'transparent', transition:'background 0.15s' }

// ── Main player ───────────────────────────────────────────────────────────
export default function PlayerPage({ params, navigate, user, goBack }) {
  const {
    kind = 'movie',
    title = '',
    episodeTitle = '',
    episodeIdx = 0,
    link,
    directLinks,
    allEpisodes = [],
    providerValue,
    seasonTitle = '',
  } = params

  // Refs
  const videoRef     = useRef(null)
  const hlsRef       = useRef(null)
  const containerRef = useRef(null)
  const progressRef  = useRef(null)
  const hideTimer    = useRef(null)
  const nextTimer    = useRef(null)
  const volumeRef    = useRef(1)

  // Streams
  const [groups,   setGroups]   = useState([])
  const [selQ,     setSelQ]     = useState(null)
  const [selSrv,   setSelSrv]   = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [fetchErr, setFetchErr] = useState(null)
  const [videoErr, setVideoErr] = useState(null)

  // Playback
  const [playing,   setPlaying]   = useState(false)
  const [progress,  setProgress]  = useState(0)
  const [buffered,  setBuffered]  = useState(0)
  const [currentT,  setCurrentT]  = useState(0)
  const [duration,  setDuration]  = useState(0)
  const [muted,     setMuted]     = useState(false)
  const [volume,    setVolume]    = useState(1)
  const [fullscreen,setFullscreen]= useState(false)

  // iOS-specific
  const [iosPoster, setIosPoster] = useState(null)
  const [iosReady,  setIosReady]  = useState(false)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  // UI
  const [brightness,  setBrightness]  = useState(100)
  const [screenMode,  setScreenMode]  = useState('contain')
  const [showUI,      setShowUI]      = useState(true)
  const [panel,       setPanel]       = useState(null)   // 'settings' | 'episodes' | null
  const [showSkip,    setShowSkip]    = useState(false)
  const [autoplay,    setAutoplay]    = useState(true)
  const [countdown,   setCountdown]   = useState(null)
  const [audioLangs,  setAudioLangs]  = useState([])
  const [selLang,     setSelLang]     = useState(null)
  const [curEpIdx,    setCurEpIdx]    = useState(episodeIdx)
  const [showInstall, setShowInstall] = useState(false)

  // ── PWA install prompt ────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setShowInstall(true)
    window.addEventListener('pwa-installable', handler)
    return () => window.removeEventListener('pwa-installable', handler)
  }, [])

  // ── Fetch streams ─────────────────────────────────────────────────────
  const fetchStreams = useCallback(async (streamLink) => {
    if (!streamLink) { setFetchErr('No stream link provided.'); setLoading(false); return }
    setLoading(true); setFetchErr(null); setVideoErr(null)
    try {
      const data = await getStream({
        providerValue, link: streamLink, type: kind,
        signal: new AbortController().signal,
      })
      const valid = (data || []).filter(s => s?.link)
      const g = groupStreamsByQuality(valid)
      setGroups(g)
      const langs = extractAudioLangs(valid)
      setAudioLangs(langs)
      if (langs.length) setSelLang(langs[0])
      if (g.length) { setSelQ(g[0].quality); setSelSrv(0) }
      else setFetchErr('No streams found. Try a different quality or provider.')
    } catch(e) {
      setFetchErr(e.message || 'Stream fetch failed.')
    } finally {
      setLoading(false)
    }
  }, [providerValue, kind])

  useEffect(() => {
    const sl = kind === 'movie' ? (directLinks?.[0]?.link || link) : link
    fetchStreams(sl)
    if (user?.username) {
      historyStorage.add(user.username, {
        title, link: link || '', image: params.image || '', provider: providerValue,
      })
    }
  }, [link, kind])

  // ── Mount stream (HLS + iOS fallback) ────────────────────────────────
  const curGroup  = groups.find(g => g.quality === selQ)
  const curStream = curGroup?.streams[selSrv] || null

  useEffect(() => {
    if (!curStream || !videoRef.current) return
    // Skip video mounting for embed-type streams — handled by iframe overlay
    const isEmbed = curStream.type === 'embed' ||
      curStream.link?.includes('vidsrc') ||
      curStream.link?.includes('autoembed') ||
      curStream.link?.includes('multiembed') ||
      curStream.link?.includes('pixeldrain.com/u/')
    if (isEmbed) return

    const v = videoRef.current
    setVideoErr(null); setProgress(0); setCurrentT(0); setDuration(0); setPlaying(false)
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    const url = curStream.link
    const isHLS = curStream.type === 'hls' || url.includes('.m3u8')

    const onFatal = () => {
      if (curGroup && selSrv < curGroup.streams.length - 1) {
        setVideoErr(`Server ${selSrv + 1} failed — switching…`)
        setTimeout(() => setSelSrv(i => i + 1), 1000)
      } else {
        setVideoErr('All servers failed. Try another quality.')
      }
    }

    if (isHLS) {
      if (Hls.isSupported()) {
        // ── Standard HLS.js (Android, desktop) ──
        const hls = new Hls({
          maxBufferLength: 120,
          maxMaxBufferLength: 300,
          enableWorker: true,
          lowLatencyMode: false,
          startLevel: -1,
          capLevelToPlayerSize: true,
          // iOS-friendly fragmentation
          fragLoadingMaxRetry: 4,
          manifestLoadingMaxRetry: 3,
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
        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          setIosReady(true)
          // Pick best starting quality
          if (data.levels?.length > 0) {
            const mid = Math.floor(data.levels.length / 2)
            hls.startLevel = mid
          }
          v.play().catch(() => {})
        })
        hls.on(Hls.Events.ERROR, (_, d) => {
          if (d.fatal) onFatal()
        })
        hlsRef.current = hls
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        // ── iOS Safari native HLS ──
        // Critical: set attributes before src for iOS
        v.setAttribute('playsinline', 'true')
        v.setAttribute('webkit-playsinline', 'true')
        v.setAttribute('x-webkit-airplay', 'allow')
        v.crossOrigin = 'anonymous'

        // iOS needs a poster to show something before play
        if (params.image) {
          v.poster = params.image
          setIosPoster(params.image)
        }

        v.src = url
        v.load() // Critical for iOS — explicit load call

        const onLoadedMeta = () => {
          setIosReady(true)
          setDuration(v.duration || 0)
          v.play().catch(() => {
            // iOS autoplay blocked — show play button
            setPlaying(false)
          })
        }
        const onLoadErr = () => {
          // iOS fallback: try without crossOrigin
          v.crossOrigin = ''
          v.src = url
          v.load()
        }
        v.addEventListener('loadedmetadata', onLoadedMeta, { once: true })
        v.addEventListener('error', onLoadErr, { once: true })
        return () => {
          v.removeEventListener('loadedmetadata', onLoadedMeta)
          v.removeEventListener('error', onLoadErr)
        }
      } else {
        onFatal()
      }
    } else {
      // ── Direct MP4 ──
      v.setAttribute('playsinline', 'true')
      v.setAttribute('webkit-playsinline', 'true')
      v.src = url
      v.load()
      v.play().catch(() => {})
    }

    v.onerror = () => {
      const err = v.error
      if (err) setVideoErr(`Video error: ${err.message || 'unknown'}`)
      onFatal()
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [curStream])

  // ── Video events ──────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current; if (!v) return
    const onPlay  = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onTime  = () => {
      const ct = v.currentTime, dur = v.duration || 0
      setCurrentT(ct); setDuration(dur)
      setProgress(dur > 0 ? ct / dur : 0)
      if (v.buffered.length > 0) {
        setBuffered(v.buffered.end(v.buffered.length - 1) / (dur || 1))
      }
      // Skip intro window: 15s–90s
      setShowSkip(kind === 'series' && ct > 15 && ct < 90)
      // Autoplay countdown: last 10s
      if (autoplay && kind === 'series' && dur > 0 && ct >= dur - 10 && curEpIdx < allEpisodes.length - 1) {
        setCountdown(Math.max(1, Math.ceil(dur - ct)))
      } else {
        setCountdown(null)
      }
    }
    const onEnded = () => {
      setPlaying(false)
      if (autoplay && kind === 'series' && curEpIdx < allEpisodes.length - 1) {
        clearTimeout(nextTimer.current)
        nextTimer.current = setTimeout(playNext, 2000)
      }
    }
    const onDur = () => setDuration(v.duration || 0)
    const onFS  = () => setFullscreen(!!document.fullscreenElement)

    v.addEventListener('play',           onPlay)
    v.addEventListener('pause',          onPause)
    v.addEventListener('timeupdate',     onTime)
    v.addEventListener('ended',          onEnded)
    v.addEventListener('durationchange', onDur)
    document.addEventListener('fullscreenchange', onFS)
    // iOS: also listen for webkitfullscreenchange
    document.addEventListener('webkitfullscreenchange', onFS)

    return () => {
      v.removeEventListener('play',           onPlay)
      v.removeEventListener('pause',          onPause)
      v.removeEventListener('timeupdate',     onTime)
      v.removeEventListener('ended',          onEnded)
      v.removeEventListener('durationchange', onDur)
      document.removeEventListener('fullscreenchange', onFS)
      document.removeEventListener('webkitfullscreenchange', onFS)
    }
  }, [autoplay, curEpIdx, allEpisodes, kind])

  // ── Auto-hide controls ────────────────────────────────────────────────
  const showAndReset = useCallback(() => {
    setShowUI(true)
    clearTimeout(hideTimer.current)
    if (videoRef.current && !videoRef.current.paused) {
      hideTimer.current = setTimeout(() => setShowUI(false), 3500)
    }
  }, [])

  // ── Actions ───────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return
    if (v.paused) {
      v.play().catch(() => {})
    } else {
      v.pause()
    }
    showAndReset()
  }, [showAndReset])

  const seek = useCallback((e) => {
    const v = videoRef.current; if (!v?.duration) return
    const rect = progressRef.current?.getBoundingClientRect(); if (!rect) return
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    v.currentTime = pct * v.duration
    showAndReset()
  }, [showAndReset])

  const skip = useCallback((secs) => {
    const v = videoRef.current; if (!v) return
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + secs))
    showAndReset()
  }, [showAndReset])

  const toggleMute = () => {
    const v = videoRef.current; if (!v) return
    v.muted = !v.muted; setMuted(!muted)
  }

  const changeVol = (val) => {
    const v = videoRef.current; if (!v) return
    const n = parseFloat(val)
    v.volume = n; volumeRef.current = n; setVolume(n)
    if (n > 0) { v.muted = false; setMuted(false) }
  }

  const toggleFS = () => {
    const el = containerRef.current; if (!el) return
    if (!fullscreen) {
      if (el.requestFullscreen) el.requestFullscreen()
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
    } else {
      if (document.exitFullscreen) document.exitFullscreen()
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
    }
    showAndReset()
  }

  const skipIntro = () => {
    const v = videoRef.current; if (!v) return
    v.currentTime = 90; setShowSkip(false)
  }

  const playNext = useCallback(() => {
    clearTimeout(nextTimer.current); setCountdown(null)
    const ni = curEpIdx + 1
    if (ni >= allEpisodes.length) return
    const ep = allEpisodes[ni]
    navigate('player', {
      ...params,
      episodeTitle: ep.title || `Episode ${ni + 1}`,
      episodeIdx: ni,
      link: ep.link,
    })
  }, [curEpIdx, allEpisodes, navigate, params])

  const playEpisode = (ep, i) => {
    setPanel(null)
    navigate('player', {
      ...params,
      episodeTitle: ep.title || `Episode ${i + 1}`,
      episodeIdx: i,
      link: ep.link,
    })
  }

  // ── Render ────────────────────────────────────────────────────────────
  const accentColor = '#e50914'
  const displaySub  = episodeTitle || seasonTitle || ''

  return (
    <div style={{ background: '#000', minHeight: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans',sans-serif", color: '#fff' }}>

      {/* ════════════ VIDEO WRAP ════════════ */}
      <div
        ref={containerRef}
        style={{
          position: 'relative', background: '#000', width: '100%',
          aspectRatio: '16/9',
          // Mobile: fill width, cap height; fullscreen: 100vh
          maxHeight: fullscreen ? '100dvh' : undefined,
          overflow: 'hidden', flexShrink: 0,
        }}
        onMouseMove={showAndReset}
        onTouchStart={(e) => {
          // Close panel if tapping outside it
          if (panel && !(e.target).closest('[data-panel]')) {
            setPanel(null); return
          }
          showAndReset()
        }}
        onClick={(e) => {
          if (panel && !(e.target).closest('[data-panel]')) { setPanel(null); return }
          if (!panel) togglePlay()
        }}
      >
        {/* Video element */}
        <video
          ref={videoRef}
          playsInline
          webkit-playsinline="true"
          x-webkit-airplay="allow"
          poster={iosPoster || undefined}
          style={{
            width: '100%', height: '100%', display: 'block', background: '#000',
            objectFit: screenMode,
            filter: `brightness(${brightness}%)`,
          }}
        />

        {/* Loading overlay */}
        {loading && (
          <div style={overlay}>
            <div style={{ textAlign: 'center' }}>
              <div style={spinnerStyle} />
              <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, marginTop: 14 }}>Finding streams…</p>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {fetchErr && !loading && (
          <div style={overlay}>
            <div style={{ textAlign: 'center', padding: '0 28px' }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>⚠️</div>
              <p style={{ color: '#f87171', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>{fetchErr}</p>
              <button onClick={() => goBack?.()} style={{ ...btn, background: accentColor, padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700 }}>
                ← Go Back
              </button>
            </div>
          </div>
        )}

        {/* Video error toast */}
        {videoErr && !fetchErr && (
          <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,.9)', color: '#fbbf24', fontSize: 12,
            padding: '7px 18px', borderRadius: 8, whiteSpace: 'nowrap', zIndex: 20, pointerEvents: 'none' }}>
            {videoErr}
          </div>
        )}

        {/* iOS tap-to-play prompt */}
        {isIOS && !loading && !fetchErr && !playing && !iosReady && (
          <div style={overlay} onClick={e => { e.stopPropagation(); videoRef.current?.play().catch(() => {}) }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', border: '2px solid rgba(255,255,255,.3)' }}>
                <I.Play />
              </div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>Tap to play</p>
            </div>
          </div>
        )}

        {/* Skip intro */}
        {showSkip && !loading && !fetchErr && (
          <button
            onClick={e => { e.stopPropagation(); skipIntro() }}
            style={{
              position: 'absolute', bottom: 72, right: 14, zIndex: 25,
              background: 'rgba(0,0,0,.85)', backdropFilter: 'blur(8px)',
              border: '1.5px solid rgba(255,255,255,.3)', color: '#fff',
              borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <I.Skip /> Skip Intro
          </button>
        )}

        {/* Autoplay countdown */}
        {countdown !== null && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 72, right: 14, zIndex: 25,
              background: 'rgba(0,0,0,.9)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,.15)', borderRadius: 12,
              padding: '12px 16px', textAlign: 'center', minWidth: 160,
            }}
          >
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginBottom: 10 }}>
              Next episode in {countdown}s
            </p>
            <button onClick={playNext} style={{ ...btn, background: accentColor, padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, width: '100%', justifyContent: 'center', gap: 6 }}>
              <I.Next /> Play Now
            </button>
          </div>
        )}

        {/* ════ CONTROLS OVERLAY ════ */}
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            background: showUI
              ? 'linear-gradient(to bottom, rgba(0,0,0,.75) 0%, transparent 28%, transparent 62%, rgba(0,0,0,.9) 100%)'
              : 'transparent',
            opacity: showUI ? 1 : 0,
            pointerEvents: showUI ? 'auto' : 'none',
            transition: 'opacity .3s ease, background .3s ease',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* TOP BAR */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px 0', gap: 8 }}>
            <button style={{ ...btn, flexShrink: 0 }} onClick={() => goBack?.()}>
              <I.Back />
            </button>
            {/* Logo centred */}
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <Logo />
            </div>
            {/* Settings */}
            <button
              style={{ ...btn, flexShrink: 0, background: panel === 'settings' ? 'rgba(255,255,255,.15)' : 'none' }}
              onClick={() => setPanel(p => p === 'settings' ? null : 'settings')}
            >
              <I.Gear />
            </button>
            {/* Episode list (series only) */}
            {kind === 'series' && allEpisodes.length > 0 && (
              <button
                style={{ ...btn, flexShrink: 0, background: panel === 'episodes' ? 'rgba(255,255,255,.15)' : 'none' }}
                onClick={() => setPanel(p => p === 'episodes' ? null : 'episodes')}
              >
                <I.List />
              </button>
            )}
          </div>

          {/* CENTRE: big play + skip zones */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', pointerEvents: 'none' }}>
            <button
              style={{ ...btn, width: 72, height: 72, borderRadius: '50%', background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(8px)', border: '2px solid rgba(255,255,255,.22)', pointerEvents: 'auto' }}
              onClick={togglePlay}
            >
              {playing ? <I.Pause /> : <I.Play />}
            </button>
            {/* Double-tap skip zones */}
            <div style={{ position: 'absolute', left: 0, top: 0, width: '35%', height: '100%', pointerEvents: 'auto' }} onDoubleClick={e => { e.stopPropagation(); skip(-10) }} />
            <div style={{ position: 'absolute', right: 0, top: 0, width: '35%', height: '100%', pointerEvents: 'auto' }} onDoubleClick={e => { e.stopPropagation(); skip(10) }} />
          </div>

          {/* BOTTOM CONTROLS */}
          <div style={{ padding: '0 12px 10px' }}>
            {/* Progress bar — touch-friendly */}
            <div
              ref={progressRef}
              style={{ height: 28, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none' }}
              onClick={seek}
              onTouchStart={seek}
              onTouchMove={seek}
              onMouseDown={e => { e.currentTarget.onmousemove = seek; e.currentTarget.onmouseup = () => { e.currentTarget.onmousemove = null } }}
            >
              <div style={{ position: 'relative', width: '100%', height: 4, background: 'rgba(255,255,255,.2)', borderRadius: 4 }}>
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${buffered * 100}%`, background: 'rgba(255,255,255,.3)', borderRadius: 4 }} />
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progress * 100}%`, background: accentColor, borderRadius: 4 }} />
                <div style={{ position: 'absolute', top: '50%', left: `${progress * 100}%`, width: 16, height: 16, borderRadius: '50%', background: '#fff', transform: 'translate(-50%,-50%)', boxShadow: '0 0 8px rgba(0,0,0,.6)' }} />
              </div>
            </div>
            {/* Controls row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <button style={btn} onClick={() => skip(-10)}><I.Rew /></button>
                <button style={{ ...btn, width: 44, height: 44 }} onClick={togglePlay}>{playing ? <I.Pause /> : <I.Play />}</button>
                <button style={btn} onClick={() => skip(10)}><I.Fwd /></button>
                {kind === 'series' && curEpIdx < allEpisodes.length - 1 && (
                  <button style={btn} onClick={playNext} title="Next episode"><I.Next /></button>
                )}
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,.75)', marginLeft: 6, whiteSpace: 'nowrap' }}>
                  {formatTime(currentT)} / {formatTime(duration)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button style={btn} onClick={toggleMute}>{muted || volume === 0 ? <I.Mute /> : <I.Vol />}</button>
                <input
                  type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
                  onChange={e => changeVol(e.target.value)}
                  style={{ width: 52, accentColor, cursor: 'pointer' }}
                />
                <button style={btn} onClick={toggleFS}>{fullscreen ? <I.ExFS /> : <I.FS />}</button>
              </div>
            </div>
          </div>
        </div>

        {/* ════ SETTINGS PANEL ════ */}
        {panel === 'settings' && (
          <div
            data-panel="settings"
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: 220,
              background: 'rgba(6,6,6,.97)', backdropFilter: 'blur(20px)',
              borderLeft: '1px solid rgba(255,255,255,.08)', zIndex: 30,
              display: 'flex', flexDirection: 'column', gap: 0,
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(255,255,255,.35)' }}>Settings</p>
            </div>

            {/* Quality */}
            <Section label="Quality">
              {groups.map(g => (
                <PanelOption
                  key={g.quality}
                  label={g.quality}
                  active={selQ === g.quality}
                  onClick={() => { setSelQ(g.quality); setSelSrv(0); setVideoErr(null) }}
                />
              ))}
            </Section>

            {/* Server */}
            {curGroup?.streams.length > 1 && (
              <Section label="Server">
                {curGroup.streams.map((_, i) => (
                  <PanelOption
                    key={i}
                    label={`Server ${i + 1}`}
                    active={selSrv === i}
                    onClick={() => { setSelSrv(i); setVideoErr(null) }}
                  />
                ))}
              </Section>
            )}

            {/* Audio / Dubbing */}
            {audioLangs.length > 0 && (
              <Section label="🎧 Audio">
                {audioLangs.map(lang => (
                  <PanelOption
                    key={lang}
                    label={lang}
                    active={selLang === lang}
                    onClick={() => setSelLang(lang)}
                  />
                ))}
              </Section>
            )}

            {/* Brightness */}
            <Section label="Brightness">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 12 }}>
                <I.Bright />
                <input
                  type="range" min={30} max={150} step={5} value={brightness}
                  onChange={e => setBrightness(Number(e.target.value))}
                  style={{ flex: 1, accentColor: accentColor, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', minWidth: 38 }}>{brightness}%</span>
              </div>
            </Section>

            {/* Screen Mode */}
            <Section label="Screen">
              {[['contain','Fit'],['cover','Crop'],['fill','Stretch']].map(([val, lbl]) => (
                <PanelOption key={val} label={lbl} active={screenMode === val} onClick={() => setScreenMode(val)} />
              ))}
            </Section>

            {/* Autoplay (series only) */}
            {kind === 'series' && (
              <Section label="Auto-play Next">
                <PanelOption label="Enabled" active={autoplay} onClick={() => setAutoplay(p => !p)} />
              </Section>
            )}
          </div>
        )}

        {/* ════ EPISODE PANEL ════ */}
        {panel === 'episodes' && kind === 'series' && (
          <div
            data-panel="episodes"
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: 240,
              background: 'rgba(6,6,6,.97)', backdropFilter: 'blur(20px)',
              borderLeft: '1px solid rgba(255,255,255,.08)', zIndex: 30,
              display: 'flex', flexDirection: 'column',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,.06)', flexShrink: 0 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(255,255,255,.35)' }}>Episodes</p>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
              {allEpisodes.map((ep, i) => {
                const isCur = i === curEpIdx
                return (
                  <div
                    key={ep.link || i}
                    onClick={() => { setCurEpIdx(i); playEpisode(ep, i) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10, marginBottom: 6,
                      background: isCur ? `${accentColor}22` : 'rgba(255,255,255,.04)',
                      border: `1px solid ${isCur ? accentColor + '55' : 'transparent'}`,
                      cursor: 'pointer', transition: 'background .15s',
                    }}
                  >
                    <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: 18, color: isCur ? accentColor : 'rgba(255,255,255,.4)', minWidth: 28 }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, color: isCur ? '#fff' : 'rgba(255,255,255,.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isCur ? 600 : 400 }}>
                      {ep.title || `Episode ${i + 1}`}
                    </span>
                    {isCur && <span style={{ fontSize: 10, color: accentColor, fontWeight: 700 }}>▶ NOW</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ════ INFO BELOW VIDEO ════ */}
      {!loading && !fetchErr && (
        <div style={{ background: 'var(--surface, #0f0f0f)', flex: 1, padding: '14px 18px 24px', borderTop: '1px solid rgba(255,255,255,.05)' }}>
          <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 1, marginBottom: 3 }}>
            {title}
          </h2>
          {displaySub && (
            <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 13, marginBottom: 12 }}>{displaySub}</p>
          )}
          {videoErr && (
            <p style={{ color: '#fbbf24', fontSize: 12, marginBottom: 10 }}>{videoErr}</p>
          )}

          {/* Audio language badges */}
          {audioLangs.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {audioLangs.map(l => (
                <span
                  key={l}
                  onClick={() => setSelLang(l)}
                  style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: selLang === l ? `${accentColor}20` : 'rgba(255,255,255,.07)',
                    color: selLang === l ? accentColor : 'rgba(255,255,255,.5)',
                    border: `1px solid ${selLang === l ? accentColor + '55' : 'rgba(255,255,255,.1)'}`,
                    cursor: 'pointer', transition: 'all .2s',
                  }}
                >
                  🎧 {l}
                </span>
              ))}
            </div>
          )}

          {/* Next episode button */}
          {kind === 'series' && curEpIdx < allEpisodes.length - 1 && (
            <button
              onClick={playNext}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 10, marginBottom: 20,
                background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)',
                color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <I.Next /> Next Episode
            </button>
          )}

          {/* Inline episode list (series) */}
          {kind === 'series' && allEpisodes.length > 0 && (
            <div>
              <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: 1, color: 'rgba(255,255,255,.4)', marginBottom: 12 }}>
                EPISODES
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '50vh', overflowY: 'auto' }}>
                {allEpisodes.map((ep, i) => {
                  const isCur = i === curEpIdx
                  return (
                    <div
                      key={ep.link || i}
                      onClick={() => { setCurEpIdx(i); playEpisode(ep, i) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '12px 14px', borderRadius: 12,
                        background: isCur ? `${accentColor}18` : 'rgba(255,255,255,.04)',
                        border: `1px solid ${isCur ? accentColor + '44' : 'rgba(255,255,255,.07)'}`,
                        cursor: 'pointer', transition: 'all .18s',
                      }}
                    >
                      <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: 22, color: isCur ? accentColor : 'rgba(255,255,255,.3)', minWidth: 32 }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: isCur ? 600 : 400, color: isCur ? '#fff' : 'rgba(255,255,255,.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ep.title || `Episode ${i + 1}`}
                      </span>
                      {isCur
                        ? <span style={{ fontSize: 11, color: accentColor, fontWeight: 700 }}>▶ NOW</span>
                        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14} style={{ color: 'rgba(255,255,255,.3)' }}><polyline points="9 18 15 12 9 6"/></svg>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* PWA Install prompt */}
          {showInstall && (
            <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 12, background: 'rgba(229,9,20,.1)', border: '1px solid rgba(229,9,20,.3)' }}>
              <p style={{ fontSize: 13, marginBottom: 10, color: 'rgba(255,255,255,.8)' }}>
                📲 Add WellStreamer to your home screen for a native app experience!
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => import('../main.jsx').then(m => m.showInstallPrompt?.())}
                  style={{ flex: 1, padding: '9px', borderRadius: 8, background: accentColor, border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Install App
                </button>
                <button
                  onClick={() => setShowInstall(false)}
                  style={{ padding: '9px 14px', borderRadius: 8, background: 'rgba(255,255,255,.08)', border: 'none', color: 'rgba(255,255,255,.6)', fontSize: 13, cursor: 'pointer' }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes _wspin { to { transform: rotate(360deg); } }
        @media (max-width: 480px) {
          /* ensure video fills on small phones */
          video { min-height: 56vw; }
        }
      `}</style>
    </div>
  )
}

// ── Panel section helper ──────────────────────────────────────────────────
function Section({ label, children }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.3, textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', paddingLeft: 16, marginBottom: 6 }}>
        {label}
      </p>
      {children}
    </div>
  )
}

function PanelOption({ label, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 16px', cursor: 'pointer',
        background: active ? 'rgba(229,9,20,.12)' : 'transparent',
        transition: 'background .15s',
      }}
    >
      <span style={{ fontSize: 14, color: active ? '#fff' : 'rgba(255,255,255,.65)', fontWeight: active ? 600 : 400 }}>{label}</span>
      {active && (
        <svg viewBox="0 0 24 24" fill="none" stroke="#e50914" strokeWidth={3} width={14} height={14}>
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
    </div>
  )
}

// ── Style constants ───────────────────────────────────────────────────────
const overlay = {
  position: 'absolute', inset: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,.88)', zIndex: 20,
}

const spinnerStyle = {
  width: 44, height: 44, margin: '0 auto',
  border: '3px solid rgba(255,255,255,.1)',
  borderTopColor: '#e50914',
  borderRadius: '50%',
  animation: '_wspin .8s linear infinite',
}
