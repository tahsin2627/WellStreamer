// src/lib/auth.jsx
// Anonymous auth — always logged in as guest.
// Keeps ALL original exports so Navbar and other components don't crash.
import { createContext, useContext } from 'react'

const GUEST = { username: 'guest' }

const AuthCtx = createContext({
  user:     GUEST,
  login:    () => ({ ok: true }),
  register: () => ({ ok: true }),
  logout:   () => {},
})

// AuthProvider wraps the app — required because Navbar calls useAuth()
export function AuthProvider({ children }) {
  return (
    <AuthCtx.Provider value={{
      user:     GUEST,
      login:    () => ({ ok: true }),
      register: () => ({ ok: true }),
      logout:   () => {},
    }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  return useContext(AuthCtx)
}
