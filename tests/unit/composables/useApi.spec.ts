/**
 * useApi.spec.ts (D11, task 14.1 — RED)
 *
 * Scenarios per the admin-backoffice spec "Authenticated Session" requirement:
 *   - Unauthenticated user is redirected to login.
 *   - Expired token triggers refresh, not logout (silent refresh + retry, the
 *     user is never redirected to login for a recoverable 401).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

function unauthorizedError(): Error & { status: number } {
  return Object.assign(new Error('Unauthorized'), { status: 401 })
}

describe('useApi — session-aware $fetch wrapper (D11)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.resetModules()
    // NOTE: no `afterEach(() => vi.unstubAllGlobals())` — see login.spec.ts for
    // why that wipes tests/unit/setup.ts's once-per-file baseline stubs. Each
    // test below re-stubs $fetch/navigateTo/useRuntimeConfig explicitly.
  })

  it('redirects to /login when no session token is stored', async () => {
    const navigateToMock = vi.fn()
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('navigateTo', navigateToMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
    )

    const { useApi } = await import('../../../app/composables/useApi')
    const { apiFetch } = useApi()

    await expect(apiFetch('/participants')).rejects.toThrow()

    expect(navigateToMock).toHaveBeenCalledWith('/login')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('silently refreshes and retries on a 401, without redirecting to /login', async () => {
    const navigateToMock = vi.fn()
    const fetchMock = vi.fn()
    // First call (the protected request) → 401. Second call (/auth/refresh) → new
    // token. Third call (the retried protected request) → success payload.
    fetchMock
      .mockRejectedValueOnce(unauthorizedError())
      .mockResolvedValueOnce({ access_token: 'fresh-token', token_type: 'bearer' })
      .mockResolvedValueOnce({ data: 'ok' })

    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('navigateTo', navigateToMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
    )

    const { useAuth } = await import('../../../app/composables/useAuth')
    const { useApi } = await import('../../../app/composables/useApi')

    useAuth().setSession('expiring-token')
    const { apiFetch } = useApi()

    const result = await apiFetch<{ data: string }>('/participants')

    expect(result).toEqual({ data: 'ok' })
    expect(navigateToMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/refresh')
    // Retried request carries the NEW token, not the stale one.
    expect(fetchMock.mock.calls[2][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
      })
    )
  })

  it('redirects to /login when refresh itself fails (refresh token also invalid/denylisted)', async () => {
    const navigateToMock = vi.fn()
    const fetchMock = vi.fn()
    fetchMock.mockRejectedValueOnce(unauthorizedError()).mockRejectedValueOnce(unauthorizedError())

    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('navigateTo', navigateToMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
    )

    const { useAuth } = await import('../../../app/composables/useAuth')
    const { useApi } = await import('../../../app/composables/useApi')

    useAuth().setSession('expiring-token')
    const { apiFetch } = useApi()

    await expect(apiFetch('/participants')).rejects.toThrow()

    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })
})
