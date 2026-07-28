/**
 * ReliabilityBadge.vue (PR B3, task 19.3 — RED)
 *
 * Renders the API's `reliability` value VERBATIM (DESIGN.md §8.3 / D8) — NO
 * High/Medium/Low band mapping. The formula and threshold are open product
 * decision #1 and are NOT ratified; inventing a band here would bake an
 * unapproved business rule into the UI.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ReliabilityBadge from '../../../../app/components/atoms/ReliabilityBadge.vue'

const tMock = (key: string) => key

describe('ReliabilityBadge', () => {
  it('renders the reliability percent string verbatim', () => {
    const wrapper = mount(ReliabilityBadge, {
      props: { reliability: '67%' },
      global: { mocks: { $t: tMock } },
    })
    expect(wrapper.text()).toContain('67%')
  })

  it('renders a DIFFERENT verbatim value for a different prop (proves no band mapping/rounding)', () => {
    const wrapper = mount(ReliabilityBadge, {
      props: { reliability: '100%' },
      global: { mocks: { $t: tMock } },
    })
    expect(wrapper.text()).toContain('100%')
    expect(wrapper.text()).not.toContain('High')
    expect(wrapper.text()).not.toContain('Medium')
    expect(wrapper.text()).not.toContain('Low')
  })
})
