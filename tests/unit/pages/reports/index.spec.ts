/**
 * pages/reports/index.vue (Unit 7, task 27.6 — RED)
 *
 * Filters wired to `useEvaluations`, `resolveResourceErrorState` error
 * mapping, lazy summary panel (D10).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
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
    expect(wrapper.text()).toContain('Mario Rossi')
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
})
