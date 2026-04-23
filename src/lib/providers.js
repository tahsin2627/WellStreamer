import { cacheStorage } from './storage.js'

const MANIFEST_URL  = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/manifest.json'
const MODULES_BASE  = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/dist'
const BASE_URL_JSON = 'https://himanshu8443.github.io/providers/modflix.json'
const DRIVE_BASE    = 'https://new2.moviesdrives.my/'   // hardcoded — modflix has wrong URL

// CORS proxies — tried in order
const PROXIES = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
]

const moduleCache = new Map()

// ── fetch helpers ─────────────────────────────────────────────────────────
async function tryFetch(url, opts = {}) {
  try {
    const r = await fetch(url, { ...opts, mode: 'cors' })
    if (r.ok) return r
  } catch (_) {}
  return null
}

async function proxyFetch(url, opts = {}) {
  for (const p of PROXIES) {
    try {
      const r = await fetch(p(url), opts)
      if (r.ok) return r
    } catch (_) {
      if (opts.signal?.aborted) throw new Error('aborted')
    }
  }
  throw new Error(`All proxies failed for: ${url}`)
}

// Direct first, then proxy fallback
async function smartFetch(url, opts = {}) {
  const d = await tryFetch(url, opts)
  if (d) return d
  return proxyFetch(url, opts)
}

const getText = async (url, o) => (await smartFetch(url, o)).text()
const getJSON = async (url, o) => (await smartFetch(url, o)).json()

// ── Base URL ──────────────────────────────────────────────────────────────
export async function getBaseUrl(key) {
  const c = cacheStorage.getValid(`bu_${key}`)
  if (c) return c
  try {
    const d = await getJSON(BASE_URL_JSON)
    Object.entries(d).forEach(([k, v]) => {
      if (v?.url) cacheStorage.set(`bu_${k}`, v.url, 3_600_000)
    })
    return d[key]?.url || ''
  } catch { return '' }
}

// ── Manifest ──────────────────────────────────────────────────────────────
export async function fetchManifest() {
  const c = cacheStorage.getValid('manifest')
  if (c) return c
  const d = await getJSON(MANIFEST_URL)
  if (!Array.isArray(d)) throw new Error('bad manifest')
  cacheStorage.set('manifest', d, 3_600_000)
  return d
}

// ── Module loader ─────────────────────────────────────────────────────────
async function loadModule(pv, name) {
  const k = `${pv}/${name}`
  if (moduleCache.has(k)) return moduleCache.get(k)
  const code = await getText(`${MODULES_BASE}/${pv}/${name}.js`)
  moduleCache.set(k, code)
  return code
}

// ── Module runner — injects process + patched fetch ───────────────────────
function runModule(code) {
  const mod = { exports: {} }
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'exports','module','console','Promise','Object',
      'setTimeout','clearTimeout','setInterval','clearInterval',
      'process','fetch',
      `"use strict";\n${code}\nreturn module.exports&&Object.keys(module.exports).length?module.exports:exports;`
    )
    return fn(
      mod.exports, mod, console, Promise, Object,
      setTimeout, clearTimeout, setInterval, clearInterval,
      { env: { CORS_PRXY: '', NODE_ENV: 'production' } },
      (u, o = {}) => smartFetch(u, o)
    ) || mod.exports
  } catch (e) {
    console.warn('[runModule]', e.message)
    return mod.exports
  }
}

// ── cheerio shim ──────────────────────────────────────────────────────────
function cheerioLoad(html) {
  try {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')

    function wrap(arr) {
      arr = Array.isArray(arr) ? arr : Array.from(arr || [])
      const o = {
        _nodes: arr, length: arr.length,
        text:     () => arr.map(n => n.textContent || '').join(''),
        html:     () => arr.map(n => n.innerHTML  || '').join(''),
        attr:     a  => arr[0]?.getAttribute?.(a) ?? '',
        val:      () => arr[0]?.value ?? '',
        first:    () => wrap(arr.slice(0,1)),
        last:     () => wrap(arr.slice(-1)),
        eq:       i  => wrap(arr.slice(i, i+1)),
        get:      i  => i == null ? arr : arr[i],
        toArray:  () => arr,
        each:     fn => { arr.forEach((n,i) => fn(i,n)); return o },
        map:      fn => arr.map((n,i) => fn(i,n)),
        find:     s  => { try { return wrap(arr.flatMap(n => [...(n.querySelectorAll?.(s)||[])])) } catch { return wrap([]) } },
        filter:   fn => typeof fn==='function' ? wrap(arr.filter((n,i)=>fn(i,n))) : wrap(arr.filter(n=>{ try{return n.matches?.(fn)}catch{return false} })),
        not:      s  => wrap(arr.filter(n=>{ try{return !n.matches?.(s)}catch{return true} })),
        parent:   () => wrap(arr.map(n=>n.parentElement).filter(Boolean)),
        parents:  s  => { const r=[]; arr.forEach(n=>{ let p=n.parentElement; while(p){if(!s||p.matches?.(s))r.push(p); p=p.parentElement} }); return wrap(r) },
        children: s  => wrap(arr.flatMap(n=>[...(s?n.querySelectorAll?.(':scope > '+s)||[]:n.children||[])])),
        next:     () => wrap(arr.map(n=>n.nextElementSibling).filter(Boolean)),
        prev:     () => wrap(arr.map(n=>n.previousElementSibling).filter(Boolean)),
        closest:  s  => wrap(arr.map(n=>{ try{return n.closest?.(s)}catch{return null} }).filter(Boolean)),
        hasClass: c  => !!arr[0]?.classList?.contains(c),
        is:       s  => arr.some(n=>{ try{return n.matches?.(s)}catch{return false} }),
        addClass: ()  => o, removeClass: () => o,
        remove:   ()  => { arr.forEach(n=>n.remove()); return o },
        prop:     p  => arr[0]?.[p],
        data:     k  => arr[0]?.dataset?.[k],
      }
      return o
    }

    function $(sel) {
      if (!sel) return wrap([])
      if (typeof sel !== 'string') return wrap([sel].flat().filter(Boolean))
      // :contains() polyfill — browser doesn't support it in querySelectorAll
      if (sel.includes(':contains(')) {
        const m = sel.match(/^([\w\s.,#\[\]-]*):contains\(["']([^"']+)["']\)([\s\S]*)$/)
        if (m) {
          const [, base, text, after] = m
          const baseEls = base.trim() ? [...doc.querySelectorAll(base.trim())] : [...doc.querySelectorAll('*')]
          const matched = baseEls.filter(el => el.textContent?.includes(text))
          return after.trim() ? wrap(matched.flatMap(el=>[...el.querySelectorAll(after.trim())])) : wrap(matched)
        }
      }
      try { return wrap([...doc.querySelectorAll(sel)]) } catch { return wrap([]) }
    }

    $.html = () => doc.documentElement.outerHTML
    $.text = () => doc.body?.textContent || ''
    $.root = () => wrap([doc.documentElement])
    $.load = h => cheerioLoad(h)
    return $
  } catch {
    const n = () => n
    n.text=()=>''; n.html=()=>''; n.attr=()=>''; n.each=()=>n
    n.find=()=>n; n.first=()=>n; n.last=()=>n; n.eq=()=>n
    n.filter=()=>n; n.not=()=>n; n.map=()=>[]; n.get=()=>[]
    n.length=0; n.parent=()=>n; n.load=()=>n; n.is=()=>false
    n.children=()=>n; n.closest=()=>n
    return n
  }
}

const cheerio = { load: cheerioLoad }

// ── axios shim ────────────────────────────────────────────────────────────
function makeAxios(useProxy = false) {
  const fetcher = useProxy ? proxyFetch : smartFetch

  const req = async (urlOrCfg, cfg = {}) => {
    const s = typeof urlOrCfg === 'string'
    const url     = s ? urlOrCfg : urlOrCfg.url
    const method  = ((s ? cfg.method : urlOrCfg.method) || 'GET').toUpperCase()
    const headers = s ? (cfg.headers||{}) : (urlOrCfg.headers||{})
    const body    = s ? cfg.data   : urlOrCfg.data
    const signal  = s ? cfg.signal : urlOrCfg.signal
    const params  = s ? cfg.params : urlOrCfg.params
    let fu = url
    if (params) fu += (url.includes('?')?'&':'?') + new URLSearchParams(params)
    const bs = body && typeof body !== 'string' ? JSON.stringify(body) : body
    const r = await fetcher(fu, { method, headers, body: bs, signal })
    const txt = await r.text()
    let data; try { data = JSON.parse(txt) } catch { data = txt }
    return { data, status: r.status, statusText: r.statusText,
             headers: Object.fromEntries(r.headers.entries()),
             request: { responseURL: r.url } }
  }

  const ax = async (u, c) => req(u, c)
  ax.get    = (u, c={})     => req(u, {...c, method:'GET'})
  ax.post   = (u, d, c={}) => req(u, {...c, method:'POST', data:d})
  ax.put    = (u, d, c={}) => req(u, {...c, method:'PUT',  data:d})
  ax.delete = (u, c={})     => req(u, {...c, method:'DELETE'})
  ax.head   = async (u, c={}) => {
    try {
      const r = await fetcher(u, {...c, method:'HEAD'})
      return { status:r.status, headers:Object.fromEntries(r.headers.entries()), request:{responseURL:r.url} }
    } catch { return { status:0, headers:{}, request:{responseURL:u} } }
  }
  ax.create = (d={}) => { const i=makeAxios(useProxy); i._defaults=d; return i }
  ax.defaults = { headers: { common:{} } }
  ax.interceptors = { request:{use:()=>{},eject:()=>{}}, response:{use:()=>{},eject:()=>{}} }
  return ax
}

function makeCtx(useProxy = false) {
  return {
    axios: makeAxios(useProxy),
    getBaseUrl,
    cheerio,
    commonHeaders: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    Crypto: { randomUUID: ()=>crypto.randomUUID(), getRandomValues: a=>crypto.getRandomValues(a) },
    Aes: { encrypt:async()=>'', decrypt:async()=>'' },
    extractors: {
      hubcloudExtracter:   async ()=>[],
      gofileExtracter:     async ()=>({link:'',token:''}),
      superVideoExtractor: async ()=>'',
      gdFlixExtracter:     async ()=>[],
    },
  }
}

// ── MoviesDrive — RSS-first, skip direct (Cloudflare blocks) ──────────────
const DRIVE_CATALOG = [
  { title:'Latest',       filter:'' },
  { title:'Bollywood',    filter:'category/bollywood/' },
  { title:'Hollywood',    filter:'category/hollywood/' },
  { title:'South Indian', filter:'category/south-indian/' },
  { title:'Bengali',      filter:'category/bengali/' },
  { title:'Anime',        filter:'category/anime/' },
  { title:'Netflix',      filter:'category/netflix/' },
  { title:'4K',           filter:'category/2160p-4k/' },
]

function parseDrivePage(html) {
  const $ = cheerioLoad(html)
  const out = []
  $('.poster-card').each((_, el) => {
    const title = $(el).find('.poster-title').text().trim()
    const link  = $(el).parent().attr('href') || ''
    const img   = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || ''
    if (title && link) out.push({ title: title.replace(/download/gi,'').trim(), link, image: img })
  })
  if (!out.length) {
    $('article').each((_, el) => {
      const title = $(el).find('h2,h3,.entry-title').first().text().trim()
      const link  = $(el).find('a').first().attr('href') || ''
      const img   = $(el).find('img').first().attr('src') || ''
      if (title && link?.startsWith('http')) out.push({ title: title.replace(/download/gi,'').trim(), link, image: img })
    })
  }
  return out
}

async function driveGetPosts({ filter, page, signal }) {
  // 1. RSS — fastest, no Cloudflare
  try {
    const r   = await proxyFetch(`${DRIVE_BASE}${filter}feed/`, { signal })
    const xml = new DOMParser().parseFromString(await r.text(), 'text/xml')
    const items = [...xml.querySelectorAll('item')]
    if (items.length) {
      return items.slice((page-1)*20, page*20).map(it => {
        const title = it.querySelector('title')?.textContent?.trim() || ''
        const link  = it.querySelector('link')?.textContent?.trim() || ''
        const body  = it.querySelector('encoded')?.textContent || it.querySelector('description')?.textContent || ''
        const img   = body.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || ''
        return title && link ? { title: title.replace(/download/gi,'').trim(), link, image:img } : null
      }).filter(Boolean)
    }
  } catch (e) { console.warn('[drive] RSS:', e.message) }

  // 2. HTML via proxy
  try {
    const r    = await proxyFetch(`${DRIVE_BASE}${filter}page/${page}/`, { signal })
    const html = await r.text()
    return parseDrivePage(html)
  } catch (e) { console.error('[drive] HTML:', e.message); return [] }
}

async function driveSearch({ searchQuery, signal }) {
  try {
    const r = await proxyFetch(`${DRIVE_BASE}?s=${encodeURIComponent(searchQuery)}`, { signal })
    return parseDrivePage(await r.text())
  } catch { return [] }
}

// ── stream type fixer ─────────────────────────────────────────────────────
// - drive/vega/mod: type:"mkv" → keep as "mkv" (direct video.src)
// - autoEmbed webstreamr: type:"movie"/"series" → set to "hls" (actual m3u8)
function fixStreams(raw, pv) {
  return (raw||[]).filter(s=>s?.link).map(s => {
    const t   = (s.type||'').toLowerCase()
    const url = (s.link||'').toLowerCase()
    if (t==='mkv'||t==='mp4'||url.endsWith('.mkv')||url.endsWith('.mp4')) return s
    if (t==='hls'||t==='m3u8'||url.includes('.m3u8')||url.includes('/manifest')) return {...s,type:'hls'}
    if (pv==='autoEmbed') return {...s,type:'hls'}
    return {...s,type:'hls'}
  })
}

// ── Public API ────────────────────────────────────────────────────────────
export async function getCatalog(pv) {
  if (pv==='drive') return { catalog:DRIVE_CATALOG, genres:[] }
  const mod = runModule(await loadModule(pv,'catalog'))
  return { catalog: mod.catalog||[], genres: mod.genres||[] }
}

export async function getPosts({ providerValue:pv, filter, page, signal }) {
  if (pv==='drive') return driveGetPosts({ filter, page, signal })
  const mod = runModule(await loadModule(pv,'posts'))
  if (typeof mod.getPosts!=='function') throw new Error('no getPosts')
  return mod.getPosts({ filter, page, providerValue:pv, signal, providerContext:makeCtx() })
}

export async function searchPosts({ providerValue:pv, searchQuery, page, signal }) {
  if (pv==='drive') return driveSearch({ searchQuery, signal })
  const mod = runModule(await loadModule(pv,'posts'))
  if (typeof mod.getSearchPosts!=='function') throw new Error('no getSearchPosts')
  return mod.getSearchPosts({ searchQuery, page, providerValue:pv, signal, providerContext:makeCtx() })
}

export async function getMeta({ providerValue:pv, link }) {
  const mod = runModule(await loadModule(pv,'meta'))
  if (typeof mod.getMeta!=='function') throw new Error('no getMeta')
  return mod.getMeta({ link, provider:pv, providerContext:makeCtx(pv==='drive') })
}

export async function getStream({ providerValue:pv, link, type, signal }) {
  const mod = runModule(await loadModule(pv,'stream'))
  if (typeof mod.getStream!=='function') throw new Error('no getStream')
  const raw = await mod.getStream({ link, type, signal, providerContext:makeCtx(pv==='drive') })
  return fixStreams(raw, pv)
}

export async function getEpisodes({ providerValue:pv, url }) {
  try {
    const mod = runModule(await loadModule(pv,'episodes'))
    if (typeof mod.getEpisodes!=='function') return []
    return mod.getEpisodes({ url, providerContext:makeCtx() })
  } catch { return [] }
}

export async function installProvider(pv) {
  if (pv==='drive') return
  await Promise.all(['catalog','posts','meta','stream'].map(m=>loadModule(pv,m)))
}
