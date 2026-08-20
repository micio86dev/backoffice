/**
 * useAuth.spec.ts (corrected first — backoffice-session-refresh-hardening
 * slice 4, design D2/D4/D9)
 *
 * The access token is now MEMORY-ONLY: no sessionStorage, no localStorage
 * anywhere. The real refresh credential is an httpOnly cookie the client can
 * never read (D2/D4) — `refresh()` sends `credentials: 'include'` +
 * `X-BEAI-Refresh` and NEVER an Authorization header (the cookie IS the
 * credential, and the whole point of D8 is that this must still work after
 * the access token has expired).
 *
 * Single-flight refresh is preserved UNCHANGED from the pre-hardening
 * design: `AuthController::refresh()` still mints a fresh access token per
 * call, so two concurrent 401s must still share one in-flight promise.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('useAuth — memory-only session, single-flight refresh (D2/D4/D9)', () => {
  beforeEach(() => {
    vi.resetModules()
    // NOTE: no `afterEach(() => vi.unstubAllGlobals())` — see login.spec.ts for
    // why that wipes tests/unit/setup.ts's once-per-file baseline stubs. Each
    // test below re-stubs $fetch/navigateTo/useRuntimeConfig explicitly.
  })

  it('issues exactly ONE /api/auth/refresh call for 2+ concurrent refresh() callers, and both resolve to the new token', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://api.test/api/auth/refresh')
      // Simulate real latency so both callers are genuinely concurrent.
      await new Promise((r) => setTimeout(r, 10))
      return { access_token: 'new-token-after-rotation', token_type: 'bearer' }
    })
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )

    const { useAuth } = await import('../../../app/composables/useAuth')
    const auth = useAuth()
    auth.setSession('stale-token')

    const [resultA, resultB, resultC] = await Promise.all([
      auth.refresh(),
      auth.refresh(),
      auth.refresh(),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resultA).toBe('new-token-after-rotation')
    expect(resultB).toBe('new-token-after-rotation')
    expect(resultC).toBe('new-token-after-rotation')
    expect(auth.accessToken.value).toBe('new-token-after-rotation')
  })

  it('refresh() sends credentials:"include" and X-BEAI-Refresh, and NEVER an Authorization header', async () => {
    const fetchMock = vi.fn(async () => ({
      access_token: 'new-token',
      token_type: 'bearer',
    }))
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )

    const { useAuth } = await import('../../../app/composables/useAuth')
    const auth = useAuth()
    auth.setSession('stale-token')

    await auth.refresh()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/api/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-BEAI-Refresh': '1' }),
      })
    )
    const [, options] = fetchMock.mock.calls[0] as [string, { headers?: Record<string, string> }]
    expect(options.headers?.Authorization).toBeUndefined()
  })

  it('allows a NEW refresh call after the in-flight one settles (not single-flight forever)', async () => {
    let callCount = 0
    const fetchMock = vi.fn(async () => {
      callCount += 1
      return { access_token: `token-${callCount}`, token_type: 'bearer' }
    })
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )

    const { useAuth } = await import('../../../app/composables/useAuth')
    const auth = useAuth()
    auth.setSession('stale-token')

    const first = await auth.refresh()
    const second = await auth.refresh()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(first).toBe('token-1')
    expect(second).toBe('token-2')
  })

  it('clears the session and rejects when refresh fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('401')
    })
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )

    const { useAuth } = await import('../../../app/composables/useAuth')
    const auth = useAuth()
    auth.setSession('stale-token')

    await expect(auth.refresh()).rejects.toThrow()
    expect(auth.accessToken.value).toBeNull()
    expect(auth.isAuthenticated.value).toBe(false)
  })

  it('logout() calls POST /api/auth/logout, clears the session, and navigates to /login regardless of the response', async () => {
    const navigateToMock = vi.fn()
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://api.test/api/auth/logout')
      return { message: 'Successfully logged out.' }
    })
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('navigateTo', navigateToMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )

    const { useAuth } = await import('../../../app/composables/useAuth')
    const auth = useAuth()
    auth.setSession('some-token')

    await auth.logout()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(auth.isAuthenticated.value).toBe(false)
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })

  it('logout() still clears the session and navigates to /login even when the network call fails', async () => {
    const navigateToMock = vi.fn()
    const fetchMock = vi.fn(async () => {
      throw new Error('network error')
    })
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('navigateTo', navigateToMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )

    const { useAuth } = await import('../../../app/composables/useAuth')
    const auth = useAuth()
    auth.setSession('some-token')

    await auth.logout()

    expect(auth.isAuthenticated.value).toBe(false)
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })

  it('setSession/clearSession keep the token in memory only — NEVER sessionStorage or localStorage', () => {
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )

    return import('../../../app/composables/useAuth').then(({ useAuth }) => {
      const auth = useAuth()
      auth.setSession('my-token')

      expect(auth.accessToken.value).toBe('my-token')
      expect(auth.isAuthenticated.value).toBe(true)
      // The whole point of D2: a reload (which wipes memory but NOT web
      // storage) must not leave a readable access token behind for an XSS
      // payload to exfiltrate.
      expect(sessionStorage.length).toBe(0)
      expect(localStorage.length).toBe(0)

      auth.clearSession()
      expect(auth.accessToken.value).toBeNull()
      expect(auth.isAuthenticated.value).toBe(false)
    })
  })
})
