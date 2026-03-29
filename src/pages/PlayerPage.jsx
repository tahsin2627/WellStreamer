import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { getStream } from '../lib/providers.js'
import { Icons } from '../components/Icons.jsx'

export default function PlayerPage({ params, navigate }) {
  const { link, title, type, providerValue } = params
  const videoRef = useRef(null)
  const hlsRef   = useRef(null)
  const [streams, setStreams]     = useState([])
  const [selIdx, setSelIdx]       = useState(0)
  const [loading, setLoading]     = useState(true)
  const [streamErr, setStreamErr] = useState(null)
  const [videoErr, setVideoErr]   = useState(null)
  const [tryCount, setTryCount]   = useState(0)

  // Fetch all available streams
  useEffect(() => {
    let cancelled = false
    setLoading(true); setStreamErr(null); setVideoErr(null)
    ;(async () => {
      try {
        const ctrl = new AbortController()
        const data = await getStream({ providerValue, link, type, signal: ctrl.signal })
        if (cancelled) return
        const valid = (data || []).filter(s => s?.link)
        setStreams(valid)
        setSelIdx(0)
        if (!valid.length) setStreamErr('No streams found. Try a different provider.')
      } catch (e) {
        if (!cancelled) setStreamErr(e.message || 'Failed to load streams.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [link, providerValue])

  // Mount stream on video element
  const mountStream = useCallback((stream) => {
    if (!stream || !videoRef.current) return
    const video = videoRef.current
    setVideoErr(null)

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    const url = stream.link
    const isHLS = stream.type === 'hls' || url.includes('.m3u8')

    const onVideoError = () => {
      // Auto-try next server
      setSelIdx(prev => {
        const next = prev + 1
        if (next < streams.length) {
          setVideoErr(`Server ${prev + 1} failed — trying next…`)
          return next
        }
        setVideoErr('All servers failed. Try a different provider.')
        return prev
      })
    }

    video.removeEventListener('error', onVideoError)
    video.addEventListener('error', onVideoError, { once: true })

    if (isHLS && Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 60,
        enableWorker: true,
        fragLoadingMaxRetry: 3,
        manifestLoadingMaxRetry: 3,
        xhrSetup(xhr) {
          if (stream.headers) {
            Object.entries(stream.headers).forEach(([k, v]) => {
              try { xhr.setRequestHeader(k, v) } catch {}
            })
          }
        },
      })
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}) })
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) onVideoError()
      })
      hlsRef.current = hls
    } else if (isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      video.play().catch(() => {})
    } else {
      video.src = url
      video.play().catch(() => {})
    }
  }, [streams])

  // Re-mount whenever selected index changes
  useEffect(() => {
    if (streams.length && streams[selIdx]) {
      mountStream(streams[selIdx])
    }
    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [selIdx, streams])

  const selected = streams[selIdx]

  return (
    <div className="player-page">
      <div className="player-topbar">
        <button className="btn btn-glass" style={{ padding: '7px 14px' }} onClick={() => navigate('home')}>
          <Icons.Back />
        </button>
        <h2 className="player-title">{title}</h2>
      </div>

      <div className="player-stage">
        {loading && (
          <div className="player-loading">
            <div className="spinner" />
            <p>Finding streams…</p>
          </div>
        )}
        {streamErr && !loading && (
          <div className="player-loading">
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <p style={{ color: '#f87171', textAlign: 'center', maxWidth: 360, marginBottom: 16 }}>{streamErr}</p>
            <button className="btn btn-primary" onClick={() => navigate('home')}><Icons.Back /> Go Back</button>
          </div>
        )}
        {videoErr && !streamErr && (
          <div className="player-video-err">
            {videoErr}
          </div>
        )}
        <video
          ref={videoRef}
          controls
          playsInline
          style={{
            width: '100%', height: '100%',
            display: loading || streamErr ? 'none' : 'block',
            background: '#000',
          }}
        />
      </div>

      {streams.length > 0 && !loading && !streamErr && (
        <div className="server-panel glass">
          <p className="server-panel-label">
            Servers ({streams.length} available)
          </p>
          <div className="server-chips">
            {streams.map((s, i) => (
              <button
                key={i}
                className={`server-chip ${selIdx === i ? 'active' : ''}`}
                onClick={() => { setVideoErr(null); setSelIdx(i) }}
              >
                {s.server || `Server ${i + 1}`}
                {s.quality ? ` · ${s.quality}p` : ''}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
