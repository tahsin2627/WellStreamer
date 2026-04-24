import { cacheStorage } from './storage.js'

const MANIFEST_URL  = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/manifest.json'
const MODULES_BASE  = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/dist'
const BASE_URL_JSON = 'https://himanshu8443.github.io/providers/modflix.json'
const DRIVE_BASE    = 'https://new2.moviesdrives.my/'

const PROXIES = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
]

const moduleCache = new Map()

// ── KEY FIX: Race all proxies in PARALLEL — use whichever responds first ──
// Previously proxies were tried sequentially: if corsproxy.io took 60s to
// timeout, we'd wait 60s before trying allorigins. Now all 3 fire at once.
async function proxyFetch(url, opts = {}) {
  const { signal, ...rest } = opts
  return Promise.any(
    PROXIES.map(p =>
      fetch(p(url), { ...rest, signal }).then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r
      })
    )
  ).catch(() => { throw new Error(`All proxies failed: ${url}`) })
}

// smartFetch: try direct first (no-op cost if CORS fails fast), then race proxies
async function smartFetch(url, opts = {}) {
  try {
    const r = await fetch(url, { ...opts, mode: 'cors' })
    if (r.ok) return r
  } catch (_) {}
  return proxyFetch(url, opts)
}

const getText = async (url, o) => (await smartFetch(url, o)).text()
const getJSON = async (url, o) => (await smartFetch(url, o)).json()

// ── Base URL ──────────────────────────────────────────────────────────────
export async function getBaseUrl(key) {
  if (key === 'drive') return DRIVE_BASE   // always use hardcoded URL for drive
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
// Injects `process` and patched `fetch` so all provider fetch() calls
// go through our proxy automatically — this is the key fix for drive posts
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
      { env: { CORS_PRXY: '', NODE_ENV: 'production' } },
      (u, o = {}) => smartFetch(u, o)   // patched fetch injected here
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
          return wrap(arr.filter(n => { try { return n.matches?.(fn) } catch { return false } }))
        },
        not:      s  => wrap(arr.filter(n => { try { return !n.matches?.(s) } catch { return true } })),
        parent:   () => wrap(arr.map(n => n.parentElement).filter(Boolean)),
        parents:  s  => {
          const r = []; arr.forEach(n => { let p = n.parentElement; while (p) { if (!s || p.matches?.(s)) r.push(p); p = p.parentElement } }); return wrap(r)
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

    function $(sel) {
      if (!sel) return wrap([])
      if (typeof sel !== 'string') return wrap([sel].flat().filter(Boolean))
      // :contains() polyfill — querySelectorAll doesn't support it
      if (sel.includes(':contains(')) {
        const m = sel.match(/^([\w\s,.*#[\]"'=-]*?):contains\(["']([^"']+)["']\)\s*([\s\S]*)$/)
        if (m) {
          const [, base, text, after] = m
          const pool = base.trim() ? [...doc.querySelectorAll(base.trim())] : [...doc.querySelectorAll('*')]
          const matched = pool.filter(el => el.textContent?.includes(text))
          return after.trim() ? wrap(matched.flatMap(el => [...(el.querySelectorAll(after.trim()) || [])])) : wrap(matched)
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
    return { data, status: r.status, statusText: r.statusText,
             headers: Object.fromEntries(r.headers.entries()),
             request: { responseURL: r.url } }
  }
  const ax = async (u, c) => req(u, c)
  ax.get    = (u, c = {})     => req(u, { ...c, method: 'GET' })
  ax.post   = (u, d, c = {}) => req(u, { ...c, method: 'POST', data: d })
  ax.put    = (u, d, c = {}) => req(u, { ...c, method: 'PUT',  data: d })
  ax.delete = (u, c = {})     => req(u, { ...c, method: 'DELETE' })
  ax.head   = async (u, c = {}) => {
    try {
      const r = await doFetch(u, { ...c, method: 'HEAD' })
      return { status: r.status, headers: Object.fromEntries(r.headers.entries()), request: { responseURL: r.url } }
    } catch { return { status: 0, headers: {}, request: { responseURL: u } } }
  }
  ax.create = (d = {}) => { const i = makeAxios(forceProxy); i._defaults = d; return i }
  ax.defaults = { headers: { common: {} } }
  ax.interceptors = { request: { use: () => {}, eject: () => {} }, response: { use: () => {}, eject: () => {} } }
  return ax
}

// ── hubcloud extractor — browser-safe ─────────────────────────────────────
// Original uses fetch(link, {redirect:"manual"}) to read Location header.
// Browsers CANNOT read Location header from opaque redirect responses.
// Fix: use proxyFetch which follows redirects server-side on the proxy.
const CF_COOKIE = 'ext_name=ojplmecpdpgccookcobabopnaifgidhf; xla=s4t'

async function hubcloudExtractor(link, signal, ax, _cheerio, headers) {
  const hdr = { ...headers, Cookie: CF_COOKIE }
  const streamLinks = []
  try {
    const baseUrl = link.split('/').slice(0, 3).join('/')

    // Step 1: get the vcloud redirect page
    const vRes  = await ax(link, { headers: hdr, signal })
    const vHtml = typeof vRes.data === 'string' ? vRes.data : ''
    const $v    = cheerioLoad(vHtml)

    const urlMatch = vHtml.match(/var\s+url\s*=\s*'([^']+)'/)
    let vcloudLink
    if (urlMatch?.[1]) {
      try { vcloudLink = atob(urlMatch[1].split('r=')[1] || '') } catch { vcloudLink = urlMatch[1] }
      if (!vcloudLink) vcloudLink = urlMatch[1]
    }
    if (!vcloudLink) vcloudLink = $v('.fa-file-download.fa-lg').parent().attr('href') || link
    if (vcloudLink?.startsWith('/')) vcloudLink = `${baseUrl}${vcloudLink}`

    console.log('[hubcloud] vcloudLink:', vcloudLink)

    // Step 2: get the download buttons page
    // Use proxyFetch with redirect:follow — proxy follows server-side
    const vcRes  = await proxyFetch(vcloudLink, { signal })
    const vcHtml = await vcRes.text()
    const $      = cheerioLoad(vcHtml)

    const btns = $('.btn-success.btn-lg.h6, .btn-danger, .btn-secondary')
    for (const el of (btns._nodes || [])) {
      let href = el.getAttribute('href') || ''
      if (!href) continue

      if (href.includes('pixeld')) {
        if (!href.includes('api')) {
          const token = href.split('/').pop()
          const base2 = href.split('/').slice(0, -2).join('/')
          href = `${base2}/api/file/${token}`
        }
        streamLinks.push({ server: 'Pixeldrain', link: href, type: 'mkv' })
      } else if (href.includes('.dev') && !href.includes('/?id=')) {
        streamLinks.push({ server: 'Cf Worker', link: href, type: 'mkv' })
      } else if (href.includes('cloudflarestorage')) {
        streamLinks.push({ server: 'CfStorage', link: href, type: 'mkv' })
      } else if (href.includes('fastdl') || href.includes('fsl.')) {
        streamLinks.push({ server: 'FastDl', link: href, type: 'mkv' })
      } else if (href.includes('hubcdn') && !href.includes('/?id=')) {
        streamLinks.push({ server: 'HubCdn', link: href, type: 'mkv' })
      } else if (href.includes('hubcloud') || href.includes('/?id=')) {
        // Resolve redirect via proxy (proxy follows 301/302 server-side)
        try {
          const rr = await proxyFetch(href, { signal })
          const finalUrl = rr.url || href
          const resolved = finalUrl.includes('?link=') ? finalUrl.split('?link=')[1] : finalUrl
          streamLinks.push({ server: 'HubCloud', link: resolved || href, type: 'mkv' })
        } catch {
          streamLinks.push({ server: 'HubCloud', link: href, type: 'mkv' })
        }
      } else if (href.includes('.mkv') || href.includes('?token=')) {
        const srv = href.match(/^(?:https?:\/\/)?(?:www\.)?([^/]+)/i)?.[1]?.replace(/\./g, ' ') || 'Unknown'
        streamLinks.push({ server: srv, link: href, type: 'mkv' })
      }
    }
    console.log('[hubcloud] found streams:', streamLinks.length)
    return streamLinks
  } catch (e) {
    console.error('[hubcloud]', e.message)
    return []
  }
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
    },
    Crypto: { randomUUID: () => crypto.randomUUID(), getRandomValues: a => crypto.getRandomValues(a) },
    Aes: { encrypt: async () => '', decrypt: async () => '' },
    extractors: {
      hubcloudExtracter: hubcloudExtractor,
      hubcloudExtractor: hubcloudExtractor,
      gofileExtracter:     async () => ({ link: '', token: '' }),
      superVideoExtractor: async () => '',
      gdFlixExtracter:     async () => [],
    },
  }
}

// ── stream type normalizer ────────────────────────────────────────────────
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
  // For drive: run the actual module with proxy-patched fetch injected
  // The module's fetch() calls go through smartFetch (our injected version)
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
