import { useState } from 'react'
import { useAuth } from '../lib/auth.js'

export default function LoginPage() {
  const { login, register } = useAuth()
  const [tab, setTab]           = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const switchTab = (t) => { setTab(t); setError('') }

  const submit = async () => {
    setError('')
    if (!username.trim() || !password) { setError('Fill in both fields'); return }
    setLoading(true)
    const res = tab === 'login' ? login(username, password) : register(username, password)
    if (res.error) setError(res.error)
    setLoading(false)
  }

  const onKey = (e) => { if (e.key === 'Enter') submit() }

  return (
    <div className="login-page">
      {/* Background glow orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />

      <div className="login-card glass">
        <div className="login-logo">
          WELL<span>STREAMER</span>
        </div>
        <p className="login-tagline">Stream everything. Ad-free. Yours.</p>

        <div className="auth-tabs">
          <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => switchTab('login')}>Sign In</button>
          <button className={`auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => switchTab('register')}>Create Account</button>
        </div>

        <div className="field">
          <label className="field-label">Username</label>
          <input
            className="field-input"
            placeholder="your_username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={onKey}
            autoComplete="username"
            autoFocus
          />
        </div>
        <div className="field">
          <label className="field-label">Password</label>
          <input
            className="field-input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={onKey}
            autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
          />
        </div>

        {error && <div className="form-error">{error}</div>}

        <button
          className="btn btn-primary btn-full"
          onClick={submit}
          disabled={loading}
          style={{ marginTop: 20 }}
        >
          {loading ? 'Loading…' : tab === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        <p className="login-hint">No email · No phone · No tracking</p>
      </div>
    </div>
  )
}
