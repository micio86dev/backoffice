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

export type PotentialCompetenciesResponse =
  paths['/framework/potential-competencies']['get']['responses']['200']['content']['application/json']

/**
 * `?framework_version_id=` when known, omitted entirely otherwise — matches
 * the API's own "no param → latest published" fallback
 * (`FrameworkController::targetRevisionId()`). Required, not cosmetic: the
 * competencies these two endpoints return are validated by
 * `StoreProjectRequest`/`UpdateProjectRequest` against THAT SPECIFIC
 * framework version's own pinned catalogue revision, which can differ from
 * "latest published" — omitting it once let the picker offer ids the server
 * would refuse as `competency_unknown`.
 */
function versionQuery(frameworkVersionId?: number | null): string {
  return frameworkVersionId === null || frameworkVersionId === undefined
    ? ''
    : `?framework_version_id=${frameworkVersionId}`
}

export function useFrameworkRoles() {
  const { apiFetch } = useApi()

  async function fetchRoleCompetencies(
    roleCode: string,
    frameworkVersionId?: number | null
  ): Promise<RoleCompetenciesResponse> {
    return apiFetch<RoleCompetenciesResponse>(
      `/framework/roles/${roleCode}/competencies${versionQuery(frameworkVersionId)}`
    )
  }

  /**
   * MTG and LAT — the `potential` set.
   *
   * A separate call because they belong to no role, which is exactly what
   * makes them potential, so the role endpoint above cannot serve them.
   */
  async function fetchPotentialCompetencies(
    frameworkVersionId?: number | null
  ): Promise<PotentialCompetenciesResponse> {
    return apiFetch<PotentialCompetenciesResponse>(
      `/framework/potential-competencies${versionQuery(frameworkVersionId)}`
    )
  }

  return { fetchRoleCompetencies, fetchPotentialCompetencies }
}
