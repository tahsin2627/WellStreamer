import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { getStream } from '../lib/providers.js'
import { Icons } from '../components/Icons.jsx'

function groupStreamsByQuality(streams) {
  // Group streams by quality, hiding server names
  // Returns: [{ quality: '1080p', streams: [...] }, ...]
  const groups = {}
  streams.forEach((s, i) => {
    const q = s.quality ? `${s.quality}p` : extractQualityFromServer(s) || 'Auto'
    if (!groups[q]) groups[q] = []
    groups[q].push({ ...s, _idx: i })
  })
  // Sort by quality descending
  const order = ['2160p','1440p','1080p','720p','480p','360p','Auto']
  return Object.entries(groups)
    .map(([quality, streams]) => ({ quality, streams }))
    .sort((a, b) => {
      const ai = order.indexOf(a.quality)
      const bi = order.indexOf(b.quality)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
}

function extractQualityFromServer(s) {
  if (!s.server && !s.link) return null
  const text = `${s.server || ''} ${s.link || ''}`
  const m = text.match(/(\d{3,4}p|4K|2160|1080|720|480|360)/i)
  if (!m) return null
  const n = m[1].replace(/p$/i,'')
  return n + 'p'
}

export default function PlayerPage({ params, navigate }) {
  const { link, title, episodeTitle, type, providerValue } = params

  const videoRef   = useRef(null)
  const hlsRef     = useRef(null)
  const [streams, setStreams]       = useState([])
  const [groups, setGroups]         = useState([])
  const [selQuality, setSelQuality] = useState(null)
  const [selServerIdx, setSelServerIdx] = useState(0)
  const [loading, setLoading]       = useState(true)
  const [streamErr, setStreamErr]   = useState(null)
  const [videoErr, setVideoErr]     = useState(null)
  const [showControls, setShowControls] = useState(true)
  const controlsTimer = useRef(null)

  // Fetch streams
  useEffect(() => {
    let cancelled = false
    setLoading(true); setStreamErr(null); setVideoErr(null)
    ;(async () => {
      try {
        const data = await getStream({ providerValue, link, type, signal: new AbortController().signal })
        if (cancelled) return
        const valid = (data || []).filter(s => s?.link)
        setStreams(valid)
        const g = groupStreamsByQuality(valid)
        setGroups(g)
        if (g.length) {
          setSelQuality(g[0].quality)
          setSelServerIdx(0)
        } else {
          setStreamErr('No streams found. Try a different provider or episode.')
        }
      } catch (e) {
        if (!cancelled) setStreamErr(e.message || 'Failed to load streams.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [link, providerValue])

  // Get current stream from selection
  const currentGroup = groups.find(g => g.quality === selQuality)
  const currentStream = currentGroup?.streams[selServerIdx] || null

  // Mount stream on video element
  const mountStream = useCallback((stream) => {
    if (!stream || !videoRef.current) return
    const video = videoRef.current
    setVideoErr(null)
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    const url   = stream.link
    const isHLS = stream.type === 'hls' || url.includes('.m3u8')

    const onErr = () => {
      // auto try next server in same quality group
      if (currentGroup && selServerIdx < currentGroup.streams.length - 1) {
        setVideoErr(`Server ${selServerIdx + 1} failed — trying next…`)
        setSelServerIdx(i => i + 1)
      } else {
        setVideoErr('All servers failed for this quality. Try another quality.')
      }
    }

    video.onerror = onErr

    if (isHLS && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 60, enableWorker: true,
        xhrSetup(xhr) {
          if (stream.headers) Object.entries(stream.headers).forEach(([k,v]) => { try { xhr.setRequestHeader(k,v) } catch {} })
        }
      })
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) onErr() })
      hlsRef.current = hls
    } else if (isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url; video.play().catch(() => {})
    } else {
      video.src = url; video.play().catch(() => {})
    }
  }, [currentGroup, selServerIdx])

  useEffect(() => {
    if (currentStream) mountStream(currentStream)
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [currentStream])

  // Auto-hide controls
  const resetControlsTimer = () => {
    setShowControls(true)
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    controlsTimer.current = setTimeout(() => setShowControls(false), 3500)
  }

  const displayTitle = episodeTitle
    ? `${title} — ${episodeTitle}`
    : title

  return (
    <div className="player-page" onMouseMove={resetControlsTimer} onTouchStart={resetControlsTimer}>

      {/* VIDEO */}
      <div className="player-video-wrap">
        {loading && (
          <div className="player-overlay-center">
            <div className="player-spinner" />
            <p className="player-loading-text">Loading streams…</p>
          </div>
        )}
        {streamErr && !loading && (
          <div className="player-overlay-center">
            <div className="player-err-icon">⚠️</div>
            <p className="player-err-text">{streamErr}</p>
            <button className="player-back-btn-big" onClick={() => navigate('home')}>
              <Icons.Back /> Go Back
            </button>
          </div>
        )}
        {videoErr && !streamErr && (
          <div className="player-video-notice">{videoErr}</div>
        )}
        <video
          ref={videoRef}
          controls
          playsInline
          className="player-video"
          style={{ display: loading || streamErr ? 'none' : 'block' }}
        />

        {/* Floating top bar — fades with controls */}
        <div className={`player-top-bar ${showControls ? 'visible' : ''}`}>
          <button className="player-back-icon" onClick={() => navigate('home')}>
            <Icons.Back />
          </button>
          <div className="player-top-titles">
            <span className="player-top-title">{title}</span>
            {episodeTitle && <span className="player-top-sub">{episodeTitle}</span>}
          </div>
        </div>
      </div>

      {/* QUALITY + SERVER PANEL */}
      {!loading && !streamErr && groups.length > 0 && (
        <div className="player-panel">

          {/* Quality selector */}
          <div className="player-panel-section">
            <p className="player-panel-label">Quality</p>
            <div className="player-quality-row">
              {groups.map(g => (
                <button
                  key={g.quality}
                  className={`player-quality-chip ${selQuality === g.quality ? 'active' : ''}`}
                  onClick={() => { setSelQuality(g.quality); setSelServerIdx(0); setVideoErr(null) }}
                >
                  {g.quality}
                </button>
              ))}
            </div>
          </div>

          {/* Server selector — anonymous names */}
          {currentGroup && currentGroup.streams.length > 1 && (
            <div className="player-panel-section">
              <p className="player-panel-label">
                Server
                {/* Show actual server name only while playing, small and subtle */}
                {currentStream && (
                  <span className="player-server-hint"> · {currentStream.server || `Server ${selServerIdx + 1}`}</span>
                )}
              </p>
              <div className="player-server-row">
                {currentGroup.streams.map((s, i) => (
                  <button
                    key={i}
                    className={`player-server-chip ${selServerIdx === i ? 'active' : ''}`}
                    onClick={() => { setSelServerIdx(i); setVideoErr(null) }}
                  >
                    Server {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
