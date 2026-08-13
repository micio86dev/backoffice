/**
 * useEvaluations (Unit 7, task 27.1 — RED)
 *
 * `index()`/`summary()` call `GET /api/evaluations` / `GET
 * /api/evaluations/summary`, typed off `paths[...]` (D6/D7). Thin wiring
 * over `useApi().apiFetch`, mirroring `useParticipants.ts:16-30`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

const { useEvaluations } = await import('../../../app/composables/useEvaluations')

describe('useEvaluations', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ data: [] })
  })

  it('lists from the evaluations index with no filters', async () => {
    await useEvaluations().index({})

    expect(apiFetch).toHaveBeenCalledWith('/evaluations')
  })

  it('serializes whitelisted filters as a query string', async () => {
    await useEvaluations().index({ project_id: 3, status: 'completed' })

    expect(apiFetch).toHaveBeenCalledWith('/evaluations?project_id=3&status=completed')
  })

  it('fetches the summary from its own endpoint with the same filters', async () => {
    await useEvaluations().summary({ project_id: 3 })

    expect(apiFetch).toHaveBeenCalledWith('/evaluations/summary?project_id=3')
  })

  it('lets an API failure propagate', async () => {
    apiFetch.mockRejectedValue(new Error('403'))

    await expect(useEvaluations().index({})).rejects.toThrow()
  })
})
