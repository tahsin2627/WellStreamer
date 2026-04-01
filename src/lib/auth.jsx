// src/lib/auth.jsx — REPLACE ENTIRE FILE
// No login required. Auto-creates anonymous guest session.
import React, { createContext, useContext, useState } from 'react'

const GUEST = { username: 'guest' }

function getOrCreateSession() {
  try {
    const v = localStorage.getItem('ws_session')
    if (v) return JSON.parse(v)
    localStorage.setItem('ws_session', JSON.stringify(GUEST))
    return GUEST
  } catch { return GUEST }
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user] = useState(getOrCreateSession)
  // No login/logout needed — always guest
  return (
    <AuthContext.Provider value={{ user, logout: () => {} }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
