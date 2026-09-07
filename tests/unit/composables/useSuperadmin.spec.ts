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
})
