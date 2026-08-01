/**
 * MetricCard.vue (PR B2, task 17.5/18.1 — RED)
 *
 * Presentational KPI card: label + value, both passed in already-formatted
 * (Intl.NumberFormat/Intl.DateTimeFormat happen at the call site — see
 * format.ts) so this atom stays free of locale logic.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MetricCard from '../../../../app/components/molecules/MetricCard.vue'

describe('MetricCard', () => {
  it('renders the given label and value', () => {
    const wrapper = mount(MetricCard, {
      props: { label: 'Total candidates', value: '128' },
    })

    expect(wrapper.text()).toContain('Total candidates')
    expect(wrapper.text()).toContain('128')
  })

  it('renders a DIFFERENT label/value pair for different props (proves real prop rendering)', () => {
    const wrapper = mount(MetricCard, {
      props: { label: 'Completion rate', value: '75%' },
    })

    expect(wrapper.text()).toContain('Completion rate')
    expect(wrapper.text()).toContain('75%')
    expect(wrapper.text()).not.toContain('Total candidates')
  })
})
