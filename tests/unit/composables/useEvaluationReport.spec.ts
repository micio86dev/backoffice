/**
 * useEvaluationReport.ts (PR B3, task 20.1 support; widened return shape for
 * scoring provenance — bars-full-scale-1-5 D7, task 2.8)
 *
 * Typed read over GET /api/participants/{id}/evaluation. The generated
 * `types/api.ts` schema for `EvaluationResource` is a generic
 * `{[key: string]: unknown}` (Scramble's passthrough-toArray() limitation,
 * already documented for `AdminEvaluationSerializer`/`DashboardMetrics` in
 * prior B2 batches) — this composable hand-types the response to match
 * `AdminEvaluationSerializer::serializeCompetencyResult()` exactly
 * (api/app/Services/Admin/AdminEvaluationSerializer.php:96-119).
 *
 * `fetchEvaluation()` returns `{ data, meta }` — `meta.scoring` carries the
 * Evaluation's `prompt_version`/`model_version`/`framework_version` (D7), a
 * response SIBLING of `data`, never merged into the competency map.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('useEvaluationReport', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('fetchEvaluation(id) calls GET /participants/{id}/evaluation and returns { data, meta }', async () => {
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
    const scoringMeta = {
      prompt_version: '2.0.0',
      model_version: 'claude-haiku-4-5-20251001',
      framework_version: '1.4.0',
    }
    const apiFetchMock = vi
      .fn()
      .mockResolvedValue({ data: evaluationData, meta: { scoring: scoringMeta } })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useEvaluationReport } = await import('../../../app/composables/useEvaluationReport')
    const { fetchEvaluation } = useEvaluationReport()

    const result = await fetchEvaluation(42)

    expect(apiFetchMock).toHaveBeenCalledWith('/participants/42/evaluation')
    expect(result.data).toEqual(evaluationData)
    expect(result.meta).toEqual(scoringMeta)
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
