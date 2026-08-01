/**
 * ExcerptList.vue (PR B3, task 19.4 — RED)
 *
 * Verbatim transcript excerpts per BARS indicator (DESIGN.md §8.3: monospace
 * font, never reworded/truncated in a way that changes meaning).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ExcerptList from '../../../../app/components/molecules/ExcerptList.vue'

const tMock = (key: string) => key

describe('ExcerptList', () => {
  it('renders each excerpt verbatim in a monospace font', () => {
    const wrapper = mount(ExcerptList, {
      props: {
        indicator: 'Work effectively with others',
        excerpts: ['Quindi quello che abbiamo fatto...', 'è stato un esempio di collaborazione...'],
      },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('Work effectively with others')
    expect(wrapper.text()).toContain('Quindi quello che abbiamo fatto...')
    expect(wrapper.text()).toContain('è stato un esempio di collaborazione...')
    expect(wrapper.find('.font-mono').exists()).toBe(true)
  })

  it('renders the empty-state label when excerpts is empty (unassessable indicator)', () => {
    const wrapper = mount(ExcerptList, {
      props: { indicator: 'Negotiate to reach solutions', excerpts: [] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('report.excerpts.empty')
  })
})
