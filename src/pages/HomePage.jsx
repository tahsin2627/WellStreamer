// src/pages/HomePage.jsx — provider tabs + content rows
import { useState, useEffect, useRef } from 'react'
import { getCatalog, getPosts } from '../lib/providers.js'
import { historyStorage } from '../lib/storage.js'

const PCOLOR = { drive:'#e50914', autoEmbed:'#1a6fff', myflixbd:'#16a34a' }

function PosterCard({ item, onClick }) {
  const [err, setErr] = useState(false)
  return (
    <div onClick={() => onClick(item)} style={{flexShrink:0,width:110,cursor:'pointer',borderRadius:10,
      overflow:'hidden',background:'#1a1a1a',transition:'transform .2s',border:'1px solid rgba(255,255,255,.06)'}}
      onMouseEnter={e=>e.currentTarget.style.transform='scale(1.05)'}
      onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
      <div style={{aspectRatio:'2/3',background:'#222',overflow:'hidden'}}>
        {item.image&&!err
          ?<img src={item.image} alt={item.title} onError={()=>setErr(true)} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
          :<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28}}>🎬</div>}
      </div>
      <div style={{padding:'6px 8px'}}>
        <p style={{fontSize:11,fontWeight:500,color:'rgba(255,255,255,.8)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',lineHeight:1.3}}>{item.title}</p>
      </div>
    </div>
  )
}

function SkeletonRow() {
  return (
    <div style={{marginBottom:28}}>
      <div style={{height:20,width:160,borderRadius:6,marginBottom:12,marginLeft:16,
        background:'linear-gradient(90deg,#1a1a1a 25%,#2a2a2a 50%,#1a1a1a 75%)',backgroundSize:'200% 100%',animation:'_sh 1.5s infinite'}}/>
      <div style={{display:'flex',gap:10,paddingLeft:16,overflowX:'auto',paddingBottom:6}}>
        {[...Array(5)].map((_,i)=>(
          <div key={i} style={{flexShrink:0,width:110,borderRadius:10}}>
            <div style={{aspectRatio:'2/3',borderRadius:10,
              background:'linear-gradient(90deg,#1a1a1a 25%,#2a2a2a 50%,#1a1a1a 75%)',backgroundSize:'200% 100%',animation:'_sh 1.5s infinite'}}/>
          </div>
        ))}
      </div>
    </div>
  )
}

const PROVIDERS = [
  { value:'drive',     display_name:'MoviesDrive', emoji:'🎬' },
  { value:'autoEmbed', display_name:'MultiStream', emoji:'🌐' },
  { value:'myflixbd',  display_name:'MyFlixBD',   emoji:'🇧🇩' },
]

export default function HomePage({ navigate, installed, user }) {
  const [selProv, setSelProv]     = useState(PROVIDERS[0])
  const [rows,    setRows]        = useState([])
  const [hero,    setHero]        = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error,   setError]       = useState(null)
  const abortRef = useRef(null)

  useEffect(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true); setRows([]); setHero(null); setError(null)

    ;(async () => {
      try {
        const { catalog } = await getCatalog(selProv.value)
        if (ctrl.signal.aborted) return
        const settled = await Promise.allSettled(
          catalog.slice(0,5).map(cat =>
            getPosts({ providerValue:selProv.value, filter:cat.filter, page:1, signal:ctrl.signal })
              .then(posts => ({ title:cat.title, posts:posts||[] }))
          )
        )
        if (ctrl.signal.aborted) return
        const filled = settled.filter(r=>r.status==='fulfilled'&&r.value.posts.length>0).map(r=>r.value)
        setRows(filled)
        const pool = filled.flatMap(r=>r.posts).filter(p=>p.image)
        if (pool.length) setHero(pool[Math.floor(Math.random()*Math.min(pool.length,8))])
      } catch(e) {
        if (!ctrl.signal.aborted) setError(e.message)
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    })()
    return () => ctrl.abort()
  }, [selProv])

  const goInfo = item => navigate('info', { item, providerValue:selProv.value })
  const history = user ? historyStorage.get(user.username).slice(0,10) : []
  const accent = PCOLOR[selProv.value] || '#e50914'

  return (
    <div style={{background:'#000',minHeight:'100vh',paddingBottom:80}}>
      <style>{`
        @keyframes _sh { 0%,100%{background-position:200% 0}50%{background-position:-200% 0} }
        ::-webkit-scrollbar { display:none }
      `}</style>

      {/* Hero */}
      <div style={{position:'relative',height:300,overflow:'hidden',marginBottom:0}}>
        {hero?.image&&<img src={hero.image} alt="" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:.35,filter:'blur(1px)'}}/>}
        <div style={{position:'absolute',inset:0,background:'linear-gradient(to top,#000 0%,rgba(0,0,0,.3)60%,transparent 100%)'}}/>
        <div style={{position:'absolute',inset:0,background:'linear-gradient(to right,rgba(0,0,0,.75)0%,transparent 60%)'}}/>
        <div style={{position:'relative',zIndex:2,height:'100%',display:'flex',flexDirection:'column',justifyContent:'flex-end',padding:'0 16px 20px'}}>
          {hero&&<>
            <h1 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'clamp(24px,5vw,42px)',letterSpacing:1.5,lineHeight:1.05,marginBottom:12,maxWidth:280}}>{hero.title}</h1>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>goInfo(hero)} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 22px',borderRadius:8,background:'#fff',color:'#000',border:'none',fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:700,cursor:'pointer'}}>▶ PLAY</button>
              <button onClick={()=>goInfo(hero)} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 18px',borderRadius:8,background:'rgba(255,255,255,.18)',color:'#fff',border:'1px solid rgba(255,255,255,.3)',fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:600,cursor:'pointer',backdropFilter:'blur(8px)'}}>ⓘ Info</button>
            </div>
          </>}
          {!hero&&!loading&&<p style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:42,letterSpacing:2,opacity:.08}}>WELLSTREAMER</p>}
        </div>
      </div>

      {/* Provider selector */}
      <div style={{padding:'14px 16px 0',position:'sticky',top:0,background:'rgba(0,0,0,.92)',backdropFilter:'blur(12px)',zIndex:10,borderBottom:'1px solid rgba(255,255,255,.05)'}}>
        <div style={{display:'flex',gap:8,paddingBottom:12,overflowX:'auto'}}>
          {PROVIDERS.map(p => (
            <button key={p.value} onClick={()=>setSelProv(p)} style={{
              flexShrink:0,display:'flex',alignItems:'center',gap:6,
              padding:'8px 16px',borderRadius:22,fontSize:13,fontWeight:700,
              border:`2px solid ${selProv.value===p.value?PCOLOR[p.value]:'rgba(255,255,255,.12)'}`,
              background:selProv.value===p.value?`${PCOLOR[p.value]}22`:'transparent',
              color:selProv.value===p.value?PCOLOR[p.value]:'rgba(255,255,255,.55)',
              cursor:'pointer',WebkitTapHighlightColor:'transparent',transition:'all .2s'}}>
              <span>{p.emoji}</span>{p.display_name}
            </button>
          ))}
        </div>
      </div>

      {/* Continue watching */}
      {history.length>0&&(
        <div style={{marginBottom:28,marginTop:16}}>
          <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:19,letterSpacing:1,color:'rgba(255,255,255,.85)',marginBottom:12,paddingLeft:16}}>Continue Watching</h2>
          <div style={{display:'flex',gap:10,overflowX:'auto',paddingLeft:16,paddingRight:16,paddingBottom:6,scrollbarWidth:'none'}}>
            {history.map((p,i)=><PosterCard key={p.link||i} item={p} onClick={goInfo}/>)}
          </div>
        </div>
      )}

      {/* Skeleton */}
      {loading&&<>{[1,2,3].map(i=><SkeletonRow key={i}/>)}</>}

      {/* Error */}
      {error&&!loading&&(
        <div style={{textAlign:'center',padding:'40px 24px',color:'rgba(255,255,255,.4)'}}>
          <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
          <p style={{fontSize:14,marginBottom:16}}>{error}</p>
          <button onClick={()=>setSelProv({...selProv})} style={{background:accent,color:'#fff',border:'none',borderRadius:10,padding:'10px 22px',fontSize:14,cursor:'pointer',fontWeight:700}}>Retry</button>
        </div>
      )}

      {/* Content rows */}
      {!loading&&rows.map(row=>(
        <div key={row.title} style={{marginBottom:28,marginTop:row===rows[0]?16:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,paddingLeft:16}}>
            <div style={{width:3,height:18,borderRadius:2,background:accent}}/>
            <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:19,letterSpacing:1,color:'rgba(255,255,255,.9)'}}>{row.title}</h2>
          </div>
          <div style={{display:'flex',gap:10,overflowX:'auto',paddingLeft:16,paddingRight:16,paddingBottom:6,scrollbarWidth:'none'}}>
            {row.posts.map((p,i)=><PosterCard key={p.link||i} item={p} onClick={goInfo}/>)}
          </div>
        </div>
      ))}

      {!loading&&!error&&rows.length===0&&(
        <div style={{textAlign:'center',padding:'60px 24px',color:'rgba(255,255,255,.3)'}}>
          <div style={{fontSize:48,marginBottom:12}}>📭</div>
          <p style={{fontSize:15,marginBottom:6}}>No content from {selProv.display_name}</p>
          <p style={{fontSize:13}}>Try another provider above</p>
        </div>
      )}
    </div>
  )
}
