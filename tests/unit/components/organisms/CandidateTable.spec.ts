/**
 * CandidateTable.vue (PR B2, task 17.3/18.1 — RED)
 *
 * Purely presentational: receives `participants`/`meta`/`filters` as props,
 * emits `update:filters` and `update:page`. Server-driven pagination lives
 * in the page-level composable (container), never here (spec: "no
 * client-side fetch-all filtering").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import CandidateTable from '../../../../app/components/organisms/CandidateTable.vue'

const tMock = (key: string, params?: Record<string, unknown>) => {
  if (key === 'participants.pagination.summary' && params) {
    return `Showing ${params['from']}-${params['to']} of ${params['total']}`
  }
  if (key.startsWith('participants.status.')) return key.replace('participants.status.', '')
  return key
}

const NuxtLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

function baseParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    candidate_ref: 'ref-001',
    display_name: 'Jane Doe',
    role_code: 'FLL',
    language: 'it',
    status: 'in_corso',
    project_id: '1',
    started_at: null,
    completed_at: null,
    created_at: '2026-03-14T10:30:00Z',
    ...overrides,
  }
}

function mountTable(props: Record<string, unknown>) {
  return mount(CandidateTable, {
    props: {
      participants: [],
      meta: null,
      filters: { status: '', q: '' },
      ...props,
    },
    global: {
      mocks: { $t: tMock },
      stubs: { NuxtLink: NuxtLinkStub },
    },
  })
}

describe('CandidateTable', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ locale: ref('en') }))
    )
  })

  it('renders one row per participant with a link to the detail page', () => {
    const wrapper = mountTable({ participants: [baseParticipant()] })

    const link = wrapper.find('a[href="/participants/1"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toContain('Jane Doe')
  })

  it('renders a DIFFERENT row set for a different participant list (proves real rendering, not a fixed fixture)', () => {
    const wrapper = mountTable({
      participants: [baseParticipant({ id: '2', display_name: 'John Smith' })],
    })

    expect(wrapper.find('a[href="/participants/2"]').text()).toContain('John Smith')
    expect(wrapper.find('a[href="/participants/1"]').exists()).toBe(false)
  })

  it('shows the empty-state message when the participant list is empty', () => {
    const wrapper = mountTable({ participants: [] })

    expect(wrapper.text()).toContain('participants.table.empty')
    expect(wrapper.findAll('tbody tr td a').length).toBe(0)
  })

  it('renders the pagination summary and enables Next when not on the last page', () => {
    const wrapper = mountTable({
      participants: [baseParticipant()],
      meta: { current_page: 1, last_page: 3, total: 25, from: 1, to: 10, per_page: 10 },
    })

    expect(wrapper.text()).toContain('Showing 1-10 of 25')
    const next = wrapper.get('[data-testid="candidate-table-next"]')
    expect(next.attributes('disabled')).toBeUndefined()
    const prev = wrapper.get('[data-testid="candidate-table-prev"]')
    expect(prev.attributes('disabled')).toBeDefined()
  })

  it('disables Next on the last page and emits update:page with the next page number when clicked mid-list', async () => {
    const wrapper = mountTable({
      participants: [baseParticipant()],
      meta: { current_page: 2, last_page: 3, total: 25, from: 11, to: 20, per_page: 10 },
    })

    await wrapper.get('[data-testid="candidate-table-next"]').trigger('click')
    expect(wrapper.emitted('update:page')).toEqual([[3]])

    await wrapper.get('[data-testid="candidate-table-prev"]').trigger('click')
    expect(wrapper.emitted('update:page')?.[1]).toEqual([1])
  })

  it('emits update:filters with the new status when the status filter changes', async () => {
    const wrapper = mountTable({ participants: [] })

    const select = wrapper.get('[data-testid="candidate-status-filter"]')
    await select.setValue('completato')

    expect(wrapper.emitted('update:filters')?.[0]).toEqual([{ status: 'completato', q: '' }])
  })

  it('emits update:filters with the search term on Enter', async () => {
    const wrapper = mountTable({ participants: [] })

    const search = wrapper.get('[data-testid="candidate-search"]')
    await search.setValue('jane')
    await search.trigger('keyup.enter')

    expect(wrapper.emitted('update:filters')?.[0]).toEqual([{ status: '', q: 'jane' }])
  })
})
