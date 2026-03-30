// Vercel serverless function — runs on Node.js, no CORS issues
// api/stream.js

const MODULES_BASE = 'https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/dist'
const BASE_URL_JSON = 'https://himanshu8443.github.io/providers/modflix.json'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

// Cache modules in memory (warm across requests on same instance)
const moduleCache = {}

async function fetchText(url) {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`fetch ${res.status}: ${url}`)
  return res.text()
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { headers: { ...HEADERS, ...opts.headers }, ...opts })
  return res.json()
}

async function getBaseUrl(pv) {
  try {
    const d = await fetchJSON(BASE_URL_JSON)
    return d[pv]?.url || ''
  } catch { return '' }
}

async function getModule(pv, name) {
  const key = `${pv}/${name}`
  if (!moduleCache[key]) {
    moduleCache[key] = await fetchText(`${MODULES_BASE}/${pv}/${name}.js`)
  }
  return moduleCache[key]
}

// ── Real extractors (Node.js, no CORS issues) ─────────────────────────────

function superVideoExtractor(data) {
  try {
    const match = /eval\(function\((.*?)\)\{.*?return p\}.*?\('(.*?)'\.split/.exec(data)
    if (!match) return ''
    let p = match[2].split("',36,")?.[0]?.trim() || ''
    let c = match[2].split("',36,")?.[1]?.slice(2)?.split('|')?.length || 0
    let k = match[2].split("',36,")?.[1]?.slice(2)?.split('|') || []
    while (c--) {
      if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(36) + '\\b', 'g'), k[c])
    }
    return p?.match(/file:\s*"([^"]+\.m3u8[^"]*)"/)?.[1] || ''
  } catch { return '' }
}

async function gofileExtracter(id) {
  try {
    const t = await fetchJSON('https://api.gofile.io/accounts')
    const token = t?.data?.token || ''
    const f = await fetchJSON(`https://api.gofile.io/contents/${id}?wt=4fd6sg89d7s6&cache=true`,
      { headers: { Authorization: `Bearer ${token}` } })
    const link = Object.values(f?.data?.contents || {})?.[0]?.link || ''
    return { link, token }
  } catch { return { link: '', token: '' } }
}

async function hubcloudExtracter(link, signal) {
  try {
    const cheerio = await import('cheerio')
    const baseUrl = link.split('/').slice(0, 3).join('/')
    const streamLinks = []

    const vRes = await fetch(link, { headers: HEADERS, signal })
    const vText = await vRes.text()
    const $v = cheerio.load(vText)
    const redirect = vText.match(/var\s+url\s*=\s*'([^']+)';/) || []

    let vcloudLink =
      (redirect[1]?.split('r=')?.[1] ? atob(redirect[1].split('r=')[1]) : '') ||
      redirect[1] ||
      $v('.fa-file-download.fa-lg').parent().attr('href') || link

    if (vcloudLink?.startsWith('/')) vcloudLink = `${baseUrl}${vcloudLink}`

    const vcRes = await fetch(vcloudLink, { headers: HEADERS, signal, redirect: 'follow' })
    const $ = cheerio.load(await vcRes.text())

    $('.btn-success.btn-lg.h6,.btn-danger,.btn-secondary').each((_, el) => {
      let href = $(el).attr('href') || ''
      if (!href) return
      if (href.includes('pixeld')) {
        if (!href.includes('api')) {
          const tok = href.split('/').pop()
          href = `${href.split('/').slice(0,-2).join('/')}/api/file/${tok}?download`
        }
        streamLinks.push({ server: 'Pixeldrain', link: href, type: 'mkv' })
      } else if (href.includes('.dev') && !href.includes('/?id=')) {
        streamLinks.push({ server: 'Cf Worker', link: href, type: 'mkv' })
      } else if (href.includes('cloudflarestorage')) {
        streamLinks.push({ server: 'CfStorage', link: href, type: 'mkv' })
      } else if (href.includes('hubcdn') && !href.includes('/?id=')) {
        streamLinks.push({ server: 'HubCdn', link: href, type: 'mkv' })
      } else if (href.includes('.mkv') || href.includes('?token=')) {
        streamLinks.push({ server: 'Direct', link: href, type: 'mkv' })
      }
    })
    return streamLinks
  } catch (e) {
    console.error('hubcloud error:', e.message)
    return []
  }
}

async function gdFlixExtracter(link, signal) {
  try {
    const cheerio = await import('cheerio')
    const streamLinks = []
    let html = await (await fetch(link, { headers: HEADERS, signal })).text()
    let $ = cheerio.load(html)

    const onload = $('body').attr('onload') || ''
    if (onload.includes('location.replace')) {
      const newLink = onload.split("location.replace('")?.[1]?.split("'")?.[0]
      if (newLink) {
        html = await (await fetch(newLink, { headers: HEADERS, signal })).text()
        $ = cheerio.load(html)
      }
    }
    $('a').each((_, el) => {
      const href = $(el).attr('href') || ''
      if (href.includes('.mkv') || href.includes('.mp4') || href.includes('m3u8')) {
        streamLinks.push({ server: 'GdFlix', link: href, type: href.includes('m3u8') ? 'hls' : 'mkv' })
      }
    })
    return streamLinks
  } catch { return [] }
}

function makeAxios() {
  const req = async (urlOrCfg, cfg = {}) => {
    const isStr  = typeof urlOrCfg === 'string'
    const url    = isStr ? urlOrCfg : urlOrCfg.url || ''
    const method = ((isStr ? cfg.method : urlOrCfg.method) || 'GET').toUpperCase()
    const hdrs   = isStr ? cfg.headers || {} : urlOrCfg.headers || {}
    const data   = isStr ? cfg.data : urlOrCfg.data
    const params = isStr ? cfg.params : urlOrCfg.params
    let finalUrl = url
    if (params) {
      const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v])=>v!=null))).toString()
      finalUrl = `${url}${url.includes('?')?'&':'?'}${qs}`
    }
    const body = data && typeof data !== 'string' ? JSON.stringify(data) : data
    const res  = await fetch(finalUrl, { method, headers: { ...HEADERS, ...hdrs }, body })
    const text = await res.text()
    let respData; try { respData = JSON.parse(text) } catch { respData = text }
    return { data: respData, status: res.status, headers: Object.fromEntries(res.headers.entries()) }
  }
  const ax       = (u,c) => req(u,c)
  ax.get         = (u,c) => req(u,{...c,method:'GET'})
  ax.post        = (u,d,c) => req(u,{...c,method:'POST',data:d})
  ax.put         = (u,d,c) => req(u,{...c,method:'PUT',data:d})
  ax.delete      = (u,c) => req(u,{...c,method:'DELETE'})
  ax.create      = () => makeAxios()
  ax.defaults    = { headers: { common:{}, get:{}, post:{} } }
  ax.interceptors = { request:{use:()=>{},eject:()=>{}}, response:{use:()=>{},eject:()=>{}} }
  return ax
}

async function makeCheerio() {
  const cheerio = await import('cheerio')
  return {
    load: (html) => cheerio.load(html)
  }
}

function runModule(code) {
  const mod = { exports: {} }
  try {
    const fn = new Function(
      'exports','module','console','Promise','Object',
      'setTimeout','clearTimeout','setInterval','clearInterval',
      'require',
      `"use strict";\n${code}\nreturn module.exports&&Object.keys(module.exports).length?module.exports:exports;`
    )
    // Stub require for common packages
    const requireStub = (name) => {
      if (name === 'axios') return makeAxios()
      return {}
    }
    return fn(mod.exports,mod,console,Promise,Object,setTimeout,clearTimeout,setInterval,clearInterval,requireStub) || mod.exports
  } catch(e) {
    console.error('module exec error:', e.message)
    return mod.exports
  }
}

// ── Handler ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { action, providerValue, link, type, filter, page, searchQuery, url } = req.method === 'POST'
    ? req.body
    : req.query

  if (!action || !providerValue) {
    return res.status(400).json({ error: 'Missing action or providerValue' })
  }

  try {
    const cheerioMod = await makeCheerio()
    const ctx = {
      axios: makeAxios(),
      getBaseUrl: () => getBaseUrl(providerValue),
      Crypto: { randomUUID: () => crypto.randomUUID() },
      commonHeaders: HEADERS,
      cheerio: cheerioMod,
      extractors: {
        hubcloudExtracter: (l, s) => hubcloudExtracter(l, s),
        gofileExtracter,
        superVideoExtractor,
        gdFlixExtracter: (l, s) => gdFlixExtracter(l, s),
      },
    }

    let result

    if (action === 'stream') {
      const code = await getModule(providerValue, 'stream')
      const mod  = runModule(code)
      if (typeof mod.getStream !== 'function') throw new Error('No getStream export')
      result = await mod.getStream({ link, type, signal: new AbortController().signal, providerContext: ctx })

    } else if (action === 'meta') {
      const code = await getModule(providerValue, 'meta')
      const mod  = runModule(code)
      if (typeof mod.getMeta !== 'function') throw new Error('No getMeta export')
      result = await mod.getMeta({ link, provider: providerValue, providerContext: ctx })

    } else if (action === 'episodes') {
      const code = await getModule(providerValue, 'episodes')
      const mod  = runModule(code)
      if (typeof mod.getEpisodes !== 'function') { result = []; }
      else result = await mod.getEpisodes({ url, providerContext: ctx })

    } else if (action === 'posts') {
      const code = await getModule(providerValue, 'posts')
      const mod  = runModule(code)
      if (typeof mod.getPosts !== 'function') throw new Error('No getPosts export')
      result = await mod.getPosts({ filter, page: Number(page)||1, providerValue, signal: new AbortController().signal, providerContext: ctx })

    } else if (action === 'search') {
      const code = await getModule(providerValue, 'posts')
      const mod  = runModule(code)
      if (typeof mod.getSearchPosts !== 'function') throw new Error('No getSearchPosts export')
      result = await mod.getSearchPosts({ searchQuery, page: Number(page)||1, providerValue, signal: new AbortController().signal, providerContext: ctx })

    } else if (action === 'catalog') {
      const code = await getModule(providerValue, 'catalog')
      const mod  = runModule(code)
      result = { catalog: mod.catalog || [], genres: mod.genres || [] }

    } else {
      return res.status(400).json({ error: `Unknown action: ${action}` })
    }

    return res.status(200).json({ ok: true, data: result })
  } catch (e) {
    console.error(`[stream API] ${action} error:`, e.message)
    return res.status(500).json({ ok: false, error: e.message })
  }
}
