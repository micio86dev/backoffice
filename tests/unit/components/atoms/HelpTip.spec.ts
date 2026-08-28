/**
 * HelpTip.vue — RED
 *
 * A glossary term the operator can ask about without leaving the report.
 *
 * The rule this component exists to enforce: a tooltip that only opens on
 * hover is invisible to keyboard and to assistive tech. So the trigger MUST
 * be a real <button> (focusable, activatable, announced as interactive), and
 * the definition MUST also exist in the DOM as text, not only inside the
 * portalled tooltip that renders when open. Both are asserted here so a
 * future "simplification" back to a hover-only <span> fails.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HelpTip from '../../../../app/components/atoms/HelpTip.vue'
import { withTooltipProvider } from '../../support/tooltip-host'

const tMock = (key: string) => key

function mountTip(term = 'indicator') {
  return mount(withTooltipProvider(HelpTip, { term }), {
    global: { mocks: { $t: tMock } },
  })
}

describe('HelpTip', () => {
  it('renders the glossary term as the visible label', () => {
    expect(mountTip().text()).toContain('help.glossary.indicator.term')
  })

  it('triggers from a real, focusable <button> — never a hover-only element', () => {
    const button = mountTip().find('button')

    expect(button.exists()).toBe(true)
    expect(button.attributes('type')).toBe('button')
    // A negative tabindex would take the trigger out of the tab order and
    // undo the whole point of using a button.
    expect(button.attributes('tabindex')).toBeUndefined()
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('names the button for what activating it does, not just the bare term', () => {
    const label = mountTip().find('button').attributes('aria-label')

    expect(label).toBe('report.help.trigger')
  })

  it('keeps the definition in the DOM for screen readers, not only inside the tooltip', () => {
    const wrapper = mountTip()
    const srOnly = wrapper.find('.sr-only')

    expect(srOnly.exists()).toBe(true)
    expect(srOnly.text()).toBe('help.glossary.indicator.definition')
  })

  it('resolves both strings from the term prop, so any glossary entry works', () => {
    const wrapper = mountTip('reliability')

    expect(wrapper.text()).toContain('help.glossary.reliability.term')
    expect(wrapper.find('.sr-only').text()).toBe('help.glossary.reliability.definition')
  })
})
