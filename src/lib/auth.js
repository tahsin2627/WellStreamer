import React, { createContext, useContext, useState, useCallback } from 'react'
import { authStorage } from './storage.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authStorage.getSession())

  const login = useCallback((username, password) => {
    if (!username?.trim()) return { error: 'Username is required' }
    if (!password) return { error: 'Password is required' }
    const users = authStorage.getUsers()
    const u = users[username.trim().toLowerCase()]
    if (!u) return { error: 'No account found. Create one?' }
    if (u.password !== password) return { error: 'Wrong password' }
    const session = { username: username.trim().toLowerCase() }
    authStorage.setSession(session)
    setUser(session)
    return { ok: true }
  }, [])

  const register = useCallback((username, password) => {
    const uname = username?.trim().toLowerCase()
    if (!uname || uname.length < 3) return { error: 'Username must be at least 3 characters' }
    if (!/^[a-z0-9_]+$/.test(uname)) return { error: 'Only letters, numbers, underscores' }
    if (!password || password.length < 4) return { error: 'Password must be at least 4 characters' }
    const users = authStorage.getUsers()
    if (users[uname]) return { error: 'Username taken — try another' }
    users[uname] = { password, createdAt: Date.now() }
    authStorage.setUsers(users)
    const session = { username: uname }
    authStorage.setSession(session)
    setUser(session)
    return { ok: true }
  }, [])

  const logout = useCallback(() => {
    authStorage.clearSession()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
