/**
 * useReusableLinks — typed calls over the reusable-links endpoints
 * (reusable-interview-links): create, list and disable. Thin wiring over
 * `useApi().apiFetch`, mirroring `useEntryLinks.ts`.
 *
 * The create response is `{ data, entry_url }`. `entry_url` is a bearer
 * credential that never expires and is the ONLY place the full link ever
 * exists: the api stores a hash, never the secret. So this composable returns
 * it to the caller and keeps nothing — no ref, no cache, no module-level copy —
 * and the caller holds it in component state for exactly one drawer session.
 *
 * The list is the opposite half of that rule: a row describes a link (label,
 * prefix, usage, status) and carries no URL, token or hash, so there is nothing
 * secret to protect on the way back. Disabling is addressed by the link's PUBLIC
 * id (`rlk_...`), answers 204, and is idempotent on the server: the second
 * disable of the same link is the same 204, so a caller never has to tell
 * "just disabled" from "was already disabled".
 *
 * Request and response types come from the generated client (`types/api.ts`),
 * never hand-written, so a contract change fails the build instead of drifting.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

type CreateOperation = paths['/projects/{project}/reusable-links']['post']
type ListOperation = paths['/projects/{project}/reusable-links']['get']

export type CreateReusableLinkPayload = NonNullable<
  CreateOperation['requestBody']
>['content']['application/json']

export type CreateReusableLinkResponse =
  CreateOperation['responses']['201']['content']['application/json']

export type ReusableLinkList = ListOperation['responses']['200']['content']['application/json']

/** One row of the list: the generated resource, with no secret field to render. */
export type ReusableLink = ReusableLinkList['data'][number]

export function useReusableLinks() {
  const { apiFetch } = useApi()

  async function createReusableLink(
    projectId: number,
    payload: CreateReusableLinkPayload
  ): Promise<CreateReusableLinkResponse> {
    return apiFetch<CreateReusableLinkResponse>(`/projects/${projectId}/reusable-links`, {
      method: 'POST',
      body: payload,
    })
  }

  /**
   * Every link of the project, disabled ones included: the api answers the whole
   * set in one response (active first, then newest), so there is no page to walk.
   */
  async function listReusableLinks(projectId: number): Promise<ReusableLinkList> {
    return apiFetch<ReusableLinkList>(`/projects/${projectId}/reusable-links`)
  }

  /**
   * Disables a link for good. A disabled link cannot be re-enabled, so the caller
   * asks the operator first (`ReusableLinksPanel` goes through `ConfirmDialog`).
   */
  async function disableReusableLink(projectId: number, linkId: string): Promise<void> {
    await apiFetch(`/projects/${projectId}/reusable-links/${linkId}`, { method: 'DELETE' })
  }

  return { createReusableLink, listReusableLinks, disableReusableLink }
}
