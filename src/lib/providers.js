import { cacheStorage } from './storage.js'

const MANIFEST_URL  = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/manifest.json'
const MODULES_BASE  = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/dist'
const BASE_URL_JSON = 'https://himanshu8443.github.io/providers/modflix.json'
const DRIVE_BASE    = 'https://new2.moviesdrives.my/'
// Rive base URL — not in modflix.json, hardcoded from vega app source
const RIVE_BASE     = 'https://rivestream.live'

const PROXIES = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
]

const moduleCache = new Map()

// ── Race all proxies in PARALLEL — fastest wins ───────────────────────────
async function proxyFetch(url, opts = {}) {
  const { signal, ...rest } = opts
  try {
    return await Promise.any(
      PROXIES.map(p =>
        fetch(p(url), { ...rest, signal }).then(r => {
          if (!r.ok) throw new Error(`${r.status}`)
          return r
        })
      )
    )
  } catch {
    throw new Error(`All proxies failed: ${url}`)
  }
}

// smartFetch: direct first (fast for GitHub/CDN), proxy fallback for CORS-blocked sites
async function smartFetch(url, opts = {}) {
  try {
    const r = await fetch(url, { ...opts, mode: 'cors' })
    if (r.ok) return r
  } catch (_) {}
  return proxyFetch(url, opts)
}

// resolveUrl: follows redirects via proxy and returns final URL
// Used instead of fetch(url, {redirect:"manual"}) which doesn't work in browser
async function resolveUrl(url, opts = {}) {
  try {
    const r = await proxyFetch(url, { ...opts, method: 'GET' })
    // After proxy follows redirects, r.url is the final URL
    return r.url || url
  } catch { return url }
}

const getText = async (url, o) => (await smartFetch(url, o)).text()
const getJSON = async (url, o) => (await smartFetch(url, o)).json()

// ── Base URL ──────────────────────────────────────────────────────────────
export async function getBaseUrl(key) {
  if (key === 'drive') return DRIVE_BASE
  if (key === 'rive')  return RIVE_BASE   // BUG FIX: rive not in modflix.json
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

// ── Module runner ─────────────────────────────────────────────────────────
// KEY: inject process.env.CORS_PRXY so getRiveStream uses our proxy
// KEY: inject patched fetch so all fetch() calls inside modules go via proxy
function runModule(code, extraEnv = {}) {
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
      {
        env: {
          // BUG FIX: provide CORS_PRXY so getRiveStream prepends proxy to rive URLs
          CORS_PRXY: PROXIES[0]('').replace('=', '='),
          NODE_ENV: 'production',
          ...extraEnv,
        }
      },
      // BUG FIX: patched fetch — all fetch() calls inside module use smartFetch
      // This means hubcloudExtractor's fetch(vcloudLink) also goes via proxy
      (u, o = {}) => {
        // BUG FIX: intercept redirect:"manual" calls
        // Original: fetch(link, {redirect:"manual"}) to read Location header
        // Browser: returns opaque response, Location = null → broken
        // Fix: use proxyFetch which follows redirects server-side
        if (o.redirect === 'manual' || o.method === 'HEAD') {
          return proxyFetch(u, { ...o, redirect: 'follow', method: 'GET' })
        }
        return smartFetch(u, o)
      }
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

    function wrap(nodes) {
      const arr = Array.isArray(nodes) ? nodes : Array.from(nodes || [])
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
        find:     s  => { try { return wrap(arr.flatMap(n => [...(n.querySelectorAll?.(s) || [])])) } catch { return wrap([]) } },
        filter:   fn => {
          if (typeof fn === 'function') return wrap(arr.filter((n, i) => fn(i, n)))
          if (typeof fn === 'string') return wrap(arr.filter(n => { try { return n.matches?.(fn) } catch { return false } }))
          return o
        },
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

    // BUG FIX: :contains() polyfill — querySelectorAll doesn't support it
    // drive/stream.js uses: $('a:contains("HubCloud")').attr('href')
    function $(sel) {
      if (!sel) return wrap([])
      if (typeof sel !== 'string') return wrap([sel].flat().filter(Boolean))

      if (sel.includes(':contains(')) {
        // Parse :contains() — handle both single and double quotes
        const m = sel.match(/^(.*?):contains\(["']([^"']+)["']\)\s*(.*)$/)
        if (m) {
          const [, base, text, after] = m
          const baseStr = base.trim()
          const pool = baseStr
            ? [...doc.querySelectorAll(baseStr)]
            : [...doc.querySelectorAll('*')]
          const matched = pool.filter(el => el.textContent?.includes(text))
          if (after.trim()) {
            return wrap(matched.flatMap(el => [...(el.querySelectorAll(after.trim()) || [])]))
          }
          return wrap(matched)
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
    n.text = () => ''; n.html = () => ''; n.attr = () => ''; n.each = () => n
    n.find = () => n; n.first = () => n; n.last = () => n; n.eq = () => n
    n.filter = () => n; n.not = () => n; n.map = () => []; n.get = () => []
    n.length = 0; n.parent = () => n; n.load = () => n; n.is = () => false
    n.children = () => n; n.closest = () => n; n.parents = () => n
    return n
  }
}

// ── axios shim ────────────────────────────────────────────────────────────
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
  ax.put    = (u, d, c = {}) => req(u, { ...c, method: 'PUT',  data: d })
  ax.delete = (u, c = {})     => req(u, { ...c, method: 'DELETE' })
  ax.head   = async (u, c = {}) => {
    // BUG FIX: axios.head() used by drive for redirect resolution
    // Instead of HEAD (blocked), GET via proxy and return final URL
    try {
      const r = await proxyFetch(u, { signal: c.signal, method: 'GET' })
      return {
        status: r.status,
        headers: Object.fromEntries(r.headers.entries()),
        request: { responseURL: r.url }
      }
    } catch { return { status: 0, headers: {}, request: { responseURL: u } } }
  }
  ax.create = (d = {}) => { const i = makeAxios(forceProxy); i._defaults = d; return i }
  ax.defaults = { headers: { common: {} } }
  ax.interceptors = { request: { use: () => {}, eject: () => {} }, response: { use: () => {}, eject: () => {} } }
  return ax
}

// ── provider context ──────────────────────────────────────────────────────
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
      hubcloudExtractor: async () => [],
      gofileExtracter:   async () => ({ link: '', token: '' }),
      superVideoExtractor: async () => '',
      gdFlixExtracter:   async () => [],
    },
  }
}

// ── stream type normalizer ────────────────────────────────────────────────
function fixStreams(raw, pv) {
  return (raw || []).filter(s => s?.link).map(s => {
    const t = (s.type || '').toLowerCase()
    const u = (s.link || '').toLowerCase()
    // mkv/mp4 = direct file, video.src plays it
    if (t === 'mkv' || t === 'mp4' || u.endsWith('.mkv') || u.endsWith('.mp4')) return s
    // explicit hls
    if (t === 'hls' || t === 'm3u8' || u.includes('.m3u8') || u.includes('/manifest')) return { ...s, type: 'hls' }
    // autoEmbed webstreamr always returns m3u8 with wrong type field
    if (pv === 'autoEmbed') return { ...s, type: 'hls' }
    return { ...s, type: 'hls' }
  })
}

// ── MoviesDrive catalog ───────────────────────────────────────────────────
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

// ── Public API ────────────────────────────────────────────────────────────
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
  const raw = await mod.getStream({ link, type, signal, providerContext: makeCtx(pv === 'drive') })
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
