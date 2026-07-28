/**
 * pages/index.vue — dashboard (PR B2, task 17.5 — RED for the KPI section;
 * the i18n-labelled heading test is the pre-existing B1 baseline, kept
 * green throughout).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const tMock = vi.fn((key: string) => (key === 'dashboard.title' ? 'Dashboard' : key))

function metricsResponse() {
  return {
    data: {
      participants_by_status: { in_corso: 2, completato: 3 },
      evaluations_by_status: { completato: 3 },
      completion_rate: 0.6,
      ai_usage: {
        input_tokens: 1000,
        output_tokens: 2000,
        latency_ms_p50: 500,
        latency_ms_p95: 900,
      },
    },
  }
}

describe('IndexPage (dashboard)', () => {
  beforeEach(() => {
    vi.resetModules()
    tMock.mockClear()
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useHead', vi.fn())
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ locale: ref('en') }))
    )
  })

  it('renders an i18n-labelled heading', async () => {
    vi.doMock('../../app/composables/useDashboardMetrics', () => ({
      useDashboardMetrics: () => ({ fetchMetrics: vi.fn().mockResolvedValue(metricsResponse()) }),
    }))
    const IndexPage = (await import('../../app/pages/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    expect(wrapper.find('h1').text()).toBe('Dashboard')
  })

  it('fetches dashboard metrics on mount and renders the total-participants KPI card', async () => {
    const fetchMetricsMock = vi.fn().mockResolvedValue(metricsResponse())
    vi.doMock('../../app/composables/useDashboardMetrics', () => ({
      useDashboardMetrics: () => ({ fetchMetrics: fetchMetricsMock }),
    }))

    const IndexPage = (await import('../../app/pages/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(fetchMetricsMock).toHaveBeenCalledOnce()
    // 2 in_corso + 3 completato = 5 total participants
    expect(wrapper.text()).toContain('5')
  })

  it('renders a DIFFERENT total when the metrics response differs (proves real aggregation, not a hardcoded value)', async () => {
    const fetchMetricsMock = vi.fn().mockResolvedValue({
      data: {
        participants_by_status: { in_attesa: 10 },
        evaluations_by_status: {},
        completion_rate: 0,
        ai_usage: { input_tokens: 0, output_tokens: 0, latency_ms_p50: null, latency_ms_p95: null },
      },
    })
    vi.doMock('../../app/composables/useDashboardMetrics', () => ({
      useDashboardMetrics: () => ({ fetchMetrics: fetchMetricsMock }),
    }))

    const IndexPage = (await import('../../app/pages/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.text()).toContain('10')
    expect(wrapper.text()).not.toContain('dashboard.kpi.noData')
  })

  it('shows the no-data placeholder before the fetch resolves, never a raw 0 masquerading as a real total', async () => {
    let resolveFetch: (value: ReturnType<typeof metricsResponse>) => void = () => {}
    const pending = new Promise<ReturnType<typeof metricsResponse>>((resolve) => {
      resolveFetch = resolve
    })
    vi.doMock('../../app/composables/useDashboardMetrics', () => ({
      useDashboardMetrics: () => ({ fetchMetrics: vi.fn().mockReturnValue(pending) }),
    }))

    const IndexPage = (await import('../../app/pages/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })

    expect(wrapper.text()).toContain('dashboard.kpi.noData')

    resolveFetch(metricsResponse())
    await flushPromises()
  })
})

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
