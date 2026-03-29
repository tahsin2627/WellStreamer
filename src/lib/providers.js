import { cacheStorage } from './storage.js'

const MANIFEST_URL = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/manifest.json'
const MODULES_BASE = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/dist'
const BASE_URL_JSON = 'https://himanshu8443.github.io/providers/modflix.json'

const PROXIES = [
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://thingproxy.freeboard.io/fetch/${u}`,
]

const moduleCodeCache = new Map()

async function fetchWithFallback(url, options = {}) {
  const { signal, headers = {}, method = 'GET', body } = options
  const attempts = [
    () => fetch(url, { method, headers, body, signal, mode: 'cors' }),
    ...PROXIES.map(p => () => fetch(p(url), { method, headers, body, signal })),
  ]
  let lastErr
  for (const attempt of attempts) {
    try {
      const res = await attempt()
      if (res.ok) return res
    } catch (e) {
      lastErr = e
      if (signal?.aborted) throw e
    }
  }
  throw lastErr || new Error(`Failed: ${url}`)
}

async function fetchText(url, opts) { return (await fetchWithFallback(url, opts)).text() }
async function fetchJSON(url, opts) { return (await fetchWithFallback(url, opts)).json() }

export async function getBaseUrl(providerValue) {
  const cached = cacheStorage.getValid(`baseUrl_${providerValue}`)
  if (cached) return cached
  try {
    const data = await fetchJSON(BASE_URL_JSON)
    for (const [k, v] of Object.entries(data)) {
      if (v?.url) cacheStorage.set(`baseUrl_${k}`, v.url, 3_600_000)
    }
    return data[providerValue]?.url || ''
  } catch { return '' }
}

export async function fetchManifest() {
  const cached = cacheStorage.getValid('manifest')
  if (cached) return cached
  const data = await fetchJSON(MANIFEST_URL)
  if (!Array.isArray(data)) throw new Error('Invalid manifest')
  cacheStorage.set('manifest', data, 3_600_000)
  return data
}

async function getModuleCode(providerValue, moduleName) {
  const key = `${providerValue}/${moduleName}`
  if (moduleCodeCache.has(key)) return moduleCodeCache.get(key)
  const code = await fetchText(`${MODULES_BASE}/${providerValue}/${moduleName}.js`)
  moduleCodeCache.set(key, code)
  return code
}

function runModule(code) {
  const mod = { exports: {} }
  try {
    const fn = new Function('exports','module','console','Promise','Object','setTimeout','clearTimeout','setInterval','clearInterval',
      `"use strict";\n${code}\nreturn module.exports&&Object.keys(module.exports).length?module.exports:exports;`)
    return fn(mod.exports,mod,console,Promise,Object,setTimeout,clearTimeout,setInterval,clearInterval)||mod.exports
  } catch(e) { console.warn('Module exec:',e.message); return mod.exports }
}

function makeAxios() {
  const request = async (urlOrCfg, cfg={}) => {
    const isStr = typeof urlOrCfg==='string'
    const url    = isStr?urlOrCfg:urlOrCfg.url
    const method = ((isStr?cfg.method:urlOrCfg.method)||'GET').toUpperCase()
    const headers= isStr?(cfg.headers||{}):(urlOrCfg.headers||{})
    const data   = isStr?cfg.data:urlOrCfg.data
    const signal = isStr?cfg.signal:urlOrCfg.signal
    const params = isStr?cfg.params:urlOrCfg.params
    let finalUrl = url
    if(params){ const qs=new URLSearchParams(params).toString(); finalUrl=`${url}${url.includes('?')?'&':'?'}${qs}` }
    const body = data&&typeof data!=='string'?JSON.stringify(data):data
    const res = await fetchWithFallback(finalUrl,{method,headers,body,signal})
    const text = await res.text()
    let respData; try{respData=JSON.parse(text)}catch{respData=text}
    return {data:respData,status:res.status,statusText:res.statusText,headers:Object.fromEntries(res.headers.entries())}
  }
  const ax = (u,c)=>request(u,c)
  ax.get    = (u,c)=>request(u,{...c,method:'GET'})
  ax.post   = (u,d,c)=>request(u,{...c,method:'POST',data:d})
  ax.put    = (u,d,c)=>request(u,{...c,method:'PUT',data:d})
  ax.delete = (u,c)=>request(u,{...c,method:'DELETE'})
  ax.create = ()=>makeAxios()
  ax.defaults={headers:{common:{}}}
  ax.interceptors={request:{use:()=>{},eject:()=>{}},response:{use:()=>{},eject:()=>{}}}
  return ax
}

function makeCheerio() {
  return {
    load: (html) => {
      try {
        const doc = new DOMParser().parseFromString(html,'text/html')
        const wrap = (nodes) => {
          const o={_n:nodes,length:nodes.length}
          o.text   =()=>nodes.map(n=>n.textContent).join('')
          o.html   =()=>nodes.map(n=>n.innerHTML).join('')
          o.attr   =(a)=>nodes[0]?.getAttribute(a)||''
          o.val    =()=>nodes[0]?.value||''
          o.first  =()=>wrap(nodes.slice(0,1))
          o.last   =()=>wrap(nodes.slice(-1))
          o.eq     =(i)=>wrap(nodes.slice(i,i+1))
          o.find   =(s)=>wrap(nodes.flatMap(n=>[...n.querySelectorAll(s)]))
          o.filter =(s)=>wrap(nodes.filter(n=>n.matches?.(s)))
          o.children=(s)=>wrap(nodes.flatMap(n=>[...(s?n.querySelectorAll(':scope > '+s):n.children)]))
          o.parent =()=>wrap(nodes.map(n=>n.parentElement).filter(Boolean))
          o.next   =()=>wrap(nodes.map(n=>n.nextElementSibling).filter(Boolean))
          o.prev   =()=>wrap(nodes.map(n=>n.previousElementSibling).filter(Boolean))
          o.each   =(fn)=>{nodes.forEach((n,i)=>fn(i,n));return o}
          o.map    =(fn)=>nodes.map((n,i)=>fn(i,n))
          o.get    =(i)=>i==null?nodes:nodes[i]
          o.toArray=()=>nodes
          o.hasClass=(c)=>nodes[0]?.classList.contains(c)||false
          o.addClass=()=>o; o.remove=()=>{nodes.forEach(n=>n.remove());return o}
          return o
        }
        const $=(s)=>wrap([...doc.querySelectorAll(s)])
        $.html=()=>doc.documentElement.outerHTML
        $.text=()=>doc.body?.textContent||''
        $.root=()=>({find:(s)=>$(s)})
        return $
      } catch {
        const n=()=>n; n.text=()=>''; n.html=()=>''; n.attr=()=>''; n.each=()=>n
        n.find=()=>n; n.first=()=>n; n.eq=()=>n; n.map=()=>({get:()=>[]}); n.length=0; n.get=()=>[]
        return n
      }
    }
  }
}

function makeContext() {
  return {
    axios: makeAxios(),
    getBaseUrl,
    Crypto: { randomUUID:()=>crypto.randomUUID(), getRandomValues:(a)=>crypto.getRandomValues(a) },
    commonHeaders: { 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    cheerio: makeCheerio(),
    extractors: {
      hubcloudExtracter: async()=>[],
      gofileExtracter:   async()=>({link:'',token:''}),
      superVideoExtractor:async()=>'',
      gdFlixExtracter:   async()=>[],
    },
  }
}

export async function getCatalog(providerValue) {
  const mod = runModule(await getModuleCode(providerValue,'catalog'))
  return { catalog:mod.catalog||[], genres:mod.genres||[] }
}
export async function getPosts({providerValue,filter,page,signal}) {
  const mod = runModule(await getModuleCode(providerValue,'posts'))
  if(typeof mod.getPosts!=='function') throw new Error('No getPosts')
  return mod.getPosts({filter,page,providerValue,signal,providerContext:makeContext()})
}
export async function searchPosts({providerValue,searchQuery,page,signal}) {
  const mod = runModule(await getModuleCode(providerValue,'posts'))
  if(typeof mod.getSearchPosts!=='function') throw new Error('No getSearchPosts')
  return mod.getSearchPosts({searchQuery,page,providerValue,signal,providerContext:makeContext()})
}
export async function getMeta({providerValue,link}) {
  const mod = runModule(await getModuleCode(providerValue,'meta'))
  if(typeof mod.getMeta!=='function') throw new Error('No getMeta')
  return mod.getMeta({link,provider:providerValue,providerContext:makeContext()})
}
export async function getStream({providerValue,link,type,signal}) {
  const mod = runModule(await getModuleCode(providerValue,'stream'))
  if(typeof mod.getStream!=='function') throw new Error('No getStream')
  return mod.getStream({link,type,signal,providerContext:makeContext()})
}
export async function getEpisodes({providerValue,url}) {
  try {
    const mod = runModule(await getModuleCode(providerValue,'episodes'))
    if(typeof mod.getEpisodes!=='function') return []
    return mod.getEpisodes({url,providerContext:makeContext()})
  } catch { return [] }
}
export async function installProvider(providerValue) {
  await Promise.all(['catalog','posts','meta','stream'].map(m=>getModuleCode(providerValue,m)))
}
