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

describe('pages/participants/index.vue', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useHead', vi.fn())
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ locale: ref('en') }))
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
})

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
