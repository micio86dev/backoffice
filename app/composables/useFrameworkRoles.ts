/**
 * useFrameworkRoles — a minimal read wrapper over the existing C3 framework
 * catalog endpoints, added for `ProjectForm`'s `CompetencyPicker` (D9: "no
 * new `/projects/field-specs` endpoint... its only dynamic part — which
 * competencies belong to a role — is already served by C3"). Not in D8's
 * originally listed composable set; added because `CompetencyPicker` cannot
 * source its `standard`-assessment options any other way. Thin wiring over
 * `useApi().apiFetch`, mirroring `useParticipants.ts:16-30`.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

export type RoleCompetenciesResponse =
  paths['/framework/roles/{roleCode}/competencies']['get']['responses']['200']['content']['application/json']

export function useFrameworkRoles() {
  const { apiFetch } = useApi()

  async function fetchRoleCompetencies(roleCode: string): Promise<RoleCompetenciesResponse> {
    return apiFetch<RoleCompetenciesResponse>(`/framework/roles/${roleCode}/competencies`)
  }

  return { fetchRoleCompetencies }
}
