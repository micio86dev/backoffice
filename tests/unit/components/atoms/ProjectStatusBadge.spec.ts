/**
 * ProjectStatusBadge.vue (Unit 2a, task 17.2 — RED)
 *
 * Mirrors StatusBadge.vue's pattern: i18n-labelled, no custom class, no
 * hardcoded copy.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProjectStatusBadge from '../../../../app/components/atoms/ProjectStatusBadge.vue'

const tMock = (key: string) => `projects.status.${key.split('.').pop()}`

describe('ProjectStatusBadge', () => {
  it.each(['draft', 'active', 'archived'])('renders the i18n-labelled %s status', (status) => {
    const wrapper = mount(ProjectStatusBadge, {
      props: { status },
      global: { mocks: { $t: tMock } },
    })
    expect(wrapper.text()).toContain(`projects.status.${status}`)
  })

  it('renders a DIFFERENT label for a different status (proves real prop rendering)', () => {
    const wrapper = mount(ProjectStatusBadge, {
      props: { status: 'draft' },
      global: { mocks: { $t: tMock } },
    })
    expect(wrapper.text()).toContain('projects.status.draft')
    expect(wrapper.text()).not.toContain('active')
  })

  it.each([
    ['draft', 'outline'],
    ['active', 'success'],
    ['archived', 'neutral'],
    ['something_new', 'outline'],
  ])(
    'maps %s onto the %s badge variant (an unknown status stays neutral, never throws)',
    (status, variant) => {
      const wrapper = mount(ProjectStatusBadge, {
        props: { status },
        global: { mocks: { $t: tMock } },
      })

      expect(wrapper.attributes('data-variant')).toBe(variant)
    }
  )
})
