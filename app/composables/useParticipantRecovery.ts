/**
 * useParticipantRecovery — typed writes over `POST /api/participants/{id}/recover`
 * (participant-error-recovery, design D9). Thin wiring over `useApi().apiFetch`,
 * mirroring `useEntryLinks.ts`. A 409 refusal (already handled/never entered
 * the interview/still live) surfaces via the thrown error's `.data.reason` —
 * the caller maps it to an i18n key, never renders the raw machine string.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

export type RecoverParticipantPayload = NonNullable<
  paths['/participants/{id}/recover']['post']['requestBody']
>['content']['application/json']

export type RecoverParticipantResponse =
  paths['/participants/{id}/recover']['post']['responses']['200']['content']['application/json']

export function useParticipantRecovery() {
  const { apiFetch } = useApi()

  async function recoverParticipant(
    participantId: number | string,
    payload: RecoverParticipantPayload = {}
  ): Promise<RecoverParticipantResponse> {
    return apiFetch<RecoverParticipantResponse>(`/participants/${participantId}/recover`, {
      method: 'POST',
      body: payload,
    })
  }

  return { recoverParticipant }
}
