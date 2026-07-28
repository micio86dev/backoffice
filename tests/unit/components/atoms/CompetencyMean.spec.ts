/**
 * CompetencyMean.vue (PR B3, task 19.3 — RED)
 *
 * Competency-level mean score. Thresholds (DESIGN.md §8.3): <2.5 error,
 * 2.5–3.5 warning, >3.5 success. `null` (all indicators unassessable) MUST
 * render `–`, never `0`.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CompetencyMean from '../../../../app/components/atoms/CompetencyMean.vue'

function mountMean(mean: number | null) {
  return mount(CompetencyMean, { props: { mean, locale: 'en' } })
}

describe('CompetencyMean', () => {
  it('renders "4.0" for a whole-number mean (SLF fixture)', () => {
    expect(mountMean(4).text()).toContain('4.0')
  })

  it('renders "3.67" for a repeating-decimal mean (COL fixture)', () => {
    expect(mountMean(11 / 3).text()).toContain('3.67')
  })

  it('renders "–" — never "0" — when the mean is null (all-unassessable competency)', () => {
    const wrapper = mountMean(null)
    expect(wrapper.text()).toContain('–')
    expect(wrapper.text()).not.toContain('0')
  })
})
