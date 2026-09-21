/**
 * useOrganization — typed reads/writes over the self-resolving singular
 * `/api/organization` resource (D2/D3). No id ever appears in the path.
 * Thin wiring over `useApi().apiFetch`, mirroring `useParticipants.ts:16-30`.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

/**
 * `data` is nullable HERE ONLY: `getOrgId()` is null for a superadmin with no
 * acting organization selected, and `OrganizationController::show()` answers
 * that ordinary state with `data: null` rather than a 404 (api
 * fix/organization-no-acting-org-404). The three write endpoints below keep
 * their OWN, still non-nullable, generated response types — a PATCH/upload/
 * delete can only ever act on a real, already-resolved organization.
 */
export type OrganizationResponse =
  paths['/organization']['get']['responses']['200']['content']['application/json']

/**
 * An actually-loaded organization, for the callers that only ever run once
 * one is known to exist: the three settings-page panels render behind
 * `v-if="organization"` (`pages/settings/index.vue`), and the write endpoints
 * (`PATCH`/logo upload/delete) can only ever act on a real one. Kept as its
 * own export, rather than a per-file `NonNullable<>`, so it stays the ONE
 * place that narrows the wire type down to "an organization is present".
 */
export type OrganizationRecord = NonNullable<OrganizationResponse['data']>

export type UpdateOrganizationPayload = NonNullable<
  paths['/organization']['patch']['requestBody']
>['content']['application/json']

type UpdateOrganizationResponse =
  paths['/organization']['patch']['responses']['200']['content']['application/json']

type OrganizationLogoResponse =
  paths['/organization/logo']['post']['responses']['200']['content']['application/json']

export function useOrganization() {
  const { apiFetch } = useApi()

  async function fetchOrganization(): Promise<OrganizationResponse> {
    return apiFetch<OrganizationResponse>('/organization')
  }

  async function updateOrganization(
    payload: UpdateOrganizationPayload
  ): Promise<UpdateOrganizationResponse> {
    return apiFetch<UpdateOrganizationResponse>('/organization', {
      method: 'PATCH',
      body: payload,
    })
  }

  /**
   * Upload a logo.
   *
   * A separate endpoint from the settings PATCH, and that separation is a
   * security property rather than REST tidiness: `logo_path` is written only
   * where a file was actually stored, so a client that could send it as a
   * settings field could point the logo at any path on the disk.
   *
   * `FormData` with no explicit Content-Type — the browser must set the
   * multipart boundary itself, and naming the header here overwrites it with
   * one that has none, producing a body the server cannot parse.
   */
  async function uploadLogo(file: File): Promise<OrganizationLogoResponse> {
    const body = new FormData()
    body.append('logo', file)

    return apiFetch<OrganizationLogoResponse>('/organization/logo', { method: 'POST', body })
  }

  /** Remove the logo, returning the organization to the product's own mark. */
  async function removeLogo(): Promise<OrganizationLogoResponse> {
    return apiFetch<OrganizationLogoResponse>('/organization/logo', { method: 'DELETE' })
  }

  return { fetchOrganization, updateOrganization, uploadLogo, removeLogo }
}
