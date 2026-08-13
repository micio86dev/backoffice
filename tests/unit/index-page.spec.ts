/**
 * pages/index.vue — dashboard (PR B2, task 17.5 — RED for the KPI section;
 * the i18n-labelled heading test is the pre-existing B1 baseline, kept
 * green throughout).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
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

function httpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

// Identity `t` — assertions are made on the KEY, so a hardcoded literal in the
// component cannot satisfy them.
const composableTMock = vi.fn((key: string) => key)
let useHeadMock: ReturnType<typeof vi.fn>

describe('IndexPage (dashboard)', () => {
  beforeEach(() => {
    vi.resetModules()
    tMock.mockClear()
    composableTMock.mockClear()
    useHeadMock = vi.fn()
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useHead', useHeadMock)
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: composableTMock, locale: ref('en') }))
    )
  })

  it('renders an i18n-labelled heading', async () => {
    vi.doMock('../../app/composables/useDashboardMetrics', () => ({
      useDashboardMetrics: () => ({
        fetchMetrics: vi.fn().mockResolvedValue(metricsResponse()),
        fetchActivity: vi.fn().mockResolvedValue({ data: [] }),
      }),
    }))
    const IndexPage = (await import('../../app/pages/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    expect(wrapper.find('h1').text()).toBe('Dashboard')
  })

  it('fetches dashboard metrics on mount and renders the total-participants KPI card', async () => {
    const fetchMetricsMock = vi.fn().mockResolvedValue(metricsResponse())
    vi.doMock('../../app/composables/useDashboardMetrics', () => ({
      useDashboardMetrics: () => ({
        fetchMetrics: fetchMetricsMock,
        fetchActivity: vi.fn().mockResolvedValue({ data: [] }),
      }),
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
      useDashboardMetrics: () => ({
        fetchMetrics: fetchMetricsMock,
        fetchActivity: vi.fn().mockResolvedValue({ data: [] }),
      }),
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
      useDashboardMetrics: () => ({
        fetchMetrics: vi.fn().mockReturnValue(pending),
        fetchActivity: vi.fn().mockResolvedValue({ data: [] }),
      }),
    }))

    const IndexPage = (await import('../../app/pages/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })

    expect(wrapper.text()).toContain('dashboard.kpi.noData')

    resolveFetch(metricsResponse())
    await flushPromises()
  })

  describe('page title (i18n)', () => {
    it('routes the <title> through i18n instead of a hardcoded English literal', async () => {
      vi.doMock('../../app/composables/useDashboardMetrics', () => ({
        useDashboardMetrics: () => ({
          fetchMetrics: vi.fn().mockResolvedValue(metricsResponse()),
          fetchActivity: vi.fn().mockResolvedValue({ data: [] }),
        }),
      }))
      const IndexPage = (await import('../../app/pages/index.vue')).default
      mount(IndexPage, { global: { mocks: { $t: tMock } } })

      const head = useHeadMock.mock.calls[0]?.[0] as { title?: () => string }
      expect(typeof head?.title).toBe('function')
      expect(head?.title?.()).toBe('head.title.dashboard')
    })
  })

  describe('latency KPI (i18n)', () => {
    it('routes the latency value through i18n — the unit and separator are copy, not code', async () => {
      const fetchMetricsMock = vi.fn().mockResolvedValue(metricsResponse())
      vi.doMock('../../app/composables/useDashboardMetrics', () => ({
        useDashboardMetrics: () => ({
          fetchMetrics: fetchMetricsMock,
          fetchActivity: vi.fn().mockResolvedValue({ data: [] }),
        }),
      }))

      const IndexPage = (await import('../../app/pages/index.vue')).default
      const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
      await flushPromises()

      // The formatted percentiles still reach the message as parameters…
      expect(composableTMock).toHaveBeenCalledWith('dashboard.kpi.latencyValue', {
        p50: '500',
        p95: '900',
      })
      // …and the rendered value is the i18n key, never a hand-built
      // `${p50} / ${p95} ms` template literal.
      expect(wrapper.text()).toContain('dashboard.kpi.latencyValue')
      expect(wrapper.text()).not.toContain('500 / 900 ms')
      expect(wrapper.text()).not.toContain(' ms')
    })
  })

  describe('failed metrics fetch (D4 — a failure must never render as an empty state)', () => {
    it.each([
      [403, 'errors.states.forbidden', ['errors.states.notFound', 'errors.states.notReady']],
      [404, 'errors.states.notFound', ['errors.states.forbidden', 'errors.states.notReady']],
      [409, 'errors.states.notReady', ['errors.states.forbidden', 'errors.states.notFound']],
      [500, 'errors.states.error', ['errors.states.forbidden', 'errors.states.notFound']],
    ])(
      'renders the %i state distinctly, never the no-data placeholder',
      async (status, expectedKey, otherKeys) => {
        vi.doMock('../../app/composables/useDashboardMetrics', () => ({
          useDashboardMetrics: () => ({
            fetchMetrics: vi.fn().mockRejectedValue(httpError(status as number)),
          }),
        }))

        const IndexPage = (await import('../../app/pages/index.vue')).default
        const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
        await flushPromises()

        const alert = wrapper.find('[data-testid="dashboard-error"]')
        expect(alert.exists()).toBe(true)
        expect(wrapper.text()).toContain(`${expectedKey}.title`)
        expect(wrapper.text()).toContain(`${expectedKey}.message`)
        // A 403 reported as "no data yet" is the bug this test exists for.
        expect(wrapper.text()).not.toContain('dashboard.kpi.noData')
        // The four states must stay distinct — collapsing them fails here.
        for (const otherKey of otherKeys as string[]) {
          expect(wrapper.text()).not.toContain(`${otherKey}.title`)
        }
      }
    )

    it('marks 409 as non-destructive and 403 as destructive (409 is "not ready", not a failure)', async () => {
      async function mountWithStatus(status: number) {
        vi.resetModules()
        vi.doMock('../../app/composables/useDashboardMetrics', () => ({
          useDashboardMetrics: () => ({
            fetchMetrics: vi.fn().mockRejectedValue(httpError(status)),
          }),
        }))
        const IndexPage = (await import('../../app/pages/index.vue')).default
        const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
        await flushPromises()
        return wrapper.find('[data-testid="dashboard-error"]')
      }

      const notReady = await mountWithStatus(409)
      const forbidden = await mountWithStatus(403)

      expect(notReady.attributes('data-state')).toBe('not-ready')
      expect(forbidden.attributes('data-state')).toBe('forbidden')
      expect(notReady.attributes('data-state')).not.toBe(forbidden.attributes('data-state'))
    })
  })

  // The activity feed is SECONDARY content. The KPI cards are what the
  // dashboard is for, and failing the whole page because a side panel could not
  // load reports the wrong problem: the operator reads "the dashboard is
  // broken" when the truth is "one panel is".
  it('still renders the KPI cards when the activity request fails', async () => {
    vi.doMock('../../app/composables/useDashboardMetrics', () => ({
      useDashboardMetrics: () => ({
        fetchMetrics: vi.fn().mockResolvedValue(metricsResponse()),
        fetchActivity: vi.fn().mockRejectedValue(new Error('boom')),
      }),
    }))

    const IndexPage = (await import('../../app/pages/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.find('[data-testid="dashboard-error"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('dashboard.kpi.totalParticipants')
    expect(wrapper.find('[data-testid="activity-empty"]').exists()).toBe(true)
  })

  it('renders the activity rows the API returns', async () => {
    vi.doMock('../../app/composables/useDashboardMetrics', () => ({
      useDashboardMetrics: () => ({
        fetchMetrics: vi.fn().mockResolvedValue(metricsResponse()),
        fetchActivity: vi.fn().mockResolvedValue({
          data: [
            {
              candidate_ref: 'ref-1',
              display_name: 'Mario Rossi',
              status: 'in_corso',
              project_name: 'Demo Project',
              updated_at: '2026-03-01T10:00:00+00:00',
            },
          ],
        }),
      }),
    }))

    const IndexPage = (await import('../../app/pages/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.find('[data-testid="activity-list"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Mario Rossi')
  })
})

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
