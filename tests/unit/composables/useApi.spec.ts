/**
 * useApi.spec.ts (corrected first — backoffice-session-refresh-hardening
 * slice 5, design D2/D4/D8)
 *
 * Scenarios per the admin-backoffice spec "Authenticated Session" requirement:
 *   - Unauthenticated user is redirected to login.
 *   - Expired token triggers refresh (via the httpOnly cookie, NOT an
 *     Authorization header), not logout — silent refresh + retry, the user
 *     is never redirected to login for a recoverable 401.
 *   - Every request is prefixed with the CONFIGURED apiBase, `/api` suffix
 *     included (AGENTS.md — "apiBase includes the /api suffix").
 *
 * URL assertions here are deliberately `toBe(<full URL>)`, never
 * `toContain('/auth/refresh')`: a substring assertion passes identically for
 * `''`, for `https://api.test`, and for `https://api.test/api`, so it can
 * never fail on the missing-suffix regression it appears to cover.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mirrors .env.example / Dockerfile — the `/api` segment is part of the value.
const API_BASE = 'https://api.test/api'

function unauthorizedError(): Error & { status: number } {
  return Object.assign(new Error('Unauthorized'), { status: 401 })
}

describe('useApi — session-aware $fetch wrapper (D2/D4/D8)', () => {
  beforeEach(() => {
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
      vi.fn(() => ({ public: { apiBase: API_BASE } }))
    )

    const { useApi } = await import('../../../app/composables/useApi')
    const { apiFetch } = useApi()

    await expect(apiFetch('/participants')).rejects.toThrow()

    expect(navigateToMock).toHaveBeenCalledWith('/login')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('silently refreshes (via cookie, credentials:"include", no Bearer) and retries on a 401, without redirecting to /login', async () => {
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
      vi.fn(() => ({ public: { apiBase: API_BASE } }))
    )

    const { useAuth } = await import('../../../app/composables/useAuth')
    const { useApi } = await import('../../../app/composables/useApi')

    useAuth().setSession('expiring-token')
    const { apiFetch } = useApi()

    const result = await apiFetch<{ data: string }>('/participants')

    expect(result).toEqual({ data: 'ok' })
    expect(navigateToMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // FULL resolved URLs — apiBase (with its `/api` segment) must be present on
    // the original request, on the refresh, and on the retry.
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/api/participants')
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.test/api/auth/refresh')
    expect(fetchMock.mock.calls[2][0]).toBe('https://api.test/api/participants')

    // The refresh call carries the cookie + CSRF header, NEVER a Bearer.
    const refreshOptions = fetchMock.mock.calls[1][1] as {
      credentials?: string
      headers?: Record<string, string>
    }
    expect(refreshOptions.credentials).toBe('include')
    expect(refreshOptions.headers?.['X-BEAI-Refresh']).toBe('1')
    expect(refreshOptions.headers?.Authorization).toBeUndefined()

    // Retried request carries the NEW token, not the stale one.
    expect(fetchMock.mock.calls[2][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
      })
    )
  })

  it('redirects to /login when refresh itself fails (refresh cookie also invalid/revoked)', async () => {
    const navigateToMock = vi.fn()
    const fetchMock = vi.fn()
    fetchMock.mockRejectedValueOnce(unauthorizedError()).mockRejectedValueOnce(unauthorizedError())

    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('navigateTo', navigateToMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: API_BASE } }))
    )

    const { useAuth } = await import('../../../app/composables/useAuth')
    const { useApi } = await import('../../../app/composables/useApi')

    useAuth().setSession('expiring-token')
    const { apiFetch } = useApi()

    await expect(apiFetch('/participants')).rejects.toThrow()

    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })

  // D5: a valid JWT can outlive a mid-session deactivation by up to the
  // token's TTL. `TenantContext` folds that into a 403 `account_deactivated`
  // on every subsequent request — a DIFFERENT path than the 401 single-flight
  // refresh above, because refreshing would only issue the deactivated user a
  // NEW valid token.
  it('clears the session and redirects to /login on a 403 account_deactivated, without attempting a refresh', async () => {
    const navigateToMock = vi.fn()
    const fetchMock = vi.fn()
    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), {
        status: 403,
        data: { error: 'account_deactivated' },
      })
    )

    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('navigateTo', navigateToMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: API_BASE } }))
    )

    const { useAuth } = await import('../../../app/composables/useAuth')
    const { useApi } = await import('../../../app/composables/useApi')

    useAuth().setSession('still-technically-valid-token')
    const { apiFetch } = useApi()

    await expect(apiFetch('/participants')).rejects.toThrow()

    // Exactly one call: the original request. No /auth/refresh attempt — a
    // deactivated account would just receive a NEW valid token for an
    // account that must not authenticate.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock).toHaveBeenCalledWith('/login')
    expect(useAuth().isAuthenticated.value).toBe(false)
  })

  // A generic 403 (an RBAC denial, not deactivation) must NOT be treated as
  // account_deactivated — that would forcibly log out an operator who is
  // simply not allowed to do the one thing they just tried.
  it('does not clear the session on a generic 403 without the account_deactivated body', async () => {
    const navigateToMock = vi.fn()
    const fetchMock = vi.fn()
    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { status: 403, data: {} })
    )

    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('navigateTo', navigateToMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: API_BASE } }))
    )

    const { useAuth } = await import('../../../app/composables/useAuth')
    const { useApi } = await import('../../../app/composables/useApi')

    useAuth().setSession('still-valid-token')
    const { apiFetch } = useApi()

    await expect(apiFetch('/users')).rejects.toThrow()

    expect(navigateToMock).not.toHaveBeenCalledWith('/login')
    expect(useAuth().isAuthenticated.value).toBe(true)
  })
})
