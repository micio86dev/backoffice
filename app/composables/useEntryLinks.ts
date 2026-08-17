/**
 * useEntryLinks — typed writes over `POST /api/entry-links`
 * (operator-interview-link). Thin wiring over `useApi().apiFetch`, mirroring
 * `useApiClients.ts:31-59`. The response is `{ entry_url, expires_at }` —
 * never a bare token (design D1): a raw token in an operator-facing payload
 * is a second copyable artifact that can land in the wrong place.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

export type GenerateEntryLinkPayload =
  paths['/entry-links']['post']['requestBody']['content']['application/json']

export type GenerateEntryLinkResponse =
  paths['/entry-links']['post']['responses']['201']['content']['application/json']

export function useEntryLinks() {
  const { apiFetch } = useApi()

  async function generateEntryLink(
    payload: GenerateEntryLinkPayload
  ): Promise<GenerateEntryLinkResponse> {
    return apiFetch<GenerateEntryLinkResponse>('/entry-links', { method: 'POST', body: payload })
  }

  return { generateEntryLink }
}
