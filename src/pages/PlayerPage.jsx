// src/pages/PlayerPage.jsx
// STABLE VERSION — fixes iOS blank screen, panel-closes bug, crash on load

import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { getStream } from '../lib/providers.js'

// ── Detect iOS once at module level ──────────────────────────────────────
const IS_IOS = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
)

// ── Quality helpers ───────────────────────────────────────────────────────
const QP_ORDER = ['4K','2160p','1440p','1080p','720p','480p','360p','Auto']

function getQ(s) {
  if (s.quality) { const q=String(s.quality); return q.endsWith('p')?q:(q==='2160'||q==='4K'?'4K':q+'p') }
  const m=`${s.server||''} ${s.link||''}`.match(/\b(2160|4K|1440|1080|720|480|360)\b/i)
  if (!m) return 'Auto'
  const n=m[1].toUpperCase(); return (n==='2160'||n==='4K')?'4K':n+'p'
}

function groupQ(streams) {
  const map={}
  streams.forEach((s,i)=>{ const q=getQ(s); if(!map[q]) map[q]=[]; map[q].push({...s,_i:i}) })
  return Object.entries(map)
    .map(([quality,streams])=>({quality,streams}))
    .sort((a,b)=>{const ai=QP_ORDER.indexOf(a.quality),bi=QP_ORDER.indexOf(b.quality);return(ai<0?99:ai)-(bi<0?99:bi)})
}

function getLangs(streams) {
  const s=new Set()
  streams?.forEach(x=>{ const t=`${x.server||''} ${x.link||''}`
    if(/hindi/i.test(t)) s.add('Hindi'); if(/english/i.test(t)) s.add('English')
    if(/tamil/i.test(t)) s.add('Tamil'); if(/telugu/i.test(t)) s.add('Telugu')
    if(/bengali|bangla/i.test(t)) s.add('Bengali'); if(/korean/i.test(t)) s.add('Korean')
    if(/kannada/i.test(t)) s.add('Kannada'); if(/malayalam/i.test(t)) s.add('Malayalam')
  })
  return [...s]
}

function fmt(sec) {
  if(!sec||isNaN(sec)) return '0:00'
  const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=Math.floor(sec%60)
  return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`
}

// ── Icons ────────────────────────────────────────────────────────────────
const Ic={
  Back: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={20} height={20}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>,
  Play: ()=><svg viewBox="0 0 24 24" fill="currentColor" width={30} height={30}><path d="M8 5v14l11-7z"/></svg>,
  Pause:()=><svg viewBox="0 0 24 24" fill="currentColor" width={30} height={30}><rect x={6} y={4} width={4} height={16}/><rect x={14} y={4} width={4} height={16}/></svg>,
  Rew:  ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={22} height={22}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>,
  Fwd:  ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={22} height={22}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
  Vol:  ()=><svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path fill="none" stroke="currentColor" strokeWidth={2} d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>,
  Mute: ()=><svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth={2}/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth={2}/></svg>,
  FS:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/></svg>,
  ExFS: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3"/></svg>,
  Gear: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><circle cx={12} cy={12} r={3}/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  Eps:  ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  Next: ()=><svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><path d="M5 4l10 8-10 8V4zM19 5h2v14h-2z"/></svg>,
}

// ── Shared styles ────────────────────────────────────────────────────────
const R='#e50914'
const IB={background:'none',border:'none',cursor:'pointer',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:8,padding:8,WebkitTapHighlightColor:'transparent',width:38,height:38}
const OVL={position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.92)',zIndex:20}

// ── PanelRow — each row in the settings/episodes side panel ──────────────
function PR({label,active,onClick}) {
  return (
    <div
      onClick={e=>{e.stopPropagation();e.preventDefault();onClick()}}
      onTouchEnd={e=>{e.stopPropagation();e.preventDefault();onClick()}}
      style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',cursor:'pointer',background:active?`${R}18`:'transparent',borderBottom:'1px solid rgba(255,255,255,.05)'}}
    >
      <span style={{fontSize:14,color:active?'#fff':'rgba(255,255,255,.7)',fontWeight:active?700:400}}>{label}</span>
      {active&&<svg viewBox="0 0 24 24" fill="none" stroke={R} strokeWidth={3} width={14} height={14}><polyline points="20 6 9 17 4 12"/></svg>}
    </div>
  )
}

function PS({title,children}) {
  return <div><p style={{fontSize:10,fontWeight:700,letterSpacing:1.3,textTransform:'uppercase',color:'rgba(255,255,255,.3)',padding:'12px 16px 4px'}}>{title}</p>{children}</div>
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────
export default function PlayerPage({params,navigate,goBack}) {
  const {link,title='',type,kind,episodeTitle='',episodeIdx=0,providerValue,directLinks,allEpisodes=[],seasonTitle='',image}=params
  const K=kind||type||'movie'

  const vRef=useRef(null)   // video element
  const hRef=useRef(null)   // hls instance
  const cRef=useRef(null)   // container (for fullscreen)
  const pRef=useRef(null)   // progress bar
  const hideT=useRef(null)  // auto-hide timer
  const nextT=useRef(null)  // autoplay timer
  const panelDivRef=useRef(null) // panel div ref for click-outside

  // Stream state
  const [groups,  setGroups]  = useState([])
  const [selQ,    setSelQ]    = useState(null)
  const [selSrv,  setSelSrv]  = useState(0)
  const [loading, setLoading] = useState(true)
  const [fErr,    setFErr]    = useState(null)
  const [vErr,    setVErr]    = useState(null)

  // Playback state
  const [playing,  setPlaying]  = useState(false)
  const [prog,     setProg]     = useState(0)
  const [buf,      setBuf]      = useState(0)
  const [ct,       setCt]       = useState(0)
  const [dur,      setDur]      = useState(0)
  const [muted,    setMuted]    = useState(false)
  const [vol,      setVol]      = useState(1)
  const [fs,       setFs]       = useState(false)

  // UI state
  const [bright,   setBright]   = useState(100)
  const [screen,   setScreen]   = useState('contain')
  const [showUI,   setShowUI]   = useState(true)
  const [panel,    setPanel]    = useState(null) // 'settings'|'episodes'|null
  const [skipBtn,  setSkipBtn]  = useState(false)
  const [autoplay, setAutoplay] = useState(true)
  const [cdwn,     setCdwn]     = useState(null)
  const [langs,    setLangs]    = useState([])
  const [lang,     setLang]     = useState(null)
  const [epIdx,    setEpIdx]    = useState(episodeIdx)
  const [tapPlay,  setTapPlay]  = useState(false)

  // ── CRITICAL iOS FIX: set video attrs synchronously on first render ─────
  // We use a callback ref so attrs are set the moment the DOM node exists,
  // BEFORE React sets any other attributes. This is the only reliable way.
  const videoCallbackRef = useCallback(node => {
    if (!node) return
    // Assign to our ref so other effects can use it
    vRef.current = node
    // Set iOS attrs immediately — cannot rely on React props for these
    node.setAttribute('playsinline', '')
    node.setAttribute('webkit-playsinline', '')
    node.setAttribute('x-webkit-airplay', 'allow')
    node.removeAttribute('crossorigin')
    // Mute trick: iOS allows autoplay if muted initially
    // We'll unmute once playing starts
    if (IS_IOS) {
      node.muted = true
      node.defaultMuted = true
    }
  }, [])

  // ── Fetch streams ────────────────────────────────────────────────────
  useEffect(()=>{
    let done=false
    const sl=K==='movie'?(directLinks?.[0]?.link||link):link
    if(!sl){setFErr('No stream link.');setLoading(false);return}
    setLoading(true);setFErr(null);setVErr(null);setTapPlay(false)
    ;(async()=>{
      try{
        const data=await getStream({providerValue,link:sl,type:K,signal:new AbortController().signal})
        if(done) return
        const valid=(data||[]).filter(s=>s?.link)
        const g=groupQ(valid)
        const ls=getLangs(valid)
        setGroups(g);setLangs(ls)
        if(ls.length) setLang(ls[0])
        if(g.length){setSelQ(g[0].quality);setSelSrv(0)}
        else setFErr('No streams found. Try a different provider.')
      }catch(e){if(!done) setFErr(e.message||'Fetch failed.')}
      finally{if(!done) setLoading(false)}
    })()
    return ()=>{done=true}
  },[link,K,providerValue])

  // ── Mount stream ─────────────────────────────────────────────────────
  const cg=groups.find(g=>g.quality===selQ)
  const cs=cg?.streams[selSrv]||null

  useEffect(()=>{
    const v=vRef.current
    if(!cs||!v) return
    setVErr(null);setProg(0);setCt(0);setDur(0);setPlaying(false);setTapPlay(false)
    if(hRef.current){hRef.current.destroy();hRef.current=null}

    const url=cs.link
    const isHLS=cs.type==='hls'||url.includes('.m3u8')

    const onFatal=()=>{
      if(cg&&selSrv<cg.streams.length-1){setVErr(`Server ${selSrv+1} failed…`);setTimeout(()=>setSelSrv(i=>i+1),800)}
      else setVErr('All servers failed. Try another quality.')
    }

    if(isHLS&&Hls.isSupported()){
      // Android / Desktop: HLS.js
      const hls=new Hls({maxBufferLength:120,maxMaxBufferLength:300,enableWorker:true,startLevel:-1,
        xhrSetup(xhr){xhr.withCredentials=false;if(cs.headers) Object.entries(cs.headers).forEach(([k,v2])=>{try{xhr.setRequestHeader(k,v2)}catch{}})}
      })
      hls.loadSource(url);hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED,()=>{
        if(IS_IOS){v.muted=false;setMuted(false)} // unmute after manifest
        v.play().catch(()=>setTapPlay(true))
      })
      hls.on(Hls.Events.ERROR,(_,d)=>{if(d.fatal)onFatal()})
      hRef.current=hls

    }else if(isHLS&&v.canPlayType('application/vnd.apple.mpegurl')){
      // iOS Safari native HLS
      // These must already be set by videoCallbackRef, but set again to be safe
      v.setAttribute('playsinline','')
      v.setAttribute('webkit-playsinline','')
      v.removeAttribute('crossorigin')
      if(image) v.poster=image

      v.src=url
      v.load()  // ← REQUIRED on iOS: without this, src assignment is ignored

      const onMeta=()=>{
        setDur(v.duration||0)
        // iOS: try to unmute and play
        v.muted=false
        v.play().catch(()=>{
          // Autoplay blocked — need user tap
          setTapPlay(true)
        })
      }
      v.addEventListener('loadedmetadata',onMeta,{once:true})
      v.addEventListener('error',onFatal,{once:true})
      return ()=>{
        v.removeEventListener('loadedmetadata',onMeta)
        v.removeEventListener('error',onFatal)
        if(hRef.current){hRef.current.destroy();hRef.current=null}
      }

    }else{
      // Direct MP4
      v.removeAttribute('crossorigin')
      v.src=url;v.load()
      v.play().catch(()=>setTapPlay(true))
    }
    v.onerror=()=>onFatal()
    return ()=>{if(hRef.current){hRef.current.destroy();hRef.current=null}}
  },[cs])

  // ── Video events ─────────────────────────────────────────────────────
  useEffect(()=>{
    const v=vRef.current;if(!v) return
    const onPlay=()=>{setPlaying(true);setTapPlay(false);setMuted(v.muted)}
    const onPause=()=>setPlaying(false)
    const onTime=()=>{
      const c=v.currentTime,d=v.duration||0
      setCt(c);setDur(d);setProg(d>0?c/d:0)
      if(v.buffered.length) setBuf(v.buffered.end(v.buffered.length-1)/(d||1))
      setSkipBtn(K==='series'&&c>15&&c<90)
      if(autoplay&&K==='series'&&d>0&&c>=d-10&&epIdx<allEpisodes.length-1) setCdwn(Math.max(1,Math.ceil(d-c)))
      else setCdwn(null)
    }
    const onEnd=()=>{setPlaying(false);if(autoplay&&K==='series'&&epIdx<allEpisodes.length-1){clearTimeout(nextT.current);nextT.current=setTimeout(playNext,2000)}}
    const onDur=()=>setDur(v.duration||0)
    const onFS=()=>setFs(!!(document.fullscreenElement||document.webkitFullscreenElement))
    v.addEventListener('play',onPlay);v.addEventListener('pause',onPause);v.addEventListener('timeupdate',onTime)
    v.addEventListener('ended',onEnd);v.addEventListener('durationchange',onDur)
    document.addEventListener('fullscreenchange',onFS);document.addEventListener('webkitfullscreenchange',onFS)
    return ()=>{
      v.removeEventListener('play',onPlay);v.removeEventListener('pause',onPause);v.removeEventListener('timeupdate',onTime)
      v.removeEventListener('ended',onEnd);v.removeEventListener('durationchange',onDur)
      document.removeEventListener('fullscreenchange',onFS);document.removeEventListener('webkitfullscreenchange',onFS)
    }
  },[autoplay,epIdx,allEpisodes,K])

  // ── Controls ──────────────────────────────────────────────────────────
  const showReset=useCallback(()=>{
    setShowUI(true);clearTimeout(hideT.current)
    if(vRef.current&&!vRef.current.paused) hideT.current=setTimeout(()=>setShowUI(false),3500)
  },[])

  const togglePlay=useCallback(()=>{
    const v=vRef.current;if(!v) return
    v.paused?v.play().catch(()=>setTapPlay(true)):v.pause()
    showReset()
  },[showReset])

  const seek=useCallback(e=>{
    const v=vRef.current;if(!v?.duration) return
    const r=pRef.current?.getBoundingClientRect();if(!r) return
    const x=e.touches?.[0]?.clientX??e.clientX
    v.currentTime=Math.max(0,Math.min(1,(x-r.left)/r.width))*v.duration
    showReset()
  },[showReset])

  const skip=useCallback(s=>{
    const v=vRef.current;if(!v) return
    v.currentTime=Math.max(0,Math.min(v.duration||0,v.currentTime+s));showReset()
  },[showReset])

  const toggleMute=()=>{const v=vRef.current;if(!v) return;v.muted=!v.muted;setMuted(v.muted)}
  const changeVol=val=>{const v=vRef.current;if(!v) return;const n=parseFloat(val);v.volume=n;setVol(n);if(n>0){v.muted=false;setMuted(false)}}
  const toggleFS=()=>{const el=cRef.current;if(!el) return;fs?(document.exitFullscreen||document.webkitExitFullscreen)?.call(document):(el.requestFullscreen||el.webkitRequestFullscreen)?.call(el);showReset()}

  const playNext=useCallback(()=>{
    clearTimeout(nextT.current);setCdwn(null)
    const ni=epIdx+1;if(ni>=allEpisodes.length) return
    navigate('player',{...params,episodeTitle:allEpisodes[ni].title||`Episode ${ni+1}`,episodeIdx:ni,link:allEpisodes[ni].link})
  },[epIdx,allEpisodes,navigate,params])

  const playEp=(ep,i)=>{
    setPanel(null);setEpIdx(i)
    navigate('player',{...params,episodeTitle:ep.title||`Episode ${i+1}`,episodeIdx:i,link:ep.link})
  }

  // ── Click handler: close panel OR toggle play ─────────────────────────
  const handleClick=useCallback(e=>{
    // If click is inside the open panel, ignore
    if(panelDivRef.current&&panelDivRef.current.contains(e.target)) return
    // If panel is open and click is outside, just close panel
    if(panel){setPanel(null);return}
    togglePlay()
  },[panel,togglePlay])

  const handleTouch=useCallback(e=>{
    if(panelDivRef.current&&panelDivRef.current.contains(e.target)) return
    if(panel){setPanel(null);return}
    showReset()
  },[panel,showReset])

  const sub=episodeTitle||seasonTitle||''

  return (
    <div style={{background:'#000',minHeight:'100dvh',display:'flex',flexDirection:'column',fontFamily:"'DM Sans',sans-serif",color:'#fff'}}>

      {/* ══ VIDEO AREA ══ */}
      <div ref={cRef} style={{position:'relative',background:'#000',width:'100%',aspectRatio:'16/9',maxHeight:fs?'100dvh':'56vw',overflow:'hidden',flexShrink:0}}
        onMouseMove={showReset} onTouchStart={handleTouch} onClick={handleClick}>

        {/* iOS: use callback ref to set attrs before React renders props */}
        <video ref={videoCallbackRef} poster={image||undefined}
          style={{width:'100%',height:'100%',display:'block',background:'#000',objectFit:screen,filter:`brightness(${bright}%)`}}
        />

        {/* Loading */}
        {loading&&<div style={OVL}><div style={{textAlign:'center'}}><div style={{width:44,height:44,border:'3px solid rgba(255,255,255,.1)',borderTopColor:R,borderRadius:'50%',animation:'_s .8s linear infinite',margin:'0 auto'}}/><p style={{color:'rgba(255,255,255,.5)',fontSize:13,marginTop:14}}>Finding streams…</p></div></div>}

        {/* Error */}
        {fErr&&!loading&&<div style={OVL}><div style={{textAlign:'center',padding:'0 24px'}}><div style={{fontSize:48,marginBottom:16}}>⚠️</div><p style={{color:'#f87171',fontSize:14,lineHeight:1.6,marginBottom:20}}>{fErr}</p><button onClick={()=>(goBack?goBack():navigate('home'))} style={{background:R,color:'#fff',border:'none',borderRadius:10,padding:'10px 22px',fontSize:14,fontWeight:700,cursor:'pointer'}}>← Go Back</button></div></div>}

        {/* iOS tap to play */}
        {tapPlay&&!loading&&!fErr&&(
          <div style={OVL} onClick={e=>{e.stopPropagation();const v=vRef.current;if(v){v.muted=false;v.play().catch(()=>{})}}}>
            <div style={{textAlign:'center'}}>
              <div style={{width:80,height:80,borderRadius:'50%',background:'rgba(0,0,0,.6)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px',border:`2px solid rgba(255,255,255,.3)`}}>
                <Ic.Play/>
              </div>
              <p style={{fontSize:15,color:'#fff',fontWeight:600}}>Tap to Play</p>
              {IS_IOS&&<p style={{fontSize:12,color:'rgba(255,255,255,.5)',marginTop:6}}>iOS requires a tap to start</p>}
            </div>
          </div>
        )}

        {/* Video error notice */}
        {vErr&&!fErr&&<div style={{position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,.9)',color:'#fbbf24',fontSize:12,padding:'7px 18px',borderRadius:8,whiteSpace:'nowrap',zIndex:20,pointerEvents:'none'}}>{vErr}</div>}

        {/* Skip intro */}
        {skipBtn&&!loading&&!fErr&&<button onClick={e=>{e.stopPropagation();const v=vRef.current;if(v)v.currentTime=90;setSkipBtn(false)}} style={{position:'absolute',bottom:72,right:14,zIndex:25,background:'rgba(0,0,0,.85)',backdropFilter:'blur(8px)',border:'1.5px solid rgba(255,255,255,.3)',color:'#fff',borderRadius:8,padding:'9px 18px',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:7,WebkitTapHighlightColor:'transparent'}}>▶| Skip Intro</button>}

        {/* Autoplay countdown */}
        {cdwn!==null&&<div onClick={e=>e.stopPropagation()} style={{position:'absolute',bottom:72,right:14,zIndex:25,background:'rgba(0,0,0,.9)',border:'1px solid rgba(255,255,255,.15)',borderRadius:12,padding:'12px 16px',textAlign:'center',minWidth:160}}><p style={{fontSize:12,color:'rgba(255,255,255,.5)',marginBottom:10}}>Next in {cdwn}s</p><button onClick={e=>{e.stopPropagation();playNext()}} style={{background:R,color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',fontSize:13,fontWeight:700,cursor:'pointer',width:'100%'}}>Play Now</button></div>}

        {/* ── CONTROLS OVERLAY ── */}
        <div style={{position:'absolute',inset:0,zIndex:10,display:'flex',flexDirection:'column',justifyContent:'space-between',background:showUI?'linear-gradient(to bottom,rgba(0,0,0,.75) 0%,transparent 30%,transparent 65%,rgba(0,0,0,.88) 100%)':'transparent',opacity:showUI?1:0,pointerEvents:showUI?'auto':'none',transition:'opacity .3s ease'}}
          onClick={e=>e.stopPropagation()}>
          {/* Top */}
          <div style={{display:'flex',alignItems:'center',padding:'10px 12px 0',gap:8}}>
            <button style={IB} onClick={()=>(goBack?goBack():navigate('home'))}><Ic.Back/></button>
            <div style={{flex:1,display:'flex',justifyContent:'center'}}>
              <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:2}}>WELL<span style={{color:R}}>STREAMER</span></span>
            </div>
            <button style={{...IB,background:panel==='settings'?'rgba(255,255,255,.15)':'none'}} onClick={e=>{e.stopPropagation();setPanel(p=>p==='settings'?null:'settings')}}><Ic.Gear/></button>
            {K==='series'&&allEpisodes.length>0&&<button style={{...IB,background:panel==='episodes'?'rgba(255,255,255,.15)':'none'}} onClick={e=>{e.stopPropagation();setPanel(p=>p==='episodes'?null:'episodes')}}><Ic.Eps/></button>}
          </div>
          {/* Centre */}
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',pointerEvents:'none'}}>
            <button style={{...IB,width:70,height:70,borderRadius:'50%',background:'rgba(0,0,0,.55)',backdropFilter:'blur(8px)',border:'2px solid rgba(255,255,255,.22)',pointerEvents:'auto'}} onClick={e=>{e.stopPropagation();togglePlay()}}>{playing?<Ic.Pause/>:<Ic.Play/>}</button>
            <div style={{position:'absolute',left:0,top:0,width:'35%',height:'100%',pointerEvents:'auto'}} onDoubleClick={e=>{e.stopPropagation();skip(-10)}}/>
            <div style={{position:'absolute',right:0,top:0,width:'35%',height:'100%',pointerEvents:'auto'}} onDoubleClick={e=>{e.stopPropagation();skip(10)}}/>
          </div>
          {/* Bottom */}
          <div style={{padding:'0 12px 10px'}}>
            <div ref={pRef} style={{height:28,display:'flex',alignItems:'center',cursor:'pointer',touchAction:'none'}} onClick={e=>{e.stopPropagation();seek(e)}} onTouchStart={e=>{e.stopPropagation();seek(e)}} onTouchMove={e=>{e.stopPropagation();seek(e)}}>
              <div style={{position:'relative',width:'100%',height:4,background:'rgba(255,255,255,.2)',borderRadius:4}}>
                <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${buf*100}%`,background:'rgba(255,255,255,.28)',borderRadius:4}}/>
                <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${prog*100}%`,background:R,borderRadius:4}}/>
                <div style={{position:'absolute',top:'50%',left:`${prog*100}%`,width:16,height:16,borderRadius:'50%',background:'#fff',transform:'translate(-50%,-50%)',boxShadow:'0 0 8px rgba(0,0,0,.6)'}}/>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{display:'flex',alignItems:'center',gap:0}}>
                <button style={IB} onClick={e=>{e.stopPropagation();skip(-10)}}><Ic.Rew/></button>
                <button style={{...IB,width:44,height:44}} onClick={e=>{e.stopPropagation();togglePlay()}}>{playing?<Ic.Pause/>:<Ic.Play/>}</button>
                <button style={IB} onClick={e=>{e.stopPropagation();skip(10)}}><Ic.Fwd/></button>
                {K==='series'&&epIdx<allEpisodes.length-1&&<button style={IB} onClick={e=>{e.stopPropagation();playNext()}}><Ic.Next/></button>}
                <span style={{fontSize:12,color:'rgba(255,255,255,.75)',marginLeft:6,whiteSpace:'nowrap'}}>{fmt(ct)} / {fmt(dur)}</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:2}}>
                <button style={IB} onClick={e=>{e.stopPropagation();toggleMute()}}>{muted||vol===0?<Ic.Mute/>:<Ic.Vol/>}</button>
                <input type="range" min={0} max={1} step={0.05} value={muted?0:vol} onChange={e=>changeVol(e.target.value)} onClick={e=>e.stopPropagation()} style={{width:52,accentColor:R,cursor:'pointer'}}/>
                <button style={IB} onClick={e=>{e.stopPropagation();toggleFS()}}>{fs?<Ic.ExFS/>:<Ic.FS/>}</button>
              </div>
            </div>
          </div>
        </div>

        {/* ── SETTINGS PANEL ── */}
        {panel==='settings'&&(
          <div ref={panelDivRef} style={{position:'absolute',top:0,right:0,bottom:0,width:220,background:'rgba(6,6,6,.97)',backdropFilter:'blur(20px)',borderLeft:'1px solid rgba(255,255,255,.08)',zIndex:30,display:'flex',flexDirection:'column'}}
            onClick={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()}>
            <div style={{padding:'14px 16px 10px',borderBottom:'1px solid rgba(255,255,255,.06)',flexShrink:0}}><p style={{fontSize:11,fontWeight:700,letterSpacing:1.3,textTransform:'uppercase',color:'rgba(255,255,255,.4)'}}>Settings</p></div>
            <div style={{flex:1,overflowY:'auto'}}>
              <PS title="Quality">{groups.map(g=><PR key={g.quality} label={g.quality} active={selQ===g.quality} onClick={()=>{setSelQ(g.quality);setSelSrv(0);setVErr(null)}}/>)}</PS>
              {cg?.streams.length>1&&<PS title="Server">{cg.streams.map((_,i)=><PR key={i} label={`Server ${i+1}`} active={selSrv===i} onClick={()=>{setSelSrv(i);setVErr(null)}}/>)}</PS>}
              {langs.length>0&&<PS title="🎧 Audio">{langs.map(l=><PR key={l} label={l} active={lang===l} onClick={()=>setLang(l)}/>)}</PS>}
              <PS title="Brightness"><div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 16px 12px'}}><input type="range" min={30} max={150} step={5} value={bright} onChange={e=>setBright(Number(e.target.value))} onClick={e=>e.stopPropagation()} style={{flex:1,accentColor:R}}/><span style={{fontSize:11,color:'rgba(255,255,255,.4)',minWidth:38}}>{bright}%</span></div></PS>
              <PS title="Screen"><PR label="Fit" active={screen==='contain'} onClick={()=>setScreen('contain')}/><PR label="Crop" active={screen==='cover'} onClick={()=>setScreen('cover')}/><PR label="Stretch" active={screen==='fill'} onClick={()=>setScreen('fill')}/></PS>
              {K==='series'&&<PS title="Auto-play Next"><PR label={autoplay?'Enabled':'Disabled'} active={autoplay} onClick={()=>setAutoplay(p=>!p)}/></PS>}
            </div>
          </div>
        )}

        {/* ── EPISODE PANEL ── */}
        {panel==='episodes'&&K==='series'&&(
          <div ref={panelDivRef} style={{position:'absolute',top:0,right:0,bottom:0,width:240,background:'rgba(6,6,6,.97)',backdropFilter:'blur(20px)',borderLeft:'1px solid rgba(255,255,255,.08)',zIndex:30,display:'flex',flexDirection:'column'}}
            onClick={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()}>
            <div style={{padding:'14px 16px 10px',borderBottom:'1px solid rgba(255,255,255,.06)',flexShrink:0}}><p style={{fontSize:11,fontWeight:700,letterSpacing:1.3,textTransform:'uppercase',color:'rgba(255,255,255,.4)'}}>Episodes</p></div>
            <div style={{flex:1,overflowY:'auto',padding:'8px 10px'}}>
              {allEpisodes.map((ep,i)=>{const cur=i===epIdx;return(
                <div key={ep.link||i} onClick={e=>{e.stopPropagation();playEp(ep,i)}} onTouchEnd={e=>{e.stopPropagation();playEp(ep,i)}} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,marginBottom:6,background:cur?`${R}22`:'rgba(255,255,255,.04)',border:`1px solid ${cur?R+'55':'transparent'}`,cursor:'pointer'}}>
                  <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:cur?R:'rgba(255,255,255,.35)',minWidth:28}}>{String(i+1).padStart(2,'0')}</span>
                  <span style={{flex:1,fontSize:13,color:cur?'#fff':'rgba(255,255,255,.7)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:cur?600:400}}>{ep.title||`Episode ${i+1}`}</span>
                  {cur&&<span style={{fontSize:10,color:R,fontWeight:700}}>▶ NOW</span>}
                </div>
              )})}
            </div>
          </div>
        )}
      </div>

      {/* ══ INFO BELOW VIDEO ══ */}
      {!loading&&!fErr&&(
        <div style={{background:'#0f0f0f',flex:1,padding:'14px 18px 32px',borderTop:'1px solid rgba(255,255,255,.05)'}}>
          <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:1,marginBottom:3}}>{title}</h2>
          {sub&&<p style={{color:'rgba(255,255,255,.45)',fontSize:13,marginBottom:12}}>{sub}</p>}
          {vErr&&<p style={{color:'#fbbf24',fontSize:12,marginBottom:10}}>{vErr}</p>}
          {langs.length>0&&<div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>{langs.map(l=><span key={l} onClick={()=>setLang(l)} style={{padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:600,background:lang===l?`${R}20`:'rgba(255,255,255,.07)',color:lang===l?R:'rgba(255,255,255,.5)',border:`1px solid ${lang===l?R+'55':'rgba(255,255,255,.1)'}`,cursor:'pointer'}}>🎧 {l}</span>)}</div>}
          {K==='series'&&epIdx<allEpisodes.length-1&&<button onClick={playNext} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'10px 18px',borderRadius:10,marginBottom:20,background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.12)',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}><Ic.Next/>Next Episode</button>}
          {K==='series'&&allEpisodes.length>0&&(
            <div>
              <h3 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1,color:'rgba(255,255,255,.35)',marginBottom:12}}>EPISODES</h3>
              <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:'50vh',overflowY:'auto'}}>
                {allEpisodes.map((ep,i)=>{const cur=i===epIdx;return(
                  <div key={ep.link||i} onClick={()=>playEp(ep,i)} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 14px',borderRadius:12,background:cur?`${R}18`:'rgba(255,255,255,.04)',border:`1px solid ${cur?R+'44':'rgba(255,255,255,.07)'}`,cursor:'pointer'}}>
                    <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:cur?R:'rgba(255,255,255,.28)',minWidth:32}}>{String(i+1).padStart(2,'0')}</span>
                    <span style={{flex:1,fontSize:14,fontWeight:cur?600:400,color:cur?'#fff':'rgba(255,255,255,.65)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ep.title||`Episode ${i+1}`}</span>
                    {cur?<span style={{fontSize:11,color:R,fontWeight:700}}>▶ NOW</span>:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14} style={{color:'rgba(255,255,255,.25)',flexShrink:0}}><polyline points="9 18 15 12 9 6"/></svg>}
                  </div>
                )})}
              </div>
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes _s{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
