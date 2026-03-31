/**
 * contentUtils.js — Core content-type logic
 *
 * Provider linkList shapes:
 *   Series season  → { title, episodesLink: "url" }
 *   Movie quality  → { title, quality?, directLinks: [{title, link, type:'movie'}] }
 */

// ── Content type analysis ─────────────────────────────────────────────────
export function analyzeContent(meta) {
  const ll = meta?.linkList || []
  if (!ll.length) return { kind: 'unknown', seasons: [], qualities: [] }

  // Real seasons MUST have episodesLink
  const realSeasons = ll.filter(l => Boolean(l.episodesLink))
  if (realSeasons.length > 0) {
    return { kind: 'series', seasons: realSeasons, qualities: [] }
  }

  // Movie: each linkList item is a quality tier
  const qualities = ll.map((l, i) => ({
    label:       extractQualityLabel(l.title) || extractQualityLabel(l.quality) || `Option ${i + 1}`,
    rawTitle:    l.title || '',
    directLinks: l.directLinks || [],
    link:        l.link || '',
    idx:         i,
  }))

  // De-duplicate quality labels (720p · 720p · 720p → 720p [Hindi], 720p [English]…)
  const seen = {}
  qualities.forEach(q => {
    seen[q.label] = (seen[q.label] || 0) + 1
  })
  const counter = {}
  qualities.forEach(q => {
    if (seen[q.label] > 1) {
      counter[q.label] = (counter[q.label] || 0) + 1
      const lang = detectLangFromTitle(q.rawTitle)
      q.label = lang ? `${q.label} · ${lang}` : `${q.label} #${counter[q.label]}`
    }
  })

  return { kind: 'movie', seasons: [], qualities }
}

// ── Quality extraction ─────────────────────────────────────────────────────
export function extractQualityLabel(str) {
  if (!str) return null
  const m = str.match(/\b(4K|2160p?|1080p?|720p?|480p?|360p?)\b/i)
  if (!m) return null
  const raw = m[1].toUpperCase().replace(/P$/,'')
  if (raw === '2160' || raw === '4K') return '4K'
  return raw + 'p'
}

export function detectLangFromTitle(str) {
  if (!str) return null
  const t = str.toLowerCase()
  if (t.includes('hindi'))    return 'Hindi'
  if (t.includes('english'))  return 'English'
  if (t.includes('tamil'))    return 'Tamil'
  if (t.includes('telugu'))   return 'Telugu'
  if (t.includes('kannada'))  return 'Kannada'
  if (t.includes('malayalam'))return 'Malayalam'
  if (t.includes('korean'))   return 'Korean'
  if (t.includes('japanese')) return 'Japanese'
  if (t.includes('spanish'))  return 'Spanish'
  return null
}

// ── Stream quality grouping ────────────────────────────────────────────────
const QP_ORDER = ['4K','2160p','1440p','1080p','720p','480p','360p','Auto']

export function getStreamQuality(s) {
  if (s.quality) {
    const q = String(s.quality)
    return q.endsWith('p') ? q : (q === '2160' ? '4K' : q + 'p')
  }
  const text = `${s.server||''} ${s.link||''}`
  const m    = text.match(/\b(2160|4K|1440|1080|720|480|360)\b/i)
  if (!m) return 'Auto'
  const n = m[1].toUpperCase()
  return (n === '2160' || n === '4K') ? '4K' : n + 'p'
}

export function groupStreamsByQuality(streams) {
  if (!streams?.length) return []
  const map = {}
  streams.forEach((s, i) => {
    const q = getStreamQuality(s)
    if (!map[q]) map[q] = []
    map[q].push({ ...s, _serverIdx: i })
  })
  return Object.entries(map)
    .map(([quality, streams]) => ({ quality, streams }))
    .sort((a, b) => {
      const ai = QP_ORDER.indexOf(a.quality)
      const bi = QP_ORDER.indexOf(b.quality)
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    })
}

// ── Audio track extraction from stream list ────────────────────────────────
export function extractAudioLangs(streams) {
  const langs = new Set()
  streams?.forEach(s => {
    const t = `${s.server||''} ${s.link||''}`
    if (/hindi/i.test(t))     langs.add('Hindi')
    if (/english/i.test(t))   langs.add('English')
    if (/tamil/i.test(t))     langs.add('Tamil')
    if (/telugu/i.test(t))    langs.add('Telugu')
    if (/kannada/i.test(t))   langs.add('Kannada')
    if (/malayalam/i.test(t)) langs.add('Malayalam')
    if (/korean/i.test(t))    langs.add('Korean')
    if (/japanese/i.test(t))  langs.add('Japanese')
  })
  return [...langs]
}

// ── Time format ───────────────────────────────────────────────────────────
export function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${m}:${String(s).padStart(2,'0')}`
}
