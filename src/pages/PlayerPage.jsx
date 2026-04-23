import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { getStream } from '../lib/providers.js'
import { Icons } from '../components/Icons.jsx'

function fmt(s) {
  if (!isFinite(s) || !s) return '0:00'
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`
}

function getMode(s) {
  const t = (s?.type||'').toLowerCase()
  const u = (s?.link||'').toLowerCase()
  if (t==='mkv'||t==='mp4'||u.endsWith('.mkv')||u.endsWith('.mp4')) return 'direct'
  return 'hls'
}

export default function PlayerPage({ params, navigate }) {
  const { link, title, type, providerValue } = params
  const videoRef     = useRef(null)
  const hlsRef       = useRef(null)
  const containerRef = useRef(null)
  const hideTimer    = useRef(null)

  const [streams, setStreams]   = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [playing, setPlaying]   = useState(false)
  const [curTime, setCurTime]   = useState(0)
  const [dur, setDur]           = useState(0)
  const [vol, setVol]           = useState(1)
  const [muted, setMuted]       = useState(false)
  const [bright, setBright]     = useState(1)
  const [fs, setFs]             = useState(false)
  const [showCtrl, setShowCtrl] = useState(true)
  const [showServers, setShowServers] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [qualities, setQualities] = useState([])
  const [audios, setAudios]       = useState([])
  const [curQ, setCurQ]           = useState(-1)
  const [curA, setCurA]           = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [stab, setStab]           = useState('q')

  // fetch streams
  useEffect(() => {
    let dead = false
    setLoading(true); setError(null); setStreams([]); setSelected(null)
    ;(async () => {
      try {
        const data = await getStream({ providerValue, link, type })
        if (dead) return
        const valid = (data||[]).filter(s=>s?.link)
        console.log('[Player] streams:', valid.length, valid.map(s=>({server:s.server,type:s.type,url:s.link?.slice(0,60)})))
        if (valid.length) { setStreams(valid); setSelected(valid[0]) }
        else setError('No streams found. Try a different provider.')
      } catch(e) { if(!dead) setError(e.message||'Failed.') }
      finally   { if(!dead) setLoading(false) }
    })()
    return () => { dead = true }
  }, [link, providerValue])

  // load stream
  useEffect(() => {
    if (!selected || !videoRef.current) return
    const video = videoRef.current
    const url   = selected.link
    const mode  = getMode(selected)
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    setQualities([]); setAudios([]); setBuffering(false)

    if (mode==='hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({ maxBufferLength:30, enableWorker:true })
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(()=>{})
          if (hls.levels?.length > 1) {
            setQualities([{id:-1,label:'Auto'}, ...hls.levels.map((l,i)=>({id:i,label:l.height?`${l.height}p`:`L${i+1}`}))])
            setCurQ(-1)
          }
          if (hls.audioTracks?.length > 1) {
            setAudios(hls.audioTracks.map((t,i)=>({id:i,label:t.name||t.lang||`Track ${i+1}`})))
            setCurA(hls.audioTrack)
          }
        })
        hls.on(Hls.Events.ERROR, (_,d) => {
          if (d.fatal) {
            if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current=null }
            video.src = url; video.play().catch(()=>setError('Stream failed. Try another server.'))
          }
        })
        hlsRef.current = hls
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url; video.play().catch(()=>{})
      }
    } else {
      video.src = url; video.play().catch(()=>{})
    }
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current=null } }
  }, [selected])

  // video events
  useEffect(() => {
    const v = videoRef.current; if(!v) return
    const on = (e,f) => v.addEventListener(e,f)
    const off = (e,f) => v.removeEventListener(e,f)
    const onPlay=()=>{setPlaying(true);setBuffering(false)}
    const onPause=()=>setPlaying(false)
    const onTime=()=>setCurTime(v.currentTime)
    const onDur=()=>setDur(v.duration)
    const onWait=()=>setBuffering(true)
    const onCan=()=>setBuffering(false)
    const onFS=()=>setFs(!!document.fullscreenElement)
    on('play',onPlay); on('pause',onPause); on('timeupdate',onTime)
    on('durationchange',onDur); on('waiting',onWait); on('playing',onCan); on('canplay',onCan)
    document.addEventListener('fullscreenchange',onFS)
    return () => {
      off('play',onPlay); off('pause',onPause); off('timeupdate',onTime)
      off('durationchange',onDur); off('waiting',onWait); off('playing',onCan); off('canplay',onCan)
      document.removeEventListener('fullscreenchange',onFS)
    }
  }, [])

  const resetHide = useCallback(() => {
    setShowCtrl(true); clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(()=>setShowCtrl(false), 3500)
  }, [])
  useEffect(()=>{ if(!playing) setShowCtrl(true) },[playing])

  const togglePlay = () => { const v=videoRef.current; if(!v) return; playing?v.pause():v.play().catch(()=>{}) }
  const seek = e => {
    const v=videoRef.current; if(!v||!dur) return
    const r=e.currentTarget.getBoundingClientRect()
    v.currentTime=((e.clientX-r.left)/r.width)*dur
  }
  const changeVol = e => {
    const val=parseFloat(e.target.value); setVol(val); setMuted(val===0)
    if(videoRef.current){videoRef.current.volume=val;videoRef.current.muted=val===0}
  }
  const toggleMute = () => { const v=videoRef.current; if(!v) return; v.muted=!muted; setMuted(!muted) }
  const toggleFS = () => {
    const el=containerRef.current; if(!el) return
    if(!document.fullscreenElement) el.requestFullscreen().catch(()=>{})
    else document.exitFullscreen()
  }
  const skip = s => { if(videoRef.current) videoRef.current.currentTime+=s }
  const pickServer = s => { setSelected(s);setShowServers(false);setError(null);setPlaying(false);setCurTime(0);setDur(0) }
  const tryNext = () => { if(streams.length<2) return; pickServer(streams[(streams.indexOf(selected)+1)%streams.length]) }
  const progress = dur ? (curTime/dur)*100 : 0

  return (
    <div ref={containerRef} className="player-page"
      onMouseMove={resetHide} onTouchStart={resetHide}
      style={{filter:`brightness(${bright})`}}>

      <video ref={videoRef} className="player-video" playsInline onClick={togglePlay} />

      {buffering && !loading && !error && <div className="player-center-overlay"><div className="player-spinner"/></div>}

      {loading && <div className="player-center-overlay">
        <div className="player-spinner"/>
        <p style={{color:'#aaa',marginTop:16,fontSize:14}}>Finding streams…</p>
      </div>}

      {error && !loading && <div className="player-center-overlay">
        <div style={{fontSize:44,marginBottom:12}}>⚠️</div>
        <p style={{color:'#f87171',maxWidth:340,textAlign:'center',marginBottom:20}}>{error}</p>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'center'}}>
          {streams.length>1 && <button className="btn btn-glass" onClick={tryNext}><Icons.Refresh/> Next Server</button>}
          <button className="btn btn-primary" onClick={()=>navigate('home')}><Icons.Back/> Go Back</button>
        </div>
      </div>}

      <div className={`player-controls-overlay ${showCtrl?'visible':''}`}>
        {/* Top */}
        <div className="player-top-bar">
          <button className="player-icon-btn" onClick={()=>navigate('home')}><Icons.Back/></button>
          <div className="player-top-title">{title}</div>
          <button className="player-icon-btn" style={showServers?{background:'rgba(26,111,255,.5)'}:{}}
            onClick={()=>{setShowServers(s=>!s);setShowSettings(false)}}><Icons.Globe/></button>
          <button className="player-icon-btn" style={showSettings?{background:'rgba(26,111,255,.5)'}:{}}
            onClick={()=>{setShowSettings(s=>!s);setShowServers(false)}}><Icons.Settings/></button>
        </div>

        {/* Center */}
        <div className="player-center-btns">
          <button className="player-skip-btn" onClick={()=>skip(-10)}><Icons.SkipBack/><span>10</span></button>
          <button className="player-play-btn" onClick={togglePlay}>{playing?<Icons.Pause/>:<Icons.Play/>}</button>
          <button className="player-skip-btn" onClick={()=>skip(10)}><Icons.SkipFwd/><span>10</span></button>
        </div>

        {/* Bottom */}
        <div className="player-bottom-bar">
          <div className="player-progress-wrap" onClick={seek}>
            <div className="player-progress-bg">
              <div className="player-progress-fill" style={{width:`${progress}%`}}/>
              <div className="player-progress-thumb" style={{left:`${progress}%`}}/>
            </div>
          </div>
          <div className="player-bottom-row">
            <div className="player-ctrl-group">
              <button className="player-icon-btn" onClick={togglePlay}>{playing?<Icons.Pause/>:<Icons.Play/>}</button>
              <button className="player-icon-btn" onClick={toggleMute}>{muted||vol===0?<Icons.VolumeMute/>:<Icons.Volume/>}</button>
              <input type="range" min="0" max="1" step="0.05" value={muted?0:vol} onChange={changeVol} className="player-volume-slider"/>
              <span className="player-time">{fmt(curTime)} / {fmt(dur)}</span>
            </div>
            <div className="player-ctrl-group">
              <div className="player-brightness-wrap">
                <Icons.Sun/>
                <input type="range" min="0.2" max="1.5" step="0.05" value={bright} onChange={e=>setBright(parseFloat(e.target.value))} className="player-volume-slider"/>
              </div>
              <button className="player-icon-btn" onClick={toggleFS}>{fs?<Icons.Shrink/>:<Icons.Expand/>}</button>
            </div>
          </div>
        </div>
      </div>

      {/* Servers */}
      {showServers && streams.length>0 && <div className="player-panel">
        <div className="player-panel-title"><Icons.Globe/> Servers ({streams.length})
          <button className="player-panel-close" onClick={()=>setShowServers(false)}><Icons.X/></button>
        </div>
        <div className="player-panel-list">
          {streams.map((s,i)=>(
            <button key={i} className={`player-panel-item ${selected===s?'active':''}`} onClick={()=>pickServer(s)}>
              <Icons.Globe/><span>{s.server||`Server ${i+1}`}</span>
              {s.quality&&<span className="player-panel-badge">{s.quality}p</span>}
              {selected===s&&<Icons.Check/>}
            </button>
          ))}
        </div>
      </div>}

      {/* Settings */}
      {showSettings && <div className="player-panel">
        <div className="player-panel-title"><Icons.Settings/> Settings
          <button className="player-panel-close" onClick={()=>setShowSettings(false)}><Icons.X/></button>
        </div>
        {qualities.length>0||audios.length>0 ? <>
          <div className="player-panel-tabs">
            {qualities.length>0&&<button className={`player-panel-tab ${stab==='q'?'active':''}`} onClick={()=>setStab('q')}>Quality</button>}
            {audios.length>0&&<button className={`player-panel-tab ${stab==='a'?'active':''}`} onClick={()=>setStab('a')}>Audio</button>}
          </div>
          <div className="player-panel-list">
            {stab==='q'&&qualities.map(q=><button key={q.id} className={`player-panel-item ${curQ===q.id?'active':''}`} onClick={()=>{if(hlsRef.current)hlsRef.current.currentLevel=q.id;setCurQ(q.id);setShowSettings(false)}}>{q.label}{curQ===q.id&&<Icons.Check/>}</button>)}
            {stab==='a'&&audios.map(a=><button key={a.id} className={`player-panel-item ${curA===a.id?'active':''}`} onClick={()=>{if(hlsRef.current)hlsRef.current.audioTrack=a.id;setCurA(a.id);setShowSettings(false)}}>{a.label}{curA===a.id&&<Icons.Check/>}</button>)}
          </div>
        </> : <div style={{padding:24,color:'#555',fontSize:13,textAlign:'center'}}>Options load after stream starts</div>}
      </div>}
    </div>
  )
}
