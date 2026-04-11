import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { getStream } from '../lib/providers.js'
import { Icons } from '../components/Icons.jsx'

function fmt(s) {
  if (!isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function PlayerPage({ params, navigate }) {
  const { link, title, type, providerValue } = params

  const videoRef     = useRef(null)
  const hlsRef       = useRef(null)
  const containerRef = useRef(null)
  const hideTimer    = useRef(null)

  const [streams, setStreams]         = useState([])
  const [selected, setSelected]       = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [playing, setPlaying]         = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]       = useState(0)
  const [volume, setVolume]           = useState(1)
  const [muted, setMuted]             = useState(false)
  const [brightness, setBrightness]   = useState(1)
  const [fullscreen, setFullscreen]   = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab]   = useState('quality')
  const [qualities, setQualities]       = useState([])
  const [audioTracks, setAudioTracks]   = useState([])
  const [currentQuality, setCurrentQuality] = useState(-1)
  const [currentAudio, setCurrentAudio]     = useState(0)
  const [showServerPanel, setShowServerPanel] = useState(false)
  const [buffering, setBuffering]       = useState(false)

  // Fetch streams
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const ctrl = new AbortController()
        const data = await getStream({ providerValue, link, type, signal: ctrl.signal })
        if (cancelled) return
        const valid = (data || []).filter(s => s?.link)
        setStreams(valid)
        if (valid.length) setSelected(valid[0])
        else setError('No streams found. Try a different server or provider.')
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load streams.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [link, providerValue])

  // Load stream into player
  useEffect(() => {
    if (!selected || !videoRef.current) return
    const video = videoRef.current
    const url   = selected.link
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    setQualities([]); setAudioTracks([])
    const isHLS = selected.type === 'hls' || url.includes('.m3u8')
    if (isHLS && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30, enableWorker: true })
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
        const levels = hls.levels.map((l, i) => ({ id: i, label: l.height ? `${l.height}p` : `Level ${i}` }))
        setQualities([{ id: -1, label: 'Auto' }, ...levels])
        setCurrentQuality(-1)
        if (hls.audioTracks?.length > 0) {
          setAudioTracks(hls.audioTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Track ${i + 1}` })))
          setCurrentAudio(hls.audioTrack)
        }
      })
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) setError(`Stream error. Try another server.`) })
      hlsRef.current = hls
    } else {
      video.src = url
      video.play().catch(() => {})
    }
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [selected])

  // Video events
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onPlay    = () => setPlaying(true)
    const onPause   = () => setPlaying(false)
    const onTime    = () => setCurrentTime(video.currentTime)
    const onDur     = () => setDuration(video.duration)
    const onWait    = () => setBuffering(true)
    const onCan     = () => setBuffering(false)
    const onFS      = () => setFullscreen(!!document.fullscreenElement)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('durationchange', onDur)
    video.addEventListener('waiting', onWait)
    video.addEventListener('playing', onCan)
    document.addEventListener('fullscreenchange', onFS)
    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('durationchange', onDur)
      video.removeEventListener('waiting', onWait)
      video.removeEventListener('playing', onCan)
      document.removeEventListener('fullscreenchange', onFS)
    }
  }, [])

  // Auto-hide controls
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowControls(false), 3000)
  }, [])

  useEffect(() => { if (!playing) setShowControls(true) }, [playing])

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return
    playing ? v.pause() : v.play().catch(() => {})
  }
  const seek = (e) => {
    const v = videoRef.current; if (!v || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    v.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }
  const changeVolume = (e) => {
    const val = parseFloat(e.target.value)
    setVolume(val); setMuted(val === 0)
    if (videoRef.current) videoRef.current.volume = val
  }
  const toggleMute = () => {
    const v = videoRef.current; if (!v) return
    v.muted = !muted; setMuted(!muted)
  }
  const toggleFullscreen = () => {
    const el = containerRef.current; if (!el) return
    if (!document.fullscreenElement) el.requestFullscreen().catch(() => {})
    else document.exitFullscreen()
  }
  const changeQuality = (id) => {
    if (hlsRef.current) hlsRef.current.currentLevel = id
    setCurrentQuality(id); setShowSettings(false)
  }
  const changeAudio = (id) => {
    if (hlsRef.current) hlsRef.current.audioTrack = id
    setCurrentAudio(id); setShowSettings(false)
  }
  const skip = (secs) => { if (videoRef.current) videoRef.current.currentTime += secs }

  const progress = duration ? (currentTime / duration) * 100 : 0

  return (
    <div
      ref={containerRef}
      className="player-page"
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
      style={{ filter: `brightness(${brightness})` }}
    >
      <video ref={videoRef} className="player-video" playsInline onClick={togglePlay} />

      {buffering && !loading && (
        <div className="player-center-overlay">
          <div className="player-spinner" />
        </div>
      )}

      {loading && (
        <div className="player-center-overlay">
          <div className="player-spinner" />
          <p style={{ color: '#aaa', marginTop: 16, fontSize: 14 }}>Finding best stream…</p>
        </div>
      )}

      {error && !loading && (
        <div className="player-center-overlay">
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <p style={{ color: '#f87171', maxWidth: 340, textAlign: 'center', marginBottom: 20 }}>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('home')}><Icons.Back /> Go Back</button>
        </div>
      )}

      <div className={`player-controls-overlay ${showControls ? 'visible' : ''}`}>
        {/* Top bar */}
        <div className="player-top-bar">
          <button className="player-icon-btn" onClick={() => navigate('home')}><Icons.Back /></button>
          <div className="player-top-title">{title}</div>
          <button className="player-icon-btn" onClick={() => { setShowServerPanel(s => !s); setShowSettings(false) }}><Icons.Globe /></button>
          <button className="player-icon-btn" onClick={() => { setShowSettings(s => !s); setShowServerPanel(false) }}><Icons.Settings /></button>
        </div>

        {/* Center controls */}
        <div className="player-center-btns">
          <button className="player-skip-btn" onClick={() => skip(-10)}>
            <Icons.SkipBack /><span>10</span>
          </button>
          <button className="player-play-btn" onClick={togglePlay}>
            {playing ? <Icons.Pause /> : <Icons.Play />}
          </button>
          <button className="player-skip-btn" onClick={() => skip(10)}>
            <Icons.SkipFwd /><span>10</span>
          </button>
        </div>

        {/* Bottom bar */}
        <div className="player-bottom-bar">
          <div className="player-progress-wrap" onClick={seek}>
            <div className="player-progress-bg">
              <div className="player-progress-fill" style={{ width: `${progress}%` }} />
              <div className="player-progress-thumb" style={{ left: `${progress}%` }} />
            </div>
          </div>
          <div className="player-bottom-row">
            <div className="player-ctrl-group">
              <button className="player-icon-btn" onClick={togglePlay}>
                {playing ? <Icons.Pause /> : <Icons.Play />}
              </button>
              <button className="player-icon-btn" onClick={toggleMute}>
                {muted || volume === 0 ? <Icons.VolumeMute /> : <Icons.Volume />}
              </button>
              <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={changeVolume} className="player-volume-slider" />
              <span className="player-time">{fmt(currentTime)} / {fmt(duration)}</span>
            </div>
            <div className="player-ctrl-group">
              <div className="player-brightness-wrap">
                <Icons.Sun />
                <input type="range" min="0.2" max="1.5" step="0.05" value={brightness} onChange={e => setBrightness(parseFloat(e.target.value))} className="player-volume-slider" />
              </div>
              <button className="player-icon-btn" onClick={toggleFullscreen}>
                {fullscreen ? <Icons.Shrink /> : <Icons.Expand />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Server panel */}
      {showServerPanel && streams.length > 0 && (
        <div className="player-panel">
          <div className="player-panel-title">
            <Icons.Globe /> Select Server
            <button className="player-panel-close" onClick={() => setShowServerPanel(false)}><Icons.X /></button>
          </div>
          <div className="player-panel-list">
            {streams.map((s, i) => (
              <button key={i} className={`player-panel-item ${selected === s ? 'active' : ''}`}
                onClick={() => { setSelected(s); setShowServerPanel(false); setError(null) }}>
                <Icons.Globe />
                <span>{s.server || `Server ${i + 1}`}</span>
                {s.quality && <span className="player-panel-badge">{s.quality}p</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="player-panel">
          <div className="player-panel-title">
            <Icons.Settings /> Settings
            <button className="player-panel-close" onClick={() => setShowSettings(false)}><Icons.X /></button>
          </div>
          <div className="player-panel-tabs">
            {qualities.length > 0 && <button className={`player-panel-tab ${settingsTab === 'quality' ? 'active' : ''}`} onClick={() => setSettingsTab('quality')}>Quality</button>}
            {audioTracks.length > 0 && <button className={`player-panel-tab ${settingsTab === 'audio' ? 'active' : ''}`} onClick={() => setSettingsTab('audio')}>Audio</button>}
          </div>
          <div className="player-panel-list">
            {settingsTab === 'quality' && qualities.map(q => (
              <button key={q.id} className={`player-panel-item ${currentQuality === q.id ? 'active' : ''}`} onClick={() => changeQuality(q.id)}>
                {q.label}{currentQuality === q.id && <Icons.Check />}
              </button>
            ))}
            {settingsTab === 'audio' && audioTracks.map(t => (
              <button key={t.id} className={`player-panel-item ${currentAudio === t.id ? 'active' : ''}`} onClick={() => changeAudio(t.id)}>
                {t.label}{currentAudio === t.id && <Icons.Check />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
