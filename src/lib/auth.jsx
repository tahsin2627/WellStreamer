// src/lib/auth.jsx — No login, always guest
import { createContext, useContext } from 'react'

const GUEST = { username: 'guest' }
const Ctx = createContext({ user: GUEST, logout: () => {}, login: () => ({ ok: true }), register: () => ({ ok: true }) })

export function AuthProvider({ children }) {
  return <Ctx.Provider value={{ user: GUEST, logout: () => {}, login: () => ({ ok: true }), register: () => ({ ok: true }) }}>{children}</Ctx.Provider>
}

export function useAuth() { return useContext(Ctx) }
