import { cacheStorage } from './storage.js'

const MANIFEST_URL = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/manifest.json'
const MODULES_BASE = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/dist'
const BASE_URL_JSON = 'https://himanshu8443.github.io/providers/modflix.json'

const PROXIES = [
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://cors-anywhere.herokuapp.com/${u}`,
]

const moduleCodeCache = new Map()

async function fetchWithFallback(url, options = {}) {
  const { signal, headers = {}, method = 'GET', body } = options
  try {
    const res = await fetch(url, { method, headers, body, signal, mode: 'cors' })
    if (res.ok) return res
  } catch (_) {}
  for (const makeProxy of PROXIES) {
    try {
      const res = await fetch(makeProxy(url), { method, headers, body, signal })
      if (res.ok) return res
    } catch (_) {
      if (signal?.aborted) throw new Error('Aborted')
    }
  }
  throw new Error(`Failed to fetch: ${url}`)
}

async function fetchText(url, opts) {
  const res = await fetchWithFallback(url, opts)
  return res.text()
}

async function fetchJSON(url, opts) {
  const res = await fetchWithFallback(url, opts)
  return res.json()
}

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
  const url = `${MODULES_BASE}/${providerValue}/${moduleName}.js`
  const code = await fetchText(url)
  moduleCodeCache.set(key, code)
  return code
}

function runModule(code) {
  const mod = { exports: {} }
  const fakeProcess = {
    env: { CORS_PRXY: '', NODE_ENV: 'production' }
  }
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
      fakeProcess,
      async (url, opts = {}) => fetchWithFallback(url, opts)
    ) || mod.exports
  } catch (e) {
    console.warn('Module exec error:', e.message)
    return mod.exports
  }
}

function makeAxios() {
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
    const res = await fetchWithFallback(finalUrl, { method, headers, body: bodyStr, signal })
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return {
      data,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      request: { responseURL: res.url },
    }
  }

  const inst = async (urlOrConfig, config) => request(urlOrConfig, config)
  inst.get     = (url, cfg = {})       => request(url, { ...cfg, method: 'GET' })
  inst.post    = (url, data, cfg = {}) => request(url, { ...cfg, method: 'POST', data })
  inst.put     = (url, data, cfg = {}) => request(url, { ...cfg, method: 'PUT', data })
  inst.delete  = (url, cfg = {})       => request(url, { ...cfg, method: 'DELETE' })
  inst.head    = async (url, cfg = {}) => {
    try {
      const res = await fetchWithFallback(url, { ...cfg, method: 'HEAD' })
      return { status: res.status, headers: Object.fromEntries(res.headers.entries()), request: { responseURL: res.url } }
    } catch { return { status: 0, headers: {}, request: { responseURL: url } } }
  }
  inst.create  = (defaults = {}) => { const i = makeAxios(); i._defaults = defaults; return i }
  inst.defaults = { headers: { common: {} } }
  inst.interceptors = {
    request:  { use: () => {}, eject: () => {} },
    response: { use: () => {}, eject: () => {} },
  }
  return inst
}

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
        try {
          const parser = new DOMParser()
          const doc = parser.parseFromString(html, 'text/html')
          function wrap(nodes) {
            const arr = Array.isArray(nodes) ? nodes : Array.from(nodes || [])
            const obj = {
              _nodes: arr,
              length:  arr.length,
              text:    () => arr.map(n => n.textContent || '').join(''),
              html:    () => arr.map(n => n.innerHTML || '').join(''),
              attr:    (a) => arr[0]?.getAttribute?.(a) ?? '',
              val:     () => arr[0]?.value ?? '',
              first:   () => wrap(arr.slice(0, 1)),
              last:    () => wrap(arr.slice(-1)),
              eq:      (i) => wrap(arr.slice(i, i + 1)),
              find:    (s) => wrap(arr.flatMap(n => Array.from(n.querySelectorAll?.(s) || []))),
              filter:  (s) => wrap(arr.filter(n => n.matches?.(s))),
              not:     (s) => wrap(arr.filter(n => !n.matches?.(s))),
              each:    (fn) => { arr.forEach((n, i) => fn(i, n)); return obj },
              map:     (fn) => arr.map((n, i) => fn(i, n)),
              get:     (i) => i == null ? arr : arr[i],
              toArray: () => arr,
              parent:  () => wrap(arr.map(n => n.parentElement).filter(Boolean)),
              children:(s) => wrap(arr.flatMap(n => Array.from(s ? n.querySelectorAll(':scope > ' + s) : n.children || []))),
              next:    () => wrap(arr.map(n => n.nextElementSibling).filter(Boolean)),
              prev:    () => wrap(arr.map(n => n.previousElementSibling).filter(Boolean)),
              hasClass:(c) => arr[0]?.classList?.contains(c) || false,
              addClass:()  => obj,
              remove:  ()  => { arr.forEach(n => n.remove()); return obj },
              closest: (s) => wrap(arr.map(n => n.closest?.(s)).filter(Boolean)),
              is:      (s) => arr.some(n => n.matches?.(s)),
            }
            return obj
          }
          const $fn = (selector) => {
            if (!selector) return wrap([])
            try { return wrap(Array.from(doc.querySelectorAll(selector))) }
            catch { return wrap([]) }
          }
          $fn.html = () => doc.documentElement.outerHTML
          $fn.text = () => doc.body?.textContent || ''
          $fn.root = () => wrap([doc.documentElement])
          $fn.load = (h) => makeContext().cheerio.load(h)
          return $fn
        } catch {
          const noop = () => noop
          noop.text = () => ''; noop.html = () => ''; noop.attr = () => ''
          noop.each = () => noop; noop.find = () => noop; noop.first = () => noop
          noop.last = () => noop; noop.eq = () => noop; noop.filter = () => noop
          noop.map = () => []; noop.get = () => []; noop.length = 0
          noop.parent = () => noop; noop.load = () => noop
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
