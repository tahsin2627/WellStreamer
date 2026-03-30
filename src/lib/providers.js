import { cacheStorage } from './storage.js'

const MANIFEST_URL = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/manifest.json'
const MODULES_BASE = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/dist'
const BASE_URL_JSON = 'https://himanshu8443.github.io/providers/modflix.json'

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
}

const PROXIES = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://thingproxy.freeboard.io/fetch/${u}`,
]

const moduleCache = new Map()

// ── Core fetch with CORS proxy fallback ──────────────────────────────────
async function fetchRaw(url, opts = {}) {
  const { signal, headers = {}, method = 'GET', body, redirect } = opts
  const mergedHeaders = { ...COMMON_HEADERS, ...headers }

  // Try direct first (works for github raw, open APIs)
  try {
    const r = await fetch(url, { method, headers: mergedHeaders, body, signal, mode: 'cors', redirect: redirect || 'follow' })
    if (r.ok || r.status === 301 || r.status === 302) return r
  } catch (_) {}

  // Try each proxy
  for (const proxy of PROXIES) {
    try {
      const r = await fetch(proxy(url), { method, headers: mergedHeaders, body, signal })
      if (r.ok) return r
    } catch (e) {
      if (signal?.aborted) throw e
    }
  }
  throw new Error(`fetch failed: ${url}`)
}

async function fetchText(url, opts) {
  return (await fetchRaw(url, opts)).text()
}
async function fetchJSON(url, opts) {
  return (await fetchRaw(url, opts)).json()
}

// ── Base URL ──────────────────────────────────────────────────────────────
export async function getBaseUrl(pv) {
  const c = cacheStorage.getValid(`bu_${pv}`)
  if (c) return c
  try {
    const d = await fetchJSON(BASE_URL_JSON)
    for (const [k, v] of Object.entries(d)) {
      if (v?.url) cacheStorage.set(`bu_${k}`, v.url, 3_600_000)
    }
    return d[pv]?.url || ''
  } catch { return '' }
}

// ── Manifest ──────────────────────────────────────────────────────────────
export async function fetchManifest() {
  const c = cacheStorage.getValid('manifest')
  if (c) return c
  const d = await fetchJSON(MANIFEST_URL)
  if (!Array.isArray(d)) throw new Error('bad manifest')
  cacheStorage.set('manifest', d, 3_600_000)
  return d
}

// ── Module loader ─────────────────────────────────────────────────────────
async function getModule(pv, name) {
  const k = `${pv}/${name}`
  if (moduleCache.has(k)) return moduleCache.get(k)
  const code = await fetchText(`${MODULES_BASE}/${pv}/${name}.js`)
  moduleCache.set(k, code)
  return code
}

// ── Module executor ───────────────────────────────────────────────────────
function run(code) {
  const mod = { exports: {} }
  try {
    const fn = new Function(
      'exports','module','console','Promise','Object',
      'setTimeout','clearTimeout','setInterval','clearInterval',
      `"use strict";\n${code}\nreturn module.exports&&Object.keys(module.exports).length?module.exports:exports;`
    )
    return fn(mod.exports,mod,console,Promise,Object,setTimeout,clearTimeout,setInterval,clearInterval) || mod.exports
  } catch(e) {
    console.warn('[WS] Module exec error:', e.message)
    return mod.exports
  }
}

// ── Cheerio shim (DOMParser-based) ───────────────────────────────────────
function makeCheerio() {
  const wrap = (nodes) => {
    if (!Array.isArray(nodes)) nodes = nodes ? [nodes] : []
    const obj = {
      _nodes: nodes, length: nodes.length,
      text:    () => nodes.map(n => n.textContent || '').join(''),
      html:    () => nodes.map(n => n.innerHTML || '').join(''),
      attr:    (a) => nodes[0]?.getAttribute?.(a) || '',
      val:     () => nodes[0]?.value || '',
      first:   () => wrap(nodes.slice(0,1)),
      last:    () => wrap(nodes.slice(-1)),
      eq:      (i) => wrap(nodes.slice(i, i+1)),
      find:    (s) => wrap(nodes.flatMap(n => { try { return [...n.querySelectorAll(s)] } catch { return [] } })),
      filter:  (s) => wrap(nodes.filter(n => { try { return n.matches?.(s) } catch { return false } })),
      children:(s) => wrap(nodes.flatMap(n => { try { return [...(s ? n.querySelectorAll(':scope > '+s) : n.children)] } catch { return [] } })),
      parent:  () => wrap(nodes.map(n => n.parentElement).filter(Boolean)),
      next:    () => wrap(nodes.map(n => n.nextElementSibling).filter(Boolean)),
      prev:    () => wrap(nodes.map(n => n.previousElementSibling).filter(Boolean)),
      each:    (fn) => { nodes.forEach((n,i) => fn(i, n)); return obj },
      map:     (fn) => nodes.map((n,i) => fn(i, n)),
      get:     (i) => i == null ? nodes : nodes[i],
      toArray: () => nodes,
      hasClass:(c) => nodes[0]?.classList?.contains(c) || false,
      addClass: () => obj, removeClass: () => obj,
      remove:  () => { nodes.forEach(n => n.remove()); return obj },
      is:      (s) => nodes.some(n => { try { return n.matches?.(s) } catch { return false } }),
      not:     (s) => wrap(nodes.filter(n => { try { return !n.matches?.(s) } catch { return true } })),
      closest: (s) => wrap(nodes.map(n => n.closest?.(s)).filter(Boolean)),
      contents:() => wrap(nodes.flatMap(n => [...n.childNodes])),
    }
    return obj
  }

  return {
    load: (html) => {
      let doc
      try {
        doc = new DOMParser().parseFromString(typeof html === 'string' ? html : String(html), 'text/html')
      } catch {
        const noop = () => noop
        noop.text = () => ''; noop.html = () => ''; noop.attr = () => ''
        noop.each = () => noop; noop.find = () => noop; noop.first = () => noop
        noop.length = 0; noop.get = () => []; noop._nodes = []
        return noop
      }
      const $ = (selector) => {
        if (!selector) return wrap([])
        try { return wrap([...doc.querySelectorAll(selector)]) } catch { return wrap([]) }
      }
      $.html   = (el) => el ? (typeof el === 'string' ? el : el.outerHTML || '') : doc.documentElement.outerHTML
      $.text   = () => doc.body?.textContent || ''
      $.root   = () => ({ find: (s) => $(s), html: () => doc.documentElement.outerHTML })
      $._doc   = doc
      return $
    }
  }
}

// ── Real extractor implementations ────────────────────────────────────────

// SuperVideo: decodes obfuscated JS to extract m3u8 URL
async function superVideoExtractor(data) {
  try {
    const functionRegex = /eval\(function\((.*?)\)\{.*?return p\}.*?\('(.*?)'\.split/
    const match = functionRegex.exec(data)
    if (!match) return ''
    const encodedString = match[2]
    let p = encodedString.split("',36,")?.[0]?.trim() || ''
    let c = encodedString.split("',36,")?.[1]?.slice(2)?.split('|')?.length || 0
    let k = encodedString.split("',36,")?.[1]?.slice(2)?.split('|') || []
    while (c--) {
      if (k[c]) {
        const regex = new RegExp('\\b' + c.toString(36) + '\\b', 'g')
        p = p.replace(regex, k[c])
      }
    }
    return p?.match(/file:\s*"([^"]+\.m3u8[^"]*)"/)?.[1] || ''
  } catch { return '' }
}

// GoFile extractor
async function gofileExtracter(id) {
  try {
    const tokenRes = await fetchJSON('https://api.gofile.io/accounts')
    const token = tokenRes?.data?.token || ''
    const fileRes = await fetchJSON(
      `https://api.gofile.io/contents/${id}?wt=4fd6sg89d7s6&cache=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const link = Object.values(fileRes?.data?.contents || {})?.[0]?.link || ''
    return { link, token }
  } catch { return { link: '', token: '' } }
}

// HubCloud extractor — real implementation
async function hubcloudExtracter(link, signal) {
  try {
    const baseUrl = link.split('/').slice(0, 3).join('/')
    const streamLinks = []
    const vLinkText = await fetchText(link, { headers: COMMON_HEADERS, signal })
    const $ = makeCheerio().load(vLinkText)
    const vLinkRedirect = vLinkText.match(/var\s+url\s*=\s*'([^']+)';/) || []

    let vcloudLink =
      (vLinkRedirect[1]?.split('r=')?.[1] ? atob(vLinkRedirect[1].split('r=')[1]) : '') ||
      vLinkRedirect[1] ||
      $('.fa-file-download.fa-lg').parent().attr('href') ||
      link

    if (vcloudLink?.startsWith('/')) vcloudLink = `${baseUrl}${vcloudLink}`

    const vcloudText = await fetchText(vcloudLink, { headers: COMMON_HEADERS, signal })
    const $v = makeCheerio().load(vcloudText)
    const linkEls = $v('.btn-success.btn-lg.h6, .btn-danger, .btn-secondary')._nodes

    for (const el of linkEls) {
      let href = el.getAttribute?.('href') || ''
      if (!href) continue

      if (href.includes('pixeld')) {
        if (!href.includes('api')) {
          const token = href.split('/').pop()
          const base  = href.split('/').slice(0, -2).join('/')
          href = `${base}/api/file/${token}?download`
        }
        streamLinks.push({ server: 'Pixeldrain', link: href, type: 'mkv' })
      } else if (href.includes('.dev') && !href.includes('/?id=')) {
        streamLinks.push({ server: 'Cf Worker', link: href, type: 'mkv' })
      } else if (href.includes('cloudflarestorage')) {
        streamLinks.push({ server: 'CfStorage', link: href, type: 'mkv' })
      } else if (href.includes('hubcdn') && !href.includes('/?id=')) {
        streamLinks.push({ server: 'HubCdn', link: href, type: 'mkv' })
      } else if (href.includes('.mkv') || href.includes('?token=')) {
        const serverName = href.match(/^(?:https?:\/\/)?(?:www\.)?([^/]+)/i)?.[1]?.replace(/\./g,' ') || 'Server'
        streamLinks.push({ server: serverName, link: href, type: 'mkv' })
      }
    }
    return streamLinks
  } catch (e) {
    console.warn('[WS] hubcloudExtracter error:', e.message)
    return []
  }
}

// GdFlix extractor — real implementation
async function gdFlixExtracter(link, signal) {
  try {
    const streamLinks = []
    let html = await fetchText(link, { headers: COMMON_HEADERS, signal })
    let $ = makeCheerio().load(html)

    // Handle redirect
    const onload = $('body').attr('onload') || ''
    if (onload.includes('location.replace')) {
      const newLink = onload.split("location.replace('")?.[1]?.split("'")?.[0]
      if (newLink) {
        html = await fetchText(newLink, { headers: COMMON_HEADERS, signal })
        $ = makeCheerio().load(html)
      }
    }

    // Extract links from buttons
    $('a').each((_, el) => {
      const href = el.getAttribute?.('href') || ''
      const txt  = (el.textContent || '').toLowerCase()
      if (!href) return
      if (href.includes('.mkv') || href.includes('.mp4') || href.includes('m3u8')) {
        streamLinks.push({ server: txt || 'GdFlix', link: href, type: href.includes('m3u8') ? 'hls' : 'mkv' })
      }
    })
    return streamLinks
  } catch (e) {
    console.warn('[WS] gdFlixExtracter error:', e.message)
    return []
  }
}

// ── Axios-compatible shim ─────────────────────────────────────────────────
function makeAxios() {
  const req = async (urlOrCfg, cfg = {}) => {
    const isStr  = typeof urlOrCfg === 'string'
    const url    = isStr ? urlOrCfg : urlOrCfg.url || ''
    const method = ((isStr ? cfg.method : urlOrCfg.method) || 'GET').toUpperCase()
    const hdrs   = { ...(isStr ? cfg.headers || {} : urlOrCfg.headers || {}) }
    const data   = isStr ? cfg.data : urlOrCfg.data
    const signal = isStr ? cfg.signal : urlOrCfg.signal
    const params = isStr ? cfg.params : urlOrCfg.params

    let finalUrl = url
    if (params) {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([,v]) => v != null))
      ).toString()
      finalUrl = `${url}${url.includes('?') ? '&' : '?'}${qs}`
    }

    const body = data && typeof data !== 'string' ? JSON.stringify(data) : data
    const res  = await fetchRaw(finalUrl, { method, headers: hdrs, body, signal })
    const text = await res.text()
    let respData
    try { respData = JSON.parse(text) } catch { respData = text }
    return { data: respData, status: res.status, statusText: res.statusText, headers: Object.fromEntries(res.headers.entries()) }
  }

  const ax       = (u, c) => req(u, c)
  ax.get         = (u, c) => req(u, { ...c, method: 'GET' })
  ax.post        = (u, d, c) => req(u, { ...c, method: 'POST', data: d })
  ax.put         = (u, d, c) => req(u, { ...c, method: 'PUT', data: d })
  ax.delete      = (u, c) => req(u, { ...c, method: 'DELETE' })
  ax.create      = () => makeAxios()
  ax.defaults    = { headers: { common: {}, get: {}, post: {} } }
  ax.interceptors = { request: { use: () => {}, eject: () => {} }, response: { use: () => {}, eject: () => {} } }
  return ax
}

// ── Provider context ──────────────────────────────────────────────────────
function makeContext() {
  return {
    axios: makeAxios(),
    getBaseUrl,
    Crypto: {
      randomUUID:      () => crypto.randomUUID(),
      getRandomValues: (a) => crypto.getRandomValues(a),
    },
    commonHeaders: COMMON_HEADERS,
    cheerio: makeCheerio(),
    extractors: {
      hubcloudExtracter,
      gofileExtracter,
      superVideoExtractor,
      gdFlixExtracter,
    },
  }
}

// ── Public API ────────────────────────────────────────────────────────────
export async function getCatalog(pv) {
  const mod = run(await getModule(pv, 'catalog'))
  return { catalog: mod.catalog || [], genres: mod.genres || [] }
}

export async function getPosts({ providerValue, filter, page, signal }) {
  const mod = run(await getModule(providerValue, 'posts'))
  if (typeof mod.getPosts !== 'function') throw new Error('No getPosts')
  return mod.getPosts({ filter, page, providerValue, signal, providerContext: makeContext() })
}

export async function searchPosts({ providerValue, searchQuery, page, signal }) {
  const mod = run(await getModule(providerValue, 'posts'))
  if (typeof mod.getSearchPosts !== 'function') throw new Error('No getSearchPosts')
  return mod.getSearchPosts({ searchQuery, page, providerValue, signal, providerContext: makeContext() })
}

export async function getMeta({ providerValue, link }) {
  const mod = run(await getModule(providerValue, 'meta'))
  if (typeof mod.getMeta !== 'function') throw new Error('No getMeta')
  return mod.getMeta({ link, provider: providerValue, providerContext: makeContext() })
}

export async function getStream({ providerValue, link, type, signal }) {
  const mod = run(await getModule(providerValue, 'stream'))
  if (typeof mod.getStream !== 'function') throw new Error('No getStream')
  return mod.getStream({ link, type, signal, providerContext: makeContext() })
}

export async function getEpisodes({ providerValue, url }) {
  try {
    const mod = run(await getModule(providerValue, 'episodes'))
    if (typeof mod.getEpisodes !== 'function') return []
    return mod.getEpisodes({ url, providerContext: makeContext() })
  } catch { return [] }
}

export async function installProvider(pv) {
  await Promise.all(['catalog', 'posts', 'meta', 'stream'].map(m => getModule(pv, m)))
}
