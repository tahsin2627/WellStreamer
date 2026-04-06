// src/pages/PlayerPage.jsx — handles embed (iframe) + hls + mp4 streams
import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import { getStream } from '../lib/providers.js'

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)
const R = '#e50914'

function fmt(s) {
  if (!s||isNaN(s)) return '0:00'
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=Math.floor(s%60)
  return h?`${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`:`${m}:${String(ss).padStart(2,'0')}`
}

const IB={background:'none',border:'none',cursor:'pointer',color:'#fff',display:'flex',
  alignItems:'center',justifyContent:'center',borderRadius:8,padding:8,
  WebkitTapHighlightColor:'transparent',width:38,height:38}

// ── Embed player (iframe) ──────────────────────────────────────────────────
function EmbedPlayer({ stream, title, onBack }) {
  const [loaded, setLoaded] = useState(false)
  const url = stream?.link || ''

  return (
    <div style={{background:'#000',minHeight:'100dvh',display:'flex',flexDirection:'column',fontFamily:"'DM Sans',sans-serif",color:'#fff'}}>
      {/* Top bar */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'#0a0a0a',borderBottom:'1px solid rgba(255,255,255,.07)',flexShrink:0}}>
        <button style={IB} onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={20} height={20}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:17,letterSpacing:2,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          WELL<span style={{color:R}}>STREAMER</span> — {title}
        </span>
      </div>

      {/* Iframe */}
      <div style={{position:'relative',width:'100%',aspectRatio:'16/9',background:'#000',flexShrink:0}}>
        {!loaded && (
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12}}>
            <div style={{width:40,height:40,border:'3px solid rgba(255,255,255,.1)',borderTopColor:R,borderRadius:'50%',animation:'_spin .8s linear infinite'}}/>
            <p style={{color:'rgba(255,255,255,.4)',fontSize:13}}>Loading player…</p>
          </div>
        )}
        <iframe
          src={url}
          onLoad={() => setLoaded(true)}
          allowFullScreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          style={{width:'100%',height:'100%',border:'none',display:'block',position:'absolute',inset:0}}
        />
      </div>

      {/* Open in browser fallback */}
      <div style={{padding:'14px 16px',background:'#0f0f0f',borderTop:'1px solid rgba(255,255,255,.05)'}}>
        <p style={{fontSize:12,color:'rgba(255,255,255,.35)',marginBottom:10}}>
          If the player doesn't load, try opening directly:
        </p>
        <a href={url} target="_blank" rel="noreferrer"
          style={{display:'inline-flex',alignItems:'center',gap:8,padding:'10px 18px',borderRadius:10,
            background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.15)',
            color:'#fff',textDecoration:'none',fontSize:13,fontWeight:600}}>
          ↗ Open in Browser
        </a>
      </div>
      <style>{'@keyframes _spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  )
}

// ── Main Player ────────────────────────────────────────────────────────────
export default function PlayerPage({ params, navigate, goBack }) {
  const { link, title='', type, kind, episodeTitle='', episodeIdx=0,
          providerValue, directLinks, allEpisodes=[], seasonTitle='', image } = params
  const K = kind||type||'movie'

  const vRef = useRef(null), hRef = useRef(null)
  const pRef = useRef(null), hideT = useRef(null)

  const [streams,   setStreams]  = useState([])
  const [selIdx,    setSelIdx]   = useState(0)
  const [loading,   setLoading]  = useState(true)
  const [fErr,      setFErr]     = useState(null)
  const [vErr,      setVErr]     = useState(null)
  const [playing,   setPlaying]  = useState(false)
  const [prog,      setProg]     = useState(0)
  const [ct,        setCt]       = useState(0)
  const [dur,       setDur]      = useState(0)
  const [showUI,    setShowUI]   = useState(true)
  const [tapPlay,   setTapPlay]  = useState(false)
  const [epIdx,     setEpIdx]    = useState(episodeIdx)
  const [fs,        setFs]       = useState(false)

  const videoRef = useCallback(node => {
    if (!node) return
    vRef.current = node
    node.setAttribute('playsinline','')
    node.setAttribute('webkit-playsinline','')
    node.removeAttribute('crossorigin')
  }, [])

  // Fetch streams
  useEffect(() => {
    let done = false
    const sl = K==='movie' ? (directLinks?.[0]?.link||link) : link
    if (!sl) { setFErr('No stream link'); setLoading(false); return }
    setLoading(true); setFErr(null); setVErr(null); setStreams([]); setSelIdx(0)
    ;(async () => {
      try {
        const data = await getStream({ providerValue, link:sl, type:K })
        if (done) return
        const valid = (data||[]).filter(s=>s?.link)
        if (!valid.length) { setFErr('No streams found. Try a different title.'); return }
        setStreams(valid)
        setSelIdx(0)
      } catch(e) { if (!done) setFErr(e.message||'Failed to load streams.') }
      finally { if (!done) setLoading(false) }
    })()
    return () => { done = true }
  }, [link, K, providerValue])

  const cur = streams[selIdx] || null

  // If current stream is embed type → use EmbedPlayer
  const isEmbed = cur && (cur.type==='embed' || cur.link?.includes('vidsrc') || cur.link?.includes('autoembed') || cur.link?.includes('multiembed') || cur.link?.includes('pixeldrain.com/u/'))

  // Mount video stream
  useEffect(() => {
    if (!cur || isEmbed) return
    const v = vRef.current; if (!v) return
    setVErr(null); setProg(0); setCt(0); setDur(0); setPlaying(false); setTapPlay(false)
    if (hRef.current) { hRef.current.destroy(); hRef.current = null }

    const url = cur.link
    const isHLS = cur.type==='hls' || url.includes('.m3u8')
    const onFail = () => {
      if (selIdx < streams.length-1) { setVErr(`Server ${selIdx+1} failed, trying next…`); setTimeout(()=>setSelIdx(i=>i+1), 900) }
      else setFErr('All servers failed. Try a different title.')
    }

    if (isHLS && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength:120, enableWorker:true, startLevel:-1 })
      hls.loadSource(url); hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(()=>setTapPlay(true)))
      hls.on(Hls.Events.ERROR, (_,d) => { if (d.fatal) onFail() })
      hRef.current = hls
    } else if (isHLS && v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = url; v.load()
      v.addEventListener('loadedmetadata', () => v.play().catch(()=>setTapPlay(true)), {once:true})
      v.addEventListener('error', onFail, {once:true})
    } else {
      v.src = url; v.load()
      v.play().catch(()=>setTapPlay(true))
    }
    v.onerror = onFail
    return () => { if (hRef.current) { hRef.current.destroy(); hRef.current = null } }
  }, [cur, isEmbed, selIdx])

  useEffect(() => {
    const v = vRef.current; if (!v) return
    const onP=()=>{setPlaying(true);setTapPlay(false)}
    const onPa=()=>setPlaying(false)
    const onT=()=>{const c=v.currentTime,d=v.duration||0;setCt(c);setDur(d);setProg(d>0?c/d:0)}
    const onFS=()=>setFs(!!(document.fullscreenElement||document.webkitFullscreenElement))
    v.addEventListener('play',onP);v.addEventListener('pause',onPa);v.addEventListener('timeupdate',onT)
    document.addEventListener('fullscreenchange',onFS);document.addEventListener('webkitfullscreenchange',onFS)
    return()=>{v.removeEventListener('play',onP);v.removeEventListener('pause',onPa);v.removeEventListener('timeupdate',onT);document.removeEventListener('fullscreenchange',onFS);document.removeEventListener('webkitfullscreenchange',onFS)}
  }, [cur, isEmbed])

  const showReset=useCallback(()=>{setShowUI(true);clearTimeout(hideT.current);if(vRef.current&&!vRef.current.paused)hideT.current=setTimeout(()=>setShowUI(false),3500)},[])
  const togglePlay=useCallback(()=>{const v=vRef.current;if(!v)return;v.paused?v.play().catch(()=>setTapPlay(true)):v.pause();showReset()},[showReset])
  const seek=useCallback(e=>{const v=vRef.current;if(!v?.duration)return;const r=pRef.current?.getBoundingClientRect();if(!r)return;const x=e.touches?.[0]?.clientX??e.clientX;v.currentTime=Math.max(0,Math.min(1,(x-r.left)/r.width))*v.duration;showReset()},[showReset])
  const skip=useCallback(s=>{const v=vRef.current;if(!v)return;v.currentTime=Math.max(0,Math.min(v.duration||0,v.currentTime+s));showReset()},[showReset])
  const toggleFS=()=>{const el=document.getElementById('ws-player-wrap');if(!el)return;fs?(document.exitFullscreen||document.webkitExitFullscreen)?.call(document):(el.requestFullscreen||el.webkitRequestFullscreen)?.call(el)}
  const playEp=(ep,i)=>{setEpIdx(i);navigate('player',{...params,episodeTitle:ep.title||`Episode ${i+1}`,episodeIdx:i,link:ep.link})}
  const playNext=()=>{const ni=epIdx+1;if(ni<allEpisodes.length)playEp(allEpisodes[ni],ni)}

  const OVL = {position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.92)',zIndex:20}
  const back = goBack || (() => navigate('home'))

  // EMBED MODE
  if (!loading && !fErr && isEmbed && cur) {
    return <EmbedPlayer stream={cur} title={title} onBack={back} />
  }

  return (
    <div style={{background:'#000',minHeight:'100dvh',display:'flex',flexDirection:'column',fontFamily:"'DM Sans',sans-serif",color:'#fff'}}>
      <div id="ws-player-wrap" style={{position:'relative',background:'#000',width:'100%',aspectRatio:'16/9',flexShrink:0,overflow:'hidden'}}
        onMouseMove={showReset} onTouchStart={showReset} onClick={togglePlay}>

        <video ref={videoRef} poster={image||undefined}
          style={{width:'100%',height:'100%',display:'block',background:'#000',objectFit:'contain'}}/>

        {loading&&<div style={OVL}><div style={{textAlign:'center'}}><div style={{width:44,height:44,border:'3px solid rgba(255,255,255,.1)',borderTopColor:R,borderRadius:'50%',animation:'_sp .8s linear infinite',margin:'0 auto'}}/><p style={{color:'rgba(255,255,255,.5)',fontSize:13,marginTop:14}}>Finding streams…</p></div></div>}
        {fErr&&!loading&&<div style={OVL}><div style={{textAlign:'center',padding:'0 24px'}}><div style={{fontSize:48,marginBottom:16}}>⚠️</div><p style={{color:'#f87171',fontSize:14,lineHeight:1.6,marginBottom:20}}>{fErr}</p><button onClick={back} style={{background:R,color:'#fff',border:'none',borderRadius:10,padding:'10px 22px',fontSize:14,fontWeight:700,cursor:'pointer'}}>← Go Back</button></div></div>}
        {tapPlay&&!loading&&!fErr&&<div style={OVL} onClick={e=>{e.stopPropagation();vRef.current?.play().catch(()=>{})}}><div style={{textAlign:'center'}}><div style={{width:80,height:80,borderRadius:'50%',background:'rgba(0,0,0,.6)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px',border:'2px solid rgba(255,255,255,.3)'}}><svg viewBox="0 0 24 24" fill="currentColor" width={30} height={30}><path d="M8 5v14l11-7z"/></svg></div><p style={{fontSize:15,color:'#fff',fontWeight:600}}>Tap to Play</p></div></div>}
        {vErr&&!fErr&&<div style={{position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,.9)',color:'#fbbf24',fontSize:12,padding:'7px 18px',borderRadius:8,whiteSpace:'nowrap',zIndex:20,pointerEvents:'none'}}>{vErr}</div>}

        {/* Controls overlay */}
        <div style={{position:'absolute',inset:0,zIndex:10,display:'flex',flexDirection:'column',justifyContent:'space-between',
          background:showUI?'linear-gradient(to bottom,rgba(0,0,0,.7)0%,transparent 30%,transparent 65%,rgba(0,0,0,.85)100%)':'transparent',
          opacity:showUI?1:0,pointerEvents:showUI?'auto':'none',transition:'opacity .3s'}} onClick={e=>e.stopPropagation()}>
          <div style={{display:'flex',alignItems:'center',padding:'10px 12px 0',gap:8}}>
            <button style={IB} onClick={back}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width={20} height={20}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            </button>
            <span style={{flex:1,textAlign:'center',fontFamily:"'Bebas Neue',sans-serif",fontSize:17,letterSpacing:2}}>WELL<span style={{color:R}}>STREAMER</span></span>
            <button style={IB} onClick={toggleFS}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/></svg>
            </button>
          </div>
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:24}} onClick={e=>e.stopPropagation()}>
            <button style={{...IB,width:52,height:52}} onClick={()=>skip(-10)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={24} height={24}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
            </button>
            <button style={{...IB,width:68,height:68,borderRadius:'50%',background:'rgba(0,0,0,.55)',border:'2px solid rgba(255,255,255,.25)'}} onClick={togglePlay}>
              {playing
                ? <svg viewBox="0 0 24 24" fill="currentColor" width={30} height={30}><rect x={6} y={4} width={4} height={16}/><rect x={14} y={4} width={4} height={16}/></svg>
                : <svg viewBox="0 0 24 24" fill="currentColor" width={30} height={30}><path d="M8 5v14l11-7z"/></svg>}
            </button>
            <button style={{...IB,width:52,height:52}} onClick={()=>skip(10)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={24} height={24}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            </button>
          </div>
          <div style={{padding:'0 12px 10px'}} onClick={e=>e.stopPropagation()}>
            <div ref={pRef} style={{height:28,display:'flex',alignItems:'center',cursor:'pointer',touchAction:'none'}}
              onClick={seek} onTouchStart={seek} onTouchMove={seek}>
              <div style={{position:'relative',width:'100%',height:4,background:'rgba(255,255,255,.2)',borderRadius:4}}>
                <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${prog*100}%`,background:R,borderRadius:4}}/>
                <div style={{position:'absolute',top:'50%',left:`${prog*100}%`,width:14,height:14,borderRadius:'50%',background:'#fff',transform:'translate(-50%,-50%)'}}/>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:12,color:'rgba(255,255,255,.7)'}}>{fmt(ct)} / {fmt(dur)}</span>
              {K==='series'&&epIdx<allEpisodes.length-1&&<button onClick={playNext} style={{...IB,fontSize:12,gap:4,color:'rgba(255,255,255,.8)'}}>Next Ep →</button>}
            </div>
          </div>
        </div>
      </div>

      {/* Server selector + info below video */}
      {!loading && !fErr && (
        <div style={{background:'#0f0f0f',flex:1,padding:'14px 16px 40px',borderTop:'1px solid rgba(255,255,255,.05)'}}>
          <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:1,marginBottom:4}}>{title}</h2>
          {(episodeTitle||seasonTitle) && <p style={{color:'rgba(255,255,255,.4)',fontSize:13,marginBottom:12}}>{episodeTitle||seasonTitle}</p>}
          {vErr && <p style={{color:'#fbbf24',fontSize:12,marginBottom:10}}>{vErr}</p>}

          {streams.length > 1 && (
            <div style={{marginBottom:16}}>
              <p style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'rgba(255,255,255,.3)',marginBottom:8}}>Servers</p>
              <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                {streams.map((s,i) => (
                  <button key={i} onClick={()=>{setSelIdx(i);setVErr(null);setFErr(null)}} style={{
                    padding:'8px 14px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',
                    border:`2px solid ${selIdx===i?R:'rgba(255,255,255,.15)'}`,
                    background:selIdx===i?`${R}22`:'transparent',
                    color:selIdx===i?R:'rgba(255,255,255,.6)',
                    WebkitTapHighlightColor:'transparent'}}>
                    {s.server||`Server ${i+1}`}
                    {s.type==='embed'&&' 🌐'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Episode list for series */}
          {K==='series'&&allEpisodes.length>0&&(
            <div>
              <p style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'rgba(255,255,255,.3)',marginBottom:8}}>Episodes</p>
              <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:'40vh',overflowY:'auto'}}>
                {allEpisodes.map((ep,i)=>{const cur=i===epIdx;return(
                  <div key={ep.link||i} onClick={()=>playEp(ep,i)} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 14px',borderRadius:10,
                    background:cur?`${R}18`:'rgba(255,255,255,.04)',border:`1px solid ${cur?R+'55':'rgba(255,255,255,.06)'}`,cursor:'pointer'}}>
                    <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:cur?R:'rgba(255,255,255,.3)',minWidth:26}}>{String(i+1).padStart(2,'0')}</span>
                    <span style={{flex:1,fontSize:13,color:cur?'#fff':'rgba(255,255,255,.65)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:cur?600:400}}>{ep.title||`Episode ${i+1}`}</span>
                    {cur&&<span style={{fontSize:10,color:R,fontWeight:700}}>▶</span>}
                  </div>
                )})}
              </div>
            </div>
          )}
        </div>
      )}
      <style>{'@keyframes _sp{to{transform:rotate(360deg)}}'}</style>
    </div>
  )
}
