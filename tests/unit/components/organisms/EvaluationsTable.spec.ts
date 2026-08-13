/**
 * EvaluationsTable.vue (Unit 7, task 27.3-27.4 — RED)
 *
 * A row without a resolvable reliability (the lifecycle-gate/aggregate edge
 * case `EvaluationIndexResource.reliability: null`) renders status only, no
 * score/reliability value. Clicking a row navigates to the existing
 * `/participants/{id}` — no second report renderer.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EvaluationsTable from '../../../../app/components/organisms/EvaluationsTable.vue'

const tMock = (key: string) => key

function row(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  }
}

describe('EvaluationsTable', () => {
  it('renders a row with its reliability percentage', () => {
    const wrapper = mount(EvaluationsTable, {
      props: { rows: [row()] },
      global: {
        mocks: { $t: tMock },
        stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    })

    expect(wrapper.text()).toContain('Mario Rossi')
    expect(wrapper.text()).toContain('83%')
  })

  it('renders status only, no reliability value, for a row with no resolvable score', () => {
    const wrapper = mount(EvaluationsTable, {
      props: { rows: [row({ reliability: null })] },
      global: {
        mocks: { $t: tMock },
        stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    })

    expect(wrapper.text()).toContain('reports.table.notYetScored')
    expect(wrapper.text()).not.toContain('%')
  })

  it('renders the empty state when there are no rows', () => {
    const wrapper = mount(EvaluationsTable, {
      props: { rows: [] },
      global: { mocks: { $t: tMock }, stubs: { NuxtLink: true } },
    })

    expect(wrapper.text()).toContain('reports.table.empty')
  })

  it('links each row to the existing participant detail page, no duplicate report renderer', () => {
    const wrapper = mount(EvaluationsTable, {
      props: { rows: [row()] },
      global: {
        mocks: { $t: tMock },
        stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
      },
    })

    const link = wrapper.get('[data-testid="evaluation-row-link-1"]')
    expect(link.attributes('href')).toBe('/participants/1')
  })
})
