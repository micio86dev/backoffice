/**
 * 00.auth-bootstrap.client.ts (new — backoffice-session-refresh-hardening
 * slice 4, design D9)
 *
 * Awaited silent refresh before the router's auth guard evaluates. Calls
 * useAuth().refresh() DIRECTLY, never useApi() (which redirects to /login on
 * failure — a redirect issued during boot risks a loop). Swallows any
 * rejection and resolves normally, leaving the session empty for
 * 02.auth.global.ts's normal unauthenticated path to handle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('00.auth-bootstrap.client.ts', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('defineNuxtPlugin', (definition: { setup: () => unknown }) => definition)
  })

  it('swallows a 401/network error from refresh() without throwing, and resolves normally', async () => {
    const fetchMock = vi.fn(async () => {
      throw Object.assign(new Error('Unauthorized'), { status: 401 })
    })
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )

    const plugin = (await import('../../../app/plugins/00.auth-bootstrap.client')).default

    await expect(plugin.setup()).resolves.not.toThrow()

    const { useAuth } = await import('../../../app/composables/useAuth')
    expect(useAuth().isAuthenticated.value).toBe(false)
  })

  it('calls useAuth().refresh() directly — never routes through useApi() (which would redirect to /login and risk a boot loop)', async () => {
    const navigateToMock = vi.fn()
    const fetchMock = vi.fn(async () => ({ access_token: 'rehydrated', token_type: 'bearer' }))
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('navigateTo', navigateToMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )

    const plugin = (await import('../../../app/plugins/00.auth-bootstrap.client')).default
    await plugin.setup()

    expect(navigateToMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/api/auth/refresh',
      expect.objectContaining({ credentials: 'include' })
    )

    const { useAuth } = await import('../../../app/composables/useAuth')
    expect(useAuth().isAuthenticated.value).toBe(true)
    expect(useAuth().accessToken.value).toBe('rehydrated')
  })
})
