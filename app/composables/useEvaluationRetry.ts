/**
 * useEvaluationRetry — typed write over `POST /api/participants/{id}/retry`
 * (scoring-retry-rt-b). Thin wiring over `useApi().apiFetch`, mirroring
 * `useParticipantRecovery.ts`. A 409 refusal surfaces via the thrown error's
 * `.data.reason`; the caller maps it to an i18n key, never renders the raw
 * machine string.
 *
 * The response carries `entry_url`, a bearer credential. This module never
 * logs it, never puts it in a URL or storage, and never wraps the error.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

export type AuthorizeRetryPayload = NonNullable<
  paths['/participants/{id}/retry']['post']['requestBody']
>['content']['application/json']

export type AuthorizeRetryResponse =
  paths['/participants/{id}/retry']['post']['responses']['200']['content']['application/json']

export function useEvaluationRetry() {
  const { apiFetch } = useApi()

  async function authorizeRetry(
    participantId: number | string,
    payload: AuthorizeRetryPayload = {}
  ): Promise<AuthorizeRetryResponse> {
    return apiFetch<AuthorizeRetryResponse>(`/participants/${participantId}/retry`, {
      method: 'POST',
      body: payload,
    })
  }

  return { authorizeRetry }
}
