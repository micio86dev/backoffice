/**
 * useSuperadmin.ts — fetchClientOverview() (superadmin-clients-console,
 * Phase 10, task 10.1 — RED).
 *
 * Thin composable wiring over useApi().apiFetch, same shape as
 * fetchClients()/useParticipants.spec.ts's precedent — no filter/pagination
 * assembly here, so there is nothing else to unit-test with zero mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('useSuperadmin', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('fetchClientOverview() calls GET /admin/clients', async () => {
    const response = {
      data: [
        {
          id: 2,
          name: 'Acme',
          created_at: '2026-01-01T00:00:00Z',
          projects: 3,
          candidates: 10,
          completed: 7,
          errored: 1,
          last_activity_at: '2026-03-01T00:00:00Z',
        },
      ],
      acting_organization_id: null,
    }
    const apiFetchMock = vi.fn().mockResolvedValue(response)
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useSuperadmin } = await import('../../../app/composables/useSuperadmin')
    const result = await useSuperadmin().fetchClientOverview()

    expect(apiFetchMock).toHaveBeenCalledWith('/admin/clients')
    expect(result).toEqual(response)
  })

  it('fetchClients() still calls GET /admin/organizations, unchanged', async () => {
    // ClientDirectory's identity-only contract must not be widened or
    // replaced by the new endpoint — the topbar switcher still reads this one.
    const apiFetchMock = vi.fn().mockResolvedValue({ data: [], acting_organization_id: null })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useSuperadmin } = await import('../../../app/composables/useSuperadmin')
    await useSuperadmin().fetchClients()

    expect(apiFetchMock).toHaveBeenCalledWith('/admin/organizations')
  })

  /**
   * SINGLE-FLIGHT — two concurrent callers, ONE request.
   *
   * `NavBar` and `SidebarNav` both call `fetchClients()` on mount, so every
   * superadmin page load fired two identical `GET /admin/organizations`. This
   * is the assertion that stops it coming back: drop the in-flight guard and
   * the call count is 2.
   */
  it('fetchClients() shares one in-flight request between concurrent callers', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    const apiFetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        })
    )
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useSuperadmin } = await import('../../../app/composables/useSuperadmin')

    // Both started BEFORE either settles — the exact window the two shells
    // mounting together creates.
    const first = useSuperadmin().fetchClients()
    const second = useSuperadmin().fetchClients()

    resolveFetch({ data: [], acting_organization_id: null })
    await Promise.all([first, second])

    expect(apiFetchMock).toHaveBeenCalledTimes(1)
  })

  /**
   * And NOT a cache: a call after the first settles must hit the server again.
   *
   * The acting-client selection is precisely the thing that changes under you
   * — `setActingClient()` is followed by a full page reload for that reason —
   * so a settled cache would answer the next page with the previous
   * selection, which is the failure the reload exists to prevent.
   */
  it('fetchClients() does NOT cache once the request has settled', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue({ data: [], acting_organization_id: null })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useSuperadmin } = await import('../../../app/composables/useSuperadmin')

    await useSuperadmin().fetchClients()
    await useSuperadmin().fetchClients()

    expect(apiFetchMock).toHaveBeenCalledTimes(2)
  })
})
