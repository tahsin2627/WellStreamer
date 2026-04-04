// src/lib/providers.js
// FIXED: Uses vega-org (active repo), fetches manifest for exact provider names,
// MoviesDrive primary + Multistream secondary only

import { cacheStorage } from './storage.js'

// ── URLs — vega-org is the ACTIVE repo (updated Mar 31 2026) ─────────────────
const PROVIDERS_BASE = 'https://raw.githubusercontent.com/vega-org/vega-providers/refs/heads/main'
const MANIFEST_URL   = `${PROVIDERS_BASE}/manifest.json`
const MODULES_BASE   = `${PROVIDERS_BASE}/dist`
const BASE_URL_JSON  = 'https://himanshu8443.github.io/providers/modflix.json'

// CORS proxies — tried in order if direct fetch fails
const PROXIES = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://cors-anywhere.herokuapp.com/${u}`,
]

// In-memory cache — cleared on hard refresh, survives soft navigation
const moduleCache = new Map()

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function fetchDirect(url, opts = {}) {
  const controller = opts.signal ? null : new AbortController()
  const signal = opts.signal || controller?.signal
  const timeout = controller ? setTimeout(() => controller.abort(), 12000) : null
  try {
    const res = await fetch(url, { ...opts, signal, mode: 'cors' })
    if (timeout) clearTimeout(timeout)
    return res
  } catch (e) {
    if (timeout) clearTimeout(timeout)
    throw e
  }
}

async function fetchWithFallback(url, opts = {}) {
  // 1. Try direct
  try {
    const res = await fetchDirect(url, opts)
    if (res.ok) return res
  } catch (_) {}

  // 2. Try each CORS proxy
  for (const makeProxy of PROXIES) {
    try {
      const res = await fetch(makeProxy(url), { ...opts, mode: 'cors' })
      if (res.ok) return res
    } catch (_) {}
  }
  throw new Error(`fetch failed: ${url}`)
}

async function fetchJSON(url, opts) {
  const res = await fetchWithFallback(url, opts)
  return res.json()
}

async function fetchText(url, opts) {
  const res = await fetchWithFallback(url, opts)
  return res.text()
}

// ── Manifest — gets exact provider value names ────────────────────────────────
export async function fetchManifest() {
  const cached = cacheStorage.getValid('manifest_vegaorg')
  if (cached) return cached
  try {
    const data = await fetchJSON(MANIFEST_URL)
    if (!Array.isArray(data)) throw new Error('Invalid manifest')
    cacheStorage.set('manifest_vegaorg', data, 3_600_000)
    return data
  } catch (e) {
    console.error('Manifest fetch failed:', e)
    return []
  }
}

// Get exact provider value from manifest (handles casing differences)
async function resolveProviderValue(name) {
  const cacheKey = `provider_value_${name.toLowerCase()}`
  const cached = cacheStorage.getValid(cacheKey)
  if (cached) return cached

  try {
    const manifest = await fetchManifest()
    // Exact match first
    let found = manifest.find(p => p.value === name)
    // Case-insensitive fallback
    if (!found) found = manifest.find(p => p.value.toLowerCase() === name.toLowerCase())
    if (found) {
      cacheStorage.set(cacheKey, found.value, 3_600_000)
      return found.value
    }
  } catch (_) {}
  return name // fallback to what was given
}

// ── Base URL ──────────────────────────────────────────────────────────────────
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

// ── Module loader ─────────────────────────────────────────────────────────────
async function getModuleCode(providerValue, moduleName) {
  const key = `${providerValue}/${moduleName}`
  if (moduleCache.has(key)) return moduleCache.get(key)

  const url = `${MODULES_BASE}/${providerValue}/${moduleName}.js`
  console.log(`[providers] Loading: ${url}`)
  const code = await fetchText(url)
  moduleCache.set(key, code)
  return code
}

// ── Module executor ───────────────────────────────────────────────────────────
function runModule(code) {
  const mod = { exports: {} }
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'exports', 'module', 'console', 'Promise', 'Object', 'setTimeout', 'clearTimeout', 'fetch',
      `${code}\nreturn (module.exports && Object.keys(module.exports).length) ? module.exports : exports;`
    )
    return fn(mod.exports, mod, console, Promise, Object, setTimeout, clearTimeout, fetch) || mod.exports
  } catch (e) {
    console.warn('[providers] Module exec error:', e.message)
    return mod.exports
  }
}

// ── Provider context ──────────────────────────────────────────────────────────
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
    create: () => axiosLike,
    defaults: { headers: { common: {} } },
  }

  return {
    axios: axiosLike,
    getBaseUrl,
    Crypto: {
      randomUUID: () => crypto.randomUUID(),
      getRandomValues: arr => crypto.getRandomValues(arr),
    },
    commonHeaders: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    cheerio: {
      load: () => {
        const noop = () => noop
        noop.text = () => ''; noop.html = () => ''; noop.attr = () => ''
        noop.each = (fn) => { return noop }
        noop.find = () => noop; noop.first = () => noop
        noop.eq = () => noop; noop.length = 0
        noop.map = () => ({ get: () => [] })
        noop.filter = () => noop; noop.children = () => noop
        noop.parent = () => noop; noop.next = () => noop
        noop.prev = () => noop; noop.closest = () => noop
        noop.toArray = () => []
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

// ── Public API ────────────────────────────────────────────────────────────────
export async function getCatalog(providerValue) {
  const exactValue = await resolveProviderValue(providerValue)
  const code = await getModuleCode(exactValue, 'catalog')
  const mod = runModule(code)
  return { catalog: mod.catalog || [], genres: mod.genres || [] }
}

export async function getPosts({ providerValue, filter, page, signal }) {
  const exactValue = await resolveProviderValue(providerValue)
  const code = await getModuleCode(exactValue, 'posts')
  const mod = runModule(code)
  if (typeof mod.getPosts !== 'function') throw new Error('No getPosts export')
  return mod.getPosts({ filter, page, providerValue: exactValue, signal, providerContext: makeContext() })
}

export async function searchPosts({ providerValue, searchQuery, page, signal }) {
  const exactValue = await resolveProviderValue(providerValue)
  const code = await getModuleCode(exactValue, 'posts')
  const mod = runModule(code)
  if (typeof mod.getSearchPosts !== 'function') {
    console.warn(`[providers] ${exactValue} has no getSearchPosts`)
    return []
  }
  return mod.getSearchPosts({ searchQuery, page, providerValue: exactValue, signal, providerContext: makeContext() })
}

export async function getMeta({ providerValue, link }) {
  const exactValue = await resolveProviderValue(providerValue)
  const code = await getModuleCode(exactValue, 'meta')
  const mod = runModule(code)
  if (typeof mod.getMeta !== 'function') throw new Error('No getMeta export')
  return mod.getMeta({ link, provider: exactValue, providerContext: makeContext() })
}

export async function getStream({ providerValue, link, type, signal }) {
  const exactValue = await resolveProviderValue(providerValue)
  const code = await getModuleCode(exactValue, 'stream')
  const mod = runModule(code)
  if (typeof mod.getStream !== 'function') throw new Error('No getStream export')
  return mod.getStream({ link, type, signal, providerContext: makeContext() })
}

export async function getEpisodes({ providerValue, url }) {
  try {
    const exactValue = await resolveProviderValue(providerValue)
    const code = await getModuleCode(exactValue, 'episodes')
    const mod = runModule(code)
    if (typeof mod.getEpisodes !== 'function') return []
    return mod.getEpisodes({ url, providerContext: makeContext() })
  } catch { return [] }
}

export async function installProvider(providerValue) {
  const exactValue = await resolveProviderValue(providerValue)
  await Promise.all(['catalog', 'posts', 'meta', 'stream'].map(m => getModuleCode(exactValue, m)))
}
