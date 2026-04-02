// src/lib/auth.jsx — REPLACED: no login, always guest
// Keeps AuthProvider and useAuth exports so other files don't crash if they import them

import { createContext, useContext } from 'react'

const GUEST = { username: 'guest' }
const AuthContext = createContext({ user: GUEST, logout: () => {} })

export function AuthProvider({ children }) {
  // Always authenticated as guest — no login needed
  return (
    <AuthContext.Provider value={{ user: GUEST, logout: () => {}, login: () => ({ ok: true }), register: () => ({ ok: true }) }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
