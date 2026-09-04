/**
 * PageHeader — the one header every backoffice route uses.
 *
 * It exists because six routes had four different headers, so the title moved
 * as the operator navigated and half the pages never said what they were for.
 * The contract worth holding is therefore small and specific: exactly one
 * `<h1>`, an optional subtitle that disappears cleanly when absent, and an
 * actions slot that leaves no empty container behind when nothing fills it.
 *
 * That last one is the reason this file exists at all. A component that renders
 * a stray flex container for an unused slot puts invisible gaps between pages,
 * which is the same drift it was written to end.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PageHeader from '../../../../app/components/molecules/PageHeader.vue'

describe('PageHeader', () => {
  it('renders the title as the page’s single h1', () => {
    // One `<h1>` per page is the whole point of centralising this: a document
    // with two competes for the accessible page name, and with none has none.
    const wrapper = mount(PageHeader, { props: { title: 'Projects' } })

    const headings = wrapper.findAll('h1')

    expect(headings).toHaveLength(1)
    expect(headings[0]?.text()).toBe('Projects')
  })

  it('renders the subtitle when given', () => {
    const wrapper = mount(PageHeader, {
      props: { title: 'Projects', subtitle: 'Everything this organization assesses.' },
    })

    expect(wrapper.text()).toContain('Everything this organization assesses.')
  })

  it('renders no subtitle element at all when it is absent', () => {
    // Not an empty `<p>`: an empty paragraph still occupies its line box, and
    // the title would sit a few pixels higher on pages that pass a subtitle
    // than on pages that do not — exactly the shifting this component ended.
    const wrapper = mount(PageHeader, { props: { title: 'Projects' } })

    expect(wrapper.find('p').exists()).toBe(false)
  })

  it('renders the actions container only when the slot is filled', () => {
    const withActions = mount(PageHeader, {
      props: { title: 'Projects' },
      slots: { actions: '<button data-testid="new">New project</button>' },
    })

    expect(withActions.find('[data-testid="new"]').exists()).toBe(true)

    const withoutActions = mount(PageHeader, { props: { title: 'Projects' } })

    // `v-if="$slots.actions"` — asserted because a container rendered for an
    // unfilled slot is an invisible gap that differs page to page.
    expect(withoutActions.findAll('div')).toHaveLength(1)
  })
})
