import { useState, useEffect } from 'react'
import { fetchManifest } from '../lib/providers.js'
import { useProviders } from '../lib/useProviders.js'
import { Icons } from '../components/Icons.jsx'

const FLAG = { india: '🇮🇳', english: '🇬🇧', italy: '🇮🇹', global: '🌐' }

export default function ProvidersPage() {
  const { installed, isInstalling, install, uninstall, isInstalled } = useProviders()
  const [manifest, setManifest] = useState([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('available')
  const [feedback, setFeedback] = useState({}) // value -> 'ok' | 'err'
  const [search, setSearch]     = useState('')

  useEffect(() => {
    fetchManifest()
      .then(data => setManifest(data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleInstall = async (provider) => {
    const res = await install(provider)
    setFeedback(f => ({ ...f, [provider.value]: res.ok ? 'ok' : 'err' }))
    setTimeout(() => setFeedback(f => { const n = { ...f }; delete n[provider.value]; return n }), 3000)
  }

  const handleUninstall = (value) => {
    uninstall(value)
    setFeedback(f => ({ ...f, [value]: 'removed' }))
    setTimeout(() => setFeedback(f => { const n = { ...f }; delete n[value]; return n }), 2000)
  }

  const filtered = manifest
    .filter(p => tab === 'installed' ? isInstalled(p.value) : !isInstalled(p.value))
    .filter(p => !search || p.display_name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Providers</h1>
          <p className="page-sub">
            {installed.length} installed · {manifest.length} total · auto-updates from Vega's GitHub
          </p>
        </div>
        <button className="btn btn-glass" onClick={() => { setLoading(true); fetchManifest().then(d => setManifest(d||[])).finally(()=>setLoading(false)) }}>
          <Icons.Refresh /> Refresh
        </button>
      </div>

      <div className="provider-controls">
        <div className="tabs">
          <button className={`tab ${tab==='available'?'active':''}`} onClick={()=>setTab('available')}>
            Available ({manifest.filter(p=>!isInstalled(p.value)).length})
          </button>
          <button className={`tab ${tab==='installed'?'active':''}`} onClick={()=>setTab('installed')}>
            Installed ({installed.length})
          </button>
        </div>
        <input
          className="field-input"
          style={{ maxWidth: 240, padding: '8px 14px' }}
          placeholder="Filter providers…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading && <div className="spinner" style={{ marginTop: 60 }} />}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon"><Icons.Puzzle /></div>
          <h2>{tab === 'installed' ? 'Nothing installed yet' : 'All caught up!'}</h2>
          <p>{tab === 'installed' ? 'Switch to Available to install providers.' : 'All providers are already installed.'}</p>
        </div>
      )}

      <div className="providers-grid">
        {filtered.map(p => {
          const busy   = isInstalling[p.value]
          const fb     = feedback[p.value]
          const inst   = isInstalled(p.value)
          return (
            <div key={p.value} className="provider-card glass2">
              <div className="provider-icon">
                {p.icon
                  ? <img src={p.icon} alt="" onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
                  : null}
                <span style={{ display: p.icon ? 'none' : 'flex', fontSize: 22, alignItems:'center', justifyContent:'center', width:'100%', height:'100%' }}>
                  {FLAG[p.type] || '🌐'}
                </span>
              </div>

              <div className="provider-info">
                <p className="provider-name">{p.display_name}</p>
                <p className="provider-meta">v{p.version} · {p.type}</p>
              </div>

              <div className="provider-action">
                {fb === 'ok'      && <span className="fb-ok"><Icons.Check /> Installed</span>}
                {fb === 'err'     && <span className="fb-err">Failed</span>}
                {fb === 'removed' && <span className="fb-err">Removed</span>}
                {!fb && inst && (
                  <button className="btn btn-glass btn-sm" onClick={() => handleUninstall(p.value)}>
                    <Icons.Trash />
                  </button>
                )}
                {!fb && !inst && (
                  <button className="btn btn-primary btn-sm" onClick={() => handleInstall(p)} disabled={busy}>
                    {busy ? <span className="btn-spinner" /> : <Icons.Download />}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
