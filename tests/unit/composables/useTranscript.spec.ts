/**
 * useTranscript.ts (operator-participant-visibility PR4, D2/D7)
 *
 * Typed read over GET /api/participants/{id}/transcript. Unlike
 * `useEvaluationReport` (whose `EvaluationResource` schema is a generic
 * passthrough Scramble cannot infer), `TranscriptResource` gained an
 * explicit `@scramble-return` in PR1 (D2b) — this composable types
 * directly from the generated `types/api.ts`, never a hand-written mirror.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('useTranscript', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('fetchTranscript(id) calls GET /participants/{id}/transcript and returns { is_partial, sessions }', async () => {
    const transcriptData = {
      is_partial: true,
      sessions: [
        {
          session_id: 10,
          competency_code: 'COL',
          question_index: 0,
          utterances: [
            { speaker: 'avatar', text: 'Tell me about a time...', ts: '2026-03-14T10:00:00Z' },
            { speaker: 'candidate', text: 'Sure, once I...', ts: '2026-03-14T10:00:05Z' },
          ],
        },
      ],
    }
    const apiFetchMock = vi.fn().mockResolvedValue({ data: transcriptData })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useTranscript } = await import('../../../app/composables/useTranscript')
    const { fetchTranscript } = useTranscript()

    const result = await fetchTranscript(42)

    expect(apiFetchMock).toHaveBeenCalledWith('/participants/42/transcript')
    expect(result).toEqual(transcriptData)
  })

  it('propagates a rejection (e.g. 409 lifecycle_not_ready) to the caller unchanged', async () => {
    const notReadyError = Object.assign(new Error('conflict'), { status: 409 })
    const apiFetchMock = vi.fn().mockRejectedValue(notReadyError)
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useTranscript } = await import('../../../app/composables/useTranscript')
    const { fetchTranscript } = useTranscript()

    await expect(fetchTranscript(42)).rejects.toBe(notReadyError)
  })
})
