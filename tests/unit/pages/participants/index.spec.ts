/**
 * pages/participants/index.vue (PR B2, task 17.4 — RED)
 *
 * Container: fetches via useParticipants(), passes results down to the
 * presentational CandidateTable, refetches on filter/page change. Spec
 * scenario: "Participant list is server-paginated" — page 2 issues a fresh
 * authorized query, never a client-side slice of a superset.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const tMock = (key: string) => key

function listResponse(page: number) {
  return {
    data: [
      {
        id: String(page),
        candidate_ref: `ref-${page}`,
        display_name: `Candidate ${page}`,
        role_code: 'FLL',
        language: 'it',
        status: 'in_corso',
        project_id: '1',
        started_at: null,
        completed_at: null,
        created_at: '2026-03-14T10:30:00Z',
      },
    ],
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: page, last_page: 3, total: 25, from: 1, to: 10, per_page: 10 },
  }
}

function httpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

let useHeadMock: ReturnType<typeof vi.fn>

describe('pages/participants/index.vue', () => {
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

  it('fetches page 1 on mount and renders the returned candidates', async () => {
    const listParticipantsMock = vi.fn().mockResolvedValue(listResponse(1))
    vi.doMock('../../../../app/composables/useParticipants', () => ({
      useParticipants: () => ({ listParticipants: listParticipantsMock }),
    }))

    const IndexPage = (await import('../../../../app/pages/participants/index.vue')).default
    const wrapper = mount(IndexPage, {
      global: {
        mocks: { $t: tMock },
        stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    })
    await flushPromises()

    expect(listParticipantsMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
    expect(wrapper.text()).toContain('Candidate 1')
  })

  it('re-fetches with the new page number when the operator clicks Next (server-driven, not client-side slicing)', async () => {
    const listParticipantsMock = vi
      .fn()
      .mockResolvedValueOnce(listResponse(1))
      .mockResolvedValueOnce(listResponse(2))
    vi.doMock('../../../../app/composables/useParticipants', () => ({
      useParticipants: () => ({ listParticipants: listParticipantsMock }),
    }))

    const IndexPage = (await import('../../../../app/pages/participants/index.vue')).default
    const wrapper = mount(IndexPage, {
      global: {
        mocks: { $t: tMock },
        stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Candidate 1')

    await wrapper.get('[data-testid="candidate-table-next"]').trigger('click')
    await flushPromises()

    expect(listParticipantsMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
    expect(wrapper.text()).toContain('Candidate 2')
    expect(wrapper.text()).not.toContain('Candidate 1')
  })

  it('re-fetches from page 1 with the new status filter when the operator changes it, resetting any deeper page', async () => {
    const listParticipantsMock = vi
      .fn()
      .mockResolvedValueOnce(listResponse(1)) // mount
      .mockResolvedValueOnce(listResponse(2)) // Next click
      .mockResolvedValueOnce(listResponse(1)) // filter change (resets to page 1)
    vi.doMock('../../../../app/composables/useParticipants', () => ({
      useParticipants: () => ({ listParticipants: listParticipantsMock }),
    }))

    const IndexPage = (await import('../../../../app/pages/participants/index.vue')).default
    const wrapper = mount(IndexPage, {
      global: {
        mocks: { $t: tMock },
        stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    })
    await flushPromises()
    // Move to page 2 first, so the filter-change reset is a real assertion,
    // not a no-op (page was already 1).
    await wrapper.get('[data-testid="candidate-table-next"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="candidate-status-filter"]').setValue('completato')
    await flushPromises()

    expect(listParticipantsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, status: 'completato' })
    )
  })

  it('routes the <title> through i18n instead of a hardcoded English literal', async () => {
    vi.doMock('../../../../app/composables/useParticipants', () => ({
      useParticipants: () => ({ listParticipants: vi.fn().mockResolvedValue(listResponse(1)) }),
    }))

    const IndexPage = (await import('../../../../app/pages/participants/index.vue')).default
    mount(IndexPage, {
      global: {
        mocks: { $t: tMock },
        stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    })

    const head = useHeadMock.mock.calls[0]?.[0] as { title?: () => string }
    expect(typeof head?.title).toBe('function')
    expect(head?.title?.()).toBe('head.title.participants')
  })

  describe('failed list fetch (D4 — a failure must never render as an empty result set)', () => {
    async function mountWithStatus(status: number) {
      vi.doMock('../../../../app/composables/useParticipants', () => ({
        useParticipants: () => ({
          listParticipants: vi.fn().mockRejectedValue(httpError(status)),
        }),
      }))

      const IndexPage = (await import('../../../../app/pages/participants/index.vue')).default
      const wrapper = mount(IndexPage, {
        global: {
          mocks: { $t: tMock },
          stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
        },
      })
      await flushPromises()
      return wrapper
    }

    it.each([
      [403, 'errors.states.forbidden', ['errors.states.notFound', 'errors.states.notReady']],
      [404, 'errors.states.notFound', ['errors.states.forbidden', 'errors.states.notReady']],
      [409, 'errors.states.notReady', ['errors.states.forbidden', 'errors.states.notFound']],
      [500, 'errors.states.error', ['errors.states.forbidden', 'errors.states.notFound']],
    ])(
      'renders the %i state distinctly, never the table empty state',
      async (status, expectedKey, otherKeys) => {
        const wrapper = await mountWithStatus(status as number)

        expect(wrapper.find('[data-testid="participants-error"]').exists()).toBe(true)
        expect(wrapper.text()).toContain(`${expectedKey}.title`)
        expect(wrapper.text()).toContain(`${expectedKey}.message`)
        // "No candidates match the current filters" is indistinguishable from a
        // genuinely empty page — a failed fetch must never reach it.
        expect(wrapper.text()).not.toContain('participants.table.empty')
        for (const otherKey of otherKeys as string[]) {
          expect(wrapper.text()).not.toContain(`${otherKey}.title`)
        }
      }
    )

    it('keeps 409 and 403 distinct on the error element itself', async () => {
      const notReady = await mountWithStatus(409)
      vi.resetModules()
      const forbidden = await mountWithStatus(403)

      const notReadyState = notReady
        .find('[data-testid="participants-error"]')
        .attributes('data-state')
      const forbiddenState = forbidden
        .find('[data-testid="participants-error"]')
        .attributes('data-state')

      expect(notReadyState).toBe('not-ready')
      expect(forbiddenState).toBe('forbidden')
      expect(notReadyState).not.toBe(forbiddenState)
    })

    it('recovers to the table when a later fetch succeeds (the error state is not sticky)', async () => {
      const listParticipantsMock = vi
        .fn()
        .mockRejectedValueOnce(httpError(500))
        .mockResolvedValueOnce(listResponse(2))
      vi.doMock('../../../../app/composables/useParticipants', () => ({
        useParticipants: () => ({ listParticipants: listParticipantsMock }),
      }))

      const IndexPage = (await import('../../../../app/pages/participants/index.vue')).default
      const wrapper = mount(IndexPage, {
        global: {
          mocks: { $t: tMock },
          stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
        },
      })
      await flushPromises()
      expect(wrapper.find('[data-testid="participants-error"]').exists()).toBe(true)

      // The table (and its filter controls) are hidden while the error shows,
      // so recovery is driven through the page's own filter handler.
      const page = wrapper.vm as unknown as { onFiltersChange: (f: unknown) => void }
      page.onFiltersChange({ status: '', q: '' })
      await flushPromises()

      expect(wrapper.find('[data-testid="participants-error"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Candidate 2')
    })
  })
})

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
