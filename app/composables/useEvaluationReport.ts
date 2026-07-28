/**
 * useEvaluationReport — typed read over GET /api/participants/{id}/evaluation
 * (D2 Evaluation scope, D6, D9).
 *
 * Hand-typed against `AdminEvaluationSerializer::serializeCompetencyResult()`
 * (api/app/Services/Admin/AdminEvaluationSerializer.php:96-119), not the
 * generated `types/api.ts` schema — `EvaluationResource` there is a generic
 * `{[key: string]: unknown}` because Scramble cannot infer a passthrough
 * `toArray()` (the same limitation already documented for
 * `DashboardMetricsResource` in useDashboardMetrics.ts, C11 PR B2).
 *
 * `behaviors[].score` is `number | null`: the server pre-maps its `-1`
 * "unassessable" sentinel to `null` before it ever reaches the wire — see
 * app/utils/bars.ts for why callers don't need to special-case either shape.
 *
 * A rejection (409 lifecycle_not_ready / 403 / 404 / network) is NOT caught
 * here — the caller (the participant detail page) is responsible for
 * distinguishing those states (D4's whole reason for choosing 409 over a
 * generic error).
 */
import { useApi } from './useApi'

export interface EvaluationBehavior {
  indicator: string
  score: number | null
  explanation: string
  excerpts: string[]
}

export interface EvaluationCompetencyResult {
  score: number | null
  reliability: string
  behaviors: EvaluationBehavior[]
}

export type EvaluationReportData = Record<string, EvaluationCompetencyResult>

interface EvaluationResponse {
  data: EvaluationReportData
}

export function useEvaluationReport() {
  const { apiFetch } = useApi()

  async function fetchEvaluation(id: number | string): Promise<EvaluationReportData> {
    const response = await apiFetch<EvaluationResponse>(`/participants/${id}/evaluation`)
    return response.data
  }

  return { fetchEvaluation }
}
