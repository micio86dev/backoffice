/**
 * PlatformTemplateBadge (global-avatar-templates, B1).
 *
 * The badge is a text label: colour is never the only signal that a template
 * belongs to the platform rather than the organization.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlatformTemplateBadge from '../../../../app/components/atoms/PlatformTemplateBadge.vue'

describe('PlatformTemplateBadge', () => {
  it('renders its slot text as the visible label', () => {
    const wrapper = mount(PlatformTemplateBadge, { slots: { default: 'Platform' } })

    expect(wrapper.text()).toBe('Platform')
  })

  it('renders whatever label the caller passes, so it can be localized', () => {
    const wrapper = mount(PlatformTemplateBadge, { slots: { default: 'Piattaforma' } })

    expect(wrapper.text()).toBe('Piattaforma')
  })

  it('forwards attributes such as a test id to the badge element', () => {
    const wrapper = mount(PlatformTemplateBadge, {
      attrs: { 'data-testid': 'x' },
      slots: { default: 'Platform' },
    })

    expect(wrapper.get('[data-testid="x"]').text()).toBe('Platform')
  })
})
