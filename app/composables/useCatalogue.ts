/**
 * useCatalogue — the platform-superadmin read/write surface over the
 * framework catalogue (framework-catalogue-authoring, catalogue-authoring
 * spec): the revision the catalogue shows, opening a draft, and CRUD over
 * its roles, competencies and BARS indicators.
 *
 * Thin wiring over `useApi().apiFetch`, same shape as `useAvatarTemplates.ts`
 * — no caching, since a superadmin editing the catalogue elsewhere (another
 * tab, another session) must never be masked by a stale local copy.
 *
 * DERIVED FROM THE GENERATED CLIENT, never hand-written — `types/api.ts`
 * regenerates from `openapi.json`, so a shape change server-side becomes a
 * type error here rather than an `undefined` at runtime.
 *
 * The page opens the draft explicitly (`openDraftRevision`) before any
 * panel offers an edit control; create requests would also open one on
 * first write (PR3's `OpenDraftRevision`, via each `store()` action).
 * Update/delete never do —
 * the target either already belongs to an existing open draft or does not
 * exist to touch (PR3's `RoleController`/`CompetencyController`/
 * `BarsIndicatorController` docblocks). Every write can answer 409 when a
 * concurrent publish flips the draft mid-request (`Revision
 * PublishedDuringWriteException`) — callers map it through the shared D4
 * state resolver like any other resource error.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

export type CatalogueRevisionResponse =
  paths['/catalogue/revisions/current']['get']['responses']['200']['content']['application/json']
export type CatalogueRevision = NonNullable<CatalogueRevisionResponse['data']>

export type OpenDraftRevisionResponse =
  paths['/catalogue/revisions/draft']['post']['responses']['200']['content']['application/json']

export type DiscardDraftRevisionResponse =
  paths['/catalogue/revisions/draft']['delete']['responses']['200']['content']['application/json']

export type PublishRevisionResponse =
  paths['/catalogue/revisions/publish']['post']['responses']['200']['content']['application/json']
export type PublishRevisionViolationsResponse =
  paths['/catalogue/revisions/publish']['post']['responses']['422']['content']['application/json']

export type CatalogueCompetenciesResponse =
  paths['/catalogue/competencies']['get']['responses']['200']['content']['application/json']
export type CatalogueCompetency = CatalogueCompetenciesResponse['data'][number]
export type CatalogueCompetencyResponse =
  paths['/catalogue/competencies']['post']['responses']['201']['content']['application/json']
export type CreateCompetencyPayload =
  paths['/catalogue/competencies']['post']['requestBody']['content']['application/json']
export type UpdateCompetencyPayload = NonNullable<
  paths['/catalogue/competencies/{competency}']['patch']['requestBody']
>['content']['application/json']

export type CatalogueRolesResponse =
  paths['/catalogue/roles']['get']['responses']['200']['content']['application/json']
export type CatalogueRole = CatalogueRolesResponse['data'][number]
export type CatalogueRoleResponse =
  paths['/catalogue/roles']['post']['responses']['201']['content']['application/json']
export type CreateRolePayload =
  paths['/catalogue/roles']['post']['requestBody']['content']['application/json']
export type UpdateRolePayload = NonNullable<
  paths['/catalogue/roles/{role}']['patch']['requestBody']
>['content']['application/json']
export type UpdateRoleCompetenciesPayload =
  paths['/catalogue/roles/{role}/competencies']['put']['requestBody']['content']['application/json']

export type CatalogueBarsIndicatorsResponse =
  paths['/catalogue/bars-indicators']['get']['responses']['200']['content']['application/json']
export type CatalogueBarsIndicator = CatalogueBarsIndicatorsResponse['data'][number]
export type CatalogueBarsIndicatorResponse =
  paths['/catalogue/bars-indicators']['post']['responses']['201']['content']['application/json']
export type CreateBarsIndicatorPayload =
  paths['/catalogue/bars-indicators']['post']['requestBody']['content']['application/json']
export type UpdateBarsIndicatorPayload = NonNullable<
  paths['/catalogue/bars-indicators/{indicator}']['patch']['requestBody']
>['content']['application/json']

export function useCatalogue() {
  const { apiFetch } = useApi()

  /**
   * The revision every catalogue list currently returns: the open draft
   * (`editable: true`), otherwise the latest published revision
   * (`editable: false`, rows are a read-only view). `data: null` only
   * before anything has ever been published.
   */
  async function fetchCurrentRevision(): Promise<CatalogueRevisionResponse> {
    return apiFetch<CatalogueRevisionResponse>('/catalogue/revisions/current')
  }

  /**
   * Opens a draft cloned from the latest published revision, or returns the
   * one already open (idempotent server-side). The lists return the draft's
   * own row ids afterwards, so every panel must reload before editing.
   */
  async function openDraftRevision(): Promise<OpenDraftRevisionResponse> {
    return apiFetch<OpenDraftRevisionResponse>('/catalogue/revisions/draft', { method: 'POST' })
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

  /**
   * Abandon the open draft entirely — every uncommitted role, competency,
   * BARS indicator and default question it holds. Irreversible, same as
   * `publishRevision`, but the opposite direction: nothing is kept.
   */
  async function discardDraftRevision(): Promise<DiscardDraftRevisionResponse> {
    return apiFetch<DiscardDraftRevisionResponse>('/catalogue/revisions/draft', {
      method: 'DELETE',
    })
  }

  async function listCompetencies(): Promise<CatalogueCompetenciesResponse> {
    return apiFetch<CatalogueCompetenciesResponse>('/catalogue/competencies')
  }

  async function createCompetency(
    payload: CreateCompetencyPayload
  ): Promise<CatalogueCompetencyResponse> {
    return apiFetch<CatalogueCompetencyResponse>('/catalogue/competencies', {
      method: 'POST',
      body: payload,
    })
  }

  async function updateCompetency(
    id: number,
    payload: UpdateCompetencyPayload
  ): Promise<CatalogueCompetencyResponse> {
    return apiFetch<CatalogueCompetencyResponse>(`/catalogue/competencies/${id}`, {
      method: 'PATCH',
      body: payload,
    })
  }

  async function deleteCompetency(id: number): Promise<void> {
    await apiFetch(`/catalogue/competencies/${id}`, { method: 'DELETE' })
  }

  async function listRoles(): Promise<CatalogueRolesResponse> {
    return apiFetch<CatalogueRolesResponse>('/catalogue/roles')
  }

  async function createRole(payload: CreateRolePayload): Promise<CatalogueRoleResponse> {
    return apiFetch<CatalogueRoleResponse>('/catalogue/roles', { method: 'POST', body: payload })
  }

  async function updateRole(
    id: number,
    payload: UpdateRolePayload
  ): Promise<CatalogueRoleResponse> {
    return apiFetch<CatalogueRoleResponse>(`/catalogue/roles/${id}`, {
      method: 'PATCH',
      body: payload,
    })
  }

  async function deleteRole(id: number): Promise<void> {
    await apiFetch(`/catalogue/roles/${id}`, { method: 'DELETE' })
  }

  /**
   * `PUT /catalogue/roles/{role}/competencies` (framework-catalogue-
   * authoring PR8b/PR10c) — replaces the role's ENTIRE competency set in
   * one idempotent write. Attach, detach and reorder are the same call:
   * the caller always sends the full ORDERED `competency_ids` list, never
   * a partial diff.
   */
  async function updateRoleCompetencies(
    id: number,
    payload: UpdateRoleCompetenciesPayload
  ): Promise<CatalogueRoleResponse> {
    return apiFetch<CatalogueRoleResponse>(`/catalogue/roles/${id}/competencies`, {
      method: 'PUT',
      body: payload,
    })
  }

  async function listBarsIndicators(): Promise<CatalogueBarsIndicatorsResponse> {
    return apiFetch<CatalogueBarsIndicatorsResponse>('/catalogue/bars-indicators')
  }

  async function createBarsIndicator(
    payload: CreateBarsIndicatorPayload
  ): Promise<CatalogueBarsIndicatorResponse> {
    return apiFetch<CatalogueBarsIndicatorResponse>('/catalogue/bars-indicators', {
      method: 'POST',
      body: payload,
    })
  }

  async function updateBarsIndicator(
    id: number,
    payload: UpdateBarsIndicatorPayload
  ): Promise<CatalogueBarsIndicatorResponse> {
    return apiFetch<CatalogueBarsIndicatorResponse>(`/catalogue/bars-indicators/${id}`, {
      method: 'PATCH',
      body: payload,
    })
  }

  async function deleteBarsIndicator(id: number): Promise<void> {
    await apiFetch(`/catalogue/bars-indicators/${id}`, { method: 'DELETE' })
  }

  return {
    fetchCurrentRevision,
    openDraftRevision,
    publishRevision,
    discardDraftRevision,
    listCompetencies,
    createCompetency,
    updateCompetency,
    deleteCompetency,
    listRoles,
    createRole,
    updateRole,
    updateRoleCompetencies,
    deleteRole,
    listBarsIndicators,
    createBarsIndicator,
    updateBarsIndicator,
    deleteBarsIndicator,
  }
}
