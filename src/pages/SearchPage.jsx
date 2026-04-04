// src/pages/SearchPage.jsx — Search across all 3 providers
import { useState, useEffect, useRef, useCallback } from 'react'
import { searchPosts } from '../lib/providers.js'

const BADGE = { drive:'#e50914', autoEmbed:'#1a6fff', myflixbd:'#16a34a' }

function Card({ item, onClick }) {
  const [err, setErr] = useState(false)
  const badge = BADGE[item._pv] || '#666'
  return (
    <div onClick={() => onClick(item)} style={{cursor:'pointer',borderRadius:10,overflow:'hidden',
      background:'#1a1a1a',border:'1px solid rgba(255,255,255,.06)',transition:'transform .2s'}}
      onMouseEnter={e=>e.currentTarget.style.transform='scale(1.04)'}
      onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
      <div style={{aspectRatio:'2/3',background:'#111',position:'relative',overflow:'hidden'}}>
        {item.image && !err
          ? <img src={item.image} alt={item.title} onError={()=>setErr(true)}
              style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
          : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,color:'rgba(255,255,255,.15)'}}>🎬</div>}
        <div style={{position:'absolute',bottom:4,left:4,background:badge,color:'#fff',
          fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:4,letterSpacing:.5,textTransform:'uppercase'}}>
          {item._pname}
        </div>
      </div>
      <div style={{padding:'7px 8px'}}>
        <p style={{fontSize:12,fontWeight:500,color:'rgba(255,255,255,.85)',
          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',lineHeight:1.3}}>
          {item.title}
        </p>
      </div>
    </div>
  )
}

const ALL_PROVIDERS = [
  { value:'drive',     display_name:'MoviesDrive' },
  { value:'autoEmbed', display_name:'MultiStream' },
  { value:'myflixbd',  display_name:'MyFlixBD'   },
]

export default function SearchPage({ navigate, installed }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [status,  setStatus]  = useState('')
  const [error,   setError]   = useState(null)
  const [selProv, setSelProv] = useState('all')
  const abortRef = useRef(null)
  const inputRef = useRef(null)

  const providers = installed?.length ? installed : ALL_PROVIDERS

  const doSearch = useCallback(async (q, pv) => {
    if (q.trim().length < 2) { setResults([]); return }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true); setError(null); setResults([]); setStatus('Searching…')

    try {
      const toSearch = pv === 'all' ? providers : providers.filter(p => p.value === pv)
      const allResults = []

      for (const prov of toSearch) {
        if (ctrl.signal.aborted) break
        setStatus(`Searching ${prov.display_name}…`)
        try {
          const data = await searchPosts({ providerValue: prov.value, searchQuery: q.trim(), page: 1, signal: ctrl.signal })
          if (!ctrl.signal.aborted && data?.length) {
            const tagged = data.map(item => ({ ...item, _pv: prov.value, _pname: prov.display_name }))
            allResults.push(...tagged)
            setResults([...allResults])
          }
        } catch (e) { if (!ctrl.signal.aborted) console.warn(prov.value, e.message) }
      }

      if (!ctrl.signal.aborted) {
        setStatus(allResults.length ? '' : `No results for "${q}"`)
      }
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e.message)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [providers])

  useEffect(() => {
    const t = setTimeout(() => doSearch(query, selProv), 600)
    return () => clearTimeout(t)
  }, [query, selProv, doSearch])

  const goInfo = (item) => {
    navigate('info', { item, providerValue: item._pv || providers[0]?.value })
  }

  const SUGGESTIONS = ['Avatar', 'KGF', 'Pathaan', 'Chokro', 'RRR', 'Pushpa', 'Squid Game']

  return (
    <div style={{background:'#000',minHeight:'100vh',paddingBottom:80}}>
      {/* Search bar */}
      <div style={{padding:'16px 16px 10px',position:'sticky',top:0,background:'rgba(0,0,0,.95)',backdropFilter:'blur(12px)',zIndex:10}}>
        <div style={{position:'relative'}}>
          <span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',
            color:loading?'#e50914':'rgba(255,255,255,.3)',pointerEvents:'none',display:'flex',transition:'color .3s'}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18}>
              <circle cx={11} cy={11} r={8}/><path d="M21 21l-4.35-4.35"/>
            </svg>
          </span>
          <input ref={inputRef} value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="Search all providers…" autoFocus
            style={{width:'100%',padding:'13px 40px 13px 44px',borderRadius:12,
              background:'rgba(255,255,255,.07)',border:`1.5px solid ${query?'#e50914':'rgba(255,255,255,.1)'}`,
              color:'#fff',fontSize:15,fontFamily:"'DM Sans',sans-serif",outline:'none',
              boxSizing:'border-box',transition:'border-color .2s'}}/>
          {query && <button onClick={()=>{setQuery('');setResults([]);inputRef.current?.focus()}}
            style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',
              background:'none',border:'none',color:'rgba(255,255,255,.4)',cursor:'pointer',fontSize:18,padding:4}}>✕</button>}
        </div>

        {/* Provider filter pills */}
        <div style={{display:'flex',gap:6,marginTop:10,overflowX:'auto',paddingBottom:4}}>
          {[{value:'all',display_name:'All Providers'},...providers].map(p => (
            <button key={p.value} onClick={()=>setSelProv(p.value)} style={{
              flexShrink:0,padding:'5px 12px',borderRadius:20,fontSize:11,fontWeight:700,
              border:`1.5px solid ${selProv===p.value?(BADGE[p.value]||'#fff'):'rgba(255,255,255,.12)'}`,
              background:selProv===p.value?`${BADGE[p.value]||'#333'}22`:'transparent',
              color:selProv===p.value?(BADGE[p.value]||'#fff'):'rgba(255,255,255,.5)',
              cursor:'pointer',letterSpacing:.5,textTransform:'uppercase',WebkitTapHighlightColor:'transparent'}}>
              {p.display_name}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,padding:'32px'}}>
          <div style={{width:20,height:20,border:'2.5px solid rgba(255,255,255,.1)',borderTopColor:'#e50914',borderRadius:'50%',animation:'_sp .7s linear infinite'}}/>
          <span style={{color:'rgba(255,255,255,.45)',fontSize:14}}>{status}</span>
          <style>{'@keyframes _sp{to{transform:rotate(360deg)}}'}</style>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{textAlign:'center',padding:'40px 24px'}}>
          <p style={{color:'#f87171',fontSize:14,marginBottom:16}}>⚠️ {error}</p>
          <button onClick={()=>doSearch(query,selProv)} style={{background:'#e50914',color:'#fff',border:'none',borderRadius:10,padding:'10px 22px',fontSize:14,cursor:'pointer'}}>Retry</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && query.trim().length < 2 && (
        <div style={{textAlign:'center',padding:'50px 24px',color:'rgba(255,255,255,.3)'}}>
          <div style={{fontSize:52,marginBottom:14}}>🔍</div>
          <p style={{fontSize:16,fontWeight:600,marginBottom:6}}>Search everything</p>
          <p style={{fontSize:13,marginBottom:24}}>MoviesDrive · MultiStream · MyFlixBD</p>
          <div style={{display:'flex',flexWrap:'wrap',gap:8,justifyContent:'center'}}>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={()=>setQuery(s)} style={{
                background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',
                color:'rgba(255,255,255,.6)',borderRadius:20,padding:'6px 14px',fontSize:13,cursor:'pointer'}}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No results */}
      {!loading && !error && query.trim().length >= 2 && results.length === 0 && status && (
        <div style={{textAlign:'center',padding:'60px 24px',color:'rgba(255,255,255,.3)'}}>
          <div style={{fontSize:48,marginBottom:12}}>😶</div>
          <p style={{fontSize:15,fontWeight:500}}>{status}</p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div style={{padding:'4px 16px 0'}}>
          <p style={{fontSize:12,color:'rgba(255,255,255,.3)',marginBottom:12}}>
            {results.length} result{results.length!==1?'s':''} for "{query}"
          </p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
            {results.map((item,i) => <Card key={item.link||i} item={item} onClick={goInfo}/>)}
          </div>
        </div>
      )}
    </div>
  )
}
