import { useState, useEffect, useRef } from 'react'
import Hls from 'hls.js'
import { getStream } from '../lib/providers.js'
import { Icons } from '../components/Icons.jsx'

export default function PlayerPage({ params, navigate }) {
  const { link, title, type, providerValue } = params

  const videoRef           = useRef(null)
  const hlsRef             = useRef(null)
  const [streams, setStreams]   = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  // Fetch all streams on mount
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
        else setError('No streams found for this title. Try a different server or provider.')
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load streams.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [link, providerValue])

  // Mount HLS / native whenever selected stream changes
  useEffect(() => {
    if (!selected || !videoRef.current) return
    const video = videoRef.current
    const url   = selected.link

    // Destroy previous HLS instance
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    const isHLS = selected.type === 'hls' || url.includes('.m3u8')

    if (isHLS && Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        enableWorker: true,
        xhrSetup(xhr) {
          if (selected.headers) {
            Object.entries(selected.headers).forEach(([k, v]) => {
              try { xhr.setRequestHeader(k, v) } catch {}
            })
          }
        },
      })
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setError(`Stream error: ${data.details}. Try another server.`)
        }
      })
      hlsRef.current = hls
    } else if (isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = url
      video.play().catch(() => {})
    } else {
      // Direct MP4 / other
      video.src = url
      video.play().catch(() => {})
    }

    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [selected])

  return (
    <div className="player-page">
      {/* Top bar */}
      <div className="player-topbar">
        <button className="btn btn-glass" style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => navigate('home')}>
          <Icons.Back />
        </button>
        <h2 className="player-title">{title}</h2>
      </div>

      {/* Video area */}
      <div className="player-stage">
        {loading && (
          <div className="player-loading">
            <div className="spinner" />
            <p>Finding best stream…</p>
          </div>
        )}
        {error && !loading && (
          <div className="player-loading">
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <p style={{ color: '#f87171', marginBottom: 16, textAlign: 'center', maxWidth: 360 }}>{error}</p>
            <button className="btn btn-primary" onClick={() => navigate('home')}>
              <Icons.Back /> Go Back
            </button>
          </div>
        )}
        <video
          ref={videoRef}
          controls
          playsInline
          style={{ width: '100%', height: '100%', display: loading || error ? 'none' : 'block', background: '#000' }}
        />
      </div>

      {/* Server selector */}
      {streams.length > 0 && (
        <div className="server-panel glass">
          <p className="server-panel-label">Select Server</p>
          <div className="server-chips">
            {streams.map((s, i) => (
              <button
                key={i}
                className={`server-chip ${selected === s ? 'active' : ''}`}
                onClick={() => { setError(null); setSelected(s) }}
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
