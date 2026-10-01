/**
 * useReusableLinks — typed writes over `POST /api/projects/{project}/reusable-links`
 * (reusable-interview-links). Thin wiring over `useApi().apiFetch`, mirroring
 * `useEntryLinks.ts`.
 *
 * The create response is `{ data, entry_url }`. `entry_url` is a bearer
 * credential that never expires and is the ONLY place the full link ever
 * exists: the api stores a hash, never the secret. So this composable returns
 * it to the caller and keeps nothing — no ref, no cache, no module-level copy —
 * and the caller holds it in component state for exactly one drawer session.
 *
 * Request and response types come from the generated client (`types/api.ts`),
 * never hand-written, so a contract change fails the build instead of drifting.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

type CreateOperation = paths['/projects/{project}/reusable-links']['post']

export type CreateReusableLinkPayload = NonNullable<
  CreateOperation['requestBody']
>['content']['application/json']

export type CreateReusableLinkResponse =
  CreateOperation['responses']['201']['content']['application/json']

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

  return { createReusableLink }
}
