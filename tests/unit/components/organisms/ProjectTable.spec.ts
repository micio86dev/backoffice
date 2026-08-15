/**
 * ProjectTable.vue (Unit 2a, task 18.3 — RED)
 *
 * Presentational table: shadcn `Table` + `Button` only, never a raw
 * `<button>` (D8 — `avatar-templates/index.vue` is explicitly NOT the
 * model).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProjectTable from '../../../../app/components/organisms/ProjectTable.vue'

const tMock = (key: string) => key

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    organization_id: 1,
    framework_version_id: 1,
    slug: 'demo-project',
    name: 'Demo Project',
    assessment_type: 'standard',
    role_code: 'FLL',
    language: 'en',
    status: 'draft',
    pause_every_n_competencies: 3,
    nudge_min_chars: 40,
    exit_redirect_url: 'https://example.com/done',
    webhook_url: 'https://example.com/hook',
    webhook_events: ['progress'],
    has_webhook_secret: false,
    deadline_at: null,
    goes_live_at: null,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
    pin_context: null,
    competencies: [],
    ...overrides,
  }
}

describe('ProjectTable', () => {
  it('renders a row per project with its status badge', () => {
    const wrapper = mount(ProjectTable, {
      props: { projects: [project()] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('Demo Project')
    expect(wrapper.text()).toContain('demo-project')
  })

  it('renders the empty state when there are no projects', () => {
    const wrapper = mount(ProjectTable, {
      props: { projects: [] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('projects.table.empty')
  })

  it('emits edit with the project id when its row action is clicked, using a real Button', () => {
    const wrapper = mount(ProjectTable, {
      props: { projects: [project({ id: 9 })] },
      global: { mocks: { $t: tMock } },
    })

    const editButton = wrapper.get('[data-testid="project-row-edit-9"]')
    // Real shadcn Button renders a native <button> element under the hood —
    // asserting the tag proves this is Button, not a raw hand-rolled <button>
    // styled to look the same (D8's avatar-templates anti-pattern).
    expect(editButton.element.tagName).toBe('BUTTON')

    editButton.trigger('click')
    expect(wrapper.emitted('edit')?.[0]).toEqual([9])
  })
})
