// src/lib/providers.js
// ALL calls go through /api/stream (Vercel serverless, Node.js)
// This fixes: MoviesDrive search, stream extraction, meta, everything
// No client-side cheerio/axios needed - server handles it all

const API = '/api/stream'

async function callAPI(action, params) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || `API error: ${action}`)
  return json.data
}

export async function getCatalog(providerValue) {
  try {
    return await callAPI('catalog', { providerValue })
  } catch {
    return { catalog: [], genres: [] }
  }
}

export async function getPosts({ providerValue, filter, page, signal }) {
  return callAPI('posts', { providerValue, filter, page: page || 1 })
}

export async function searchPosts({ providerValue, searchQuery, page, signal }) {
  return callAPI('search', { providerValue, searchQuery, page: page || 1 })
}

export async function getMeta({ providerValue, link }) {
  return callAPI('meta', { providerValue, link })
}

export async function getStream({ providerValue, link, type, signal }) {
  return callAPI('stream', { providerValue, link, type })
}

export async function getEpisodes({ providerValue, url }) {
  try {
    return await callAPI('episodes', { providerValue, url })
  } catch {
    return []
  }
}

// Kept for compatibility - no-op since API handles everything
export async function fetchManifest() {
  try {
    return await callAPI('catalog', { providerValue: 'manifest' })
  } catch {
    return []
  }
}

export async function installProvider() { /* no-op */ }
