/**
 * pages/clients/index.vue (superadmin-clients-console, Phase 12 — RED).
 *
 * Container: fetches via useSuperadmin().fetchClientOverview(), passes the
 * result down to ClientTable. Same D4/D7 discipline as
 * participants/index.vue: a failed fetch renders the Alert and MUST NOT fall
 * through to the table's empty state — "no clients yet" and "we could not
 * ask" are different facts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const tMock = (key: string) => key

function overviewResponse() {
  return {
    data: [
      {
        id: 2,
        name: 'Acme',
        created_at: '2026-01-01T00:00:00Z',
        projects: 3,
        candidates: 10,
        completed: 7,
        errored: 1,
        last_activity_at: '2026-03-01T00:00:00Z',
      },
    ],
    acting_organization_id: null,
  }
}

function emptyOverviewResponse() {
  return { data: [], acting_organization_id: null }
}

function httpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

let useHeadMock: ReturnType<typeof vi.fn>

describe('pages/clients/index.vue', () => {
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

  it('fetches the overview on mount and renders every client', async () => {
    const fetchClientOverviewMock = vi.fn().mockResolvedValue(overviewResponse())
    vi.doMock('../../../app/composables/useSuperadmin', () => ({
      useSuperadmin: () => ({ fetchClientOverview: fetchClientOverviewMock }),
    }))

    const ClientsPage = (await import('../../../app/pages/clients/index.vue')).default
    const wrapper = mount(ClientsPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(fetchClientOverviewMock).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('Acme')
    expect(wrapper.find('[data-testid="clients-error"]').exists()).toBe(false)
  })

  it('renders ClientTable (which itself renders TableEmpty) for a genuinely empty estate, not the error state', async () => {
    const fetchClientOverviewMock = vi.fn().mockResolvedValue(emptyOverviewResponse())
    vi.doMock('../../../app/composables/useSuperadmin', () => ({
      useSuperadmin: () => ({ fetchClientOverview: fetchClientOverviewMock }),
    }))

    const ClientsPage = (await import('../../../app/pages/clients/index.vue')).default
    const wrapper = mount(ClientsPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.find('[data-testid="clients-table-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="clients-error"]').exists()).toBe(false)
  })

  it('routes the <title> through i18n instead of a hardcoded English literal', async () => {
    vi.doMock('../../../app/composables/useSuperadmin', () => ({
      useSuperadmin: () => ({ fetchClientOverview: vi.fn().mockResolvedValue(overviewResponse()) }),
    }))

    const ClientsPage = (await import('../../../app/pages/clients/index.vue')).default
    mount(ClientsPage, { global: { mocks: { $t: tMock } } })

    const head = useHeadMock.mock.calls[0]?.[0] as { title?: () => string }
    expect(typeof head?.title).toBe('function')
    expect(head?.title?.()).toBe('head.title.clients')
  })

  describe('a failed fetch must never fall through to the empty state (D7)', () => {
    async function mountWithStatus(status: number) {
      vi.doMock('../../../app/composables/useSuperadmin', () => ({
        useSuperadmin: () => ({
          fetchClientOverview: vi.fn().mockRejectedValue(httpError(status)),
        }),
      }))

      const ClientsPage = (await import('../../../app/pages/clients/index.vue')).default
      const wrapper = mount(ClientsPage, { global: { mocks: { $t: tMock } } })
      await flushPromises()
      return wrapper
    }

    it('renders the Alert with data-state="error" for a generic failure, and never the table', async () => {
      const wrapper = await mountWithStatus(500)

      const alert = wrapper.find('[data-testid="clients-error"]')
      expect(alert.exists()).toBe(true)
      expect(alert.attributes('data-state')).toBe('error')
      expect(wrapper.text()).toContain('errors.states.error.title')
      expect(wrapper.text()).toContain('errors.states.error.message')
      expect(wrapper.find('[data-testid="clients-table"]').exists()).toBe(false)
      // Not indistinguishable from a genuinely empty estate.
      expect(wrapper.find('[data-testid="clients-table-empty"]').exists()).toBe(false)
    })

    it('renders 403 distinctly as forbidden', async () => {
      const wrapper = await mountWithStatus(403)

      expect(wrapper.find('[data-testid="clients-error"]').attributes('data-state')).toBe(
        'forbidden'
      )
    })

    it('renders 404 distinctly as not-found', async () => {
      const wrapper = await mountWithStatus(404)

      expect(wrapper.find('[data-testid="clients-error"]').attributes('data-state')).toBe(
        'not-found'
      )
    })

    it('renders 409 as not-ready, and NOT as a destructive error', async () => {
      // The 409 branch had no test at all, and the ternary that implements it
      // is the only 409-specific behaviour on this page: collapsing it to a
      // flat `variant="destructive"` — the exact collapse D4 forbids — left
      // every test green.
      //
      // A 409 is temporal and self-resolving. Painting it in the destructive
      // variant tells a platform operator something broke when the honest
      // answer is "not yet".
      const wrapper = await mountWithStatus(409)
      const alert = wrapper.find('[data-testid="clients-error"]')

      expect(alert.attributes('data-state')).toBe('not-ready')
      // The variant is what carries the distinction visually, so assert it
      // rather than the state alone: `data-state` could be right while the
      // alert still rendered red.
      expect(alert.classes().join(' ')).not.toContain('destructive')
    })
  })
})
