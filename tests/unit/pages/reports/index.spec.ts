/**
 * pages/reports/index.vue (Unit 7, task 27.6 — RED)
 *
 * Filters wired to `useEvaluations`, `resolveResourceErrorState` error
 * mapping, lazy summary panel (D10).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// Pre-warm the lazily-loaded ReportSummary panel — see
// `pages/settings/index.spec.ts` for why this is needed alongside
// `vi.resetModules()`.
await import('../../../../app/components/organisms/ReportSummary.vue')

const tMock = (key: string) => key

function indexResponse() {
  return {
    data: [
      {
        participant_id: '1',
        candidate_ref: 'ref-001',
        display_name: 'Mario Rossi',
        project_id: '1',
        project_name: 'Demo Project',
        assessment_type: 'standard',
        role_code: 'FLL',
        evaluated_at: '2026-03-14T10:00:00Z',
        status: 'completed',
        reliability: '83%',
      },
    ],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, from: 1, path: '', per_page: 20, to: 1 },
  }
}

function summaryResponse() {
  return { data: { by_status: { completed: 1, pending: 0 }, competencies: [] } }
}

function httpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

let useHeadMock: ReturnType<typeof vi.fn>

describe('pages/reports/index.vue', () => {
  beforeEach(() => {
    vi.resetModules()
    useHeadMock = vi.fn()
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useHead', useHeadMock)
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: (key: string) => key, locale: ref('en') }))
    )
  })

  afterEach(() => {
    // `vi.doMock` registrations outlive the test: drop them so a later
    // test (or file section) never inherits another test's composable mocks.
    vi.doUnmock('../../../../app/composables/useEvaluations')
    vi.doUnmock('../../../../app/composables/useProjects')
    vi.resetModules()
  })

  it('fetches the index and summary on mount and renders the returned rows', async () => {
    const indexMock = vi.fn().mockResolvedValue(indexResponse())
    const summaryMock = vi.fn().mockResolvedValue(summaryResponse())
    vi.doMock('../../../../app/composables/useEvaluations', () => ({
      useEvaluations: () => ({ index: indexMock, summary: summaryMock }),
    }))
    vi.doMock('../../../../app/composables/useProjects', () => ({
      useProjects: () => ({ listProjects: vi.fn().mockResolvedValue({ data: [] }) }),
    }))

    const ReportsPage = (await import('../../../../app/pages/reports/index.vue')).default
    const wrapper = mount(ReportsPage, {
      global: {
        mocks: { $t: tMock },
        stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    })
    await flushPromises()

    expect(indexMock).toHaveBeenCalledWith({})
    expect(summaryMock).toHaveBeenCalledWith({})
    expect(wrapper.text()).toContain('Demo Project')
  })

  it('routes the <title> through i18n instead of a hardcoded English literal', async () => {
    vi.doMock('../../../../app/composables/useEvaluations', () => ({
      useEvaluations: () => ({
        index: vi.fn().mockResolvedValue(indexResponse()),
        summary: vi.fn().mockResolvedValue(summaryResponse()),
      }),
    }))
    vi.doMock('../../../../app/composables/useProjects', () => ({
      useProjects: () => ({ listProjects: vi.fn().mockResolvedValue({ data: [] }) }),
    }))

    const ReportsPage = (await import('../../../../app/pages/reports/index.vue')).default
    mount(ReportsPage, {
      global: {
        mocks: { $t: tMock },
        stubs: { NuxtLink: true },
      },
    })

    const head = useHeadMock.mock.calls[0]?.[0] as { title?: () => string }
    expect(typeof head?.title).toBe('function')
    expect(head?.title?.()).toBe('head.title.reports')
  })

  it('re-fetches both the index and the summary with the new filters when they change', async () => {
    const indexMock = vi.fn().mockResolvedValue(indexResponse())
    const summaryMock = vi.fn().mockResolvedValue(summaryResponse())
    vi.doMock('../../../../app/composables/useEvaluations', () => ({
      useEvaluations: () => ({ index: indexMock, summary: summaryMock }),
    }))
    vi.doMock('../../../../app/composables/useProjects', () => ({
      useProjects: () => ({ listProjects: vi.fn().mockResolvedValue({ data: [] }) }),
    }))

    const ReportsPage = (await import('../../../../app/pages/reports/index.vue')).default
    const ReportFilters = (await import('../../../../app/components/molecules/ReportFilters.vue'))
      .default
    const wrapper = mount(ReportsPage, {
      global: { mocks: { $t: tMock }, stubs: { NuxtLink: true } },
    })
    await flushPromises()

    wrapper.findComponent(ReportFilters).vm.$emit('update:modelValue', { project_id: 7 })
    await flushPromises()

    expect(indexMock).toHaveBeenCalledTimes(2)
    expect(indexMock).toHaveBeenLastCalledWith({ project_id: 7 })
    expect(summaryMock).toHaveBeenLastCalledWith({ project_id: 7 })
  })

  it('still renders the report when the project list for the filter fails', async () => {
    vi.doMock('../../../../app/composables/useEvaluations', () => ({
      useEvaluations: () => ({
        index: vi.fn().mockResolvedValue(indexResponse()),
        summary: vi.fn().mockResolvedValue(summaryResponse()),
      }),
    }))
    vi.doMock('../../../../app/composables/useProjects', () => ({
      useProjects: () => ({ listProjects: vi.fn().mockRejectedValue(httpError(500)) }),
    }))

    const ReportsPage = (await import('../../../../app/pages/reports/index.vue')).default
    const wrapper = mount(ReportsPage, {
      global: { mocks: { $t: tMock }, stubs: { NuxtLink: true } },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="reports-error"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Demo Project')
  })

  it('refetches both endpoints with the filters ReportFilters emits', async () => {
    const indexMock = vi.fn().mockResolvedValue(indexResponse())
    const summaryMock = vi.fn().mockResolvedValue(summaryResponse())
    vi.doMock('../../../../app/composables/useEvaluations', () => ({
      useEvaluations: () => ({ index: indexMock, summary: summaryMock }),
    }))
    vi.doMock('../../../../app/composables/useProjects', () => ({
      useProjects: () => ({ listProjects: vi.fn().mockResolvedValue({ data: [] }) }),
    }))

    const ReportsPage = (await import('../../../../app/pages/reports/index.vue')).default
    const ReportFilters = (await import('../../../../app/components/molecules/ReportFilters.vue'))
      .default
    const wrapper = mount(ReportsPage, {
      global: { mocks: { $t: tMock }, stubs: { NuxtLink: true } },
    })
    await flushPromises()

    wrapper.findComponent(ReportFilters).vm.$emit('update:modelValue', { project_id: 7 })
    await flushPromises()

    expect(indexMock).toHaveBeenLastCalledWith({ project_id: 7 })
    expect(summaryMock).toHaveBeenLastCalledWith({ project_id: 7 })
  })

  it('clears a previous error once a later fetch succeeds', async () => {
    const indexMock = vi
      .fn()
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValue(indexResponse())
    vi.doMock('../../../../app/composables/useEvaluations', () => ({
      useEvaluations: () => ({
        index: indexMock,
        summary: vi.fn().mockResolvedValue(summaryResponse()),
      }),
    }))
    vi.doMock('../../../../app/composables/useProjects', () => ({
      useProjects: () => ({ listProjects: vi.fn().mockResolvedValue({ data: [] }) }),
    }))

    const ReportsPage = (await import('../../../../app/pages/reports/index.vue')).default
    const wrapper = mount(ReportsPage, {
      global: { mocks: { $t: tMock }, stubs: { NuxtLink: true } },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="reports-error"]').exists()).toBe(true)

    // Direct state write; the real ReportFilters emit path in the error state is
    // covered in 'error state keeps the filters usable' below.
    const vm = wrapper.vm as unknown as { filters: Record<string, unknown> }
    vm.filters = { project_id: 1 }
    await flushPromises()

    expect(wrapper.find('[data-testid="reports-error"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Demo Project')
  })

  describe('failed index fetch (D4 — a failure must never render as an empty result set)', () => {
    async function mountWithStatus(status: number) {
      vi.doMock('../../../../app/composables/useEvaluations', () => ({
        useEvaluations: () => ({
          index: vi.fn().mockRejectedValue(httpError(status)),
          summary: vi.fn().mockResolvedValue(summaryResponse()),
        }),
      }))
      vi.doMock('../../../../app/composables/useProjects', () => ({
        useProjects: () => ({ listProjects: vi.fn().mockResolvedValue({ data: [] }) }),
      }))

      const ReportsPage = (await import('../../../../app/pages/reports/index.vue')).default
      const wrapper = mount(ReportsPage, {
        global: { mocks: { $t: tMock }, stubs: { NuxtLink: true } },
      })
      await flushPromises()
      return wrapper
    }

    it.each([
      [403, 'errors.states.forbidden'],
      [404, 'errors.states.notFound'],
      [409, 'errors.states.notReady'],
      [500, 'errors.states.error'],
    ])('renders the %i state distinctly, never the table empty state', async (status, key) => {
      const wrapper = await mountWithStatus(status as number)

      expect(wrapper.find('[data-testid="reports-error"]').exists()).toBe(true)
      expect(wrapper.text()).toContain(`${key}.title`)
      expect(wrapper.text()).not.toContain('reports.table.empty')
    })
  })
  describe('error state keeps the filters usable', () => {
    async function mountFailingOnce() {
      const indexMock = vi
        .fn()
        .mockRejectedValueOnce(httpError(500))
        .mockResolvedValue(indexResponse())
      const summaryMock = vi.fn().mockResolvedValue(summaryResponse())
      vi.doMock('../../../../app/composables/useEvaluations', () => ({
        useEvaluations: () => ({ index: indexMock, summary: summaryMock }),
      }))
      vi.doMock('../../../../app/composables/useProjects', () => ({
        useProjects: () => ({ listProjects: vi.fn().mockResolvedValue({ data: [] }) }),
      }))
      const ReportsPage = (await import('../../../../app/pages/reports/index.vue')).default
      const ReportFilters = (await import('../../../../app/components/molecules/ReportFilters.vue'))
        .default
      const wrapper = mount(ReportsPage, {
        global: { mocks: { $t: tMock }, stubs: { NuxtLink: true } },
      })
      await flushPromises()
      return { wrapper, ReportFilters, indexMock, summaryMock }
    }

    it('shows the error alert while the filter bar stays rendered', async () => {
      const { wrapper, ReportFilters } = await mountFailingOnce()

      expect(wrapper.find('[data-testid="reports-error"]').exists()).toBe(true)
      expect(wrapper.findComponent(ReportFilters).exists()).toBe(true)
    })

    it('retry re-fetches both endpoints and clears the error on success', async () => {
      const { wrapper, indexMock, summaryMock } = await mountFailingOnce()

      await wrapper.get('[data-testid="reports-retry"]').trigger('click')
      await flushPromises()

      expect(indexMock).toHaveBeenCalledTimes(2)
      expect(summaryMock).toHaveBeenCalledTimes(2)
      expect(wrapper.find('[data-testid="reports-error"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Demo Project')
    })

    it('disables the retry while a load is in flight, so a second click starts no second request', async () => {
      const { wrapper, indexMock } = await mountFailingOnce()
      let release!: (value: ReturnType<typeof indexResponse>) => void
      indexMock.mockReset().mockReturnValue(new Promise((resolve) => (release = resolve)))

      const retry = wrapper.get('[data-testid="reports-retry"]')
      await retry.trigger('click')
      await retry.trigger('click')

      expect(indexMock).toHaveBeenCalledTimes(1)
      expect(retry.attributes('disabled')).toBeDefined()

      release(indexResponse())
      await flushPromises()
      expect(wrapper.find('[data-testid="reports-error"]').exists()).toBe(false)
    })

    it('ignores a stale failed response that settles after a newer success', async () => {
      const { wrapper, ReportFilters, indexMock } = await mountFailingOnce()
      let failStale!: (reason: unknown) => void
      indexMock
        .mockReset()
        .mockReturnValueOnce(new Promise((_, reject) => (failStale = reject)))
        .mockResolvedValueOnce(indexResponse())

      await wrapper.get('[data-testid="reports-retry"]').trigger('click')
      wrapper.findComponent(ReportFilters).vm.$emit('update:modelValue', { project_id: 3 })
      await flushPromises()
      expect(wrapper.find('[data-testid="reports-error"]').exists()).toBe(false)

      failStale(httpError(500))
      await flushPromises()

      expect(wrapper.find('[data-testid="reports-error"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Demo Project')
    })

    it('still renders the table when the summary response carries no data field', async () => {
      const { wrapper, indexMock, summaryMock } = await mountFailingOnce()
      summaryMock.mockReset().mockResolvedValue({})
      indexMock.mockReset().mockResolvedValue(indexResponse())

      await wrapper.get('[data-testid="reports-retry"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="reports-error"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Demo Project')
    })

    it('a filter changed through the real ReportFilters in the error state refetches and clears the error', async () => {
      const { wrapper, indexMock, summaryMock } = await mountFailingOnce()

      await wrapper.get('[data-testid="report-filter-assessment-type"]').setValue('potential')
      await flushPromises()

      expect(indexMock).toHaveBeenCalledTimes(2)
      expect(indexMock).toHaveBeenLastCalledWith({ assessment_type: 'potential' })
      expect(summaryMock).toHaveBeenLastCalledWith({ assessment_type: 'potential' })
      expect(wrapper.find('[data-testid="reports-error"]').exists()).toBe(false)
    })
  })
})
