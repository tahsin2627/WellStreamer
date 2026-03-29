import { useState, useCallback } from 'react'
import { providerStorage } from './storage.js'
import { installProvider as downloadProvider } from './providers.js'

export function useProviders() {
  const [installed, setInstalled] = useState(() => providerStorage.getInstalled())
  const [installing, setInstalling] = useState({})

  const install = useCallback(async (provider) => {
    setInstalling(s => ({ ...s, [provider.value]: true }))
    try {
      await downloadProvider(provider.value)
      const updated = [
        ...installed.filter(p => p.value !== provider.value),
        {
          value: provider.value,
          display_name: provider.display_name,
          type: provider.type,
          icon: provider.icon || '',
          version: provider.version,
        }
      ]
      providerStorage.setInstalled(updated)
      setInstalled(updated)
      return { ok: true }
    } catch (e) {
      return { error: e.message }
    } finally {
      setInstalling(s => ({ ...s, [provider.value]: false }))
    }
  }, [installed])

  const uninstall = useCallback((value) => {
    const updated = installed.filter(p => p.value !== value)
    providerStorage.setInstalled(updated)
    setInstalled(updated)
  }, [installed])

  const isInstalled = useCallback((value) => installed.some(p => p.value === value), [installed])

  return { installed, isInstalling: installing, install, uninstall, isInstalled }
}
