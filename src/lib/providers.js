// src/lib/providers.js
// Browser-side Vega provider engine — fetches JS modules from GitHub and runs them in-browser
// This is the April 2 architecture that worked

const MODULES_BASE = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/dist'
const BASE_URL_JSON = 'https://himanshu8443.github.io/providers/modflix.json'

// CORS proxies tried in order
const CORS_PROXIES = [
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
]

// In-memory module code cache (survives the session)
const moduleCodeCache = new Map()
const baseUrlCache = {}

async function fetchWithFallback(url, options = {}) {
  try {
    const res = await fetch(url, { ...options, mode: 'cors' })
    if (res.ok) return res
  } catch (_) {}
  for (const makeProxy of CORS_PROXIES) {
    try {
      const res = await fetch(makeProxy(url), options)
      if (res.ok) return res
    } catch (_) {}
  }
  throw new Error(`All fetch attempts failed for: ${url}`)
}

export async function getBaseUrl(providerValue) {
  if (baseUrlCache[providerValue] && Date.now() - baseUrlCache[providerValue].t < 3_600_000)
    return baseUrlCache[providerValue].url
  try {
    const res = await fetchWithFallback(BASE_URL_JSON)
    const data = await res.json()
    for (const [k, v] of Object.entries(data)) {
      if (v?.url) baseUrlCache[k] = { url: v.url, t: Date.now() }
    }
    return data[providerValue]?.url || ''
  } catch { return '' }
}

async function getModuleCode(providerValue, moduleName) {
  const key = `${providerValue}/${moduleName}`
  if (moduleCodeCache.has(key)) return moduleCodeCache.get(key)
  const url = `${MODULES_BASE}/${providerValue}/${moduleName}.js`
  const res = await fetchWithFallback(url)
  const code = await res.text()
  moduleCodeCache.set(key, code)
  return code
}

function runModule(code) {
  const mod = { exports: {} }
  try {
    const fn = new Function(
      'exports', 'module', 'console', 'Promise', 'Object', 'setTimeout', 'clearTimeout',
      `${code}\nreturn module.exports && Object.keys(module.exports).length ? module.exports : exports;`
    )
    return fn(mod.exports, mod, console, Promise, Object, setTimeout, clearTimeout) || mod.exports
  } catch (e) {
    console.warn('Module exec error:', e.message)
    return mod.exports
  }
}

function makeContext() {
  const axiosLike = {
    get: async (url, config = {}) => {
      const res = await fetchWithFallback(url, { headers: config.headers || {}, signal: config.signal })
      const text = await res.text()
      let data; try { data = JSON.parse(text) } catch { data = text }
      return { data, status: res.status, headers: Object.fromEntries(res.headers.entries()) }
    },
    post: async (url, body, config = {}) => {
      const res = await fetchWithFallback(url, {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', ...(config.headers || {}) },
        signal: config.signal,
      })
      const text = await res.text()
      let data; try { data = JSON.parse(text) } catch { data = text }
      return { data, status: res.status }
    },
    create: function() { return axiosLike },
    defaults: { headers: { common: {} } },
  }
  return {
    axios: axiosLike,
    getBaseUrl,
    Crypto: { randomUUID: () => crypto.randomUUID(), getRandomValues: (a) => crypto.getRandomValues(a) },
    commonHeaders: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    cheerio: {
      load: () => {
        const noop = () => noop
        noop.text = () => ''; noop.html = () => ''; noop.attr = () => ''
        noop.each = () => noop; noop.find = () => noop; noop.first = () => noop
        noop.eq = () => noop; noop.map = () => ({ get: () => [] })
        return noop
      },
    },
    extractors: {
      hubcloudExtracter: async () => [],
      gofileExtracter: async () => ({ link: '', token: '' }),
      superVideoExtractor: async () => '',
      gdFlixExtracter: async () => [],
    },
  }
}

export async function getCatalog(providerValue) {
  const code = await getModuleCode(providerValue, 'catalog')
  const mod = runModule(code)
  return { catalog: mod.catalog || [], genres: mod.genres || [] }
}

export async function getPosts({ providerValue, filter, page, signal }) {
  const code = await getModuleCode(providerValue, 'posts')
  const mod = runModule(code)
  if (typeof mod.getPosts !== 'function') throw new Error('No getPosts export')
  return mod.getPosts({ filter, page, providerValue, signal, providerContext: makeContext() })
}

export async function searchPosts({ providerValue, searchQuery, page, signal }) {
  const code = await getModuleCode(providerValue, 'posts')
  const mod = runModule(code)
  if (typeof mod.getSearchPosts !== 'function') throw new Error('No getSearchPosts export')
  return mod.getSearchPosts({ searchQuery, page, providerValue, signal, providerContext: makeContext() })
}

export async function getMeta({ providerValue, link }) {
  const code = await getModuleCode(providerValue, 'meta')
  const mod = runModule(code)
  if (typeof mod.getMeta !== 'function') throw new Error('No getMeta export')
  return mod.getMeta({ link, provider: providerValue, providerContext: makeContext() })
}

export async function getStream({ providerValue, link, type, signal }) {
  const code = await getModuleCode(providerValue, 'stream')
  const mod = runModule(code)
  if (typeof mod.getStream !== 'function') throw new Error('No getStream export')
  return mod.getStream({ link, type, signal, providerContext: makeContext() })
}

export async function getEpisodes({ providerValue, url }) {
  try {
    const code = await getModuleCode(providerValue, 'episodes')
    const mod = runModule(code)
    if (typeof mod.getEpisodes !== 'function') return []
    return mod.getEpisodes({ url, providerContext: makeContext() })
  } catch { return [] }
}

export async function fetchManifest() {
  const MANIFEST_URL = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/manifest.json'
  const res = await fetchWithFallback(MANIFEST_URL)
  return res.json()
}

export async function installProvider(providerValue) {
  await Promise.all(['catalog', 'posts', 'meta', 'stream'].map(m => getModuleCode(providerValue, m)))
}
