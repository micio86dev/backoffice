/**
 * useEvaluations — typed reads over `GET /api/evaluations` and `GET
 * /api/evaluations/summary` (D6/D7). Thin wiring over `useApi().apiFetch`;
 * filter assembly is the pure `buildEvaluationQuery` (evaluation-query.ts),
 * mirroring `useParticipants.ts:16-30`.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'
import { buildEvaluationQuery, type EvaluationQueryParams } from '../utils/evaluation-query'

export type EvaluationIndexResponse =
  paths['/evaluations']['get']['responses']['200']['content']['application/json']

export type EvaluationSummaryResponse =
  paths['/evaluations/summary']['get']['responses']['200']['content']['application/json']

export function useEvaluations() {
  const { apiFetch } = useApi()

  async function index(params: EvaluationQueryParams): Promise<EvaluationIndexResponse> {
    return apiFetch<EvaluationIndexResponse>(`/evaluations${buildEvaluationQuery(params)}`)
  }

  async function summary(params: EvaluationQueryParams): Promise<EvaluationSummaryResponse> {
    return apiFetch<EvaluationSummaryResponse>(
      `/evaluations/summary${buildEvaluationQuery(params)}`
    )
  }

  return { index, summary }
}
