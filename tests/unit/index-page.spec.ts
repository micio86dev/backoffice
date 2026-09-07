/**
 * pages/index.vue — dashboard (PR B2, task 17.5 — RED for the KPI section;
 * the i18n-labelled heading test is the pre-existing B1 baseline, kept
 * green throughout).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const tMock = vi.fn((key: string) => (key === 'dashboard.title' ? 'Dashboard' : key))

/**
 * @param inCorso lets a test tell two responses apart — the stale-load test
 *   needs the slow one and the fresh one to be distinguishable on screen.
 */
function metricsResponse(inCorso = 2) {
  return {
    data: {
      participants_by_status: { in_corso: inCorso, completato: 3 },
      evaluations_by_status: { completato: 3 },
      completion_rate: 0.6,
      ai_usage: {
        input_tokens: 1000,
        output_tokens: 2000,
        latency_ms_p50: 500,
        latency_ms_p95: 900,
      },
      costs: {
        scoring_usd: 1.25,
        conversation_usd: 0.5,
        total_usd: 1.75,
        currency: 'USD',
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
        costs: { scoring_usd: 0, conversation_usd: 0, total_usd: 0, currency: 'USD' },
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

  it('drops a previous failure when a new read starts, instead of showing it over the retry', async () => {
    // `statusKey` checks `failure` before `loading`, and `v-if="loadError"`
    // wins over `v-else-if="loading"`. Clearing the failure only on SUCCESS
    // therefore kept "You do not have permission" on screen for the entire
    // in-flight retry — stale state outranking the fresh read, which is the
    // defect the loading state was added to fix, one variable over.
    let resolveSecond: (value: ReturnType<typeof metricsResponse>) => void = () => {}
    const second = new Promise<ReturnType<typeof metricsResponse>>((resolve) => {
      resolveSecond = resolve
    })
    const fetchMetricsMock = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 403 } })
      .mockReturnValueOnce(second)

    vi.doMock('../../app/composables/useDashboardMetrics', () => ({
      useDashboardMetrics: () => ({
        fetchMetrics: fetchMetricsMock,
        fetchActivity: vi.fn().mockResolvedValue({ data: [] }),
      }),
    }))

    const IndexPage = (await import('../../app/pages/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.find('[data-testid="dashboard-error"]').exists()).toBe(true)

    wrapper.findComponent({ name: 'DashboardFilters' }).vm.$emit('change', { from: '2026-01-01' })
    await flushPromises()

    expect(wrapper.find('[data-testid="dashboard-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="dashboard-loading"]').exists()).toBe(true)

    resolveSecond(metricsResponse())
    await flushPromises()
  })

  it('renders the KPI tiles as soon as the metrics land, without waiting on the feed', async () => {
    // The two flags were one. `loading = false` sat in the outer finally, after
    // the awaited activity fetch, so a slow secondary panel held counters that
    // had already resolved as skeletons — the same "a secondary panel must not
    // hold the dashboard hostage" rule the swallowed catch is built on, one
    // await too late.
    let resolveActivity: (value: { data: [] }) => void = () => {}
    const pendingActivity = new Promise<{ data: [] }>((resolve) => {
      resolveActivity = resolve
    })
    vi.doMock('../../app/composables/useDashboardMetrics', () => ({
      useDashboardMetrics: () => ({
        fetchMetrics: vi.fn().mockResolvedValue(metricsResponse()),
        fetchActivity: vi.fn().mockReturnValue(pendingActivity),
      }),
    }))

    const IndexPage = (await import('../../app/pages/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.find('[data-testid="dashboard-loading"]').exists()).toBe(false)
    // 2 in_corso + 3 completato — the tile is addressed directly rather than
    // searching the page text, where a bare '5' also appears inside '500 ms'.
    expect(wrapper.get('[data-testid="dashboard-total-participants"]').text()).toContain('5')
    // ...while the feed is still honestly saying it is loading.
    expect(wrapper.find('[data-testid="activity-loading"]').exists()).toBe(true)

    resolveActivity({ data: [] })
    await flushPromises()
  })

  it('shows a loading state before the fetch resolves — neither a raw 0 nor a claim of no data', async () => {
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

    // This used to assert `noData`, and asserting it was the defect: "No data
    // available" is a claim about the operator's numbers, made before anything
    // had been read. A raw 0 would have been worse; a loading state is the only
    // one of the three that is TRUE while the request is in flight.
    expect(wrapper.find('[data-testid="dashboard-loading"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('dashboard.kpi.noData')
    expect(wrapper.text()).not.toContain('dashboard.activity.empty')

    resolveFetch(metricsResponse())
    await flushPromises()

    // And it clears — a spinner that never resolves is its own defect.
    expect(wrapper.find('[data-testid="dashboard-loading"]').exists()).toBe(false)
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

      // Each percentile carries its own UNIT now, so `latencyValue` joins two
      // already-complete phrases rather than two bare numbers followed by a
      // trailing `ms`. That trailing unit is what produced "not measured / not
      // measured ms" the moment a percentile was null — the unit has to travel
      // with a number or not at all.
      expect(composableTMock).toHaveBeenCalledWith('dashboard.kpi.latencyMs', { value: '500' })
      expect(composableTMock).toHaveBeenCalledWith('dashboard.kpi.latencyMs', { value: '900' })
      expect(composableTMock).toHaveBeenCalledWith('dashboard.kpi.latencyValue', {
        p50: 'dashboard.kpi.latencyMs',
        p95: 'dashboard.kpi.latencyMs',
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
    // The feed SAYS it failed. This line asserted `activity-empty` — it pinned
    // the defect as the requirement: a 403 or a 500 rendered "No candidates
    // yet. They appear here as soon as the calling system creates one.", an
    // affirmative claim about the operator's own data made without having read
    // it. Swallowing the rejection so the counters survive is right; laundering
    // it into a success-looking empty state is the exact failure
    // `error-state.ts`'s docblock names.
    expect(wrapper.find('[data-testid="activity-failed"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="activity-empty"]').exists()).toBe(false)
  })

  it('renders the activity rows the API returns', async () => {
    vi.doMock('../../app/composables/useDashboardMetrics', () => ({
      useDashboardMetrics: () => ({
        fetchMetrics: vi.fn().mockResolvedValue(metricsResponse()),
        fetchActivity: vi.fn().mockResolvedValue({
          data: [
            {
              id: 42,
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

describe('IndexPage — cost KPI', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useHead', vi.fn())
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: tMock, locale: ref('en') }))
    )
  })

  it('shows the total spend AND what it is made of', async () => {
    // An operator asking what their assessments cost was being answered in
    // tokens, which is not the question. The breakdown is not decoration: the
    // two halves behave differently — scoring is per completed evaluation and
    // predictable, conversation is per minute of interview and is the one that
    // moves when candidates talk longer.
    vi.doMock('../../app/composables/useDashboardMetrics', () => ({
      useDashboardMetrics: () => ({
        fetchMetrics: vi.fn().mockResolvedValue(metricsResponse()),
        fetchActivity: vi.fn().mockResolvedValue({ data: [] }),
      }),
    }))

    const IndexPage = (await import('../../app/pages/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.text()).toContain('dashboard.kpi.cost')
    // `currency` comes from the API rather than a symbol baked into the i18n
    // string. `useDashboardMetrics` types `costs.currency` and its docblock
    // says it is "carried rather than assumed"; the page assumed anyway, in
    // both locales, on a figure an operator may reconcile against an invoice.
    expect(tMock).toHaveBeenCalledWith('dashboard.kpi.costValue', {
      currency: 'USD',
      usd: '1.75',
    })
    expect(tMock).toHaveBeenCalledWith('dashboard.kpi.costBreakdown', {
      currency: 'USD',
      scoring: '1.25',
      conversation: '0.50',
    })
  })

  it('reports zero as a number, never as a blank', async () => {
    // A blank where a figure belongs reads as "we do not know". Zero is a
    // fact, and the right one for a tenant that has run nothing.
    vi.doMock('../../app/composables/useDashboardMetrics', () => ({
      useDashboardMetrics: () => ({
        fetchMetrics: vi.fn().mockResolvedValue({
          data: {
            participants_by_status: {},
            evaluations_by_status: {},
            completion_rate: 0,
            ai_usage: {
              input_tokens: 0,
              output_tokens: 0,
              latency_ms_p50: null,
              latency_ms_p95: null,
            },
            costs: { scoring_usd: 0, conversation_usd: 0, total_usd: 0, currency: 'USD' },
          },
        }),
        fetchActivity: vi.fn().mockResolvedValue({ data: [] }),
      }),
    }))

    const IndexPage = (await import('../../app/pages/index.vue')).default
    mount(IndexPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(tMock).toHaveBeenCalledWith('dashboard.kpi.costValue', {
      currency: 'USD',
      usd: '0.00',
    })
  })

  it('drops a stale load, so the numbers never describe a period the filter is not showing', async () => {
    // Change year, then month quickly: two loads are in flight. Without
    // sequencing whichever resolves LAST wins, so the slower OLDER range
    // overwrites the newer one and the filter confidently shows a period the
    // counters are not describing. The shared `range` stops the two PANELS
    // disagreeing with each other; it never addressed either disagreeing with
    // the filter.
    let resolveFirst: (v: unknown) => void = () => {}
    const first = new Promise((r) => {
      resolveFirst = r
    })

    const fetchMetrics = vi
      .fn()
      // The first call hangs until we release it — the SLOW, STALE one.
      .mockImplementationOnce(() => first.then(() => metricsResponse(1)))
      // The second resolves immediately — the NEWER one the operator asked for.
      .mockResolvedValue(metricsResponse(999))

    vi.doMock('../../app/composables/useDashboardMetrics', () => ({
      useDashboardMetrics: () => ({
        fetchMetrics,
        fetchActivity: vi.fn().mockResolvedValue({ data: [] }),
      }),
    }))

    const IndexPage = (await import('../../app/pages/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })

    // Second load starts while the first is still pending.
    wrapper.findComponent({ name: 'DashboardFilters' }).vm.$emit('change', { from: '2025-01-01' })
    await flushPromises()

    // Now let the stale one land. It must NOT overwrite.
    resolveFirst(null)
    await flushPromises()

    // 999 + 3 completed = 1002 total participants, the FRESH answer.
    // The stale one would render 1 + 3 = 4.
    expect(fetchMetrics).toHaveBeenCalledTimes(2)
    const text = wrapper.text().replace(/[\u202F\u00A0.,]/g, '')
    expect(text).toContain('1002')
    expect(text).not.toContain('dashboard.kpi.totalParticipants4')
  })

  it('renders a missing latency without inheriting the unit', async () => {
    // Asserted on the RENDERED SENTENCE, not on the $t call. The existing
    // latency test checks only that the translator was invoked with the right
    // params, and the mock echoes the key back — so "not measured / not
    // measured ms", produced by interpolating the missing-value label into a
    // slot the unit followed, was invisible to it.
    //
    // Stubs `useI18n`, not `$t`: the computed reads `t` from the composable,
    // and a template mock would never have been consulted.
    const translate = (key: string, params?: Record<string, unknown>): string => {
      if (key === 'dashboard.kpi.notMeasured') return 'not measured'
      if (key === 'dashboard.kpi.latencyMs') return `${params?.value} ms`
      if (key === 'dashboard.kpi.latencyValue') return `${params?.p50} / ${params?.p95}`
      return key
    }
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: translate, locale: ref('en') }))
    )

    vi.doMock('../../app/composables/useDashboardMetrics', () => ({
      useDashboardMetrics: () => ({
        fetchMetrics: vi.fn().mockResolvedValue({
          data: {
            participants_by_status: { in_attesa: 1 },
            evaluations_by_status: {},
            completion_rate: 0,
            ai_usage: {
              input_tokens: 0,
              output_tokens: 0,
              latency_ms_p50: null,
              latency_ms_p95: null,
            },
            costs: { scoring_usd: 0, conversation_usd: 0, total_usd: 0, currency: 'USD' },
          },
        }),
        fetchActivity: vi.fn().mockResolvedValue({ data: [] }),
      }),
    }))

    const IndexPage = (await import('../../app/pages/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.text()).toContain('not measured / not measured')
    expect(wrapper.text()).not.toContain('not measured ms')
  })
})
