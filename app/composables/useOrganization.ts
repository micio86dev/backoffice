/**
 * useOrganization — typed reads/writes over the self-resolving singular
 * `/api/organization` resource (D2/D3). No id ever appears in the path.
 * Thin wiring over `useApi().apiFetch`, mirroring `useParticipants.ts:16-30`.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

export type OrganizationResponse =
  paths['/organization']['get']['responses']['200']['content']['application/json']

export type UpdateOrganizationPayload = NonNullable<
  paths['/organization']['patch']['requestBody']
>['content']['application/json']

export function useOrganization() {
  const { apiFetch } = useApi()

  async function fetchOrganization(): Promise<OrganizationResponse> {
    return apiFetch<OrganizationResponse>('/organization')
  }

  async function updateOrganization(
    payload: UpdateOrganizationPayload
  ): Promise<OrganizationResponse> {
    return apiFetch<OrganizationResponse>('/organization', { method: 'PATCH', body: payload })
  }

  return { fetchOrganization, updateOrganization }
}
