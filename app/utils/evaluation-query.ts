/**
 * Pure query-string builder for `GET /api/evaluations`/`.../summary` (D6/D7
 * — whitelisted filters only, no client-specified sort). Extracted so
 * filter assembly is unit-testable without mocking `$fetch`, mirroring
 * `participant-query.ts`.
 */
export interface EvaluationQueryParams {
  project_id?: number
  assessment_type?: 'standard' | 'potential'
  role_code?: string
  status?: 'completed' | 'pending'
  evaluated_from?: string
  evaluated_to?: string
}

export function buildEvaluationQuery(params: EvaluationQueryParams): string {
  const search = new URLSearchParams()

  if (params.project_id !== undefined) search.set('project_id', String(params.project_id))
  if (params.assessment_type) search.set('assessment_type', params.assessment_type)
  if (params.role_code) search.set('role_code', params.role_code)
  if (params.status) search.set('status', params.status)
  if (params.evaluated_from) search.set('evaluated_from', params.evaluated_from)
  if (params.evaluated_to) search.set('evaluated_to', params.evaluated_to)

  const query = search.toString()
  return query ? `?${query}` : ''
}
