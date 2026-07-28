/**
 * useEvaluationReport.ts (PR B3, task 20.1 support — RED)
 *
 * Typed read over GET /api/participants/{id}/evaluation. The generated
 * `types/api.ts` schema for `EvaluationResource` is a generic
 * `{[key: string]: unknown}` (Scramble's passthrough-toArray() limitation,
 * already documented for `AdminEvaluationSerializer`/`DashboardMetrics` in
 * prior B2 batches) — this composable hand-types the response to match
 * `AdminEvaluationSerializer::serializeCompetencyResult()` exactly
 * (api/app/Services/Admin/AdminEvaluationSerializer.php:96-119).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('useEvaluationReport', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('fetchEvaluation(id) calls GET /participants/{id}/evaluation and returns the competency map', async () => {
    const evaluationData = {
      SLF: {
        score: 4,
        reliability: '67%',
        behaviors: [
          { indicator: 'a', score: 5, explanation: 'x', excerpts: ['e1'] },
          { indicator: 'b', score: 3, explanation: 'y', excerpts: ['e2'] },
          { indicator: 'c', score: null, explanation: 'z', excerpts: [] },
        ],
      },
    }
    const apiFetchMock = vi.fn().mockResolvedValue({ data: evaluationData })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useEvaluationReport } = await import('../../../app/composables/useEvaluationReport')
    const { fetchEvaluation } = useEvaluationReport()

    const result = await fetchEvaluation(42)

    expect(apiFetchMock).toHaveBeenCalledWith('/participants/42/evaluation')
    expect(result).toEqual(evaluationData)
  })

  it('propagates a rejection (e.g. 409 lifecycle_not_ready) to the caller unchanged', async () => {
    const notReadyError = Object.assign(new Error('conflict'), { status: 409 })
    const apiFetchMock = vi.fn().mockRejectedValue(notReadyError)
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useEvaluationReport } = await import('../../../app/composables/useEvaluationReport')
    const { fetchEvaluation } = useEvaluationReport()

    await expect(fetchEvaluation(42)).rejects.toBe(notReadyError)
  })
})
