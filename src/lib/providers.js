// src/lib/providers.js — CLIENT VERSION
// All heavy scraping now goes through /api/stream (Node.js serverless)
// Only manifest + catalog still fetched client-side (no scraping needed)

import { cacheStorage } from './storage.js'

const MANIFEST_URL = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/manifest.json'
const MODULES_BASE = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/dist'
const API = '/api/stream'

// ── Fetch helpers ─────────────────────────────────────────────────────────
const PROXIES = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
]

async function fetchDirect(url, opts = {}) {
  for (const attempt of [
    () => fetch(url, { ...opts, mode: 'cors' }),
    ...PROXIES.map(p => () => fetch(p(url), opts)),
  ]) {
    try {
      const r = await attempt()
      if (r.ok) return r
    } catch (e) {
      if (opts.signal?.aborted) throw e
    }
  }
  throw new Error(`fetch failed: ${url}`)
}

async function callAPI(body) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || 'API error')
  return json.data
}

// ── Manifest ──────────────────────────────────────────────────────────────
export async function fetchManifest() {
  const cached = cacheStorage.getValid('manifest')
  if (cached) return cached
  const r = await fetchDirect(MANIFEST_URL)
  const data = await r.json()
  if (!Array.isArray(data)) throw new Error('bad manifest')
  cacheStorage.set('manifest', data, 3_600_000)
  return data
}

// ── Catalog (simple JSON, no scraping — OK client-side) ───────────────────
const catalogCache = new Map()

export async function getCatalog(providerValue) {
  if (catalogCache.has(providerValue)) return catalogCache.get(providerValue)
  try {
    // Try via API first (most reliable)
    const result = await callAPI({ action: 'catalog', providerValue })
    catalogCache.set(providerValue, result)
    return result
  } catch {
    // Fallback: load catalog.js directly
    try {
      const r = await fetchDirect(`${MODULES_BASE}/${providerValue}/catalog.js`)
      const code = await r.text()
      const mod = { exports: {} }
      const fn = new Function('exports','module', `"use strict";\n${code}\nreturn module.exports&&Object.keys(module.exports).length?module.exports:exports;`)
      const result2 = fn(mod.exports, mod) || mod.exports
      const out = { catalog: result2.catalog || [], genres: result2.genres || [] }
      catalogCache.set(providerValue, out)
      return out
    } catch { return { catalog: [], genres: [] } }
  }
}

// ── All scraping-heavy operations go through serverless API ───────────────
export async function getPosts({ providerValue, filter, page = 1, signal }) {
  return callAPI({ action: 'posts', providerValue, filter, page })
}

export async function searchPosts({ providerValue, searchQuery, page = 1 }) {
  return callAPI({ action: 'search', providerValue, searchQuery, page })
}

export async function getMeta({ providerValue, link }) {
  return callAPI({ action: 'meta', providerValue, link })
}

export async function getStream({ providerValue, link, type }) {
  return callAPI({ action: 'stream', providerValue, link, type })
}

export async function getEpisodes({ providerValue, url }) {
  try {
    return await callAPI({ action: 'episodes', providerValue, url })
  } catch { return [] }
}

// Install just validates the provider exists
export async function installProvider(providerValue) {
  await getCatalog(providerValue)
}
