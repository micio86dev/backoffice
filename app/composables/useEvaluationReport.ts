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
 *
 * `fetchEvaluation()` returns `{ data, meta }` (D7, bars-full-scale-1-5):
 * `meta` is the Evaluation's scoring provenance (`prompt_version`,
 * `model_version`, `framework_version` — the resolved string, never the FK
 * id), unwrapped from the API response's `meta.scoring` sibling of `data`.
 * Nothing is computed here; this is a pure read-through of what the API
 * already exposes.
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

export interface EvaluationScoringMeta {
  prompt_version: string
  model_version: string
  framework_version: string
}

interface EvaluationResponse {
  data: EvaluationReportData
  meta: { scoring: EvaluationScoringMeta }
}

export function useEvaluationReport() {
  const { apiFetch } = useApi()

  async function fetchEvaluation(
    id: number | string
  ): Promise<{ data: EvaluationReportData; meta: EvaluationScoringMeta }> {
    const response = await apiFetch<EvaluationResponse>(`/participants/${id}/evaluation`)
    return { data: response.data, meta: response.meta.scoring }
  }

  return { fetchEvaluation }
}
