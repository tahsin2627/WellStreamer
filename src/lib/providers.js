import { cacheStorage } from './storage.js'

const MANIFEST_URL = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/manifest.json'
const MODULES_BASE = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/dist'
const BASE_URL_JSON = 'https://himanshu8443.github.io/providers/modflix.json'

// Hardcoded — modflix.json has outdated/wrong URL for MoviesDrive
const DRIVE_BASE = 'https://new2.moviesdrives.my/'

const PROXIES = [
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
]

const moduleCodeCache = new Map()

// ── Fast fetch: tries one proxy at a time with short timeout ──────────────
async function fetchDirect(url, options = {}) {
  const { signal, headers = {}, method = 'GET', body } = options
  try {
    const res = await fetch(url, { method, headers, body, signal, mode: 'cors' })
    if (res.ok) return res
  } catch (_) {}
  return null
}

// For MoviesDrive: skip direct (Cloudflare blocks), go straight to proxies
async function fetchViaProxy(url, options = {}) {
  const { signal, headers = {}, method = 'GET', body } = options
  for (const makeProxy of PROXIES) {
    try {
      const res = await fetch(makeProxy(url), { method, headers, body, signal })
      if (res.ok) return res
    } catch (_) {
      if (signal?.aborted) throw new Error('Aborted')
    }
  }
  throw new Error(`Proxy fetch failed: ${url}`)
}

// General fetch: try direct first, then proxies
async function fetchWithFallback(url, options = {}) {
  const direct = await fetchDirect(url, options)
  if (direct) return direct
  return fetchViaProxy(url, options)
}

async function fetchText(url, opts) { return (await fetchWithFallback(url, opts)).text() }
async function fetchJSON(url, opts) { return (await fetchWithFallback(url, opts)).json() }

// ── Base URL ──────────────────────────────────────────────────────────────
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

// ── Manifest ──────────────────────────────────────────────────────────────
export async function fetchManifest() {
  const cached = cacheStorage.getValid('manifest')
  if (cached) return cached
  const data = await fetchJSON(MANIFEST_URL)
  if (!Array.isArray(data)) throw new Error('Invalid manifest')
  cacheStorage.set('manifest', data, 3_600_000)
  return data
}

// ── Module loader ─────────────────────────────────────────────────────────
async function getModuleCode(providerValue, moduleName) {
  const key = `${providerValue}/${moduleName}`
  if (moduleCodeCache.has(key)) return moduleCodeCache.get(key)
  const url = `${MODULES_BASE}/${providerValue}/${moduleName}.js`
  const code = await fetchText(url)
  moduleCodeCache.set(key, code)
  return code
}

// ── Module executor ───────────────────────────────────────────────────────
function runModule(code) {
  const mod = { exports: {} }
  const fakeProcess = { env: { CORS_PRXY: '', NODE_ENV: 'production' } }
  const patchedFetch = (url, opts = {}) => fetchWithFallback(url, opts)
  try {
    const fn = new Function(
      'exports', 'module', 'console', 'Promise', 'Object',
      'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      'process', 'fetch',
      `"use strict";\n${code}\nreturn module.exports && Object.keys(module.exports).length ? module.exports : exports;`
    )
    return fn(
      mod.exports, mod, console, Promise, Object,
      setTimeout, clearTimeout, setInterval, clearInterval,
      fakeProcess, patchedFetch
    ) || mod.exports
  } catch (e) {
    console.warn('Module exec error:', e.message)
    return mod.exports
  }
}

// ── Axios shim ────────────────────────────────────────────────────────────
function makeAxios(forceProxy = false) {
  const fetcher = forceProxy ? fetchViaProxy : fetchWithFallback

  const request = async (urlOrConfig, config = {}) => {
    const isStr   = typeof urlOrConfig === 'string'
    const url     = isStr ? urlOrConfig : urlOrConfig.url
    const method  = ((isStr ? config.method : urlOrConfig.method) || 'GET').toUpperCase()
    const headers = isStr ? (config.headers || {}) : (urlOrConfig.headers || {})
    const body    = isStr ? config.data   : urlOrConfig.data
    const signal  = isStr ? config.signal : urlOrConfig.signal
    const params  = isStr ? config.params : urlOrConfig.params
    let finalUrl = url
    if (params) {
      const qs = new URLSearchParams(params).toString()
      finalUrl = `${url}${url.includes('?') ? '&' : '?'}${qs}`
    }
    const bodyStr = body && typeof body !== 'string' ? JSON.stringify(body) : body
    const res = await fetcher(finalUrl, { method, headers, body: bodyStr, signal })
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { data, status: res.status, statusText: res.statusText, headers: Object.fromEntries(res.headers.entries()), request: { responseURL: res.url } }
  }

  const inst = async (u, c) => request(u, c)
  inst.get    = (url, cfg = {})       => request(url, { ...cfg, method: 'GET' })
  inst.post   = (url, data, cfg = {}) => request(url, { ...cfg, method: 'POST', data })
  inst.put    = (url, data, cfg = {}) => request(url, { ...cfg, method: 'PUT', data })
  inst.delete = (url, cfg = {})       => request(url, { ...cfg, method: 'DELETE' })
  inst.head   = async (url, cfg = {}) => {
    try {
      const res = await fetcher(url, { ...cfg, method: 'HEAD' })
      return { status: res.status, headers: Object.fromEntries(res.headers.entries()), request: { responseURL: res.url } }
    } catch { return { status: 0, headers: {}, request: { responseURL: url } } }
  }
  inst.create = (d = {}) => { const i = makeAxios(forceProxy); i._defaults = d; return i }
  inst.defaults = { headers: { common: {} } }
  inst.interceptors = { request: { use: () => {}, eject: () => {} }, response: { use: () => {}, eject: () => {} } }
  return inst
}

// ── Cheerio shim ──────────────────────────────────────────────────────────
function makeCheerio() {
  return {
    load: (html) => {
      try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(typeof html === 'string' ? html : String(html || ''), 'text/html')
        function wrap(nodes) {
          const arr = Array.isArray(nodes) ? nodes : Array.from(nodes || [])
          const obj = {
            _nodes: arr, length: arr.length,
            text:     () => arr.map(n => n.textContent || '').join(''),
            html:     () => arr.map(n => n.innerHTML || '').join(''),
            attr:     (a) => arr[0]?.getAttribute?.(a) ?? '',
            val:      () => arr[0]?.value ?? '',
            first:    () => wrap(arr.slice(0, 1)),
            last:     () => wrap(arr.slice(-1)),
            eq:       (i) => wrap(arr.slice(i, i + 1)),
            find:     (s) => { try { return wrap(arr.flatMap(n => Array.from(n.querySelectorAll?.(s) || []))) } catch { return wrap([]) } },
            filter:   (fn) => {
              if (typeof fn === 'string') return wrap(arr.filter(n => { try { return n.matches?.(fn) } catch { return false } }))
              if (typeof fn === 'function') return wrap(arr.filter((n, i) => fn(i, n)))
              return obj
            },
            not:      (s) => wrap(arr.filter(n => { try { return !n.matches?.(s) } catch { return true } })),
            each:     (fn) => { arr.forEach((n, i) => fn(i, n)); return obj },
            map:      (fn) => arr.map((n, i) => fn(i, n)),
            get:      (i) => i == null ? arr : arr[i],
            toArray:  () => arr,
            parent:   () => wrap(arr.map(n => n.parentElement).filter(Boolean)),
            parents:  (s) => { const r = []; arr.forEach(n => { let p = n.parentElement; while (p) { if (!s || p.matches?.(s)) r.push(p); p = p.parentElement } }); return wrap(r) },
            children: (s) => wrap(arr.flatMap(n => Array.from(s ? (n.querySelectorAll?.(':scope > ' + s) || []) : (n.children || [])))),
            next:     () => wrap(arr.map(n => n.nextElementSibling).filter(Boolean)),
            prev:     () => wrap(arr.map(n => n.previousElementSibling).filter(Boolean)),
            hasClass: (c) => arr[0]?.classList?.contains(c) || false,
            addClass: () => obj, removeClass: () => obj,
            remove:   () => { arr.forEach(n => n.remove()); return obj },
            closest:  (s) => wrap(arr.map(n => { try { return n.closest?.(s) } catch { return null } }).filter(Boolean)),
            is:       (s) => { try { return arr.some(n => n.matches?.(s)) } catch { return false } },
            prop:     (p) => arr[0]?.[p],
            data:     (k) => arr[0]?.dataset?.[k],
            // :contains() polyfill — DOMParser doesn't support it
            // We handle it at the $fn level below
          }
          return obj
        }

        const $fn = (sel) => {
          if (!sel) return wrap([])
          if (typeof sel !== 'string') return wrap([sel].flat().filter(Boolean))

          // Handle :contains() pseudo-selector — not supported by querySelectorAll
          if (sel.includes(':contains(')) {
            const containsMatch = sel.match(/^(.*?):contains\("([^"]+)"\)(.*)$/) ||
                                  sel.match(/^(.*?):contains\('([^']+)'\)(.*)$/)
            if (containsMatch) {
              const [, base, text, rest] = containsMatch
              const baseEls = base ? Array.from(doc.querySelectorAll(base)) : Array.from(doc.querySelectorAll('*'))
              const filtered = baseEls.filter(el => el.textContent?.includes(text))
              const resultSet = rest ? filtered.flatMap(el => Array.from(el.querySelectorAll(rest) || [])) : filtered
              return wrap(resultSet)
            }
          }

          try { return wrap(Array.from(doc.querySelectorAll(sel))) } catch { return wrap([]) }
        }

        $fn.html = () => doc.documentElement.outerHTML
        $fn.text = () => doc.body?.textContent || ''
        $fn.root = () => wrap([doc.documentElement])
        $fn.load = (h) => makeCheerio().load(h)
        return $fn
      } catch {
        const noop = () => noop
        noop.text = () => ''; noop.html = () => ''; noop.attr = () => ''
        noop.each = () => noop; noop.find = () => noop; noop.first = () => noop
        noop.last = () => noop; noop.eq = () => noop; noop.filter = () => noop
        noop.not = () => noop; noop.map = () => []; noop.get = () => []
        noop.length = 0; noop.parent = () => noop; noop.load = () => noop
        noop.closest = () => noop; noop.is = () => false; noop.children = () => noop
        return noop
      }
    }
  }
}

// ── Context: normal vs proxy-forced for MoviesDrive ───────────────────────
function makeContext(forceProxy = false) {
  return {
    axios: makeAxios(forceProxy),
    getBaseUrl,
    Crypto: { randomUUID: () => crypto.randomUUID(), getRandomValues: (a) => crypto.getRandomValues(a) },
    commonHeaders: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    cheerio: makeCheerio(),
    extractors: {
      hubcloudExtracter: async () => [],
      gofileExtracter: async () => ({ link: '', token: '' }),
      superVideoExtractor: async () => '',
      gdFlixExtracter: async () => [],
    },
  }
}

// ── MOVIESDRIVE — RSS-first, proxy-first, hardcoded URL ───────────────────
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

function parseDriveHTML(html) {
  const $ = makeCheerio().load(html)
  const results = []
  $('.poster-card').each((_, el) => {
    const title = $(el).find('.poster-title').text().trim()
    const link  = $(el).parent().attr('href') || ''
    const image = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || ''
    if (title && link) results.push({ title: title.replace(/download/gi, '').trim(), link, image })
  })
  if (results.length === 0) {
    $('article').each((_, el) => {
      const title = $(el).find('h2,h3,.entry-title,.title').first().text().trim()
      const link  = $(el).find('a').first().attr('href') || ''
      const image = $(el).find('img').first().attr('src') || ''
      if (title && link && link.startsWith('http')) {
        results.push({ title: title.replace(/download/gi, '').trim(), link, image })
      }
    })
  }
  return results
}

async function driveGetPosts({ filter, page, signal }) {
  const base = DRIVE_BASE

  // 1. Try RSS first (fastest, no Cloudflare)
  try {
    const rssUrl = `${base}${filter}feed/`
    console.log('[Drive] Trying RSS:', rssUrl)
    const text = await fetchViaProxy(rssUrl, { signal })
    const txt  = await text.text()
    const xml  = new DOMParser().parseFromString(txt, 'text/xml')
    const items = Array.from(xml.querySelectorAll('item'))
    if (items.length > 0) {
      console.log('[Drive] RSS ok:', items.length, 'items')
      return items.slice((page - 1) * 20, page * 20).map(item => {
        const title   = item.querySelector('title')?.textContent?.trim() || ''
        const link    = item.querySelector('link')?.textContent?.trim() || ''
        const encoded = item.querySelector('encoded')?.textContent || item.querySelector('description')?.textContent || ''
        const image   = encoded.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || ''
        return title && link ? { title: title.replace(/download/gi, '').trim(), link, image } : null
      }).filter(Boolean)
    }
  } catch (e) { console.warn('[Drive] RSS failed:', e.message) }

  // 2. Fallback: HTML via proxy
  try {
    const url = `${base}${filter}page/${page}/`
    console.log('[Drive] HTML fallback:', url)
    const res  = await fetchViaProxy(url, { signal })
    const html = await res.text()
    const results = parseDriveHTML(html)
    console.log('[Drive] HTML results:', results.length)
    return results
  } catch (e) {
    console.error('[Drive] all failed:', e.message)
    return []
  }
}

async function driveSearch({ searchQuery, signal }) {
  try {
    const res  = await fetchViaProxy(`${DRIVE_BASE}?s=${encodeURIComponent(searchQuery)}`, { signal })
    const html = await res.text()
    return parseDriveHTML(html)
  } catch { return [] }
}

// ── Stream normalizer ─────────────────────────────────────────────────────
function normalizeStreams(streams, providerValue) {
  return (streams || []).filter(s => s?.link).map(s => {
    const url = (s.link || '').toLowerCase()
    const t   = (s.type || '').toLowerCase()
    if (t === 'mkv' || t === 'mp4' || url.endsWith('.mkv') || url.endsWith('.mp4')) return s
    if (t === 'hls' || t === 'm3u8') return { ...s, type: 'hls' }
    if (providerValue === 'autoEmbed') return { ...s, type: 'hls' }
    if (url.includes('.m3u8') || url.includes('/manifest')) return { ...s, type: 'hls' }
    return { ...s, type: 'hls' }
  })
}

// ── Public API ────────────────────────────────────────────────────────────
export async function getCatalog(providerValue) {
  if (providerValue === 'drive') return { catalog: DRIVE_CATALOG, genres: [] }
  const code = await getModuleCode(providerValue, 'catalog')
  const mod  = runModule(code)
  return { catalog: mod.catalog || [], genres: mod.genres || [] }
}

export async function getPosts({ providerValue, filter, page, signal }) {
  if (providerValue === 'drive') return driveGetPosts({ filter, page, signal })
  const code = await getModuleCode(providerValue, 'posts')
  const mod  = runModule(code)
  if (typeof mod.getPosts !== 'function') throw new Error('No getPosts export')
  return mod.getPosts({ filter, page, providerValue, signal, providerContext: makeContext() })
}

export async function searchPosts({ providerValue, searchQuery, page, signal }) {
  if (providerValue === 'drive') return driveSearch({ searchQuery, signal })
  const code = await getModuleCode(providerValue, 'posts')
  const mod  = runModule(code)
  if (typeof mod.getSearchPosts !== 'function') throw new Error('No getSearchPosts export')
  return mod.getSearchPosts({ searchQuery, page, providerValue, signal, providerContext: makeContext() })
}

export async function getMeta({ providerValue, link }) {
  const code = await getModuleCode(providerValue, 'meta')
  const mod  = runModule(code)
  if (typeof mod.getMeta !== 'function') throw new Error('No getMeta export')
  // MoviesDrive meta also needs proxy
  const ctx = makeContext(providerValue === 'drive')
  return mod.getMeta({ link, provider: providerValue, providerContext: ctx })
}

export async function getStream({ providerValue, link, type, signal }) {
  const code = await getModuleCode(providerValue, 'stream')
  const mod  = runModule(code)
  if (typeof mod.getStream !== 'function') throw new Error('No getStream export')
  // MoviesDrive stream uses hubcloud extractor — needs proxy
  const ctx = makeContext(providerValue === 'drive')
  const raw = await mod.getStream({ link, type, signal, providerContext: ctx })
  return normalizeStreams(raw, providerValue)
}

export async function getEpisodes({ providerValue, url }) {
  try {
    const code = await getModuleCode(providerValue, 'episodes')
    const mod  = runModule(code)
    if (typeof mod.getEpisodes !== 'function') return []
    return mod.getEpisodes({ url, providerContext: makeContext() })
  } catch { return [] }
}

export async function installProvider(providerValue) {
  if (providerValue === 'drive') return
  await Promise.all(['catalog', 'posts', 'meta', 'stream'].map(m => getModuleCode(providerValue, m)))
}
