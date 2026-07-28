/**
 * useAuth.spec.ts (D11, task 14.2 — RED)
 *
 * Regression guard for the concurrent-refresh hazard flagged in design D11:
 * `AuthController.php:86-98` rotates the JWT on every /api/auth/refresh call
 * with the denylist enabled (`config/jwt.php:227`). If two concurrent 401s each
 * triggered their own refresh call, the second would present a jti the first
 * already denylisted, causing a spurious logout — and the dashboard fires
 * several parallel requests on mount, so this is not hypothetical.
 *
 * `useAuth().refresh()` MUST be single-flight: every concurrent caller awaits
 * the SAME in-flight promise, and exactly one network call reaches
 * `/api/auth/refresh` no matter how many callers ask concurrently.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('useAuth — single-flight refresh (D11)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.resetModules()
    // NOTE: no `afterEach(() => vi.unstubAllGlobals())` — see login.spec.ts for
    // why that wipes tests/unit/setup.ts's once-per-file baseline stubs. Each
    // test below re-stubs $fetch/navigateTo/useRuntimeConfig explicitly.
  })

  it('issues exactly ONE /api/auth/refresh call for 2+ concurrent refresh() callers, and both resolve to the new token', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain('/auth/refresh')
      // Simulate real latency so both callers are genuinely concurrent.
      await new Promise((r) => setTimeout(r, 10))
      return { access_token: 'new-token-after-rotation', token_type: 'bearer' }
    })
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
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

  it('allows a NEW refresh call after the in-flight one settles (not single-flight forever)', async () => {
    let callCount = 0
    const fetchMock = vi.fn(async () => {
      callCount += 1
      return { access_token: `token-${callCount}`, token_type: 'bearer' }
    })
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
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
      vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
    )

    const { useAuth } = await import('../../../app/composables/useAuth')
    const auth = useAuth()
    auth.setSession('stale-token')

    await expect(auth.refresh()).rejects.toThrow()
    expect(auth.accessToken.value).toBeNull()
    expect(auth.isAuthenticated.value).toBe(false)
  })

  it('logout() calls POST /api/auth/logout, clears the session, and navigates to /login regardless of the response (task 14.4)', async () => {
    const navigateToMock = vi.fn()
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain('/auth/logout')
      return { message: 'Successfully logged out.' }
    })
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('navigateTo', navigateToMock)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
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
      vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
    )

    const { useAuth } = await import('../../../app/composables/useAuth')
    const auth = useAuth()
    auth.setSession('some-token')

    await auth.logout()

    expect(auth.isAuthenticated.value).toBe(false)
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })

  it('setSession persists to sessionStorage and clearSession removes it', () => {
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
    )
    const KEY = 'beai_access_token'

    return import('../../../app/composables/useAuth').then(({ useAuth }) => {
      const auth = useAuth()
      auth.setSession('my-token')
      expect(sessionStorage.getItem(KEY)).toBe('my-token')
      expect(auth.isAuthenticated.value).toBe(true)

      auth.clearSession()
      expect(sessionStorage.getItem(KEY)).toBeNull()
      expect(auth.isAuthenticated.value).toBe(false)
    })
  })
})
