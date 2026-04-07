// api/stream.js — Vercel serverless, ESM format (matches package.json "type":"module")
import { load } from 'cheerio'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const H = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
}

async function get(url, extra = {}) {
  const res = await fetch(url, { headers: { ...H, ...extra }, redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.text()
}
async function getJSON(url) {
  const res = await fetch(url, { headers: H })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.json()
}

// ─── CATALOGS ────────────────────────────────────────────────────────────────
const CATALOGS = {
  drive: [
    { title:'Latest',   filter:'' },
    { title:'Netflix',  filter:'category/netflix/' },
    { title:'Anime',    filter:'category/anime/' },
    { title:'4K',       filter:'category/2160p-4k/' },
    { title:'Action',   filter:'/category/action' },
    { title:'Comedy',   filter:'/category/comedy' },
    { title:'Drama',    filter:'/category/drama' },
    { title:'Horror',   filter:'/category/horror' },
    { title:'Thriller', filter:'/category/triller' },
  ],
  autoEmbed: [
    { title:'Trending Movies', filter:'/catalog/movie/top.json' },
    { title:'Popular Series',  filter:'/catalog/series/top.json' },
    { title:'Top IMDB',        filter:'/catalog/movie/imdb-trending.json' },
  ],
  myflixbd: [
    { title:'Latest',        filter:'/' },
    { title:'Bangla Movies', filter:'/genre/bangla-movies/' },
    { title:'Hollywood',     filter:'/genre/hollywood-movies/' },
    { title:'Hindi',         filter:'/genre/hindi-movies/' },
    { title:'Bangla Dubbed', filter:'/genre/bangla-dub-movies/' },
    { title:'K-Drama',       filter:'/genre/k-drama-web-series/' },
    { title:'South Indian',  filter:'/genre/south-indian-movies/' },
    { title:'Anime',         filter:'/genre/anime/' },
  ],
}

// ─── MOVIESDRIVE ─────────────────────────────────────────────────────────────
async function driveBase() {
  try {
    const d = await getJSON('https://himanshu8443.github.io/providers/modflix.json')
    return (d?.drive?.url || 'https://moviesdrive.rent/').replace(/\/$/, '') + '/'
  } catch { return 'https://moviesdrive.rent/' }
}

async function driveScrape(url) {
  try {
    const html = await get(url)
    const $ = load(html)
    const posts = []
    $('.poster-card').each((_, el) => {
      const title = $(el).find('.poster-title').text().replace('Download','').trim()
      const link  = $(el).parent().attr('href') || $(el).closest('a').attr('href') || ''
      const image = $(el).find('.poster-image img').attr('src') || $(el).find('img').attr('src') || ''
      if (title && link) posts.push({ title, link, image })
    })
    if (!posts.length) {
      $('article').each((_, el) => {
        const $el = $(el)
        const title = $el.find('.entry-title,h2,h3').first().text().trim()
        const link  = $el.find('a').first().attr('href') || ''
        const image = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || ''
        if (title && link) posts.push({ title, link, image })
      })
    }
    console.log(`[drive] ${posts.length} posts from ${url}`)
    return posts
  } catch (e) { console.error('[drive] scrape:', e.message); return [] }
}

async function driveMeta(link) {
  try {
    const html = await get(link)
    const $ = load(html)
    const lw = $('.left-wrapper,.entry-content')
    const type = lw.text().toLowerCase().includes('movie name') ? 'movie' : 'series'
    const title = (lw.find('strong:contains("Name")').next().text() || $('h1').first().text()).trim()
    const synopsis = lw.find('h2:contains("Storyline"),h3:contains("Storyline"),h4:contains("Storyline")').next().text().trim()
    const image = $('img.entered.lazyloaded,img.litespeed-loaded,.wp-post-image').attr('src') || $('img').first().attr('src') || ''
    const imdbId = ($('a:contains("IMDb")').attr('href') || '').split('/')[4] || ''
    const links = []
    // Match by link TEXT containing quality keywords (exact same logic as vega-providers)
    // MoviesDrive: <h5>Section</h5> <a href="hubcloud_url">Download 1080p</a>
    $('a:contains("1080"):not(:contains("Zip")), a:contains("720"):not(:contains("Zip")), a:contains("480"):not(:contains("Zip")), a:contains("2160"):not(:contains("Zip")), a:contains("4k"):not(:contains("Zip"))').each((_, el) => {
      const href = $(el).attr('href') || ''
      if (!href || href === '#') return
      const title2 = $(el).parent('h5').prev().text() || $(el).closest('p,div').prev('h5,h4,h3').text() || $(el).text().trim()
      const qm = title2.match(/\b(480p|720p|1080p|2160p)\b/i)
      const quality = qm ? qm[0] : ''
      if (!title2 || !href) return
      links.push({
        title: title2,
        episodesLink: type === 'series' ? href : '',
        directLinks: type === 'movie' ? [{ title: 'Movie', link: href, type: 'movie' }] : [],
        quality: quality,
      })
    })
    // Also catch any remaining hubcloud/gdflix links not caught above
    if (links.length === 0) {
      $('a').each((_, el) => {
        const href = $(el).attr('href') || ''
        const text = $(el).text().trim()
        if (!href || href === '#') return
        if (href.includes('hubcloud') || href.includes('gdflix') || href.includes('driveleech') || href.includes('drivebot')) {
          const qm = (text + href).match(/\b(4K|2160p?|1080p?|720p?|480p?)\b/i)
          const q = qm ? qm[0] : ''
          links.push({
            title: text || q || 'Stream',
            episodesLink: type === 'series' ? href : '',
            directLinks: type === 'movie' ? [{ title: text||'Movie', link: href, type:'movie' }] : [],
            quality: q,
          })
        }
      })
    }
    return { title, synopsis, image, imdbId, type, linkList: links }
  } catch (e) { console.error('[drive] meta:', e.message); return { title:'',synopsis:'',image:'',imdbId:'',type:'movie',linkList:[] } }
}

async function driveStream(url, type) {
  try {
    if (type === 'movie') {
      const html = await get(url)
      const $ = load(html)
      url = $('a:contains("HubCloud")').attr('href') || url
    }
    let redirect = ''
    try {
      const html = await get(url)
      redirect = html.match(/<meta[^>]+http-equiv="refresh"[^>]+url=([^"]+)"/i)?.[1] ||
                 html.match(/<a[^>]+href="(https:\/\/hubcloud\.[^"]+)"/i)?.[1] || ''
    } catch {}
    if (!redirect) {
      if (url.includes('hubcloud')) return hubcloud(url)
      if (url.includes('gdflix'))   return gdflix(url)
      return []
    }
    const html2 = await get(redirect)
    const $2 = load(html2)
    const hcLink = $2('.fa-file-download').parent().attr('href') || ''
    return hubcloud(hcLink?.includes('hubcloud') ? hcLink : redirect)
  } catch (e) { console.error('[drive] stream:', e.message); return [] }
}

async function hubcloud(link) {
  try {
    const ck = 'ext_name=ojplmecpdpgccookcobabopnaifgidhf; xla=s4t'
    const h = { ...H, Cookie: ck }
    const base = link.split('/').slice(0,3).join('/')
    const html = await get(link, h)
    const $ = load(html)
    const redir = html.match(/var\s+url\s*=\s*'([^']+)';/) || []
    let vc = redir[1] ? (() => { try { return atob(redir[1].split('r=')[1]) } catch { return redir[1] } })()
              : ($('.fa-file-download.fa-lg').parent().attr('href') || link)
    if (vc?.startsWith('/')) vc = `${base}${vc}`
    const r2 = await fetch(vc, { headers: h, redirect:'follow' })
    const $2 = load(await r2.text())
    const out = []
    $2('.btn-success.btn-lg.h6,.btn-danger,.btn-secondary').each((_, el) => {
      const href = $2(el).attr('href') || ''
      if (!href) return
      if (href.includes('pixeld')) {
        // Convert to pixeldrain embed player
        const id = href.split('/').pop().split('?')[0]
        out.push({server:'Pixeldrain',link:`https://pixeldrain.com/u/${id}`,type:'embed'})
      } else if (href.includes('.dev') && !href.includes('/?id=')) {
        out.push({server:'Cf Worker',link:href,type:'embed'})
      } else if (href.includes('hubcloud')||href.includes('/?id=')) {
        out.push({server:'HubCloud',link:href,type:'embed'})
      } else if (href.includes('cloudflarestorage')) {
        out.push({server:'CfStorage',link:href,type:'embed'})
      } else if (href.includes('hubcdn')) {
        out.push({server:'HubCdn',link:href,type:'embed'})
      } else if (href.includes('.mkv')||href.includes('?token=')) {
        out.push({server:'Direct',link:href,type:'embed'})
      }
    })
    return out
  } catch (e) { console.error('[hubcloud]', e.message); return [] }
}

async function gdflix(link) {
  try {
    const html = await get(link)
    const $ = load(html)
    const seed = $('.btn-danger').attr('href') || ''
    if (!seed.includes('?url=')) return []
    const token = seed.split('=')[1]
    const fd = new FormData(); fd.append('keys', token)
    const api = seed.split('/').slice(0,3).join('/') + '/api'
    const res = await fetch(api, { method:'POST', body:fd, headers:{'x-token':api} })
    const d = await res.json()
    return d.error ? [] : [{server:'GDFlix',link:d.url,type:'mkv'}]
  } catch { return [] }
}

// ─── MULTISTREAM (autoEmbed via Stremio cinemeta) ────────────────────────────
async function autoEmbedPosts(filter) {
  try {
    const d = await getJSON('https://v3-cinemeta.strem.io' + filter)
    return (d?.metas || []).slice(0,20).map(m => ({
      title:m.name, link:`autoEmbed:${m.type}:${m.id}`, image:m.poster||''
    }))
  } catch (e) { console.error('[autoEmbed] posts:', e.message); return [] }
}

async function autoEmbedSearch(q) {
  try {
    const [r1,r2] = await Promise.allSettled([
      getJSON(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(q)}.json`),
      getJSON(`https://v3-cinemeta.strem.io/catalog/series/top/search=${encodeURIComponent(q)}.json`),
    ])
    return [
      ...(r1.status==='fulfilled' ? r1.value?.metas||[] : []),
      ...(r2.status==='fulfilled' ? r2.value?.metas||[] : []),
    ].slice(0,30).map(m=>({ title:m.name, link:`autoEmbed:${m.type}:${m.id}`, image:m.poster||'' }))
  } catch (e) { console.error('[autoEmbed] search:', e.message); return [] }
}

async function autoEmbedMeta(link) {
  try {
    const [,type,id] = link.split(':')
    const d = await getJSON(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`)
    const m = d?.meta || {}
    return {
      title:m.name||'', synopsis:m.description||'', image:m.poster||'',
      imdbId:m.imdb_id||id, type, tags:m.genres||[], rating:m.imdbRating||'',
      cast:(m.cast||[]).slice(0,6),
      linkList: type==='series'
        ? [{title:'Season 1',episodesLink:link,directLinks:[],quality:''}]
        : [{title:'Watch',episodesLink:'',directLinks:[{title:'Stream',link,type:'movie'}],quality:''}],
    }
  } catch (e) { console.error('[autoEmbed] meta:', e.message); return {title:'',synopsis:'',image:'',imdbId:'',type:'movie',linkList:[]} }
}

function autoEmbedStream(link) {
  const parts = link.split(':')
  const type = parts[1], id = parts[2]
  return [
    {server:'VidSrc',     link:`https://vidsrc.cc/v2/embed/${type}/${id}`,        type:'embed'},
    {server:'VidSrc Pro', link:`https://vidsrc.pro/embed/${type}/${id}`,           type:'embed'},
    {server:'SuperEmbed', link:`https://multiembed.mov/?video_id=${id}&tmdb=1`,    type:'embed'},
    {server:'AutoEmbed',  link:`https://player.autoembed.cc/embed/${type}/${id}`,  type:'embed'},
  ]
}

function autoEmbedEpStream(link) {
  const [,type,id,season,ep] = link.split(':')
  return [
    {server:'VidSrc',     link:`https://vidsrc.cc/v2/embed/${type}/${id}/${season}-${ep}`,              type:'embed'},
    {server:'VidSrc Pro', link:`https://vidsrc.pro/embed/${type}/${id}?season=${season}&episode=${ep}`, type:'embed'},
    {server:'AutoEmbed',  link:`https://player.autoembed.cc/embed/${type}/${id}/${season}/${ep}`,        type:'embed'},
  ]
}

async function autoEmbedEpisodes(link) {
  try {
    const [,type,id] = link.split(':')
    const d = await getJSON(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`)
    const s1 = (d?.meta?.videos||[]).filter(v=>v.season===1)
    return s1.map(ep=>({ title:ep.title||`Episode ${ep.number}`, link:`autoEmbed:${type}:${id}:${ep.season}:${ep.number}` }))
  } catch { return [] }
}

// ─── MYFLIXBD ────────────────────────────────────────────────────────────────
const MFBD = 'https://myflixbd.to'

async function mfbdScrape(url) {
  const base = 'https://myflixbd.to'
  
  // Helper: fetch posts from WP REST API and extract image from yoast or _embedded
  async function fetchPosts(apiUrl) {
    const posts = await getJSON(apiUrl)
    return (posts || []).map(p => ({
      title: (p.title?.rendered || '').replace(/<[^>]+>/g,'').trim(),
      link:  p.link || '',
      image: p.yoast_head_json?.og_image?.[0]?.url ||
             p.yoast_head_json?.twitter_image ||
             p._embedded?.['wp:featuredmedia']?.[0]?.source_url || '',
    })).filter(p => p.title && p.link)
  }

  try {
    const fields = '_fields=id,title,link,yoast_head_json&per_page=15'
    let apiUrl

    if (url.includes('/?s=')) {
      const q = decodeURIComponent(url.split('/?s=')[1])
      apiUrl = `${base}/wp-json/wp/v2/posts?search=${encodeURIComponent(q)}&${fields}`
    } else {
      const catMatch = url.match(/\/genre\/([^/]+)/)
      const pageMatch = url.match(/\/page\/(\d+)/)
      const page = pageMatch ? pageMatch[1] : 1
      if (catMatch) {
        const catSlug = catMatch[1]
        const catRes = await getJSON(`${base}/wp-json/wp/v2/categories?slug=${catSlug}&_fields=id`)
        const catId = catRes?.[0]?.id
        if (catId) {
          apiUrl = `${base}/wp-json/wp/v2/posts?categories=${catId}&page=${page}&${fields}`
        }
      }
      if (!apiUrl) apiUrl = `${base}/wp-json/wp/v2/posts?page=${page}&${fields}`
    }

    const results = await fetchPosts(apiUrl)
    console.log(`[myflixbd] ${results.length} posts`)
    return results
  } catch (e) {
    console.error('[myflixbd] error:', e.message)
    return []
  }
}

async function mfbdMeta(link) {
  try {
    const html = await get(link)
    const $ = load(html)
    const title = ($('meta[property="og:title"]').attr('content') || $('h1').first().text()).replace(/\s*(Watch Online|Download|WEB-DL|WEB-RIP).*/i,'').trim()
    const image = $('meta[property="og:image"]').attr('content') || $('img.wp-post-image').attr('src') || ''
    const synopsis = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || ''
    const type = link.includes('/series/') || link.includes('/tv/') ? 'series' : 'movie'
    const links = []
    $('a').each((_,el) => {
      const href = $(el).attr('href') || ''
      const text = $(el).text().trim()
      if (!href.startsWith('http') || href.includes('myflixbd')) return
      if (text.match(/server\s*\d+/i) || href.includes('gofile') || href.includes('mega') || href.includes('drive.google') || href.includes('pixeldrain') || href.includes('hubcloud')) {
        links.push({ title:text||'Watch', episodesLink:'', directLinks:[{title:text||'Server',link:href,type:'movie'}], quality:'' })
      }
    })
    if (!links.length) links.push({ title:'Watch', episodesLink:'', directLinks:[{title:'Watch',link,type:'movie'}], quality:'' })
    return { title, synopsis, image, imdbId:'', type, linkList:links }
  } catch (e) { console.error('[myflixbd] meta:', e.message); return {title:'',synopsis:'',image:'',imdbId:'',type:'movie',linkList:[]} }
}

async function mfbdStream(link) {
  try {
    const html = await get(link)
    const m = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i)
    if (m) return [{server:'JWPlayer',link:m[1],type:m[1].includes('.m3u8')?'hls':'mp4'}]
    const $ = load(html)
    const iframes = []
    $('iframe').each((_,el) => {
      const src = $(el).attr('src')||$(el).attr('data-src')||''
      if (src?.startsWith('http') && !src.includes('google.com/maps')) iframes.push({server:'Embed',link:src,type:'embed'})
    })
    if (iframes.length) return iframes
    return [{server:'MyFlixBD',link,type:'embed'}]
  } catch (e) { console.error('[myflixbd] stream:', e.message); return [] }
}

// ─── HANDLER ─────────────────────────────────────────────────────────────────
async function driveEpisodes(url) {
  // For drive series, episodesLink is a hubcloud/gdflix page with episode links
  // OR it's a season page on moviesdrive with episode links
  try {
    const html = await get(url)
    const $ = load(html)
    const eps = []
    // Case 1: it's a moviesdrive season page with episode links
    $('a').each((_, el) => {
      const href = $(el).attr('href') || ''
      const text = $(el).text().trim()
      if (!href || href === '#') return
      if ((text.match(/ep(isode)?\s*\d+|e\d+/i) || href.match(/ep(isode)?[-_]\d+/i)) && 
          (href.includes('hubcloud') || href.includes('gdflix') || href.includes('driveleech'))) {
        eps.push({ title: text || href.split('/').pop(), link: href })
      }
    })
    if (eps.length) return eps
    // Case 2: the url itself IS the stream link — return it as a single episode
    if (url.includes('hubcloud') || url.includes('gdflix') || url.includes('driveleech')) {
      return [{ title: 'Episode 1', link: url }]
    }
    return []
  } catch { return [] }
}


export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const body = req.method === 'POST' ? req.body : req.query
  const { action, providerValue:pv, link, type, filter, page=1, searchQuery, url } = body || {}
  const p = Number(page)||1

  console.log(`[API] ${action} pv=${pv}`)

  try {
    let result

    if (action === 'catalog') {
      result = { catalog: CATALOGS[pv] || [], genres: [] }

    } else if (action === 'posts') {
      if (pv === 'drive') {
        const base = await driveBase()
        const f = filter || ''
        const pageUrl = f ? `${base}${f.startsWith('/')?f.slice(1):f}page/${p}/` : `${base}page/${p}/`
        result = await driveScrape(pageUrl)
      } else if (pv === 'autoEmbed') {
        const cat = CATALOGS.autoEmbed.find(c=>c.filter===filter) || CATALOGS.autoEmbed[0]
        result = await autoEmbedPosts(cat.filter)
      } else if (pv === 'myflixbd') {
        const f = filter || '/'
        result = await mfbdScrape(`${MFBD}${f}page/${p}/`)
      }

    } else if (action === 'search') {
      if (pv === 'drive') {
        const base = await driveBase()
        result = await driveScrape(`${base}page/${p}/?s=${encodeURIComponent(searchQuery)}`)
      } else if (pv === 'autoEmbed') {
        result = await autoEmbedSearch(searchQuery)
      } else if (pv === 'myflixbd') {
        result = await mfbdScrape(`${MFBD}/?s=${encodeURIComponent(searchQuery)}`)
      }

    } else if (action === 'meta') {
      if (pv === 'drive')     result = await driveMeta(link)
      else if (pv === 'autoEmbed') result = await autoEmbedMeta(link)
      else if (pv === 'myflixbd')  result = await mfbdMeta(link)

    } else if (action === 'stream') {
      if (pv === 'drive')     result = await driveStream(link, type)
      else if (pv === 'autoEmbed') result = link.split(':').length===5 ? autoEmbedEpStream(link) : autoEmbedStream(link)
      else if (pv === 'myflixbd')  result = await mfbdStream(link)

    } else if (action === 'episodes') {
      if (pv === 'drive')     result = await driveEpisodes(url)
      else if (pv === 'autoEmbed') result = await autoEmbedEpisodes(url)
      else if (pv === 'myflixbd')  result = []

    } else {
      return res.status(400).json({ ok:false, error:`Unknown action: ${action}` })
    }

    return res.status(200).json({ ok:true, data:result })
  } catch (e) {
    console.error(`[API] ${action}/${pv} error:`, e.message)
    return res.status(500).json({ ok:false, error:e.message })
  }
}
