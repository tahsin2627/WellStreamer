export function ProviderTabs({ providers, active, onChange }) {
  if (!providers.length) return null
  return (
    <div className="provider-tabs-wrap">
      <div className="provider-tabs">
        {providers.map(p => (
          <button
            key={p.value}
            className={`provider-tab ${active?.value === p.value ? 'active' : ''}`}
            onClick={() => onChange(p)}
          >
            {p.display_name}
          </button>
        ))}
      </div>
    </div>
  )
}
