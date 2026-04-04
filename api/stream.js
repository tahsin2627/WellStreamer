// api/stream.js — WellStreamer backend
// Providers: drive (MoviesDrive) + autoEmbed (MultiStream) + myflixbd (MyFlixBD)
// All self-contained — no GitHub fetching

const cheerio = require('cheerio')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const HDRS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function get(url, extraHeaders = {}) {
  const res = await fetch(url, {
    headers: { ...HDRS, ...extraHeaders },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.text()
}

async function getJSON(url) {
  const res = await fetch(url, { headers: HDRS })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.json()
}

// ── Catalog definitions ───────────────────────────────────────────────────────
const CATALOGS = {
  drive: [
    { title: 'Latest',   filter: '' },
    { title: 'Netflix',  filter: 'category/netflix/' },
    { title: 'Anime',    filter: 'category/anime/' },
    { title: '4K',       filter: 'category/2160p-4k/' },
    { title: 'Action',   filter: '/category/action' },
    { title: 'Comedy',   filter: '/category/comedy' },
    { title: 'Drama',    filter: '/category/drama' },
    { title: 'Horror',   filter: '/category/horror' },
    { title: 'Thriller', filter: '/category/triller' },
  ],
  autoEmbed: [
    { title: 'Trending Movies',  filter: '/catalog/movie/top.json' },
    { title: 'Popular Series',   filter: '/catalog/series/top.json' },
    { title: 'New on Netflix',   filter: '/catalog/movie/netflix-movies.json' },
  ],
  myflixbd: [
    { title: 'Latest',         filter: '/' },
    { title: 'Bangla Movies',  filter: '/genre/bangla-movies/' },
    { title: 'Bangla Dubbed',  filter: '/genre/bangla-dub-movies/' },
    { title: 'Hollywood',      filter: '/genre/hollywood-movies/' },
    { title: 'Hindi',          filter: '/genre/hindi-movies/' },
    { title: 'South Indian',   filter: '/genre/south-indian-movies/' },
    { title: 'K-Drama',        filter: '/genre/k-drama-web-series/' },
    { title: 'Anime',          filter: '/genre/anime/' },
    { title: 'Bangla Series',  filter: '/genre/bangla-web-series/' },
  ],
}

// ══════════════════════════════════════════════════════════
// MOVIESDRIVE (drive)
// ══════════════════════════════════════════════════════════
async function getDriveBase() {
  try {
    const d = await getJSON('https://himanshu8443.github.io/providers/modflix.json')
    return (d?.drive?.url || 'https://moviesdrive.rent/').replace(/\/$/, '') + '/'
  } catch { return 'https://moviesdrive.rent/' }
}

async function driveScrape(url) {
  try {
    const html = await get(url)
    const $ = cheerio.load(html)
    const posts = []
    // Primary selector
    $('.poster-card').each((_, el) => {
      const title = $(el).find('.poster-title').text().replace('Download','').trim()
      const link  = $(el).parent().attr('href') || $(el).closest('a').attr('href') || ''
      const image = $(el).find('.poster-image img').attr('src') || $(el).find('img').attr('src') || ''
      if (title && link) posts.push({ title, link, image })
    })
    // Fallback
    if (!posts.length) {
      $('article').each((_, el) => {
        const $el = $(el)
        const title = $el.find('.entry-title, h2, h3').first().text().trim()
        const link  = $el.find('a').first().attr('href') || ''
        const image = $el.find('img').first().attr('src') || $el.find('img').attr('data-src') || ''
        if (title && link) posts.push({ title, link, image })
      })
    }
    return posts
  } catch (e) {
    console.error('[drive] scrape error:', e.message)
    return []
  }
}

async function driveMeta(link) {
  try {
    const html = await get(link)
    const $ = cheerio.load(html)
    const lw = $('.left-wrapper, .entry-content')
    const type = lw.text().toLowerCase().includes('movie name') ? 'movie' : 'series'
    const title = (lw.find('strong:contains("Name")').next().text() || $('h1').first().text()).trim()
    const synopsis = (lw.find('h2:contains("Storyline"),h3:contains("Storyline"),h4:contains("Storyline")').next().text() || '').trim()
    const image = $('img.entered.lazyloaded,img.litespeed-loaded,.wp-post-image').attr('src') || $('img').first().attr('src') || ''
    const imdbId = ($('a:contains("IMDb")').attr('href') || '').split('/')[4] || ''
    const links = []
    $('a').each((_, el) => {
      const href = $(el).attr('href') || ''
      const text = $(el).text().trim()
      if (!href || href === '#') return
      if (href.includes('hubcloud') || href.includes('gdflix') || href.includes('vcloud')) {
        const q = (text + href).match(/\b(480p?|720p?|1080p?|2160p?|4k)\b/i)?.[0] || ''
        links.push({
          title: text || q || 'Stream',
          episodesLink: type === 'series' ? href : '',
          directLinks: type === 'movie' ? [{ title: text || 'Movie', link: href, type: 'movie' }] : [],
          quality: q.replace(/p$/i, ''),
        })
      }
    })
    return { title, synopsis, image, imdbId, type, linkList: links }
  } catch (e) {
    console.error('[drive] meta error:', e.message)
    return { title: '', synopsis: '', image: '', imdbId: '', type: 'movie', linkList: [] }
  }
}

async function driveStream(url, type) {
  try {
    if (type === 'movie') {
      const html = await get(url)
      const $ = cheerio.load(html)
      url = $('a:contains("HubCloud")').attr('href') || url
    }
    let redirect = ''
    try {
      const html = await get(url)
      redirect = html.match(/<meta[^>]+http-equiv="refresh"[^>]+url=([^"]+)"/i)?.[1] ||
                 html.match(/<a[^>]+href="(https:\/\/hubcloud\.[^"]+)"/i)?.[1] || ''
      if (url.includes('/archives/')) redirect = html.match(/<a[^>]+href="(https:\/\/hubcloud\.[^"]+)"/i)?.[1] || ''
    } catch {}
    if (!redirect) {
      if (url.includes('hubcloud')) return hubcloud(url)
      if (url.includes('gdflix')) return gdflix(url)
      return []
    }
    const html2 = await get(redirect)
    const $2 = cheerio.load(html2)
    const hcLink = $2('.fa-file-download').parent().attr('href') || ''
    return hubcloud(hcLink?.includes('hubcloud') ? hcLink : redirect)
  } catch (e) {
    console.error('[drive] stream error:', e.message)
    return []
  }
}

async function hubcloud(link) {
  try {
    const base = link.split('/').slice(0,3).join('/')
    const ck = 'ext_name=ojplmecpdpgccookcobabopnaifgidhf; xla=s4t'
    const h = { ...HDRS, Cookie: ck }
    const html = await get(link, h)
    const $ = cheerio.load(html)
    const redir = html.match(/var\s+url\s*=\s*'([^']+)';/) || []
    let vc = redir[1] ? (() => { try { return atob(redir[1].split('r=')[1]) } catch { return redir[1] } })()
              : ($('.fa-file-download.fa-lg').parent().attr('href') || link)
    if (vc?.startsWith('/')) vc = `${base}${vc}`
    const r2 = await fetch(vc, { headers: h, redirect: 'follow' })
    const $2 = cheerio.load(await r2.text())
    const out = []
    $2('.btn-success.btn-lg.h6,.btn-danger,.btn-secondary').each((_, el) => {
      const href = $2(el).attr('href') || ''
      if (!href) return
      if      (href.includes('pixeld') && !href.includes('api')) { const t=href.split('/').pop(),b=href.split('/').slice(0,-2).join('/'); out.push({server:'Pixeldrain',link:`${b}/api/file/${t}`,type:'mkv'}) }
      else if (href.includes('.dev') && !href.includes('/?id='))  out.push({server:'Cf Worker',link:href,type:'mkv'})
      else if (href.includes('hubcloud') || href.includes('/?id=')) out.push({server:'HubCloud',link:href,type:'mkv'})
      else if (href.includes('cloudflarestorage'))  out.push({server:'CfStorage',link:href,type:'mkv'})
      else if (href.includes('hubcdn'))             out.push({server:'HubCdn',link:href,type:'mkv'})
      else if (href.includes('.mkv') || href.includes('?token=')) out.push({server:'Direct',link:href,type:'mkv'})
    })
    return out
  } catch (e) { console.error('[hubcloud]', e.message); return [] }
}

async function gdflix(link) {
  try {
    const html = await get(link)
    const $ = cheerio.load(html)
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

// ══════════════════════════════════════════════════════════
// MULTISTREAM (autoEmbed) — Stremio/cinemeta + embed players
// ══════════════════════════════════════════════════════════
async function autoEmbedPosts(filter) {
  try {
    const d = await getJSON('https://cinemeta-catalogs.strem.io' + filter)
    return (d?.metas || []).slice(0,20).map(m => ({
      title: m.name, link: `autoEmbed:${m.type}:${m.id}`, image: m.poster || '',
    }))
  } catch (e) { console.error('[autoEmbed] posts:', e.message); return [] }
}

async function autoEmbedSearch(q) {
  try {
    const [r1,r2] = await Promise.allSettled([
      getJSON(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(q)}.json`),
      getJSON(`https://v3-cinemeta.strem.io/catalog/series/top/search=${encodeURIComponent(q)}.json`),
    ])
    const all = [
      ...(r1.status==='fulfilled' ? r1.value?.metas||[] : []),
      ...(r2.status==='fulfilled' ? r2.value?.metas||[] : []),
    ].slice(0,30)
    return all.map(m => ({ title:m.name, link:`autoEmbed:${m.type}:${m.id}`, image:m.poster||'' }))
  } catch (e) { console.error('[autoEmbed] search:', e.message); return [] }
}

async function autoEmbedMeta(link) {
  try {
    const [, type, id] = link.split(':')
    const d = await getJSON(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`)
    const m = d?.meta || {}
    const isSeries = type === 'series'
    return {
      title: m.name||'', synopsis: m.description||'', image: m.poster||'',
      imdbId: m.imdb_id||id, type, tags: m.genres||[], rating: m.imdbRating||'',
      cast: (m.cast||[]).slice(0,6),
      linkList: isSeries
        ? [{ title:'Season 1', episodesLink: link, directLinks:[], quality:'' }]
        : [{ title:'Watch', episodesLink:'', directLinks:[{title:'Stream',link,type:'movie'}], quality:'' }],
    }
  } catch (e) { console.error('[autoEmbed] meta:', e.message); return {title:'',synopsis:'',image:'',imdbId:'',type:'movie',linkList:[]} }
}

async function autoEmbedStream(link) {
  const [, type, id] = link.split(':')
  return [
    { server:'VidSrc',      link:`https://vidsrc.cc/v2/embed/${type}/${id}`,        type:'embed' },
    { server:'VidSrc Pro',  link:`https://vidsrc.pro/embed/${type}/${id}`,           type:'embed' },
    { server:'SuperEmbed',  link:`https://multiembed.mov/?video_id=${id}&tmdb=1`,    type:'embed' },
    { server:'AutoEmbed',   link:`https://player.autoembed.cc/embed/${type}/${id}`,  type:'embed' },
  ]
}

async function autoEmbedEpisodes(link) {
  try {
    const [, type, id] = link.split(':')
    const d = await getJSON(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`)
    const s1 = (d?.meta?.videos||[]).filter(v=>v.season===1)
    return s1.map(ep => ({
      title: ep.title||`Episode ${ep.number}`,
      link: `autoEmbed:${type}:${id}:${ep.season}:${ep.number}`,
    }))
  } catch { return [] }
}

async function autoEmbedEpisodeStream(link) {
  const [, type, id, season, ep] = link.split(':')
  return [
    { server:'VidSrc',     link:`https://vidsrc.cc/v2/embed/${type}/${id}/${season}-${ep}`,            type:'embed' },
    { server:'VidSrc Pro', link:`https://vidsrc.pro/embed/${type}/${id}?season=${season}&episode=${ep}`, type:'embed' },
    { server:'AutoEmbed',  link:`https://player.autoembed.cc/embed/${type}/${id}/${season}/${ep}`,      type:'embed' },
  ]
}

// ══════════════════════════════════════════════════════════
// MYFLIXBD — Bangla/South Asian content
// ══════════════════════════════════════════════════════════
const MFBD = 'https://myflixbd.to'

async function mfbdScrape(url) {
  try {
    const html = await get(url)
    const $ = cheerio.load(html)
    const posts = []

    // The site uses standard WordPress archive layout
    // Try all known selectors for this theme style
    const selectors = [
      'article.type-post',
      'article.type-movie', 
      '.post-item',
      '.movie-item',
      '.flx-item',
      '.item',
      'article',
    ]

    for (const sel of selectors) {
      $(sel).each((_, el) => {
        const $el = $(el)
        // Skip if already found via earlier selector
        const link = (
          $el.find('a.post-thumbnail-link,a.entry-link').attr('href') ||
          $el.find('h2 a, h3 a, .entry-title a').attr('href') ||
          $el.find('a').first().attr('href') || ''
        )
        if (!link || !link.includes('myflixbd.to')) return

        const title = (
          $el.find('.entry-title, h2, h3, .title').first().text() ||
          $el.find('img').attr('alt') || ''
        ).trim()

        const image = (
          $el.find('img.wp-post-image').attr('src') ||
          $el.find('img').first().attr('src') ||
          $el.find('img').first().attr('data-src') ||
          $el.find('img').first().attr('data-lazy-src') || ''
        )

        if (title && link) {
          posts.push({ title: title.replace(/\s*\(.*?Download.*?\)\s*/i,'').trim(), link, image })
        }
      })
      if (posts.length > 0) break
    }

    console.log(`[myflixbd] Scraped ${posts.length} from ${url}`)
    return posts
  } catch (e) {
    console.error('[myflixbd] scrape error:', e.message)
    return []
  }
}

async function mfbdMeta(link) {
  try {
    const html = await get(link)
    const $ = cheerio.load(html)

    // Title
    const title = (
      $('h1.entry-title, h1.post-title, h1').first().text() ||
      $('meta[property="og:title"]').attr('content') || ''
    ).trim().replace(/\s*(Watch Online|Download|WEB-DL|WEB-RIP).*$/i, '').trim()

    // Image
    const image = (
      $('meta[property="og:image"]').attr('content') ||
      $('.post-thumbnail img, .entry-thumbnail img, img.wp-post-image').attr('src') ||
      $('img.size-post-thumbnail').attr('src') || ''
    )

    // Synopsis
    const synopsis = (
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      $('.entry-content p').first().text() || ''
    ).trim()

    // Determine type: series has season/episode structure
    const bodyClass = $('body').attr('class') || ''
    const isSeries = bodyClass.includes('series') || 
                     link.includes('/series/') || 
                     link.includes('/tv/') ||
                     $('a:contains("Season"),a:contains("Episode")').length > 0
    const type = isSeries ? 'series' : 'movie'

    // Build link list - find download/stream server buttons
    const linkList = []
    let currentQuality = ''

    // Quality sections like "Download 1080p", "Download 720p"
    $('h3, h4, strong').each((_, el) => {
      const t = $(el).text().trim()
      const qMatch = t.match(/\b(1080p?|720p?|480p?|2160p?|4k)\b/i)
      if (qMatch) currentQuality = qMatch[0]
    })

    // Find server links
    const serverLinks = []
    $('a').each((_, el) => {
      const href = $(el).attr('href') || ''
      const text = $(el).text().trim()
      // Server buttons like "Server 1", "SERVER-1", download links
      if (
        href.startsWith('http') &&
        !href.includes('myflixbd.to') &&
        (
          text.match(/server\s*\d+/i) ||
          href.includes('gofile') ||
          href.includes('mega') ||
          href.includes('drive.google') ||
          href.includes('terabox') ||
          href.includes('1fichier') ||
          href.includes('mediafire') ||
          href.includes('pixeldrain') ||
          href.includes('hubcloud') ||
          href.includes('gdflix') ||
          href.includes('jwplayer')
        )
      ) {
        serverLinks.push({ text, href })
      }
    })

    // Group server links into quality groups
    if (serverLinks.length > 0) {
      linkList.push({
        title: 'Stream',
        episodesLink: type === 'series' ? link : '',
        directLinks: type === 'movie' ? serverLinks.slice(0,4).map(s => ({
          title: s.text || 'Server',
          link: s.href,
          type: 'movie',
        })) : [],
        quality: currentQuality || '720',
      })
    }

    // If no links found, use the page itself for JW Player extraction
    if (linkList.length === 0) {
      linkList.push({
        title: 'Watch',
        episodesLink: '',
        directLinks: [{ title: 'JW Player', link, type: 'movie' }],
        quality: '',
      })
    }

    return { title, synopsis, image, imdbId: '', type, linkList }
  } catch (e) {
    console.error('[myflixbd] meta error:', e.message)
    return { title: '', synopsis: '', image: '', imdbId: '', type: 'movie', linkList: [] }
  }
}

async function mfbdStream(link) {
  try {
    const html = await get(link)

    // Try to extract JW Player setup file (m3u8/mp4)
    const jwMatch = html.match(/file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i)
    if (jwMatch) {
      const streamUrl = jwMatch[1]
      return [{ server: 'JWPlayer', link: streamUrl, type: streamUrl.includes('.m3u8') ? 'hls' : 'mp4' }]
    }

    // Try iframe embed sources
    const iframes = []
    const $ = cheerio.load(html)
    $('iframe').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || ''
      if (src && src.startsWith('http') && !src.includes('google.com/maps')) {
        iframes.push({ server: 'Embed', link: src, type: 'embed' })
      }
    })
    if (iframes.length) return iframes

    // Try finding gofile/pixeldrain/direct links in page
    const directLinks = []
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || ''
      if (
        href.includes('gofile.io') ||
        href.includes('pixeldrain.com') ||
        href.includes('mega.nz') ||
        href.includes('.m3u8') ||
        href.includes('.mp4')
      ) {
        directLinks.push({
          server: new URL(href).hostname.replace('www.', ''),
          link: href,
          type: href.includes('.m3u8') ? 'hls' : href.includes('.mp4') ? 'mp4' : 'direct',
        })
      }
    })
    if (directLinks.length) return directLinks

    // Last resort: return page as embed  
    return [{ server: 'MyFlixBD', link, type: 'embed' }]
  } catch (e) {
    console.error('[myflixbd] stream error:', e.message)
    return []
  }
}

async function mfbdEpisodes(link) {
  try {
    const html = await get(link)
    const $ = cheerio.load(html)
    const eps = []
    // Look for episode links
    $('a').each((_, el) => {
      const href = $(el).attr('href') || ''
      const text = $(el).text().trim()
      if (
        (text.match(/episode\s*\d+|ep\s*\d+|\bS\d+E\d+\b/i) ||
         href.includes('/episode/') || href.includes('/ep-')) &&
        href.includes('myflixbd.to')
      ) {
        eps.push({ title: text, link: href })
      }
    })
    return eps
  } catch { return [] }
}

// ══════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const body = req.method === 'POST' ? req.body : req.query
  const { action, providerValue, link, type, filter, page=1, searchQuery, url } = body || {}
  const p = Number(page) || 1

  console.log(`[API] action=${action} provider=${providerValue} page=${p}`)

  try {
    let result

    // ── CATALOG ──
    if (action === 'catalog') {
      result = { catalog: CATALOGS[providerValue] || [], genres: [] }
    }

    // ── POSTS ──
    else if (action === 'posts') {
      if (providerValue === 'drive') {
        const base = await getDriveBase()
        const f = filter || ''
        const pageUrl = f
          ? `${base}${f.startsWith('/') ? f.slice(1) : f}page/${p}/`
          : `${base}page/${p}/`
        result = await driveScrape(pageUrl)
      } else if (providerValue === 'autoEmbed') {
        const cat = CATALOGS.autoEmbed.find(c=>c.filter===filter) || CATALOGS.autoEmbed[0]
        result = await autoEmbedPosts(cat.filter)
      } else if (providerValue === 'myflixbd') {
        const f = filter || '/'
        const pageUrl = `${MFBD}${f}${f.endsWith('/') ? '' : '/'}page/${p}/`
        result = await mfbdScrape(pageUrl)
      }
    }

    // ── SEARCH ──
    else if (action === 'search') {
      if (providerValue === 'drive') {
        const base = await getDriveBase()
        result = await driveScrape(`${base}page/${p}/?s=${encodeURIComponent(searchQuery)}`)
      } else if (providerValue === 'autoEmbed') {
        result = await autoEmbedSearch(searchQuery)
      } else if (providerValue === 'myflixbd') {
        result = await mfbdScrape(`${MFBD}/?s=${encodeURIComponent(searchQuery)}`)
      }
    }

    // ── META ──
    else if (action === 'meta') {
      if (providerValue === 'drive')     result = await driveMeta(link)
      else if (providerValue === 'autoEmbed') result = await autoEmbedMeta(link)
      else if (providerValue === 'myflixbd')  result = await mfbdMeta(link)
    }

    // ── STREAM ──
    else if (action === 'stream') {
      if (providerValue === 'drive')     result = await driveStream(link, type)
      else if (providerValue === 'autoEmbed') {
        result = link.split(':').length === 5
          ? await autoEmbedEpisodeStream(link)
          : await autoEmbedStream(link)
      }
      else if (providerValue === 'myflixbd')  result = await mfbdStream(link)
    }

    // ── EPISODES ──
    else if (action === 'episodes') {
      if (providerValue === 'drive')     result = []
      else if (providerValue === 'autoEmbed') result = await autoEmbedEpisodes(url)
      else if (providerValue === 'myflixbd')  result = await mfbdEpisodes(url)
    }

    else {
      return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
    }

    return res.status(200).json({ ok: true, data: result })
  } catch (e) {
    console.error(`[API] ${action}/${providerValue} error:`, e.message)
    return res.status(500).json({ ok: false, error: e.message })
  }
}
