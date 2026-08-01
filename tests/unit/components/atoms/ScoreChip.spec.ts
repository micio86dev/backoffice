/**
 * ScoreChip.vue (PR B3, task 19.1 — RED)
 *
 * Renders a single BARS indicator score. DESIGN.md §8.3: the discrete set
 * {1,3,5} maps 1:1 to error/warning/success chips; `-1`/`null` means
 * UNASSESSABLE and renders a neutral `–`, never the literal `-1` and never on
 * the error/warning/success scale. Color is the THIRD signal only (numeral +
 * icon carry the meaning too, WCAG 2.1 AA 1.4.1) — assertions below never
 * inspect a CSS color class, only the visible numeral/`–` text and the
 * visually-hidden i18n label.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ScoreChip from '../../../../app/components/atoms/ScoreChip.vue'

const tMock = (key: string) => key

describe('ScoreChip', () => {
  it('renders "1" with the low/error accessible label', () => {
    const wrapper = mount(ScoreChip, { props: { score: 1 }, global: { mocks: { $t: tMock } } })
    expect(wrapper.text()).toContain('1')
    expect(wrapper.text()).toContain('report.chip.low')
  })

  it('renders "3" with the mid/warning accessible label', () => {
    const wrapper = mount(ScoreChip, { props: { score: 3 }, global: { mocks: { $t: tMock } } })
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('report.chip.mid')
  })

  it('renders "5" with the high/success accessible label', () => {
    const wrapper = mount(ScoreChip, { props: { score: 5 }, global: { mocks: { $t: tMock } } })
    expect(wrapper.text()).toContain('5')
    expect(wrapper.text()).toContain('report.chip.high')
  })

  it('renders the neutral "–" (never "-1") for the raw -1 sentinel, with the unassessable label', () => {
    const wrapper = mount(ScoreChip, { props: { score: -1 }, global: { mocks: { $t: tMock } } })
    expect(wrapper.text()).toContain('–')
    expect(wrapper.text()).not.toContain('-1')
    expect(wrapper.text()).toContain('report.chip.unassessable')
  })

  it('renders the neutral "–" for a null score (API-mapped sentinel), with the unassessable label', () => {
    const wrapper = mount(ScoreChip, { props: { score: null }, global: { mocks: { $t: tMock } } })
    expect(wrapper.text()).toContain('–')
    expect(wrapper.text()).toContain('report.chip.unassessable')
  })

  it('marks the glyph icon aria-hidden (numeral + visually-hidden label already carry the meaning)', () => {
    const wrapper = mount(ScoreChip, { props: { score: 5 }, global: { mocks: { $t: tMock } } })
    const icon = wrapper.find('svg')
    expect(icon.exists()).toBe(true)
    expect(icon.attributes('aria-hidden')).toBe('true')
  })
})
