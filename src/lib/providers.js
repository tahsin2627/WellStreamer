import { cacheStorage } from './storage.js'

const MANIFEST_URL = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/manifest.json'
const MODULES_BASE = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/dist'
const BASE_URL_JSON = 'https://himanshu8443.github.io/providers/modflix.json'

// Multiple CORS proxies — tried in order until one works
const PROXIES = [
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://cors-anywhere.herokuapp.com/${u}`,
  (u) => `https://thingproxy.freeboard.io/fetch/${u}`,
]

const moduleCodeCache = new Map()

// ── Core fetch with proxy fallback ────────────────────────────────────────
async function fetchWithFallback(url, options = {}) {
  const { signal, headers = {}, method = 'GET', body } = options

  const attempts = [
    // 1. Direct (works for GitHub raw, some open APIs)
    () => fetch(url, { method, headers, body, signal, mode: 'cors' }),
    // 2-5. Each proxy
    ...PROXIES.map(makeProxy => () =>
      fetch(makeProxy(url), { method, headers, body, signal })
    ),
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
  throw lastErr || new Error(`Failed to fetch: ${url}`)
}

async function fetchText(url, opts) {
  const res = await fetchWithFallback(url, opts)
  return res.text()
}

async function fetchJSON(url, opts) {
  const res = await fetchWithFallback(url, opts)
  return res.json()
}

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
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'exports', 'module', 'console', 'Promise', 'Object',
      'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      `"use strict";\n${code}\nreturn module.exports && Object.keys(module.exports).length ? module.exports : exports;`
    )
    return fn(mod.exports, mod, console, Promise, Object, setTimeout, clearTimeout, setInterval, clearInterval) || mod.exports
  } catch (e) {
    console.warn('Module exec error:', e.message)
    return mod.exports
  }
}

// ── Axios-compatible shim injected into provider context ──────────────────
function makeAxios() {
  const request = async (urlOrConfig, config = {}) => {
    const isString = typeof urlOrConfig === 'string'
    const url      = isString ? urlOrConfig : urlOrConfig.url
    const method   = (isString ? config.method : urlOrConfig.method)?.toUpperCase() || 'GET'
    const headers  = isString ? (config.headers || {}) : (urlOrConfig.headers || {})
    const body     = isString ? config.data : urlOrConfig.data
    const signal   = isString ? config.signal : urlOrConfig.signal
    const params   = isString ? config.params : urlOrConfig.params

    let finalUrl = url
    if (params) {
      const qs = new URLSearchParams(params).toString()
      finalUrl = `${url}${url.includes('?') ? '&' : '?'}${qs}`
    }

    const bodyStr = body && typeof body !== 'string' ? JSON.stringify(body) : body
    const res = await fetchWithFallback(finalUrl, { method, headers, body: bodyStr, signal })
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return {
      data,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
    }
  }

  const axiosInstance = async (urlOrConfig, config) => request(urlOrConfig, config)
  axiosInstance.get     = (url, cfg)       => request(url, { ...cfg, method: 'GET' })
  axiosInstance.post    = (url, data, cfg) => request(url, { ...cfg, method: 'POST', data })
  axiosInstance.put     = (url, data, cfg) => request(url, { ...cfg, method: 'PUT',  data })
  axiosInstance.delete  = (url, cfg)       => request(url, { ...cfg, method: 'DELETE' })
  axiosInstance.create  = (defaults = {}) => {
    const inst = makeAxios()
    inst._defaults = defaults
    return inst
  }
  axiosInstance.defaults = { headers: { common: {} } }
  axiosInstance.interceptors = {
    request:  { use: () => {}, eject: () => {} },
    response: { use: () => {}, eject: () => {} },
  }
  return axiosInstance
}

// ── Provider context ──────────────────────────────────────────────────────
function makeContext() {
  return {
    axios: makeAxios(),
    getBaseUrl,
    Crypto: {
      randomUUID: () => crypto.randomUUID(),
      getRandomValues: (a) => crypto.getRandomValues(a),
    },
    commonHeaders: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    cheerio: {
      load: (html) => {
        // Minimal cheerio shim using DOMParser (available in browsers)
        try {
          const parser = new DOMParser()
          const doc = parser.parseFromString(html, 'text/html')
          const $ = (selector) => {
            const els = [...doc.querySelectorAll(selector)]
            const wrap = (nodeList) => {
              const obj = {
                _nodes: nodeList,
                text:   () => nodeList.map(n => n.textContent).join(''),
                html:   () => nodeList.map(n => n.innerHTML).join(''),
                attr:   (a) => nodeList[0]?.getAttribute(a) || '',
                val:    () => nodeList[0]?.value || '',
                length: nodeList.length,
                first:  () => wrap(nodeList.slice(0, 1)),
                last:   () => wrap(nodeList.slice(-1)),
                eq:     (i) => wrap(nodeList.slice(i, i + 1)),
                find:   (s) => wrap(nodeList.flatMap(n => [...n.querySelectorAll(s)])),
                filter: (s) => wrap(nodeList.filter(n => n.matches?.(s))),
                each:   (fn) => { nodeList.forEach((n, i) => fn(i, n)); return obj },
                map:    (fn) => nodeList.map((n, i) => fn(i, n)),
                get:    (i) => i == null ? nodeList : nodeList[i],
                toArray:() => nodeList,
                parent: () => wrap(nodeList.map(n => n.parentElement).filter(Boolean)),
                children:(s) => wrap(nodeList.flatMap(n => [...(s ? n.querySelectorAll(':scope > ' + s) : n.children)])),
                next:   () => wrap(nodeList.map(n => n.nextElementSibling).filter(Boolean)),
                prev:   () => wrap(nodeList.map(n => n.previousElementSibling).filter(Boolean)),
                hasClass:(c) => nodeList[0]?.classList.contains(c) || false,
                addClass:() => obj,
                remove:  () => { nodeList.forEach(n => n.remove()); return obj },
              }
              return obj
            }
            return wrap(els)
          }
          $.html = () => doc.documentElement.outerHTML
          $.text = () => doc.body.textContent
          $.root = () => ({ find: (s) => $( s) })
          return $
        } catch {
          const noop = () => noop
          noop.text = () => ''; noop.html = () => ''; noop.attr = () => ''
          noop.each = () => noop; noop.find = () => noop; noop.first = () => noop
          noop.eq = () => noop; noop.map = () => ({ get: () => [] })
          noop.length = 0; noop.get = () => []
          return noop
        }
      },
    },
    extractors: {
      hubcloudExtracter: async () => [],
      gofileExtracter:   async () => ({ link: '', token: '' }),
      superVideoExtractor: async () => '',
      gdFlixExtracter:   async () => [],
    },
  }
}

// ── Public API ────────────────────────────────────────────────────────────
export async function getCatalog(providerValue) {
  const code = await getModuleCode(providerValue, 'catalog')
  const mod  = runModule(code)
  return { catalog: mod.catalog || [], genres: mod.genres || [] }
}

export async function getPosts({ providerValue, filter, page, signal }) {
  const code = await getModuleCode(providerValue, 'posts')
  const mod  = runModule(code)
  if (typeof mod.getPosts !== 'function') throw new Error('No getPosts export')
  return mod.getPosts({ filter, page, providerValue, signal, providerContext: makeContext() })
}

export async function searchPosts({ providerValue, searchQuery, page, signal }) {
  const code = await getModuleCode(providerValue, 'posts')
  const mod  = runModule(code)
  if (typeof mod.getSearchPosts !== 'function') throw new Error('No getSearchPosts export')
  return mod.getSearchPosts({ searchQuery, page, providerValue, signal, providerContext: makeContext() })
}

export async function getMeta({ providerValue, link }) {
  const code = await getModuleCode(providerValue, 'meta')
  const mod  = runModule(code)
  if (typeof mod.getMeta !== 'function') throw new Error('No getMeta export')
  return mod.getMeta({ link, provider: providerValue, providerContext: makeContext() })
}

export async function getStream({ providerValue, link, type, signal }) {
  const code = await getModuleCode(providerValue, 'stream')
  const mod  = runModule(code)
  if (typeof mod.getStream !== 'function') throw new Error('No getStream export')
  return mod.getStream({ link, type, signal, providerContext: makeContext() })
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
  await Promise.all(['catalog', 'posts', 'meta', 'stream'].map(m => getModuleCode(providerValue, m)))
}
