const ls = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key)
      return v !== null ? JSON.parse(v) : fallback
    } catch { return fallback }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
  },
  del(key) {
    try { localStorage.removeItem(key) } catch {}
  }
}

export const authStorage = {
  getSession:   ()  => ls.get('ws_session'),
  setSession:   (s) => ls.set('ws_session', s),
  clearSession: ()  => ls.del('ws_session'),
  getUsers:     ()  => ls.get('ws_users', {}),
  setUsers:     (u) => ls.set('ws_users', u),
}

export const providerStorage = {
  getInstalled:  ()    => ls.get('ws_providers', []),
  setInstalled:  (arr) => ls.set('ws_providers', arr),
}

export const historyStorage = {
  get(username) {
    return ls.get(`ws_history_${username}`, [])
  },
  add(username, item) {
    let arr = ls.get(`ws_history_${username}`, [])
    arr = [{ ...item, watchedAt: Date.now() }, ...arr.filter(x => x.link !== item.link)].slice(0, 200)
    ls.set(`ws_history_${username}`, arr)
  },
  clear(username) { ls.del(`ws_history_${username}`) }
}

export const watchlistStorage = {
  get(username) {
    return ls.get(`ws_watchlist_${username}`, [])
  },
  has(username, link) {
    return ls.get(`ws_watchlist_${username}`, []).some(x => x.link === link)
  },
  toggle(username, item) {
    let arr = ls.get(`ws_watchlist_${username}`, [])
    const exists = arr.some(x => x.link === item.link)
    arr = exists ? arr.filter(x => x.link !== item.link) : [{ ...item, addedAt: Date.now() }, ...arr]
    ls.set(`ws_watchlist_${username}`, arr)
    return !exists
  }
}

export const cacheStorage = {
  get(key) { return ls.get(`ws_cache_${key}`) },
  set(key, value, ttlMs = 3_600_000) {
    ls.set(`ws_cache_${key}`, { value, expiresAt: Date.now() + ttlMs })
  },
  getValid(key) {
    const entry = ls.get(`ws_cache_${key}`)
    if (!entry || Date.now() > entry.expiresAt) return null
    return entry.value
  }
}
