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
  async function uploadLogo(file: File): Promise<OrganizationResponse> {
    const body = new FormData()
    body.append('logo', file)

    return apiFetch<OrganizationResponse>('/organization/logo', { method: 'POST', body })
  }

  /** Remove the logo, returning the organization to the product's own mark. */
  async function removeLogo(): Promise<OrganizationResponse> {
    return apiFetch<OrganizationResponse>('/organization/logo', { method: 'DELETE' })
  }

  return { fetchOrganization, updateOrganization, uploadLogo, removeLogo }
}
