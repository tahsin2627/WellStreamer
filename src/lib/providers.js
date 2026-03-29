import { cacheStorage } from './storage.js'

// ── Constants ──────────────────────────────────────────────────────────────
const MANIFEST_URL =
  'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/manifest.json'
const MODULES_BASE =
  'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/dist'
const BASE_URL_JSON =
  'https://himanshu8443.github.io/providers/modflix.json'

// CORS proxies tried in order
const CORS_PROXIES = [
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
]

// In-memory module code cache (survives the session, no repeated fetches)
const moduleCodeCache = new Map()

// ── Fetch with CORS fallback ───────────────────────────────────────────────
async function fetchWithFallback(url, options = {}) {
  // Try direct first
  try {
    const res = await fetch(url, { ...options, mode: 'cors' })
    if (res.ok) return res
  } catch (_) { /* fall through */ }

  // Try each CORS proxy
  for (const makeProxy of CORS_PROXIES) {
    try {
      const res = await fetch(makeProxy(url), options)
      if (res.ok) return res
    } catch (_) { /* try next */ }
  }
  throw new Error(`All fetch attempts failed for: ${url}`)
}

async function fetchJSON(url, options) {
  const res = await fetchWithFallback(url, options)
  return res.json()
}

async function fetchText(url, options) {
  const res = await fetchWithFallback(url, options)
  return res.text()
}

// ── Base URL resolver ──────────────────────────────────────────────────────
export async function getBaseUrl(providerValue) {
  const cached = cacheStorage.getValid(`baseUrl_${providerValue}`)
  if (cached) return cached

  try {
    const data = await fetchJSON(BASE_URL_JSON)
    // Cache ALL provider base URLs in one shot
    for (const [key, val] of Object.entries(data)) {
      if (val?.url) cacheStorage.set(`baseUrl_${key}`, val.url, 3_600_000)
    }
    return data[providerValue]?.url || ''
  } catch {
    return ''
  }
}

// ── Manifest ───────────────────────────────────────────────────────────────
export async function fetchManifest() {
  const cached = cacheStorage.getValid('manifest')
  if (cached) return cached

  const data = await fetchJSON(MANIFEST_URL)
  if (!Array.isArray(data)) throw new Error('Invalid manifest')
  cacheStorage.set('manifest', data, 3_600_000)
  return data
}

// ── Module fetcher ─────────────────────────────────────────────────────────
async function getModuleCode(providerValue, moduleName) {
  const key = `${providerValue}/${moduleName}`
  if (moduleCodeCache.has(key)) return moduleCodeCache.get(key)

  const url = `${MODULES_BASE}/${providerValue}/${moduleName}.js`
  const code = await fetchText(url)
  moduleCodeCache.set(key, code)
  return code
}

// ── Safe module executor ───────────────────────────────────────────────────
function runModule(code) {
  const mod = { exports: {} }
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'exports', 'module', 'console', 'Promise', 'Object', 'setTimeout', 'clearTimeout',
      `${code}\nreturn module.exports && Object.keys(module.exports).length ? module.exports : exports;`
    )
    const result = fn(mod.exports, mod, console, Promise, Object, setTimeout, clearTimeout)
    return result || mod.exports
  } catch (e) {
    console.warn('Module exec error:', e.message)
    return mod.exports
  }
}

// ── Provider context (browser-safe axios shim) ─────────────────────────────
function makeContext() {
  const axiosLike = {
    get: async (url, config = {}) => {
      const res = await fetchWithFallback(url, {
        headers: config.headers || {},
        signal: config.signal,
      })
      const text = await res.text()
      let data
      try { data = JSON.parse(text) } catch { data = text }
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
      let data
      try { data = JSON.parse(text) } catch { data = text }
      return { data, status: res.status }
    },
    create: () => axiosLike,
    defaults: { headers: { common: {} } },
  }

  return {
    axios: axiosLike,
    getBaseUrl,
    Crypto: {
      randomUUID: () => crypto.randomUUID(),
      getRandomValues: (arr) => crypto.getRandomValues(arr),
    },
    commonHeaders: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    // cheerio is a Node.js lib — providers that use it won't work in browser
    // We stub it so the module at least loads without crashing
    cheerio: {
      load: () => {
        const noop = () => noop
        noop.text = () => ''
        noop.html = () => ''
        noop.attr = () => ''
        noop.each = () => noop
        noop.find = () => noop
        noop.first = () => noop
        noop.eq = () => noop
        noop.map = () => ({ get: () => [] })
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

// ── Public API ─────────────────────────────────────────────────────────────
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

// ── Install a provider (pre-warms module cache) ────────────────────────────
export async function installProvider(providerValue) {
  // Download all modules in parallel to validate they exist
  const required = ['catalog', 'posts', 'meta', 'stream']
  await Promise.all(required.map(m => getModuleCode(providerValue, m)))
}
