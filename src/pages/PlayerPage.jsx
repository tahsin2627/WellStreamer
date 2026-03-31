import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { getStream } from '../lib/providers.js'

// ── helpers ──────────────────────────────────────────────────────────────
const QP_ORDER = ['2160p','1440p','1080p','720p','480p','360p','Auto']

function extractQp(s) {
  const t = `${s.server||''} ${s.link||''} ${s.quality||''}`
  if (s.quality) return `${s.quality}p`
  const m = t.match(/\b(2160|1440|1080|720|480|360)\b/)
  return m ? `${m[1]}p` : 'Auto'
}

function groupByQuality(streams) {
  const map = {}
  streams.forEach((s,i) => {
    const q = extractQp(s)
    if (!map[q]) map[q] = []
    map[q].push({ ...s, _i: i })
  })
  return Object.entries(map)
    .map(([q, ss]) => ({ q, ss }))
    .sort((a,b) => {
      const ai = QP_ORDER.indexOf(a.q), bi = QP_ORDER.indexOf(b.q)
      return (ai<0?99:ai) - (bi<0?99:bi)
    })
}

function fmt(sec) {
  if (!sec || isNaN(sec)) return '0:00'
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = Math.floor(sec%60)
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
           : `${m}:${String(s).padStart(2,'0')}`
}

// ── component ─────────────────────────────────────────────────────────────
export default function PlayerPage({ params, navigate }) {
  const { link, title, episodeTitle, type, providerValue } = params

  const videoRef      = useRef(null)
  const hlsRef        = useRef(null)
  const containerRef  = useRef(null)
  const hideTimer     = useRef(null)
  const progressRef   = useRef(null)

  const [groups,    setGroups]    = useState([])
  const [selQ,      setSelQ]      = useState(null)
  const [selSrv,    setSelSrv]    = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [fetchErr,  setFetchErr]  = useState(null)
  const [videoErr,  setVideoErr]  = useState(null)
  const [showUI,    setShowUI]    = useState(true)
  const [playing,   setPlaying]   = useState(false)
  const [progress,  setProgress]  = useState(0)  // 0-1
  const [buffered,  setBuffered]  = useState(0)
  const [currentT,  setCurrentT]  = useState(0)
  const [duration,  setDuration]  = useState(0)
  const [muted,     setMuted]     = useState(false)
  const [volume,    setVolume]    = useState(1)
  const [fullscreen,setFullscreen]= useState(false)
  const [showQPanel,setShowQPanel]= useState(false)

  // ── fetch streams ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true); setFetchErr(null); setVideoErr(null)
    ;(async () => {
      try {
        const data = await getStream({ providerValue, link, type, signal: new AbortController().signal })
        if (cancelled) return
        const valid = (data||[]).filter(s=>s?.link)
        const g = groupByQuality(valid)
        setGroups(g)
        if (g.length) { setSelQ(g[0].q); setSelSrv(0) }
        else setFetchErr('No streams found. Try a different server or provider.')
      } catch(e) {
        if (!cancelled) setFetchErr(e.message || 'Failed to load streams.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [link, providerValue])

  // ── mount stream ─────────────────────────────────────────────────────────
  const curGroup  = groups.find(g => g.q === selQ)
  const curStream = curGroup?.ss[selSrv] || null

  useEffect(() => {
    if (!curStream || !videoRef.current) return
    const v = videoRef.current
    setVideoErr(null); setProgress(0); setBuffered(0); setCurrentT(0); setDuration(0); setPlaying(false)
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    const url   = curStream.link
    const isHLS = curStream.type === 'hls' || url.includes('.m3u8')
    const onErr = () => {
      if (curGroup && selSrv < curGroup.ss.length - 1) {
        setVideoErr(`Server ${selSrv+1} failed — trying next…`)
        setSelSrv(i => i+1)
      } else setVideoErr('All servers failed. Try another quality.')
    }
    if (isHLS && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength:60, enableWorker:true })
      hls.loadSource(url); hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(()=>{}))
      hls.on(Hls.Events.ERROR, (_,d) => { if(d.fatal) onErr() })
      hlsRef.current = hls
    } else if (isHLS && v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = url; v.play().catch(()=>{})
    } else {
      v.src = url; v.play().catch(()=>{})
    }
    v.onerror = onErr
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [curStream])

  // ── video event listeners ────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay     = () => setPlaying(true)
    const onPause    = () => setPlaying(false)
    const onTimeUp   = () => {
      setCurrentT(v.currentTime); setDuration(v.duration||0)
      setProgress(v.duration ? v.currentTime/v.duration : 0)
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length-1)/(v.duration||1))
    }
    const onFS       = () => setFullscreen(!!document.fullscreenElement)
    v.addEventListener('play',     onPlay)
    v.addEventListener('pause',    onPause)
    v.addEventListener('timeupdate',onTimeUp)
    document.addEventListener('fullscreenchange', onFS)
    return () => {
      v.removeEventListener('play',      onPlay)
      v.removeEventListener('pause',     onPause)
      v.removeEventListener('timeupdate',onTimeUp)
      document.removeEventListener('fullscreenchange', onFS)
    }
  }, [])

  // ── auto-hide UI ─────────────────────────────────────────────────────────
  const showAndReset = useCallback(() => {
    setShowUI(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { if (playing) setShowUI(false) }, 3500)
  }, [playing])

  // ── actions ───────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current; if (!v) return
    playing ? v.pause() : v.play().catch(()=>{})
    showAndReset()
  }
  const seek = (e) => {
    const v = videoRef.current; if (!v || !v.duration) return
    const rect = progressRef.current.getBoundingClientRect()
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    v.currentTime = pct * v.duration
    showAndReset()
  }
  const toggleMute  = () => { const v=videoRef.current; if(!v) return; v.muted=!v.muted; setMuted(!muted) }
  const changeVol   = (e) => { const v=videoRef.current; if(!v) return; v.volume=e.target.value; setVolume(e.target.value); v.muted=false; setMuted(false) }
  const skipSecs    = (s) => { const v=videoRef.current; if(!v) return; v.currentTime=Math.max(0,v.currentTime+s); showAndReset() }
  const toggleFS    = () => {
    const el = containerRef.current; if (!el) return
    fullscreen ? document.exitFullscreen() : el.requestFullscreen?.()
    showAndReset()
  }
  const pickQuality = (q) => { setSelQ(q); setSelSrv(0); setVideoErr(null); setShowQPanel(false) }
  const pickServer  = (i) => { setSelSrv(i); setVideoErr(null) }

  const displayTitle = title || ''
  const displaySub   = episodeTitle || ''

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background:'#000', minHeight:'100vh', display:'flex', flexDirection:'column', fontFamily:"'DM Sans',sans-serif" }}>

      {/* ── VIDEO CONTAINER ──────────────────────────────────────── */}
      <div
        ref={containerRef}
        style={{ position:'relative', background:'#000', flex:'0 0 auto', width:'100%', aspectRatio:'16/9', maxHeight:'56vw', cursor:'none' }}
        onMouseMove={showAndReset}
        onTouchStart={showAndReset}
        onClick={togglePlay}
      >
        {/* actual video */}
        <video
          ref={videoRef}
          playsInline
          style={{ width:'100%', height:'100%', display:'block', background:'#000' }}
        />

        {/* loading spinner */}
        {loading && (
          <div style={styles.overlay}>
            <div style={styles.spinWrap}>
              <div style={styles.spin} />
              <p style={{ color:'rgba(255,255,255,.55)', fontSize:13, marginTop:14 }}>Finding streams…</p>
            </div>
          </div>
        )}

        {/* fetch error */}
        {fetchErr && !loading && (
          <div style={styles.overlay}>
            <div style={{ textAlign:'center', padding:'0 24px' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>⚠️</div>
              <p style={{ color:'#f87171', fontSize:14, marginBottom:20, lineHeight:1.6 }}>{fetchErr}</p>
              <button
                onClick={(e)=>{e.stopPropagation();navigate('home')}}
                style={styles.errBtn}
              >← Go Back</button>
            </div>
          </div>
        )}

        {/* video retry notice */}
        {videoErr && !fetchErr && (
          <div style={styles.notice}>{videoErr}</div>
        )}

        {/* BIG centre play/pause — shows briefly on toggle */}
        {!loading && !fetchErr && (
          <div style={{ ...styles.centreBtn, opacity: showUI ? 1 : 0, transition:'opacity .3s' }}
            onClick={(e) => { e.stopPropagation(); togglePlay() }}>
            <div style={styles.centreBtnInner}>
              {playing
                ? <svg viewBox="0 0 24 24" fill="white" width={32} height={32}><rect x={6} y={4} width={4} height={16}/><rect x={14} y={4} width={4} height={16}/></svg>
                : <svg viewBox="0 0 24 24" fill="white" width={32} height={32}><path d="M8 5v14l11-7z"/></svg>}
            </div>
          </div>
        )}

        {/* skip zones (double-tap feel on mobile) */}
        <div style={{ position:'absolute', top:0, left:0, width:'35%', height:'100%' }}
          onDoubleClick={(e)=>{e.stopPropagation(); skipSecs(-10)}} />
        <div style={{ position:'absolute', top:0, right:0, width:'35%', height:'100%' }}
          onDoubleClick={(e)=>{e.stopPropagation(); skipSecs(10)}} />

        {/* ── CONTROLS OVERLAY ── */}
        <div style={{ ...styles.controls, opacity: showUI ? 1 : 0, pointerEvents: showUI ? 'auto':'none', transition:'opacity .3s' }}
          onClick={e => e.stopPropagation()}>

          {/* TOP BAR */}
          <div style={styles.topBar}>
            <button style={styles.iconBtn} onClick={(e)=>{e.stopPropagation();navigate('home')}}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} width={20} height={20}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            </button>
            <div style={{ flex:1, minWidth:0, paddingLeft:10 }}>
              <div style={{ color:'#fff', fontSize:15, fontWeight:700, fontFamily:"'Bebas Neue',sans-serif", letterSpacing:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {displayTitle}
              </div>
              {displaySub && (
                <div style={{ color:'rgba(255,255,255,.65)', fontSize:12, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {displaySub}
                </div>
              )}
            </div>
            {/* Quality badge */}
            {selQ && (
              <button
                style={{ ...styles.qBadge }}
                onClick={(e)=>{e.stopPropagation(); setShowQPanel(p=>!p)}}
              >
                {selQ} <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} width={12} height={12} style={{marginLeft:4}}><path d="M6 9l6 6 6-6"/></svg>
              </button>
            )}
          </div>

          {/* BOTTOM CONTROLS */}
          <div style={styles.bottomBar}>
            {/* progress bar */}
            <div
              ref={progressRef}
              style={styles.progressWrap}
              onClick={seek}
              onMouseMove={(e)=>{ if(e.buttons===1) seek(e) }}
            >
              <div style={{ ...styles.progressTrack }}>
                <div style={{ ...styles.progressBuffered, width:`${buffered*100}%` }} />
                <div style={{ ...styles.progressFill, width:`${progress*100}%` }} />
                <div style={{ ...styles.progressDot, left:`${progress*100}%` }} />
              </div>
            </div>

            {/* controls row */}
            <div style={styles.ctrlRow}>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                {/* skip back */}
                <button style={styles.iconBtn} onClick={()=>skipSecs(-10)}>
                  <svg viewBox="0 0 24 24" fill="white" width={22} height={22}><path d="M12.5 3a9 9 0 1 1-9 9M3 3v6h6"/><text x="8" y="15" fontSize="6" fill="white" fontWeight="bold">10</text></svg>
                </button>
                {/* play/pause */}
                <button style={styles.iconBtn} onClick={togglePlay}>
                  {playing
                    ? <svg viewBox="0 0 24 24" fill="white" width={26} height={26}><rect x={6} y={4} width={4} height={16}/><rect x={14} y={4} width={4} height={16}/></svg>
                    : <svg viewBox="0 0 24 24" fill="white" width={26} height={26}><path d="M8 5v14l11-7z"/></svg>}
                </button>
                {/* skip forward */}
                <button style={styles.iconBtn} onClick={()=>skipSecs(10)}>
                  <svg viewBox="0 0 24 24" fill="white" width={22} height={22}><path d="M11.5 3a9 9 0 1 0 9 9M21 3v6h-6"/><text x="8" y="15" fontSize="6" fill="white" fontWeight="bold">10</text></svg>
                </button>
                {/* time */}
                <span style={{ color:'rgba(255,255,255,.8)', fontSize:12, marginLeft:6 }}>
                  {fmt(currentT)} / {fmt(duration)}
                </span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                {/* volume */}
                <button style={styles.iconBtn} onClick={toggleMute}>
                  {muted || volume==0
                    ? <svg viewBox="0 0 24 24" fill="white" width={20} height={20}><path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/></svg>
                    : <svg viewBox="0 0 24 24" fill="white" width={20} height={20}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>}
                </button>
                <input
                  type="range" min={0} max={1} step={0.05} value={muted?0:volume}
                  onChange={changeVol}
                  style={{ width:70, accentColor:'#e50914', cursor:'pointer' }}
                />
                {/* fullscreen */}
                <button style={styles.iconBtn} onClick={toggleFS}>
                  {fullscreen
                    ? <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} width={20} height={20}><path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3"/></svg>
                    : <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} width={20} height={20}><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/></svg>}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Quality picker popup */}
        {showQPanel && (
          <div style={styles.qPanel} onClick={e=>e.stopPropagation()}>
            <p style={{ color:'rgba(255,255,255,.5)', fontSize:11, fontWeight:700, letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>Quality</p>
            {groups.map(g => (
              <button
                key={g.q}
                style={{ ...styles.qOption, background: selQ===g.q ? '#e50914' : 'transparent', color: selQ===g.q ? '#fff' : 'rgba(255,255,255,.8)' }}
                onClick={()=>pickQuality(g.q)}
              >
                {selQ===g.q && <span style={{marginRight:6}}>✓</span>}{g.q}
              </button>
            ))}
            {curGroup && curGroup.ss.length > 1 && (
              <>
                <p style={{ color:'rgba(255,255,255,.5)', fontSize:11, fontWeight:700, letterSpacing:1, textTransform:'uppercase', margin:'14px 0 10px' }}>Server</p>
                {curGroup.ss.map((s,i) => (
                  <button
                    key={i}
                    style={{ ...styles.qOption, background: selSrv===i ? 'rgba(229,9,20,.3)' : 'transparent', color: selSrv===i ? '#fff' : 'rgba(255,255,255,.7)' }}
                    onClick={()=>{ pickServer(i); setShowQPanel(false) }}
                  >
                    {selSrv===i && <span style={{marginRight:6}}>✓</span>}Server {i+1}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── INFO PANEL BELOW VIDEO ─────────────────────────────────── */}
      {!loading && !fetchErr && (
        <div style={{ background:'#111', flex:1, padding:'16px 20px' }}>
          <p style={{ color:'#fff', fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1 }}>{displayTitle}</p>
          {displaySub && <p style={{ color:'rgba(255,255,255,.5)', fontSize:13, marginTop:2 }}>{displaySub}</p>}
          {videoErr && <p style={{ color:'#fbbf24', fontSize:12, marginTop:8 }}>{videoErr}</p>}
        </div>
      )}
    </div>
  )
}

// ── inline styles ────────────────────────────────────────────────────────
const styles = {
  overlay: { position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.85)', zIndex:20 },
  spinWrap:{ display:'flex', flexDirection:'column', alignItems:'center' },
  spin:    { width:44, height:44, border:'3px solid rgba(229,9,20,.3)', borderTopColor:'#e50914', borderRadius:'50%', animation:'playerSpin .8s linear infinite' },
  notice:  { position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,.9)', color:'#fbbf24', fontSize:12, padding:'6px 16px', borderRadius:8, whiteSpace:'nowrap', zIndex:15, pointerEvents:'none' },
  errBtn:  { background:'#e50914', color:'#fff', border:'none', borderRadius:10, padding:'10px 22px', fontSize:14, fontWeight:700, cursor:'pointer' },
  centreBtn:{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', zIndex:8, pointerEvents:'none' },
  centreBtnInner:{ width:72, height:72, borderRadius:'50%', background:'rgba(0,0,0,.6)', backdropFilter:'blur(8px)', border:'2px solid rgba(255,255,255,.2)', display:'flex', alignItems:'center', justifyContent:'center' },
  controls:{ position:'absolute', inset:0, zIndex:10, display:'flex', flexDirection:'column', justifyContent:'space-between',
    background:'linear-gradient(to bottom, rgba(0,0,0,.7) 0%, transparent 30%, transparent 65%, rgba(0,0,0,.85) 100%)' },
  topBar:  { display:'flex', alignItems:'center', padding:'14px 16px 0' },
  bottomBar:{ padding:'0 16px 14px' },
  iconBtn: { background:'none', border:'none', cursor:'pointer', padding:8, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, transition:'background .15s' },
  progressWrap:{ height:24, display:'flex', alignItems:'center', cursor:'pointer', marginBottom:4 },
  progressTrack:{ position:'relative', width:'100%', height:4, background:'rgba(255,255,255,.25)', borderRadius:4, overflow:'visible' },
  progressBuffered:{ position:'absolute', left:0, top:0, height:'100%', background:'rgba(255,255,255,.35)', borderRadius:4 },
  progressFill:{ position:'absolute', left:0, top:0, height:'100%', background:'#e50914', borderRadius:4, transition:'width .1s' },
  progressDot: { position:'absolute', top:'50%', width:14, height:14, borderRadius:'50%', background:'#fff', transform:'translate(-50%,-50%)', boxShadow:'0 0 6px rgba(229,9,20,.8)', transition:'left .1s' },
  ctrlRow: { display:'flex', alignItems:'center', justifyContent:'space-between' },
  qBadge:  { background:'rgba(255,255,255,.15)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,.2)', color:'#fff', borderRadius:6, padding:'4px 10px', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', letterSpacing:.5 },
  qPanel:  { position:'absolute', top:56, right:12, zIndex:30, background:'rgba(15,15,15,.97)', backdropFilter:'blur(20px)', border:'1px solid rgba(255,255,255,.1)', borderRadius:14, padding:16, minWidth:150 },
  qOption: { display:'flex', alignItems:'center', width:'100%', padding:'9px 12px', borderRadius:8, border:'none', cursor:'pointer', fontSize:14, fontWeight:500, textAlign:'left', transition:'background .15s' },
}
