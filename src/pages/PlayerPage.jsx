import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { getStream } from '../lib/providers.js'
import { Icons } from '../components/Icons.jsx'

function fmt(s) {
  if (!isFinite(s) || !s) return '0:00'
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function isHLS(stream) {
  const url = stream?.link || ''
  const t   = (stream?.type || '').toLowerCase()
  return t === 'hls' || t === 'm3u8' || url.includes('.m3u8') || url.includes('/manifest')
}

export default function PlayerPage({ params, navigate }) {
  const { link, title, type, providerValue } = params

  const videoRef     = useRef(null)
  const hlsRef       = useRef(null)
  const containerRef = useRef(null)
  const hideTimer    = useRef(null)

  const [streams, setStreams]           = useState([])
  const [selected, setSelected]         = useState(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [playing, setPlaying]           = useState(false)
  const [currentTime, setCurrentTime]   = useState(0)
  const [duration, setDuration]         = useState(0)
  const [volume, setVolume]             = useState(1)
  const [muted, setMuted]               = useState(false)
  const [brightness, setBrightness]     = useState(1)
  const [fullscreen, setFullscreen]     = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [showServers, setShowServers]   = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab]   = useState('quality')
  const [qualities, setQualities]       = useState([])
  const [audioTracks, setAudioTracks]   = useState([])
  const [curQuality, setCurQuality]     = useState(-1)
  const [curAudio, setCurAudio]         = useState(0)
  const [buffering, setBuffering]       = useState(false)

  // Fetch streams
  useEffect(() => {
    let dead = false
    setLoading(true); setError(null); setStreams([]); setSelected(null)
    ;(async () => {
      try {
        const data = await getStream({ providerValue, link, type, signal: new AbortController().signal })
        if (dead) return
        const valid = (data || []).filter(s => s?.link)
        console.log('[Player] streams:', valid.length, valid.map(s => ({ server: s.server, type: s.type, url: s.link?.slice(0, 60) })))
        if (valid.length) { setStreams(valid); setSelected(valid[0]) }
        else setError('No streams found. Try another provider.')
      } catch (e) {
        if (!dead) setError(e.message || 'Failed to load.')
      } finally {
        if (!dead) setLoading(false)
      }
    })()
    return () => { dead = true }
  }, [link, providerValue])

  // Load stream
  useEffect(() => {
    if (!selected || !videoRef.current) return
    const video = videoRef.current
    const url   = selected.link
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    setQualities([]); setAudioTracks([])
    console.log('[Player] loading:', url, '| type:', selected.type, '| isHLS:', isHLS(selected))

    if (isHLS(selected)) {
      if (Hls.isSupported()) {
        const hls = new Hls({ maxBufferLength: 30, enableWorker: true })
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {})
          if (hls.levels?.length) {
            setQualities([{ id: -1, label: 'Auto' }, ...hls.levels.map((l, i) => ({ id: i, label: l.height ? `${l.height}p` : `Level ${i+1}` }))])
            setCurQuality(-1)
          }
          if (hls.audioTracks?.length > 1) {
            setAudioTracks(hls.audioTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Track ${i+1}` })))
            setCurAudio(hls.audioTrack)
          }
        })
        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) setError('Stream error. Try another server.') })
        hlsRef.current = hls
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url; video.play().catch(() => {})
      } else {
        setError('HLS not supported in this browser.')
      }
    } else {
      video.src = url; video.play().catch(() => {})
    }
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [selected])

  // Video events
  useEffect(() => {
    const v = videoRef.current; if (!v) return
    const onPlay  = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onTime  = () => setCurrentTime(v.currentTime)
    const onDur   = () => setDuration(v.duration)
    const onWait  = () => setBuffering(true)
    const onCan   = () => setBuffering(false)
    const onFS    = () => setFullscreen(!!document.fullscreenElement)
    v.addEventListener('play', onPlay); v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTime); v.addEventListener('durationchange', onDur)
    v.addEventListener('waiting', onWait); v.addEventListener('playing', onCan); v.addEventListener('canplay', onCan)
    document.addEventListener('fullscreenchange', onFS)
    return () => {
      v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause)
      v.removeEventListener('timeupdate', onTime); v.removeEventListener('durationchange', onDur)
      v.removeEventListener('waiting', onWait); v.removeEventListener('playing', onCan); v.removeEventListener('canplay', onCan)
      document.removeEventListener('fullscreenchange', onFS)
    }
  }, [])

  const resetHide = useCallback(() => {
    setShowControls(true); clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowControls(false), 3500)
  }, [])

  useEffect(() => { if (!playing) setShowControls(true) }, [playing])

  const togglePlay = () => { const v = videoRef.current; if (!v) return; playing ? v.pause() : v.play().catch(() => {}) }
  const seek = (e) => {
    const v = videoRef.current; if (!v || !duration) return
    const r = e.currentTarget.getBoundingClientRect()
    v.currentTime = ((e.clientX - r.left) / r.width) * duration
  }
  const changeVol = (e) => {
    const val = parseFloat(e.target.value); setVolume(val); setMuted(val === 0)
    if (videoRef.current) { videoRef.current.volume = val; videoRef.current.muted = val === 0 }
  }
  const toggleMute = () => { const v = videoRef.current; if (!v) return; v.muted = !muted; setMuted(!muted) }
  const toggleFS = () => {
    const el = containerRef.current; if (!el) return
    if (!document.fullscreenElement) el.requestFullscreen().catch(() => {})
    else document.exitFullscreen()
  }
  const changeQuality = (id) => { if (hlsRef.current) hlsRef.current.currentLevel = id; setCurQuality(id); setShowSettings(false) }
  const changeAudio   = (id) => { if (hlsRef.current) hlsRef.current.audioTrack = id; setCurAudio(id); setShowSettings(false) }
  const skip = (s) => { if (videoRef.current) videoRef.current.currentTime += s }
  const selectServer = (s) => { setSelected(s); setShowServers(false); setError(null); setPlaying(false); setCurrentTime(0); setDuration(0) }

  const progress = duration ? (currentTime / duration) * 100 : 0

  return (
    <div ref={containerRef} className="player-page"
      onMouseMove={resetHide} onTouchStart={resetHide}
      style={{ filter: `brightness(${brightness})` }}>

      <video ref={videoRef} className="player-video" playsInline onClick={togglePlay} />

      {buffering && !loading && !error && (
        <div className="player-center-overlay"><div className="player-spinner" /></div>
      )}

      {loading && (
        <div className="player-center-overlay">
          <div className="player-spinner" />
          <p style={{ color: '#aaa', marginTop: 16, fontSize: 14 }}>Finding streams…</p>
        </div>
      )}

      {error && !loading && (
        <div className="player-center-overlay">
          <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
          <p style={{ color: '#f87171', maxWidth: 340, textAlign: 'center', marginBottom: 20 }}>{error}</p>
          <div style={{ display: 'flex', gap: 12 }}>
            {streams.length > 1 && (
              <button className="btn btn-glass" onClick={() => {
                const idx = streams.indexOf(selected)
                const next = streams[(idx + 1) % streams.length]
                selectServer(next)
              }}>Try Next Server</button>
            )}
            <button className="btn btn-primary" onClick={() => navigate('home')}><Icons.Back /> Go Back</button>
          </div>
        </div>
      )}

      <div className={`player-controls-overlay ${showControls ? 'visible' : ''}`}>
        {/* Top */}
        <div className="player-top-bar">
          <button className="player-icon-btn" onClick={() => navigate('home')}><Icons.Back /></button>
          <div className="player-top-title">{title}</div>
          <button className="player-icon-btn" style={showServers ? { background: 'rgba(26,111,255,0.5)' } : {}}
            onClick={() => { setShowServers(s => !s); setShowSettings(false) }}>
            <Icons.Globe />
          </button>
          <button className="player-icon-btn" style={showSettings ? { background: 'rgba(26,111,255,0.5)' } : {}}
            onClick={() => { setShowSettings(s => !s); setShowServers(false) }}>
            <Icons.Settings />
          </button>
        </div>

        {/* Center */}
        <div className="player-center-btns">
          <button className="player-skip-btn" onClick={() => skip(-10)}><Icons.SkipBack /><span>10</span></button>
          <button className="player-play-btn" onClick={togglePlay}>{playing ? <Icons.Pause /> : <Icons.Play />}</button>
          <button className="player-skip-btn" onClick={() => skip(10)}><Icons.SkipFwd /><span>10</span></button>
        </div>

        {/* Bottom */}
        <div className="player-bottom-bar">
          <div className="player-progress-wrap" onClick={seek}>
            <div className="player-progress-bg">
              <div className="player-progress-fill" style={{ width: `${progress}%` }} />
              <div className="player-progress-thumb" style={{ left: `${progress}%` }} />
            </div>
          </div>
          <div className="player-bottom-row">
            <div className="player-ctrl-group">
              <button className="player-icon-btn" onClick={togglePlay}>{playing ? <Icons.Pause /> : <Icons.Play />}</button>
              <button className="player-icon-btn" onClick={toggleMute}>{muted || volume === 0 ? <Icons.VolumeMute /> : <Icons.Volume />}</button>
              <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={changeVol} className="player-volume-slider" />
              <span className="player-time">{fmt(currentTime)} / {fmt(duration)}</span>
            </div>
            <div className="player-ctrl-group">
              <div className="player-brightness-wrap">
                <Icons.Sun />
                <input type="range" min="0.2" max="1.5" step="0.05" value={brightness} onChange={e => setBrightness(parseFloat(e.target.value))} className="player-volume-slider" />
              </div>
              <button className="player-icon-btn" onClick={toggleFS}>{fullscreen ? <Icons.Shrink /> : <Icons.Expand />}</button>
            </div>
          </div>
        </div>
      </div>

      {/* Server panel */}
      {showServers && streams.length > 0 && (
        <div className="player-panel">
          <div className="player-panel-title">
            <Icons.Globe /> Servers ({streams.length})
            <button className="player-panel-close" onClick={() => setShowServers(false)}><Icons.X /></button>
          </div>
          <div className="player-panel-list">
            {streams.map((s, i) => (
              <button key={i} className={`player-panel-item ${selected === s ? 'active' : ''}`} onClick={() => selectServer(s)}>
                <Icons.Globe />
                <span>{s.server || `Server ${i + 1}`}</span>
                {s.quality && <span className="player-panel-badge">{s.quality}p</span>}
                {selected === s && <Icons.Check />}
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
          {qualities.length > 0 || audioTracks.length > 0 ? (
            <>
              <div className="player-panel-tabs">
                {qualities.length > 0 && <button className={`player-panel-tab ${settingsTab === 'quality' ? 'active' : ''}`} onClick={() => setSettingsTab('quality')}>Quality</button>}
                {audioTracks.length > 0 && <button className={`player-panel-tab ${settingsTab === 'audio' ? 'active' : ''}`} onClick={() => setSettingsTab('audio')}>Audio</button>}
              </div>
              <div className="player-panel-list">
                {settingsTab === 'quality' && qualities.map(q => (
                  <button key={q.id} className={`player-panel-item ${curQuality === q.id ? 'active' : ''}`} onClick={() => changeQuality(q.id)}>
                    {q.label} {curQuality === q.id && <Icons.Check />}
                  </button>
                ))}
                {settingsTab === 'audio' && audioTracks.map(t => (
                  <button key={t.id} className={`player-panel-item ${curAudio === t.id ? 'active' : ''}`} onClick={() => changeAudio(t.id)}>
                    {t.label} {curAudio === t.id && <Icons.Check />}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: 24, color: '#555', fontSize: 13, textAlign: 'center' }}>Quality options load after stream starts</div>
          )}
        </div>
      )}
    </div>
  )
}
