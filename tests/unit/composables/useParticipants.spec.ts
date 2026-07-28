/**
 * useParticipants.ts (PR B2, task 17.4 — RED)
 *
 * Thin composable wiring over useApi().apiFetch — filter/pagination
 * assembly itself is tested with zero mocks in participant-query.spec.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('useParticipants', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('listParticipants() calls GET /participants with the built query string', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue({ data: [], links: {}, meta: {} })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useParticipants } = await import('../../../app/composables/useParticipants')
    const { listParticipants } = useParticipants()

    await listParticipants({ page: 2, status: 'completato' })

    expect(apiFetchMock).toHaveBeenCalledWith('/participants?page=2&status=completato')
  })

  it('listParticipants() with no filters calls the bare /participants path', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue({ data: [], links: {}, meta: {} })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useParticipants } = await import('../../../app/composables/useParticipants')
    const { listParticipants } = useParticipants()

    await listParticipants({})

    expect(apiFetchMock).toHaveBeenCalledWith('/participants')
  })

  it('fetchParticipant(id) calls GET /participants/{id}', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue({ data: { id: '42' } })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useParticipants } = await import('../../../app/composables/useParticipants')
    const { fetchParticipant } = useParticipants()

    const result = await fetchParticipant(42)

    expect(apiFetchMock).toHaveBeenCalledWith('/participants/42')
    expect(result).toEqual({ data: { id: '42' } })
  })
})
