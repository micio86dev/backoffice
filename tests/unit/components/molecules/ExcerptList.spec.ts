/**
 * ExcerptList.vue (PR B3, task 19.4 — RED)
 *
 * Verbatim transcript excerpts per BARS indicator (DESIGN.md §8.3: monospace
 * font, never reworded/truncated in a way that changes meaning).
 *
 * The `indicator` prop is GONE. The indicator text now labels the accordion
 * trigger in `IndicatorEvidence`, which is the point of the restructure: the
 * indicator, its score and its evidence belong to one disclosure unit, and a
 * heading printed twice inside that unit is noise. This component is now only
 * the evidence.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ExcerptList from '../../../../app/components/molecules/ExcerptList.vue'

const tMock = (key: string) => key

describe('ExcerptList', () => {
  it('renders each excerpt verbatim in a monospace font', () => {
    const wrapper = mount(ExcerptList, {
      props: {
        excerpts: ['Quindi quello che abbiamo fatto...', 'è stato un esempio di collaborazione...'],
      },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('Quindi quello che abbiamo fatto...')
    expect(wrapper.text()).toContain('è stato un esempio di collaborazione...')
    expect(wrapper.find('.font-mono').exists()).toBe(true)
  })

  it('renders one list item per excerpt, so they are countable and not run together', () => {
    const wrapper = mount(ExcerptList, {
      props: { excerpts: ['first', 'second', 'third'] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.findAll('li')).toHaveLength(3)
  })

  it('renders the empty-state label when excerpts is empty (unassessable indicator)', () => {
    const wrapper = mount(ExcerptList, {
      props: { excerpts: [] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('report.excerpts.empty')
    expect(wrapper.find('ul').exists()).toBe(false)
  })
})
