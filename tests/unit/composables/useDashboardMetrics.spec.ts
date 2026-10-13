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

  it('appends from/to to BOTH endpoints so tiles and activity describe one period', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue({ data: [] })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useDashboardMetrics } = await import('../../../app/composables/useDashboardMetrics')
    const { fetchMetrics, fetchActivity } = useDashboardMetrics()
    const range = { from: '2026-01-01', to: '2026-01-31' }

    await fetchMetrics(range)
    await fetchActivity(range)

    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      '/dashboard/metrics?from=2026-01-01&to=2026-01-31'
    )
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      '/dashboard/activity?from=2026-01-01&to=2026-01-31'
    )
  })

  it('sends only the bound that was given (half-open ranges)', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue({ data: [] })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useDashboardMetrics } = await import('../../../app/composables/useDashboardMetrics')
    const { fetchMetrics } = useDashboardMetrics()

    await fetchMetrics({ from: '2026-02-01' })
    await fetchMetrics({ to: '2026-02-28' })

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, '/dashboard/metrics?from=2026-02-01')
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, '/dashboard/metrics?to=2026-02-28')
  })

  it('treats an empty range as all time: no query string at all', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue({ data: [] })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useDashboardMetrics } = await import('../../../app/composables/useDashboardMetrics')
    const { fetchActivity } = useDashboardMetrics()

    await fetchActivity({})

    expect(apiFetchMock).toHaveBeenCalledWith('/dashboard/activity')
  })
})
