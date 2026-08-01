/**
 * Pure query-string builder for `GET /api/participants` (D5 — server-driven
 * pagination + filters `project_id`/`status`/`q`, no client-specifiable
 * sort). Extracted from `useParticipants` so filter/pagination assembly is
 * unit-testable without mocking `$fetch`.
 */
export interface ParticipantListParams {
  page?: number
  perPage?: number
  projectId?: number
  status?: string
  q?: string
}

export function buildParticipantListQuery(params: ParticipantListParams): string {
  const search = new URLSearchParams()

  if (params.page !== undefined) search.set('page', String(params.page))
  if (params.perPage !== undefined) search.set('per_page', String(params.perPage))
  if (params.projectId !== undefined) search.set('project_id', String(params.projectId))
  if (params.status) search.set('status', params.status)
  if (params.q) search.set('q', params.q)

  const query = search.toString()
  return query ? `?${query}` : ''
}
