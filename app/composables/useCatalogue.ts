/**
 * useCatalogue — the platform-superadmin read/write surface over the
 * framework catalogue (framework-catalogue-authoring, catalogue-authoring
 * spec): the open revision, and read-only listings of its roles,
 * competencies and BARS indicators.
 *
 * Thin wiring over `useApi().apiFetch`, same shape as `useAvatarTemplates.ts`
 * — no caching, since a superadmin editing the catalogue elsewhere (another
 * tab, another session) must never be masked by a stale local copy.
 *
 * DERIVED FROM THE GENERATED CLIENT, never hand-written — `types/api.ts`
 * regenerates from `openapi.json`, so a shape change server-side becomes a
 * type error here rather than an `undefined` at runtime.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

export type CatalogueRevisionResponse =
  paths['/catalogue/revisions/current']['get']['responses']['200']['content']['application/json']
export type CatalogueRevision = NonNullable<CatalogueRevisionResponse['data']>

export type PublishRevisionResponse =
  paths['/catalogue/revisions/publish']['post']['responses']['200']['content']['application/json']
export type PublishRevisionViolationsResponse =
  paths['/catalogue/revisions/publish']['post']['responses']['422']['content']['application/json']

export type CatalogueCompetenciesResponse =
  paths['/catalogue/competencies']['get']['responses']['200']['content']['application/json']
export type CatalogueCompetency = CatalogueCompetenciesResponse['data'][number]

export type CatalogueRolesResponse =
  paths['/catalogue/roles']['get']['responses']['200']['content']['application/json']
export type CatalogueRole = CatalogueRolesResponse['data'][number]

export type CatalogueBarsIndicatorsResponse =
  paths['/catalogue/bars-indicators']['get']['responses']['200']['content']['application/json']
export type CatalogueBarsIndicator = CatalogueBarsIndicatorsResponse['data'][number]

export function useCatalogue() {
  const { apiFetch } = useApi()

  /** `data: null` when no revision has ever been opened on this platform. */
  async function fetchCurrentRevision(): Promise<CatalogueRevisionResponse> {
    return apiFetch<CatalogueRevisionResponse>('/catalogue/revisions/current')
  }

  /**
   * Publish the open draft. A failing sweep answers 422 with the FULL
   * violations list (`PublishRevision::violations()`, design D3) — the
   * caller distinguishes success from that shape, not from a thrown status
   * alone, so a superadmin sees every blocking reason at once.
   */
  async function publishRevision(): Promise<PublishRevisionResponse> {
    return apiFetch<PublishRevisionResponse>('/catalogue/revisions/publish', { method: 'POST' })
  }

  async function listCompetencies(): Promise<CatalogueCompetenciesResponse> {
    return apiFetch<CatalogueCompetenciesResponse>('/catalogue/competencies')
  }

  async function listRoles(): Promise<CatalogueRolesResponse> {
    return apiFetch<CatalogueRolesResponse>('/catalogue/roles')
  }

  async function listBarsIndicators(): Promise<CatalogueBarsIndicatorsResponse> {
    return apiFetch<CatalogueBarsIndicatorsResponse>('/catalogue/bars-indicators')
  }

  return { fetchCurrentRevision, publishRevision, listCompetencies, listRoles, listBarsIndicators }
}
