// src/lib/providers.js — All calls via /api/stream (Vercel Node.js)
// providerValue: 'drive' = MoviesDrive, 'autoEmbed' = MultiStream

const API = '/api/stream'

async function call(action, params) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || `API error: ${action}`)
  return json.data
}

export const getCatalog     = (pv)       => call('catalog', { providerValue: pv }).catch(() => ({ catalog: [], genres: [] }))
export const getPosts        = ({providerValue,filter,page}) => call('posts',   { providerValue, filter, page })
export const searchPosts     = ({providerValue,searchQuery,page}) => call('search', { providerValue, searchQuery, page })
export const getMeta         = ({providerValue,link})  => call('meta',    { providerValue, link })
export const getStream       = ({providerValue,link,type}) => call('stream', { providerValue, link, type })
export const getEpisodes     = ({providerValue,url})   => call('episodes', { providerValue, url }).catch(() => [])
export const fetchManifest   = () => Promise.resolve([])
export const installProvider = () => Promise.resolve()
