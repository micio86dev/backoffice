/**
 * ReusableLinkStatusBadge.vue (reusable-interview-links, B6b; DESIGN.md 16.18)
 *
 * Two states, Active and Disabled, each STATED IN TEXT: the badge maps onto the
 * existing status variants for emphasis, but colour is never the only signal.
 * Mirrors ApiKeyStateBadge.spec.ts.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ReusableLinkStatusBadge from '../../../../app/components/atoms/ReusableLinkStatusBadge.vue'

const tMock = (key: string) => key

describe('ReusableLinkStatusBadge', () => {
  it('says "active" in words for an active link', () => {
    const wrapper = mount(ReusableLinkStatusBadge, {
      props: { status: 'active' },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toBe('reusableLinks.status.active')
  })

  it('says "disabled" in words for a disabled link, and not "active"', () => {
    const wrapper = mount(ReusableLinkStatusBadge, {
      props: { status: 'disabled' },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toBe('reusableLinks.status.disabled')
    expect(wrapper.text()).not.toContain('active')
  })
})
