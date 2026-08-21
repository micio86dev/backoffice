/**
 * useTranscript — typed read over GET /api/participants/{id}/transcript
 * (operator-participant-visibility D2/D7).
 *
 * Unlike `useEvaluationReport` (whose `EvaluationResource` schema is a
 * generic Scramble passthrough it cannot infer), `TranscriptResource` gained
 * an explicit `@scramble-return` in PR1 (D2b), so this composable types
 * directly from the generated `types/api.ts` instead of hand-typing a
 * fourth copy of the payload shape.
 *
 * A rejection (409 lifecycle_not_ready / 403 / 404 / network) is NOT caught
 * here — the caller (the participant detail page) is responsible for
 * resolving it, mirroring `useEvaluationReport`'s stated contract. In
 * practice the page only calls this once its client-side mirror
 * (`isParticipantResourceReady(status, 'transcript')`) already says the
 * resource should be reachable (D7) — a 409 here would mean the mirror
 * disagreed with the server, not an expected steady state.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

export type TranscriptResponse =
  paths['/participants/{id}/transcript']['get']['responses']['200']['content']['application/json']

export type TranscriptData = TranscriptResponse['data']

export type TranscriptSession = TranscriptData['sessions'][number]

export function useTranscript() {
  const { apiFetch } = useApi()

  async function fetchTranscript(id: number | string): Promise<TranscriptData> {
    const response = await apiFetch<TranscriptResponse>(`/participants/${id}/transcript`)
    return response.data
  }

  return { fetchTranscript }
}
