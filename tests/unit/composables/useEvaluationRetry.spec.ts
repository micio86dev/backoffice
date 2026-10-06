/**
 * useEvaluationRetry.ts (scoring-retry-rt-b, PR4a)
 *
 * Thin composable wiring over useApi().apiFetch, mirroring
 * useParticipantRecovery. The request body is typed from `types/api.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('useEvaluationRetry', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('authorizeRetry(id, payload) POSTs /participants/{id}/retry with the body', async () => {
    const response = {
      status: 'in_attesa',
      entry_url: 'https://interview.example.com/interview/tok',
      expires_at: '2026-10-07T10:00:00.000000Z',
      email_sent: true,
      competencies_reset: ['PRS', 'STG'],
    }
    const apiFetchMock = vi.fn().mockResolvedValue(response)
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useEvaluationRetry } = await import('../../../app/composables/useEvaluationRetry')
    const { authorizeRetry } = useEvaluationRetry()

    const result = await authorizeRetry(42, { reason: 'customer asked' })

    expect(apiFetchMock).toHaveBeenCalledWith('/participants/42/retry', {
      method: 'POST',
      body: { reason: 'customer asked' },
    })
    expect(result).toEqual(response)
  })

  it('sends an empty body when no reason is given', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue({})
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useEvaluationRetry } = await import('../../../app/composables/useEvaluationRetry')
    await useEvaluationRetry().authorizeRetry('7')

    expect(apiFetchMock).toHaveBeenCalledWith('/participants/7/retry', {
      method: 'POST',
      body: {},
    })
  })

  it('lets a refusal reach the caller untouched', async () => {
    const refusal = { status: 409, data: { reason: 'retry_already_consumed' } }
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: vi.fn().mockRejectedValue(refusal) }),
    }))

    const { useEvaluationRetry } = await import('../../../app/composables/useEvaluationRetry')

    await expect(useEvaluationRetry().authorizeRetry(1)).rejects.toBe(refusal)
  })
})
