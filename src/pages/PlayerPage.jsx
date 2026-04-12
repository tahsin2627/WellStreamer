import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { getStream } from '../lib/providers.js'
import { Icons } from '../components/Icons.jsx'

function fmt(s) {
  if (!isFinite(s) || !s) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// Detect if a URL/type is HLS
function isHLSStream(stream) {
  const url = stream?.link || ''
  const type = (stream?.type || '').toLowerCase()
  return type === 'hls' || type === 'm3u8' || url.includes('.m3u8')
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
  const [showControls, setShowControls]   = useState(true)
  const [showSettings, setShowSettings]   = useState(false)
  const [settingsTab, setSettingsTab]     = useState('quality')
  const [qualities, setQualities]         = useState([])
  const [audioTracks, setAudioTracks]     = useState([])
  const [currentQuality, setCurrentQuality] = useState(-1)
  const [currentAudio, setCurrentAudio]     = useState(0)
  const [showServerPanel, setShowServerPanel] = useState(false)
  const [buffering, setBuffering]       = useState(false)

  // ── Fetch streams ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setStreams([]); setSelected(null)
    ;(async () => {
      try {
        const ctrl = new AbortController()
        const data = await getStream({ providerValue, link, type, signal: ctrl.signal })
        if (cancelled) return
        const valid = (data || []).filter(s => s?.link)
        console.log('Streams found:', valid.length, valid)
        if (valid.length) {
          setStreams(valid)
          setSelected(valid[0])
        } else {
          setError('No streams found. Try another provider.')
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load streams.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [link, providerValue])

  // ── Load selected stream into player ──────────────────────────────────
  useEffect(() => {
    if (!selected || !videoRef.current) return
    const video = videoRef.current
    const url   = selected.link

    // Destroy old HLS instance
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    setQualities([]); setAudioTracks([])

    console.log('Loading stream:', url, 'type:', selected.type)

    if (isHLSStream(selected)) {
      // HLS stream
      if (Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 30,
          enableWorker: true,
          xhrSetup: (xhr) => {
            if (selected.headers) {
              Object.entries(selected.headers).forEach(([k, v]) => {
                try { xhr.setRequestHeader(k, v) } catch {}
              })
            }
          }
        })
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {})
          // Quality levels
          if (hls.levels?.length > 0) {
            const levels = hls.levels.map((l, i) => ({
              id: i,
              label: l.height ? `${l.height}p` : `Level ${i + 1}`
            }))
            setQualities([{ id: -1, label: 'Auto' }, ...levels])
            setCurrentQuality(-1)
          }
          // Audio tracks
          if (hls.audioTracks?.length > 0) {
            setAudioTracks(hls.audioTracks.map((t, i) => ({
              id: i,
              label: t.name || t.lang || `Track ${i + 1}`
            })))
            setCurrentAudio(hls.audioTrack)
          }
        })
        hls.on(Hls.Events.ERROR, (_, d) => {
          if (d.fatal) {
            console.error('HLS fatal error:', d.type, d.details)
            setError('Stream error. Try another server.')
          }
        })
        hlsRef.current = hls
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        video.src = url
        video.play().catch(() => {})
      } else {
        setError('HLS not supported in this browser.')
      }
    } else {
      // Direct MP4 / MKV etc
      video.src = url
      video.play().catch(() => {})
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [selected])

  // ── Video event listeners ─────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const on = (ev, fn) => video.addEventListener(ev, fn)
    const off = (ev, fn) => video.removeEventListener(ev, fn)
    const onPlay    = () => setPlaying(true)
    const onPause   = () => setPlaying(false)
    const onTime    = () => setCurrentTime(video.currentTime)
    const onDur     = () => setDuration(video.duration)
    const onWait    = () => setBuffering(true)
    const onCan     = () => setBuffering(false)
    const onFS      = () => setFullscreen(!!document.fullscreenElement)
    on('play', onPlay); on('pause', onPause)
    on('timeupdate', onTime); on('durationchange', onDur)
    on('waiting', onWait); on('playing', onCan); on('canplay', onCan)
    document.addEventListener('fullscreenchange', onFS)
    return () => {
      off('play', onPlay); off('pause', onPause)
      off('timeupdate', onTime); off('durationchange', onDur)
      off('waiting', onWait); off('playing', onCan); off('canplay', onCan)
      document.removeEventListener('fullscreenchange', onFS)
    }
  }, [])

  // ── Auto-hide controls ────────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowControls(false), 3500)
  }, [])

  useEffect(() => { if (!playing) setShowControls(true) }, [playing])

  // ── Controls ──────────────────────────────────────────────────────────
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
    if (videoRef.current) { videoRef.current.volume = val; videoRef.current.muted = val === 0 }
  }

  const toggleMute = () => {
    const v = videoRef.current; if (!v) return
    const next = !muted; v.muted = next; setMuted(next)
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

  const skip = (secs) => {
    if (videoRef.current) videoRef.current.currentTime += secs
  }

  const selectServer = (s) => {
    setSelected(s); setShowServerPanel(false); setError(null)
    setPlaying(false); setCurrentTime(0); setDuration(0)
  }

  const progress = duration ? (currentTime / duration) * 100 : 0

  return (
    <div
      ref={containerRef}
      className="player-page"
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
      style={{ filter: `brightness(${brightness})` }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        className="player-video"
        playsInline
        onClick={togglePlay}
      />

      {/* Buffering */}
      {buffering && !loading && !error && (
        <div className="player-center-overlay">
          <div className="player-spinner" />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="player-center-overlay">
          <div className="player-spinner" />
          <p style={{ color: '#aaa', marginTop: 16, fontSize: 14 }}>Finding streams…</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="player-center-overlay">
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <p style={{ color: '#f87171', maxWidth: 340, textAlign: 'center', marginBottom: 20, fontSize: 15 }}>{error}</p>
          <div style={{ display: 'flex', gap: 12 }}>
            {streams.length > 1 && (
              <button className="btn btn-glass" onClick={() => {
                const next = streams.find(s => s !== selected)
                if (next) selectServer(next)
              }}>Try Next Server</button>
            )}
            <button className="btn btn-primary" onClick={() => navigate('home')}>
              <Icons.Back /> Go Back
            </button>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div className={`player-controls-overlay ${showControls ? 'visible' : ''}`}>

        {/* Top bar */}
        <div className="player-top-bar">
          <button className="player-icon-btn" onClick={() => navigate('home')}><Icons.Back /></button>
          <div className="player-top-title">{title}</div>
          {streams.length > 0 && (
            <button className="player-icon-btn" style={showServerPanel ? { background: 'rgba(26,111,255,0.4)' } : {}}
              onClick={() => { setShowServerPanel(s => !s); setShowSettings(false) }}>
              <Icons.Globe />
              {streams.length > 1 && (
                <span style={{ position: 'absolute', top: 4, right: 4, background: 'var(--blue)', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {streams.length}
                </span>
              )}
            </button>
          )}
          <button className="player-icon-btn" style={showSettings ? { background: 'rgba(26,111,255,0.4)' } : {}}
            onClick={() => { setShowSettings(s => !s); setShowServerPanel(false) }}>
            <Icons.Settings />
          </button>
        </div>

        {/* Center play/skip */}
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
          {/* Progress */}
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
              <input
                type="range" min="0" max="1" step="0.05"
                value={muted ? 0 : volume}
                onChange={changeVolume}
                className="player-volume-slider"
              />
              <span className="player-time">{fmt(currentTime)} / {fmt(duration)}</span>
            </div>
            <div className="player-ctrl-group">
              <div className="player-brightness-wrap">
                <Icons.Sun />
                <input
                  type="range" min="0.2" max="1.5" step="0.05"
                  value={brightness}
                  onChange={e => setBrightness(parseFloat(e.target.value))}
                  className="player-volume-slider"
                />
              </div>
              <button className="player-icon-btn" onClick={toggleFullscreen}>
                {fullscreen ? <Icons.Shrink /> : <Icons.Expand />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Server panel */}
      {showServerPanel && (
        <div className="player-panel">
          <div className="player-panel-title">
            <Icons.Globe /> Servers ({streams.length})
            <button className="player-panel-close" onClick={() => setShowServerPanel(false)}><Icons.X /></button>
          </div>
          <div className="player-panel-list">
            {streams.map((s, i) => (
              <button
                key={i}
                className={`player-panel-item ${selected === s ? 'active' : ''}`}
                onClick={() => selectServer(s)}
              >
                <Icons.Globe />
                <span>{s.server || `Server ${i + 1}`}</span>
                {s.quality && <span className="player-panel-badge">{s.quality}p</span>}
                {selected === s && <Icons.Check />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Settings panel (quality + audio) */}
      {showSettings && (
        <div className="player-panel">
          <div className="player-panel-title">
            <Icons.Settings /> Settings
            <button className="player-panel-close" onClick={() => setShowSettings(false)}><Icons.X /></button>
          </div>
          {(qualities.length > 0 || audioTracks.length > 0) ? (
            <>
              <div className="player-panel-tabs">
                {qualities.length > 0 && (
                  <button className={`player-panel-tab ${settingsTab === 'quality' ? 'active' : ''}`}
                    onClick={() => setSettingsTab('quality')}>Quality</button>
                )}
                {audioTracks.length > 0 && (
                  <button className={`player-panel-tab ${settingsTab === 'audio' ? 'active' : ''}`}
                    onClick={() => setSettingsTab('audio')}>Audio</button>
                )}
              </div>
              <div className="player-panel-list">
                {settingsTab === 'quality' && qualities.map(q => (
                  <button key={q.id}
                    className={`player-panel-item ${currentQuality === q.id ? 'active' : ''}`}
                    onClick={() => changeQuality(q.id)}>
                    {q.label}
                    {currentQuality === q.id && <Icons.Check />}
                  </button>
                ))}
                {settingsTab === 'audio' && audioTracks.map(t => (
                  <button key={t.id}
                    className={`player-panel-item ${currentAudio === t.id ? 'active' : ''}`}
                    onClick={() => changeAudio(t.id)}>
                    {t.label}
                    {currentAudio === t.id && <Icons.Check />}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: 20, color: '#666', fontSize: 13, textAlign: 'center' }}>
              Quality/Audio options available for HLS streams
            </div>
          )}
        </div>
      )}
    </div>
  )
}
