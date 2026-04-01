// src/pages/PlayerPage.jsx — Complete professional player
import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { getStream } from '../lib/providers.js'
import { groupStreamsByQuality, extractAudioLangs, formatTime } from '../lib/contentUtils.js'
import { historyStorage } from '../lib/storage.js'
import Logo from '../components/Logo.jsx'
import QualitySelector from '../components/QualitySelector.jsx'
import DubSelector from '../components/DubSelector.jsx'
import EpisodeList from '../components/EpisodeList.jsx'
import { ProgressBar, BrightnessSlider, ScreenModeSelector } from '../components/Controls.jsx'

const Ic = {
  Back:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={20} height={20}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>,
  Play:    ()=><svg viewBox="0 0 24 24" fill="currentColor" width={32} height={32}><path d="M8 5v14l11-7z"/></svg>,
  Pause:   ()=><svg viewBox="0 0 24 24" fill="currentColor" width={32} height={32}><rect x={6} y={4} width={4} height={16}/><rect x={14} y={4} width={4} height={16}/></svg>,
  Rew:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={22} height={22}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>,
  Fwd:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={22} height={22}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
  Vol:     ()=><svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path fill="none" stroke="currentColor" strokeWidth={2} d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>,
  Mute:    ()=><svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth={2}/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth={2}/></svg>,
  FS:      ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/></svg>,
  ExitFS:  ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3"/></svg>,
  Settings:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><circle cx={12} cy={12} r={3}/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  EpList:  ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  Next:    ()=><svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><path d="M5 4l10 8-10 8V4zM19 5h2v14h-2z"/></svg>,
  Skip:    ()=><svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14}><path d="M5 4l10 8-10 8V4zM19 4h2v16h-2z"/></svg>,
}

const iBtn = { background:'none',border:'none',cursor:'pointer',padding:8,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:8,color:'white',width:38,height:38 }
const pLabel = { fontSize:10,fontWeight:700,letterSpacing:1.4,textTransform:'uppercase',color:'rgba(255,255,255,0.35)',marginBottom:8 }

export default function PlayerPage({ params, navigate, user, goBack }) {
  const { kind='movie', title='', episodeTitle='', episodeIdx=0, link, directLinks, allEpisodes=[], providerValue, seasonTitle='' } = params

  const videoRef = useRef(null), hlsRef = useRef(null), containerRef = useRef(null)
  const progressRef = useRef(null), hideTimer = useRef(null), nextTimer = useRef(null)

  const [groups, setGroups]   = useState([])
  const [selQ,   setSelQ]     = useState(null)
  const [selSrv, setSelSrv]   = useState(0)
  const [loading,setLoading]  = useState(true)
  const [fetchErr,setFetchErr]= useState(null)
  const [videoErr,setVideoErr]= useState(null)

  const [playing,  setPlaying]  = useState(false)
  const [progress, setProgress] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [currentT, setCurrentT] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted,    setMuted]    = useState(false)
  const [volume,   setVolume]   = useState(1)
  const [fullscreen,setFullscreen]=useState(false)

  const [brightness, setBrightness] = useState(100)
  const [screenMode, setScreenMode] = useState('contain')
  const [showUI,     setShowUI]     = useState(true)
  const [panel,      setPanel]      = useState(null)
  const [showSkip,   setShowSkip]   = useState(false)
  const [autoplay,   setAutoplay]   = useState(true)
  const [countdown,  setCountdown]  = useState(null)
  const [audioLangs, setAudioLangs] = useState([])
  const [selLang,    setSelLang]    = useState(null)
  const [curEpIdx,   setCurEpIdx]   = useState(episodeIdx)

  // fetch
  const fetchStreams = useCallback(async (sl) => {
    if (!sl) { setFetchErr('No stream link.'); setLoading(false); return }
    setLoading(true); setFetchErr(null); setVideoErr(null)
    try {
      const data = await getStream({ providerValue, link:sl, type:kind, signal:new AbortController().signal })
      const valid = (data||[]).filter(s=>s?.link)
      const g = groupStreamsByQuality(valid)
      setGroups(g)
      const langs = extractAudioLangs(valid)
      setAudioLangs(langs)
      if (langs.length) setSelLang(langs[0])
      if (g.length) { setSelQ(g[0].quality); setSelSrv(0) }
      else setFetchErr('No streams found. Try another server or provider.')
    } catch(e) { setFetchErr(e.message||'Stream fetch failed.') }
    finally { setLoading(false) }
  }, [providerValue, kind])

  useEffect(() => {
    fetchStreams(kind==='movie' ? (directLinks?.[0]?.link||link) : link)
    if (user?.username) historyStorage.add(user.username,{ title, link:link||'', image:params.image||'', provider:providerValue })
  }, [link, kind])

  const curGroup  = groups.find(g=>g.quality===selQ)
  const curStream = curGroup?.streams[selSrv]||null

  useEffect(() => {
    if (!curStream||!videoRef.current) return
    const v = videoRef.current
    setVideoErr(null); setProgress(0); setCurrentT(0); setDuration(0); setPlaying(false)
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current=null }
    const url=curStream.link, isHLS=curStream.type==='hls'||url.includes('.m3u8')
    const onFatal=()=>{
      if (curGroup&&selSrv<curGroup.streams.length-1) { setVideoErr(`Server ${selSrv+1} failed…`); setTimeout(()=>setSelSrv(i=>i+1),800) }
      else setVideoErr('All servers failed. Try another quality.')
    }
    if (isHLS&&Hls.isSupported()) {
      const hls=new Hls({ maxBufferLength:120, maxMaxBufferLength:300, enableWorker:true, startLevel:-1,
        xhrSetup(xhr){ if(curStream.headers) Object.entries(curStream.headers).forEach(([k,v])=>{ try{xhr.setRequestHeader(k,v)}catch{} }) }
      })
      hls.loadSource(url); hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED,()=>v.play().catch(()=>{}))
      hls.on(Hls.Events.ERROR,(_,d)=>{ if(d.fatal) onFatal() })
      hlsRef.current=hls
    } else if (isHLS&&v.canPlayType('application/vnd.apple.mpegurl')) { v.src=url; v.play().catch(()=>{}) }
    else { v.src=url; v.play().catch(()=>{}) }
    v.onerror=onFatal
    return ()=>{ if(hlsRef.current){ hlsRef.current.destroy(); hlsRef.current=null } }
  }, [curStream])

  useEffect(() => {
    const v=videoRef.current; if(!v) return
    const onPlay=()=>setPlaying(true), onPause=()=>setPlaying(false)
    const onTime=()=>{
      setCurrentT(v.currentTime); setDuration(v.duration||0)
      setProgress(v.duration?v.currentTime/v.duration:0)
      if(v.buffered.length) setBuffered(v.buffered.end(v.buffered.length-1)/(v.duration||1))
      setShowSkip(kind==='series'&&v.currentTime>30&&v.currentTime<90)
      if(autoplay&&kind==='series'&&v.duration&&v.currentTime>=v.duration-8&&curEpIdx<allEpisodes.length-1)
        setCountdown(Math.ceil(v.duration-v.currentTime))
      else setCountdown(null)
    }
    const onEnded=()=>{ if(autoplay&&kind==='series'&&curEpIdx<allEpisodes.length-1) { clearTimeout(nextTimer.current); nextTimer.current=setTimeout(playNext,3000) } }
    const onFS=()=>setFullscreen(!!document.fullscreenElement)
    v.addEventListener('play',onPlay); v.addEventListener('pause',onPause); v.addEventListener('timeupdate',onTime); v.addEventListener('ended',onEnded); document.addEventListener('fullscreenchange',onFS)
    return ()=>{ v.removeEventListener('play',onPlay); v.removeEventListener('pause',onPause); v.removeEventListener('timeupdate',onTime); v.removeEventListener('ended',onEnded); document.removeEventListener('fullscreenchange',onFS) }
  }, [autoplay,curEpIdx,allEpisodes,kind])

  const showAndReset=useCallback(()=>{ setShowUI(true); clearTimeout(hideTimer.current); if(videoRef.current&&!videoRef.current.paused) hideTimer.current=setTimeout(()=>setShowUI(false),3500) },[])
  const togglePlay=useCallback(()=>{ const v=videoRef.current; if(!v) return; playing?v.pause():v.play().catch(()=>{}); showAndReset() },[playing,showAndReset])
  const seek=useCallback((e)=>{ const v=videoRef.current; if(!v?.duration) return; const rect=progressRef.current?.getBoundingClientRect(); if(!rect) return; const pct=e._pct!==undefined?e._pct:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)); v.currentTime=pct*v.duration; showAndReset() },[showAndReset])
  const skip=useCallback((s)=>{ const v=videoRef.current; if(!v) return; v.currentTime=Math.max(0,Math.min(v.duration||0,v.currentTime+s)); showAndReset() },[showAndReset])
  const toggleMute=()=>{ const v=videoRef.current; if(!v) return; v.muted=!v.muted; setMuted(!muted) }
  const changeVol=(val)=>{ const v=videoRef.current; if(!v) return; v.volume=val; setVolume(val); if(val>0){v.muted=false;setMuted(false)} }
  const toggleFS=()=>{ const el=containerRef.current; if(!el) return; fullscreen?document.exitFullscreen?.():el.requestFullscreen?.(); showAndReset() }

  const playNext=useCallback(()=>{ clearTimeout(nextTimer.current); setCountdown(null); const ni=curEpIdx+1; if(ni>=allEpisodes.length) return; navigate('player',{...params,episodeTitle:allEpisodes[ni].title||`Episode ${ni+1}`,episodeIdx:ni,link:allEpisodes[ni].link}) },[curEpIdx,allEpisodes,navigate,params])
  const playEp=useCallback((ep,i)=>{ setPanel(null); navigate('player',{...params,episodeTitle:ep.title||`Episode ${i+1}`,episodeIdx:i,link:ep.link}) },[navigate,params])

  return (
    <div style={{ background:'#000',minHeight:'100vh',display:'flex',flexDirection:'column',fontFamily:"'DM Sans',sans-serif",color:'#fff',userSelect:'none' }}>
      {/* VIDEO */}
      <div ref={containerRef} style={{ position:'relative',background:'#000',width:'100%',aspectRatio:'16/9',maxHeight:fullscreen?'100vh':'min(56vw, 56vh)',overflow:'hidden',flexShrink:0 }}
        onMouseMove={showAndReset} onTouchStart={showAndReset}
        onClick={()=>{ if(panel){setPanel(null);return} togglePlay() }}>
        <video ref={videoRef} playsInline style={{ width:'100%',height:'100%',display:'block',background:'#000',objectFit:screenMode,filter:`brightness(${brightness}%)` }} />

        {/* Loading */}
        {loading&&<div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.88)',zIndex:20 }}><div style={{ textAlign:'center' }}><div style={{ width:44,height:44,border:'3px solid rgba(255,255,255,.1)',borderTopColor:'var(--accent,#1a6fff)',borderRadius:'50%',animation:'_wspin .8s linear infinite',margin:'0 auto' }}/><p style={{ color:'rgba(255,255,255,.5)',fontSize:13,marginTop:14 }}>Loading streams…</p></div></div>}

        {/* Error */}
        {fetchErr&&!loading&&<div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.88)',zIndex:20 }}><div style={{ textAlign:'center',padding:'0 28px' }}><div style={{ fontSize:48,marginBottom:16 }}>⚠️</div><p style={{ color:'#f87171',fontSize:14,lineHeight:1.6,marginBottom:20 }}>{fetchErr}</p><button onClick={()=>goBack?.()} style={{ background:'var(--accent,#1a6fff)',color:'#fff',border:'none',borderRadius:10,padding:'10px 22px',fontSize:13,fontWeight:700,cursor:'pointer' }}>← Go Back</button></div></div>}

        {/* Video error */}
        {videoErr&&!fetchErr&&<div style={{ position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,.9)',color:'#fbbf24',fontSize:12,padding:'6px 16px',borderRadius:8,whiteSpace:'nowrap',zIndex:15,pointerEvents:'none' }}>{videoErr}</div>}

        {/* Skip intro */}
        {showSkip&&!loading&&!fetchErr&&<button onClick={e=>{e.stopPropagation();const v=videoRef.current;if(v)v.currentTime=90;setShowSkip(false)}} style={{ position:'absolute',bottom:70,right:16,zIndex:20,background:'rgba(0,0,0,.82)',backdropFilter:'blur(8px)',border:'1.5px solid rgba(255,255,255,.25)',color:'#fff',borderRadius:8,padding:'8px 16px',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:6 }}><Ic.Skip/>Skip Intro</button>}

        {/* Autoplay countdown */}
        {countdown!==null&&<div onClick={e=>e.stopPropagation()} style={{ position:'absolute',bottom:70,right:16,zIndex:20,background:'rgba(0,0,0,.88)',backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,.15)',borderRadius:12,padding:'12px 16px',textAlign:'center' }}><p style={{ fontSize:12,color:'rgba(255,255,255,.55)',marginBottom:8 }}>Next in {countdown}s</p><button onClick={playNext} style={{ background:'var(--accent,#1a6fff)',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:6 }}><Ic.Next/>Play Now</button></div>}

        {/* CONTROLS */}
        <div style={{ position:'absolute',inset:0,zIndex:10,display:'flex',flexDirection:'column',justifyContent:'space-between',background:'linear-gradient(to bottom,rgba(0,0,0,.72) 0%,transparent 28%,transparent 64%,rgba(0,0,0,.88) 100%)',opacity:showUI?1:0,pointerEvents:showUI?'auto':'none',transition:'opacity .35s ease' }} onClick={e=>e.stopPropagation()}>
          {/* Top */}
          <div style={{ display:'flex',alignItems:'center',padding:'12px 14px 0',gap:10 }}>
            <button style={iBtn} onClick={()=>goBack?.()}><Ic.Back/></button>
            <div style={{ flex:1,display:'flex',justifyContent:'center' }}><Logo size="sm"/></div>
            <button style={{ ...iBtn,background:panel==='settings'?'rgba(255,255,255,.15)':'none' }} onClick={()=>setPanel(p=>p==='settings'?null:'settings')}><Ic.Settings/></button>
            {kind==='series'&&allEpisodes.length>0&&<button style={{ ...iBtn,background:panel==='episodes'?'rgba(255,255,255,.15)':'none' }} onClick={()=>setPanel(p=>p==='episodes'?null:'episodes')}><Ic.EpList/></button>}
          </div>
          {/* Centre */}
          <div style={{ flex:1,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',pointerEvents:'none' }}>
            <button style={{ ...iBtn,width:68,height:68,borderRadius:'50%',background:'rgba(0,0,0,.55)',backdropFilter:'blur(8px)',border:'2px solid rgba(255,255,255,.2)',pointerEvents:'auto' }} onClick={togglePlay}>{playing?<Ic.Pause/>:<Ic.Play/>}</button>
            <div style={{ position:'absolute',left:0,top:0,width:'35%',height:'100%',pointerEvents:'auto' }} onDoubleClick={e=>{e.stopPropagation();skip(-10)}}/>
            <div style={{ position:'absolute',right:0,top:0,width:'35%',height:'100%',pointerEvents:'auto' }} onDoubleClick={e=>{e.stopPropagation();skip(10)}}/>
          </div>
          {/* Bottom */}
          <div style={{ padding:'0 14px 10px' }}>
            <ProgressBar progress={progress} buffered={buffered} onSeek={seek} progressRef={progressRef}/>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:2 }}>
              <div style={{ display:'flex',alignItems:'center',gap:2 }}>
                <button style={iBtn} onClick={()=>skip(-10)}><Ic.Rew/></button>
                <button style={{ ...iBtn,width:42,height:42 }} onClick={togglePlay}>{playing?<Ic.Pause/>:<Ic.Play/>}</button>
                <button style={iBtn} onClick={()=>skip(10)}><Ic.Fwd/></button>
                {kind==='series'&&curEpIdx<allEpisodes.length-1&&<button style={iBtn} onClick={playNext}><Ic.Next/></button>}
                <span style={{ fontSize:11,color:'rgba(255,255,255,.7)',marginLeft:6,whiteSpace:'nowrap' }}>{formatTime(currentT)} / {formatTime(duration)}</span>
              </div>
              <div style={{ display:'flex',alignItems:'center',gap:2 }}>
                <button style={iBtn} onClick={toggleMute}>{muted||volume===0?<Ic.Mute/>:<Ic.Vol/>}</button>
                <input type="range" min={0} max={1} step={0.05} value={muted?0:volume} onChange={e=>changeVol(parseFloat(e.target.value))} style={{ width:50,accentColor:'var(--accent)',cursor:'pointer' }}/>
                <button style={iBtn} onClick={toggleFS}>{fullscreen?<Ic.ExitFS/>:<Ic.FS/>}</button>
              </div>
            </div>
          </div>
        </div>

        {/* SETTINGS PANEL */}
        {panel==='settings'&&(
          <div style={{ position:'absolute',top:0,right:0,bottom:0,width:210,background:'rgba(8,8,8,.97)',backdropFilter:'blur(20px)',borderLeft:'1px solid rgba(255,255,255,.08)',zIndex:30,overflowY:'auto',padding:'56px 16px 16px',display:'flex',flexDirection:'column',gap:20 }} onClick={e=>e.stopPropagation()}>
            <QualitySelector groups={groups} selected={selQ} onSelect={q=>{setSelQ(q);setSelSrv(0);setVideoErr(null);setPanel(null)}}/>
            {curGroup?.streams.length>1&&<div><p style={pLabel}>Server</p>{curGroup.streams.map((_,i)=><button key={i} onClick={()=>{setSelSrv(i);setVideoErr(null);setPanel(null)}} style={{ padding:'8px 12px',borderRadius:8,border:'none',background:selSrv===i?'rgba(255,255,255,.12)':'transparent',color:selSrv===i?'#fff':'rgba(255,255,255,.65)',fontSize:13,cursor:'pointer',textAlign:'left',fontWeight:selSrv===i?700:400,width:'100%',display:'block' }}>{selSrv===i?'✓ ':''}Server {i+1}</button>)}</div>}
            {audioLangs.length>0&&<DubSelector langs={audioLangs} selected={selLang} onSelect={setSelLang}/>}
            <div><p style={pLabel}>Brightness</p><BrightnessSlider value={brightness} onChange={setBrightness}/></div>
            <div><p style={pLabel}>Screen Mode</p><ScreenModeSelector mode={screenMode} onChange={m=>{setScreenMode(m);setPanel(null)}}/></div>
            {kind==='series'&&<div><p style={pLabel}>Auto-play Next</p><button onClick={()=>setAutoplay(p=>!p)} style={{ padding:'8px 14px',borderRadius:8,border:`1.5px solid ${autoplay?'var(--accent)':'rgba(255,255,255,.12)'}`,background:autoplay?'var(--accent-dim)':'transparent',color:autoplay?'var(--accent2)':'rgba(255,255,255,.5)',fontSize:13,fontWeight:600,cursor:'pointer',width:'100%' }}>{autoplay?'✓ Enabled':'Disabled'}</button></div>}
          </div>
        )}

        {/* EPISODE PANEL */}
        {panel==='episodes'&&kind==='series'&&(
          <div style={{ position:'absolute',top:0,right:0,bottom:0,width:230,background:'rgba(8,8,8,.97)',backdropFilter:'blur(20px)',borderLeft:'1px solid rgba(255,255,255,.08)',zIndex:30,overflowY:'auto',padding:'54px 12px 12px' }} onClick={e=>e.stopPropagation()}>
            <p style={pLabel}>Episodes</p>
            <EpisodeList episodes={allEpisodes} currentIdx={curEpIdx} onSelect={(ep,i)=>{setCurEpIdx(i);playEp(ep,i)}} maxHeight="none"/>
          </div>
        )}
      </div>

      {/* INFO BELOW */}
      {!loading&&!fetchErr&&(
        <div style={{ background:'var(--surface,#111)',flex:1,padding:'14px 18px 24px',borderTop:'1px solid rgba(255,255,255,.06)' }}>
          <h2 style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:1,marginBottom:2 }}>{title}</h2>
          {(episodeTitle||seasonTitle)&&<p style={{ color:'rgba(255,255,255,.5)',fontSize:13,marginBottom:10 }}>{episodeTitle||seasonTitle}</p>}
          {videoErr&&<p style={{ color:'#fbbf24',fontSize:12,marginBottom:8 }}>{videoErr}</p>}
          {audioLangs.length>0&&<div style={{ display:'flex',gap:6,flexWrap:'wrap',marginBottom:12 }}>{audioLangs.map(l=><span key={l} style={{ padding:'3px 10px',borderRadius:6,fontSize:11,fontWeight:600,background:'rgba(255,255,255,.07)',color:'rgba(255,255,255,.5)',border:'1px solid rgba(255,255,255,.1)' }}>🎧 {l}</span>)}</div>}
          {kind==='series'&&curEpIdx<allEpisodes.length-1&&<button onClick={playNext} style={{ display:'inline-flex',alignItems:'center',gap:8,padding:'9px 18px',borderRadius:10,background:'var(--surface2,#1a1a1a)',border:'1px solid rgba(255,255,255,.1)',color:'var(--text,#f0f0f0)',fontSize:13,fontWeight:600,cursor:'pointer',marginBottom:16 }}><Ic.Next/>Next Episode</button>}
          {kind==='series'&&allEpisodes.length>0&&<div><h3 style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1,marginBottom:10,color:'rgba(255,255,255,.55)' }}>Episodes</h3><EpisodeList episodes={allEpisodes} currentIdx={curEpIdx} onSelect={(ep,i)=>{setCurEpIdx(i);playEp(ep,i)}} maxHeight="45vh"/></div>}
        </div>
      )}
      <style>{`@keyframes _wspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
