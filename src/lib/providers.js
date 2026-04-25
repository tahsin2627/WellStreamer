import { cacheStorage } from './storage.js'

const MANIFEST_URL  = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/manifest.json'
const MODULES_BASE  = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/dist'
const BASE_URL_JSON = 'https://himanshu8443.github.io/providers/modflix.json'
const DRIVE_BASE    = 'https://new2.moviesdrives.my/'
const RIVE_BASE     = 'https://rivestream.live'

const PROXIES = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
]
const moduleCache = new Map()

// ── Race all proxies in parallel ──────────────────────────────────────────
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
  } catch { throw new Error(`All proxies failed: ${url}`) }
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

// ── Base URL ──────────────────────────────────────────────────────────────
export async function getBaseUrl(key) {
  if (key === 'drive') return DRIVE_BASE
  if (key === 'rive')  return RIVE_BASE
  const c = cacheStorage.getValid(`bu_${key}`)
  if (c) return c
  try {
    const d = await getJSON(BASE_URL_JSON)
    Object.entries(d).forEach(([k, v]) => { if (v?.url) cacheStorage.set(`bu_${k}`, v.url, 3_600_000) })
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
      { env: { CORS_PRXY: PROXIES[0]('').replace(/=$/,'='), NODE_ENV: 'production' } },
      (u, o = {}) => {
        if (o.redirect === 'manual' || o.method === 'HEAD') {
          return proxyFetch(u, { ...o, redirect: 'follow', method: 'GET' })
        }
        return smartFetch(u, o)
      }
    ) || mod.exports
  } catch (e) { console.warn('[runModule]', e.message); return mod.exports }
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
        find:     s  => { try { return $(s, arr) } catch { return wrap([]) } },
        filter:   fn => {
          if (typeof fn === 'function') return wrap(arr.filter((n, i) => fn(i, n)))
          if (typeof fn === 'string') return wrap(arr.filter(n => { try { return n.matches?.(fn) } catch { return false } }))
          return o
        },
        not:      s  => wrap(arr.filter(n => { try { return !n.matches?.(s) } catch { return true } })),
        parent:   () => wrap(arr.map(n => n.parentElement).filter(Boolean)),
        parents:  s  => { const r = []; arr.forEach(n => { let p = n.parentElement; while (p) { if (!s || p.matches?.(s)) r.push(p); p = p.parentElement } }); return wrap(r) },
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

    // Full :contains() polyfill supporting compound selectors
    function resolveContains(sel, root) {
      // Split on :contains(...) to handle multiple occurrences
      const parts = []
      let remaining = sel
      let nodes = root ? (Array.isArray(root) ? root : [root]) : null

      while (remaining.includes(':contains(')) {
        const idx = remaining.indexOf(':contains(')
        const before = remaining.slice(0, idx)
        // Find matching closing paren
        const start = idx + ':contains('.length
        let depth = 1, i = start
        while (i < remaining.length && depth > 0) {
          if (remaining[i] === '(') depth++
          else if (remaining[i] === ')') depth--
          i++
        }
        const textRaw = remaining.slice(start, i - 1).replace(/^["']|["']$/g, '')
        remaining = remaining.slice(i)

        // Apply the base selector up to :contains
        const baseStr = before.trim()
        if (nodes === null) {
          // First pass — search whole doc
          const pool = baseStr ? [...doc.querySelectorAll(baseStr)] : [...doc.querySelectorAll('*')]
          nodes = pool.filter(el => el.textContent?.includes(textRaw))
        } else {
          // Subsequent pass — filter existing nodes
          if (baseStr) {
            nodes = nodes.flatMap(n => [...(n.querySelectorAll?.(baseStr) || [])])
          }
          nodes = nodes.filter(el => el.textContent?.includes(textRaw))
        }
      }

      // Apply any remaining selector after all :contains() processed
      const rest = remaining.trim()
      if (rest && nodes) {
        try {
          nodes = nodes.flatMap(n => [...(n.querySelectorAll?.(rest) || [])])
        } catch { nodes = [] }
      }

      return nodes || []
    }

    function $(sel, context) {
      if (!sel) return wrap([])
      if (typeof sel !== 'string') return wrap([sel].flat().filter(Boolean))
      if (sel.includes(':contains(')) {
        const root = context
          ? (Array.isArray(context) ? context : [context])
          : null
        return wrap(resolveContains(sel, root))
      }
      const pool = context
        ? (Array.isArray(context) ? context : [context])
        : null
      try {
        if (pool) {
          return wrap(pool.flatMap(n => [...(n.querySelectorAll?.(sel) || [])]))
        }
        return wrap([...doc.querySelectorAll(sel)])
      } catch { return wrap([]) }
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
    return { data, status: r.status, statusText: r.statusText, headers: Object.fromEntries(r.headers.entries()), request: { responseURL: r.url } }
  }
  const ax = async (u, c) => req(u, c)
  ax.get    = (u, c = {})     => req(u, { ...c, method: 'GET' })
  ax.post   = (u, d, c = {}) => req(u, { ...c, method: 'POST', data: d })
  ax.put    = (u, d, c = {}) => req(u, { ...c, method: 'PUT',  data: d })
  ax.delete = (u, c = {})     => req(u, { ...c, method: 'DELETE' })
  ax.head   = async (u, c = {}) => {
    try {
      const r = await proxyFetch(u, { signal: c.signal, method: 'GET' })
      return { status: r.status, headers: Object.fromEntries(r.headers.entries()), request: { responseURL: r.url } }
    } catch { return { status: 0, headers: {}, request: { responseURL: u } } }
  }
  ax.create = (d = {}) => { const i = makeAxios(forceProxy); i._defaults = d; return i }
  ax.defaults = { headers: { common: {} } }
  ax.interceptors = { request: { use: () => {}, eject: () => {} }, response: { use: () => {}, eject: () => {} } }
  return ax
}

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Cookie': 'xla=s4t; ext_name=ojplmecpdpgccookcobabopnaifgidhf',
}

function makeCtx(forceProxy = false) {
  return {
    axios: makeAxios(forceProxy),
    getBaseUrl,
    cheerio: { load: cheerioLoad },
    commonHeaders: COMMON_HEADERS,
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

// ══════════════════════════════════════════════════════════════════════════
// CUSTOM MOVIESDRIVE — bypasses all broken :contains() issues
// ══════════════════════════════════════════════════════════════════════════

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

// Parse posts from RSS or HTML
function parseDrivePosts(html) {
  const $ = cheerioLoad(html)
  const out = []
  $('.poster-card').each((_, el) => {
    const title = $(el).find('.poster-title').text().trim()
    const link  = $(el).parent().attr('href') || ''
    const image = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || ''
    if (title && link) out.push({ title: title.replace(/download/gi, '').trim(), link, image })
  })
  if (!out.length) {
    $('article').each((_, el) => {
      const title = $(el).find('h2,h3,.entry-title').first().text().trim()
      const link  = $(el).find('a').first().attr('href') || ''
      const image = $(el).find('img').first().attr('src') || ''
      if (title && link?.startsWith('http')) out.push({ title: title.replace(/download/gi, '').trim(), link, image })
    })
  }
  return out
}

// Custom drive getMeta — no :contains() used, pure href/regex matching
async function driveGetMeta(link, signal) {
  const html = await (await proxyFetch(link, { signal })).text()
  const $    = cheerioLoad(html)

  const bodyText = $('body').text()
  const type     = bodyText.toLowerCase().includes('movie name') ? 'movie' : 'series'
  const title    = $('.entry-title, h1.title, h1').first().text().trim()
  const synopsis = $('.entry-content p').first().text().trim()
  const image    = $('img.aligncenter, img.wp-post-image, .entry-content img').first().attr('src') || ''

  // Find IMDb ID from any IMDb link
  let imdbId = ''
  $('a[href*="imdb.com"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const m = href.match(/title\/(tt\d+)/)
    if (m) imdbId = m[1]
  })

  // Find all quality download links — look for anchors with quality text
  // Use regex on raw HTML instead of :contains() selector
  const links = []
  const allAnchors = $('a').toArray()
  const qualityRe = /\b(480p|720p|1080p|2160p|4k)\b/i

  if (type === 'movie') {
    // For movies: find ALL external download page links
    const seen = new Set()
    allAnchors.forEach(el => {
      const href = el.getAttribute('href') || ''
      const text = el.textContent || ''
      if (
        href.startsWith('http') &&
        !href.includes('moviesdrives') &&
        !href.includes('facebook') &&
        !href.includes('twitter') &&
        !href.includes('imdb.com') &&
        !text.toLowerCase().includes('zip') &&
        !seen.has(href)
      ) {
        seen.add(href)
        const qMatch = (el.closest('p,h5,h4,h3,div')?.textContent || text).match(qualityRe)
        const quality = qMatch?.[0] || ''
        links.push({
          title: quality || text.trim() || 'Movie',
          episodesLink: '',
          directLinks: [{ title: quality || 'Movie', link: href, type: 'movie' }],
          quality,
        })
      }
    })
  } else {
    // For series: find episode group links
    const seen = new Set()
    allAnchors.forEach(el => {
      const href = el.getAttribute('href') || ''
      const text = (el.closest('p,h5,h4,h3')?.textContent || el.textContent || '').trim()
      if (
        href.startsWith('http') &&
        !href.includes('moviesdrives') &&
        !href.includes('facebook') &&
        !href.includes('twitter') &&
        !href.includes('imdb.com') &&
        !text.toLowerCase().includes('zip') &&
        !seen.has(href)
      ) {
        seen.add(href)
        links.push({
          title: text || 'Episodes',
          episodesLink: href,
          directLinks: [],
          quality: text.match(qualityRe)?.[0] || '',
        })
      }
    })
  }

  console.log('[drive meta] type:', type, 'links found:', links.length)
  return { title, synopsis, image, imdbId, type, linkList: links }
}

// Custom drive getStream — finds hubcloud links by href pattern, not :contains()
async function driveGetStream(link, type, signal) {
  try {
    console.log('[drive stream] fetching:', link, 'type:', type)
    const html = await (await proxyFetch(link, { signal })).text()
    const $    = cheerioLoad(html)

    // Find hubcloud/vcloud links by href, not text
    let hubLink = ''
    $('a').each((_, el) => {
      const href = el.getAttribute('href') || ''
      if (!hubLink && (
        href.includes('hubcloud') ||
        href.includes('vcloud') ||
        href.includes('hub.') ||
        href.includes('gdflix') ||
        href.includes('pixeldrain')
      )) {
        hubLink = href
      }
    })

    // Also search raw HTML for hubcloud URLs (sometimes in JS or data attrs)
    if (!hubLink) {
      const m = html.match(/https?:\/\/[^\s"']+hubcloud[^\s"']*/i) ||
                html.match(/https?:\/\/[^\s"']+vcloud[^\s"']*/i)
      if (m) hubLink = m[0]
    }

    console.log('[drive stream] hubLink:', hubLink)
    if (!hubLink) return []

    return driveHubcloudExtract(hubLink, signal)
  } catch (e) {
    console.error('[drive stream]', e.message)
    return []
  }
}

// Hubcloud extractor — follows vcloud redirect chain via proxy
async function driveHubcloudExtract(link, signal) {
  const streamLinks = []
  try {
    const hdrs = { ...COMMON_HEADERS }
    const baseUrl = link.split('/').slice(0, 3).join('/')

    // Step 1: fetch the initial link page (may be hubcloud or a redirect page)
    const r1   = await proxyFetch(link, { signal })
    const html1 = await r1.text()
    const $1   = cheerioLoad(html1)

    // Look for var url = 'BASE64' pattern
    const urlMatch = html1.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/i)
    let vcloudLink = ''

    if (urlMatch?.[1]) {
      try {
        const decoded = atob(urlMatch[1])
        vcloudLink = decoded.startsWith('http') ? decoded : ''
      } catch { vcloudLink = '' }
      if (!vcloudLink) {
        // Try split on r=
        const rPart = urlMatch[1].split('r=')?.[1]
        if (rPart) { try { vcloudLink = atob(rPart) } catch {} }
      }
      if (!vcloudLink) vcloudLink = urlMatch[1]
    }

    // Fallback: look for download button link
    if (!vcloudLink) {
      $1('a').each((_, el) => {
        const href = el.getAttribute('href') || ''
        const cls  = el.getAttribute('class') || ''
        if (!vcloudLink && (cls.includes('btn') || href.includes('vcloud') || href.includes('hubcloud'))) {
          vcloudLink = href
        }
      })
    }

    if (vcloudLink?.startsWith('/')) vcloudLink = `${baseUrl}${vcloudLink}`
    console.log('[hubcloud] vcloudLink:', vcloudLink)

    if (!vcloudLink) return []

    // Step 2: fetch the vcloud download page
    const r2   = await proxyFetch(vcloudLink, { signal })
    const html2 = await r2.text()
    const $2   = cheerioLoad(html2)

    // Extract all download buttons
    $2('a').each((_, el) => {
      let href = el.getAttribute('href') || ''
      const cls  = el.getAttribute('class') || ''
      const text = el.textContent?.trim() || ''

      if (!href || href === '#' || href.startsWith('javascript')) return

      // Pixeldrain — convert to streaming URL
      if (href.includes('pixeld')) {
        if (!href.includes('/api/')) {
          const token = href.split('/').pop()
          const base2 = href.split('/').slice(0, -2).join('/')
          href = `${base2}/api/file/${token}`
        }
        streamLinks.push({ server: 'Pixeldrain', link: href, type: 'mkv' })
      }
      // CF Worker
      else if (href.includes('.dev') && !href.includes('/?id=')) {
        streamLinks.push({ server: 'Cf Worker', link: href, type: 'mkv' })
      }
      // Cloudflare Storage
      else if (href.includes('cloudflarestorage')) {
        streamLinks.push({ server: 'CfStorage', link: href, type: 'mkv' })
      }
      // FastDL
      else if (href.includes('fastdl') || href.includes('fsl.')) {
        streamLinks.push({ server: 'FastDl', link: href, type: 'mkv' })
      }
      // HubCDN
      else if (href.includes('hubcdn') && !href.includes('/?id=')) {
        streamLinks.push({ server: 'HubCdn', link: href, type: 'mkv' })
      }
      // Direct MKV or token links
      else if (href.includes('.mkv') || href.includes('?token=')) {
        const srv = href.match(/^(?:https?:\/\/)?(?:www\.)?([^/]+)/i)?.[1] || 'Stream'
        streamLinks.push({ server: srv, link: href, type: 'mkv' })
      }
      // Any other btn-style link that looks like a stream
      else if ((cls.includes('btn-success') || cls.includes('btn-danger') || cls.includes('btn-secondary')) && href.startsWith('http')) {
        streamLinks.push({ server: text || 'Stream', link: href, type: 'mkv' })
      }
    })

    console.log('[hubcloud] streams found:', streamLinks.length, streamLinks)
    return streamLinks
  } catch (e) {
    console.error('[hubcloud]', e.message)
    return []
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

// ── Public API ────────────────────────────────────────────────────────────
export async function getCatalog(pv) {
  if (pv === 'drive') return { catalog: DRIVE_CATALOG, genres: [] }
  const mod = runModule(await loadModule(pv, 'catalog'))
  return { catalog: mod.catalog || [], genres: mod.genres || [] }
}

export async function getPosts({ providerValue: pv, filter, page, signal }) {
  if (pv === 'drive') {
    // RSS feed — fastest, bypasses Cloudflare
    try {
      const r    = await proxyFetch(`${DRIVE_BASE}${filter}feed/`, { signal })
      const xml  = new DOMParser().parseFromString(await r.text(), 'text/xml')
      const items = [...xml.querySelectorAll('item')]
      if (items.length) {
        return items.slice((page - 1) * 20, page * 20).map(it => {
          const title = it.querySelector('title')?.textContent?.trim() || ''
          const link  = it.querySelector('link')?.textContent?.trim()  || ''
          const body  = it.querySelector('encoded')?.textContent || it.querySelector('description')?.textContent || ''
          const image = body.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || ''
          return title && link ? { title: title.replace(/download/gi, '').trim(), link, image } : null
        }).filter(Boolean)
      }
    } catch (e) { console.warn('[drive posts] RSS:', e.message) }
    // HTML fallback
    try {
      const r   = await proxyFetch(`${DRIVE_BASE}${filter}page/${page}/`, { signal })
      return parseDrivePosts(await r.text())
    } catch { return [] }
  }
  const mod = runModule(await loadModule(pv, 'posts'))
  if (typeof mod.getPosts !== 'function') throw new Error('no getPosts')
  return mod.getPosts({ filter, page, providerValue: pv, signal, providerContext: makeCtx() })
}

export async function searchPosts({ providerValue: pv, searchQuery, page, signal }) {
  if (pv === 'drive') {
    try {
      const r = await proxyFetch(`${DRIVE_BASE}?s=${encodeURIComponent(searchQuery)}`, { signal })
      return parseDrivePosts(await r.text())
    } catch { return [] }
  }
  const mod = runModule(await loadModule(pv, 'posts'))
  if (typeof mod.getSearchPosts !== 'function') throw new Error('no getSearchPosts')
  return mod.getSearchPosts({ searchQuery, page, providerValue: pv, signal, providerContext: makeCtx() })
}

export async function getMeta({ providerValue: pv, link }) {
  // Custom drive meta — avoids broken :contains() selectors
  if (pv === 'drive') return driveGetMeta(link)
  const mod = runModule(await loadModule(pv, 'meta'))
  if (typeof mod.getMeta !== 'function') throw new Error('no getMeta')
  return mod.getMeta({ link, provider: pv, providerContext: makeCtx() })
}

export async function getStream({ providerValue: pv, link, type, signal }) {
  // Custom drive stream — finds hubcloud by href pattern, not :contains()
  if (pv === 'drive') {
    const streams = await driveGetStream(link, type, signal)
    return fixStreams(streams, pv)
  }
  const mod = runModule(await loadModule(pv, 'stream'))
  if (typeof mod.getStream !== 'function') throw new Error('no getStream')
  const raw = await mod.getStream({ link, type, signal, providerContext: makeCtx() })
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
