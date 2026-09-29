/**
 * useCurrentUser.spec.ts (user-profile-self-service, design D6, task 4.1 —
 * the FIRST tests for this file — RED)
 *
 * "One page load, one /auth/me" (admin-backoffice spec, "Current-User State
 * Is Fetched Once And Shared"): module-scoped shared state + single-flight
 * in-flight promise, mirroring useAuth.ts's `refreshInFlight` precedent.
 * Cleared by a module-scoped `watch(accessToken, …)` on useAuth's REAL ref
 * (not mocked here — same discipline as useAuth.spec.ts using the real
 * module and stubbing only the network boundary).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

function meResponse() {
  return {
    user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test', locale: 'en' },
    organization: { id: 1, name: 'Acme' },
    roles: ['operator'],
  }
}

describe('useCurrentUser — shared state (admin-backoffice spec)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.resetModules()
    apiFetch.mockReset()
  })

  it('ensureLoaded() fetches once; a second call reuses the cached value, not a second fetch', async () => {
    apiFetch.mockResolvedValue(meResponse())
    const { useCurrentUser } = await import('../../../app/composables/useCurrentUser')

    await useCurrentUser().ensureLoaded()
    await useCurrentUser().ensureLoaded()

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch).toHaveBeenCalledWith('/auth/me')
  })

  it('concurrent ensureLoaded() callers share a single in-flight promise', async () => {
    apiFetch.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return meResponse()
    })
    const { useCurrentUser } = await import('../../../app/composables/useCurrentUser')

    await Promise.all([useCurrentUser().ensureLoaded(), useCurrentUser().ensureLoaded()])

    expect(apiFetch).toHaveBeenCalledTimes(1)
  })

  it('refresh() forces a second fetch even when already cached', async () => {
    apiFetch.mockResolvedValue(meResponse())
    const { useCurrentUser } = await import('../../../app/composables/useCurrentUser')

    await useCurrentUser().ensureLoaded()
    await useCurrentUser().refresh()

    expect(apiFetch).toHaveBeenCalledTimes(2)
  })

  it('clearing the access token (useAuth) clears the cached current user', async () => {
    apiFetch.mockResolvedValue(meResponse())
    const { useAuth } = await import('../../../app/composables/useAuth')
    const { useCurrentUser } = await import('../../../app/composables/useCurrentUser')

    useAuth().setSession('a-token')
    await useCurrentUser().ensureLoaded()
    expect(useCurrentUser().user.value).not.toBeNull()

    useAuth().clearSession()
    // Let the module-scoped watch(accessToken, ...) callback flush.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(useCurrentUser().user.value).toBeNull()
  })

  it('user and roles computeds reflect the cached response', async () => {
    apiFetch.mockResolvedValue(meResponse())
    const { useCurrentUser } = await import('../../../app/composables/useCurrentUser')

    await useCurrentUser().ensureLoaded()

    expect(useCurrentUser().user.value?.name).toBe('Ada Lovelace')
    expect(useCurrentUser().roles.value).toEqual(['operator'])
  })
})
