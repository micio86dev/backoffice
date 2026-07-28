/**
 * useParticipants — typed reads over the C11 admin participant endpoints
 * (D5). Thin wiring over `useApi().apiFetch`; filter/pagination assembly is
 * the pure `buildParticipantListQuery` (participant-query.ts).
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'
import { buildParticipantListQuery, type ParticipantListParams } from '../utils/participant-query'

export type ParticipantListResponse =
  paths['/participants']['get']['responses']['200']['content']['application/json']

export type ParticipantDetailResponse =
  paths['/participants/{id}']['get']['responses']['200']['content']['application/json']

export function useParticipants() {
  const { apiFetch } = useApi()

  async function listParticipants(
    params: ParticipantListParams = {}
  ): Promise<ParticipantListResponse> {
    return apiFetch<ParticipantListResponse>(`/participants${buildParticipantListQuery(params)}`)
  }

  async function fetchParticipant(id: number | string): Promise<ParticipantDetailResponse> {
    return apiFetch<ParticipantDetailResponse>(`/participants/${id}`)
  }

  return { listParticipants, fetchParticipant }
}
