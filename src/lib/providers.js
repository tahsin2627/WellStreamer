import { cacheStorage } from './storage.js'

const MANIFEST_URL  = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/manifest.json'
const MODULES_BASE  = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/dist'
const BASE_URL_JSON = 'https://himanshu8443.github.io/providers/modflix.json'
const DRIVE_BASE    = 'https://new2.moviesdrives.my/'
const RIVE_BASE     = 'https://rivestream.live'
const PROXY0        = 'https://corsproxy.io/?'

const PROXIES = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
]

const moduleCache = new Map()

async function proxyFetch(url, opts = {}) {
  const { signal, ...rest } = opts
  try {
    return await Promise.any(
      PROXIES.map(p =>
        fetch(p(url), { ...rest, signal })
          .then(r => { if (!r.ok) throw new Error(r.status); return r })
      )
    )
  } catch { throw new Error(`proxyFetch failed: ${url}`) }
}

async function smartFetch(url, opts = {}) {
  try {
    const r = await fetch(url, { ...opts, mode: 'cors' })
    if (r.ok) return r
  } catch (_) {}
  return proxyFetch(url, opts)
}

const getText = async (url, o) => (await smartFetch(url, o)).text()
const getJSON = async (url, o) => (await smartFetch(url, o)).json()

export async function getBaseUrl(key) {
  if (key === 'drive') return DRIVE_BASE
  if (key === 'rive')  return RIVE_BASE
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

export async function fetchManifest() {
  const c = cacheStorage.getValid('manifest')
  if (c) return c
  const d = await getJSON(MANIFEST_URL)
  if (!Array.isArray(d)) throw new Error('bad manifest')
  cacheStorage.set('manifest', d, 3_600_000)
  return d
}

async function loadModule(pv, name) {
  const k = `${pv}/${name}`
  if (moduleCache.has(k)) return moduleCache.get(k)
  const code = await getText(`${MODULES_BASE}/${pv}/${name}.js`)
  moduleCache.set(k, code)
  return code
}

function runModule(code) {
  const mod = { exports: {} }
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'exports', 'module', 'console', 'Promise', 'Object',
      'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      'process', 'fetch',
      `"use strict";\n${code}\nreturn module.exports&&Object.keys(module.exports).length?module.exports:exports;`
    )
    return fn(
      mod.exports, mod, console, Promise, Object,
      setTimeout, clearTimeout, setInterval, clearInterval,
      { env: { CORS_PRXY: PROXY0, NODE_ENV: 'production' } },
      (u, o = {}) => {
        if (o.redirect === 'manual' || o.method === 'HEAD') {
          return proxyFetch(u, { signal: o.signal, method: 'GET' }).then(r => {
            const finalUrl = r.url && r.url !== u ? r.url : u
            const fakeHeaders = new Headers()
            const loc = finalUrl.includes('?link=')
              ? finalUrl
              : `https://redirect.dummy/?link=${encodeURIComponent(finalUrl)}`
            fakeHeaders.set('location', loc)
            return new Response(null, { status: 302, headers: fakeHeaders })
          }).catch(() => new Response(null, { status: 200, headers: new Headers() }))
        }
        return smartFetch(u, o)
      }
    ) || mod.exports
  } catch (e) {
    console.warn('[runModule]', e.message)
    return mod.exports
  }
}

function splitByComma(sel) {
  const parts = []; let depth = 0, cur = ''
  for (const c of sel) {
    if (c === '(') depth++
    else if (c === ')') depth--
    if (c === ',' && depth === 0) { parts.push(cur.trim()); cur = '' }
    else cur += c
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

function evalContains(sel, scope) {
  const tag = (sel.match(/^([a-z][a-z0-9]*)/i) || [])[1] || '*'
  const must = [], mustNot = []
  const re = /:not\(:contains\(["']([^"']+)["']\)\)|:contains\(["']([^"']+)["']\)/g
  let m
  while ((m = re.exec(sel)) !== null) {
    if (m[1]) mustNot.push(m[1])
    else if (m[2]) must.push(m[2])
  }
  try {
    return [...scope.querySelectorAll(tag)].filter(el => {
      const t = el.textContent || ''
      return must.every(x => t.includes(x)) && mustNot.every(x => !t.includes(x))
    })
  } catch { return [] }
}

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
        first:    () => wrap(arr.slice(0, 1)),
        last:     () => wrap(arr.slice(-1)),
        eq:       i  => wrap(arr.slice(i, i + 1)),
        get:      i  => i == null ? arr : arr[i],
        toArray:  () => arr,
        each:     fn => { arr.forEach((n, i) => fn(i, n)); return o },
        map:      fn => arr.map((n, i) => fn(i, n)),
        find:     s  => $(s, arr),
        filter:   fn => typeof fn === 'function'
          ? wrap(arr.filter((n, i) => fn(i, n)))
          : $(fn, arr),
        not:      s  => wrap(arr.filter(n => { try { return !n.matches?.(s) } catch { return true } })),
        parent:   () => wrap(arr.map(n => n.parentElement).filter(Boolean)),
        parents:  s  => {
          const r = []
          arr.forEach(n => { let p = n.parentElement; while (p) { if (!s || p.matches?.(s)) r.push(p); p = p.parentElement } })
          return wrap(r)
        },
        children: s  => wrap(arr.flatMap(n => [...(s ? (n.querySelectorAll?.(':scope > ' + s) || []) : (n.children || []))])),
        next:     () => wrap(arr.map(n => n.nextElementSibling).filter(Boolean)),
        prev:     () => wrap(arr.map(n => n.previousElementSibling).filter(Boolean)),
        closest:  s  => wrap(arr.map(n => { try { return n.closest?.(s) } catch { return null } }).filter(Boolean)),
        hasClass: c  => !!arr[0]?.classList?.contains(c),
        is:       s  => arr.some(n => { try { return n.matches?.(s) } catch { return false } }),
        addClass: () => o, removeClass: () => o,
        remove:   () => { arr.forEach(n => n.remove()); return o },
        prop:     p  => arr[0]?.[p],
        data:     k  => arr[0]?.dataset?.[k],
      }
      return o
    }

    function $(sel, ctx) {
      if (!sel) return wrap([])
      if (typeof sel !== 'string') return wrap([sel].flat().filter(Boolean))
      const scope = ctx
        ? { querySelectorAll: s => ctx.flatMap(n => [...(n.querySelectorAll?.(s) || [])]) }
        : doc
      if (!sel.includes(':contains(')) {
        try { return wrap([...scope.querySelectorAll(sel)]) } catch { return wrap([]) }
      }
      const seen = new Set(), all = []
      for (const part of splitByComma(sel)) {
        for (const el of evalContains(part, scope)) {
          if (!seen.has(el)) { seen.add(el); all.push(el) }
        }
      }
      return wrap(all)
    }

    $.html = () => doc.documentElement.outerHTML
    $.text = () => doc.body?.textContent || ''
    $.root = () => wrap([doc.documentElement])
    $.load = h => cheerioLoad(h)
    return $
  } catch {
    const n = () => n
    n.text = () => ''; n.html = () => ''; n.attr = () => ''; n.each = () => n
    n.find = () => n; n.first = () => n; n.last = () => n; n.eq = () => n
    n.filter = () => n; n.not = () => n; n.map = () => []; n.get = () => []
    n.length = 0; n.parent = () => n; n.load = () => n; n.is = () => false
    n.children = () => n; n.closest = () => n; n.parents = () => n
    return n
  }
}

function makeAxios(forceProxy = false) {
  const doFetch = forceProxy ? proxyFetch : smartFetch
  const req = async (cfg, extra = {}) => {
    const s = typeof cfg === 'string'
    const url    = s ? cfg : cfg.url
    const method = ((s ? extra.method : cfg.method) || 'GET').toUpperCase()
    const hdrs   = s ? (extra.headers || {}) : (cfg.headers || {})
    const body   = s ? extra.data   : cfg.data
    const signal = s ? extra.signal : cfg.signal
    const params = s ? extra.params : cfg.params
    let fu = url
    if (params) fu += (url.includes('?') ? '&' : '?') + new URLSearchParams(params)
    const bs = body && typeof body !== 'string' ? JSON.stringify(body) : body
    const r = await doFetch(fu, { method, headers: hdrs, body: bs, signal })
    const txt = await r.text()
    let data; try { data = JSON.parse(txt) } catch { data = txt }
    return {
      data, status: r.status, statusText: r.statusText,
      headers: Object.fromEntries(r.headers.entries()),
      request: { responseURL: r.url }
    }
  }
  const ax = async (u, c) => req(u, c)
  ax.get    = (u, c = {})     => req(u, { ...c, method: 'GET' })
  ax.post   = (u, d, c = {}) => req(u, { ...c, method: 'POST', data: d })
  ax.put    = (u, d, c = {}) => req(u, { ...c, method: 'PUT', data: d })
  ax.delete = (u, c = {})     => req(u, { ...c, method: 'DELETE' })
  ax.head   = async (u, c = {}) => {
    try {
      const r = await proxyFetch(u, { signal: c.signal, method: 'GET' })
      return {
        status: r.status,
        headers: Object.fromEntries(r.headers.entries()),
        request: { responseURL: r.url || u }
      }
    } catch { return { status: 0, headers: {}, request: { responseURL: u } } }
  }
  ax.create = (d = {}) => { const i = makeAxios(forceProxy); i._defaults = d; return i }
  ax.defaults = { headers: { common: {} } }
  ax.interceptors = {
    request:  { use: () => {}, eject: () => {} },
    response: { use: () => {}, eject: () => {} }
  }
  return ax
}

function makeCtx(forceProxy = false) {
  return {
    axios: makeAxios(forceProxy),
    getBaseUrl,
    cheerio: { load: cheerioLoad },
    commonHeaders: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Cookie': 'xla=s4t; ext_name=ojplmecpdpgccookcobabopnaifgidhf',
    },
    Crypto: { randomUUID: () => crypto.randomUUID(), getRandomValues: a => crypto.getRandomValues(a) },
    Aes: { encrypt: async () => '', decrypt: async () => '' },
    extractors: {
      hubcloudExtracter: async () => [],
      gofileExtracter:   async () => ({ link: '', token: '' }),
      superVideoExtractor: async () => '',
      gdFlixExtracter:   async () => [],
    },
  }
}

function fixStreams(raw, pv) {
  return (raw || []).filter(s => s?.link).map(s => {
    const t = (s.type || '').toLowerCase()
    const u = (s.link || '').toLowerCase()
    if (t === 'mkv' || t === 'mp4' || u.endsWith('.mkv') || u.endsWith('.mp4')) return s
    if (t === 'hls' || t === 'm3u8' || u.includes('.m3u8') || u.includes('/manifest')) return { ...s, type: 'hls' }
    if (pv === 'autoEmbed') return { ...s, type: 'hls' }
    return { ...s, type: 'hls' }
  })
}

const DRIVE_CATALOG = [
  { title: 'Latest',       filter: '' },
  { title: 'Bollywood',    filter: 'category/bollywood/' },
  { title: 'Hollywood',    filter: 'category/hollywood/' },
  { title: 'South Indian', filter: 'category/south-indian/' },
  { title: 'Bengali',      filter: 'category/bengali/' },
  { title: 'Anime',        filter: 'category/anime/' },
  { title: 'Netflix',      filter: 'category/netflix/' },
  { title: '4K',           filter: 'category/2160p-4k/' },
]

export async function getCatalog(pv) {
  if (pv === 'drive') return { catalog: DRIVE_CATALOG, genres: [] }
  const mod = runModule(await loadModule(pv, 'catalog'))
  return { catalog: mod.catalog || [], genres: mod.genres || [] }
}

export async function getPosts({ providerValue: pv, filter, page, signal }) {
  const mod = runModule(await loadModule(pv, 'posts'))
  if (typeof mod.getPosts !== 'function') throw new Error('no getPosts')
  return mod.getPosts({ filter, page, providerValue: pv, signal, providerContext: makeCtx(pv === 'drive') })
}

export async function searchPosts({ providerValue: pv, searchQuery, page, signal }) {
  const mod = runModule(await loadModule(pv, 'posts'))
  if (typeof mod.getSearchPosts !== 'function') throw new Error('no getSearchPosts')
  return mod.getSearchPosts({ searchQuery, page, providerValue: pv, signal, providerContext: makeCtx(pv === 'drive') })
}

export async function getMeta({ providerValue: pv, link }) {
  const mod = runModule(await loadModule(pv, 'meta'))
  if (typeof mod.getMeta !== 'function') throw new Error('no getMeta')
  return mod.getMeta({ link, provider: pv, providerContext: makeCtx(pv === 'drive') })
}

export async function getStream({ providerValue: pv, link, type, signal }) {
  const mod = runModule(await loadModule(pv, 'stream'))
  if (typeof mod.getStream !== 'function') throw new Error('no getStream')

  // Drive meta.js gives /go/?url=BASE64 redirect links
  // stream.js checks if URL contains "hubcloud"/"gdflix" but /go/ links don't
  // Fix: resolve the redirect first so stream.js sees the real destination URL
  let resolvedLink = link
  if (pv === 'drive' && link.includes('/go/')) {
    try {
      const r = await proxyFetch(link, { signal })
      const finalUrl = r.url || link
      if (finalUrl && finalUrl !== link && !finalUrl.includes('/go/')) {
        resolvedLink = finalUrl
        console.log('[drive] /go/ resolved to:', finalUrl.slice(0, 80))
      }
    } catch (e) {
      console.warn('[drive] resolve /go/ failed:', e.message)
    }
  }

  const raw = await mod.getStream({ link: resolvedLink, type, signal, providerContext: makeCtx(pv === 'drive') })
  return fixStreams(raw, pv)
}

export async function getEpisodes({ providerValue: pv, url }) {
  try {
    const mod = runModule(await loadModule(pv, 'episodes'))
    if (typeof mod.getEpisodes !== 'function') return []
    return mod.getEpisodes({ url, providerContext: makeCtx() })
  } catch { return [] }
}

export async function installProvider(pv) {
  await Promise.all(['catalog', 'posts', 'meta', 'stream'].map(m => loadModule(pv, m)))
}
