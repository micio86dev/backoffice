/**
 * useDashboardMetrics.ts (PR B2, task 17.5 — RED)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('useDashboardMetrics', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('fetchMetrics() calls GET /dashboard/metrics and returns the response', async () => {
    const payload = {
      data: {
        participants_by_status: { completato: 3 },
        evaluations_by_status: { completato: 2 },
        completion_rate: 0.75,
        ai_usage: {
          input_tokens: 100,
          output_tokens: 200,
          latency_ms_p50: 500,
          latency_ms_p95: 900,
        },
      },
    }
    const apiFetchMock = vi.fn().mockResolvedValue(payload)
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useDashboardMetrics } = await import('../../../app/composables/useDashboardMetrics')
    const { fetchMetrics } = useDashboardMetrics()

    const result = await fetchMetrics()

    expect(apiFetchMock).toHaveBeenCalledWith('/dashboard/metrics')
    expect(result).toEqual(payload)
  })
})
