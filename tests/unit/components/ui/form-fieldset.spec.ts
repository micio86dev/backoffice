/**
 * FormFieldset — one place that disables a whole form.
 *
 * The rule is "while a form is submitting, every field stays disabled". Wiring
 * that onto each control is the same rule written N times, and the Nth one is
 * always the field added next week — leaving a form half-editable mid-save,
 * which is how one user produces two conflicting writes.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { FormFieldset } from '../../../../app/components/ui/form-fieldset'

const fields = `
  <input data-testid="text" />
  <select data-testid="select"><option>a</option></select>
  <textarea data-testid="textarea"></textarea>
  <button data-testid="inner-button">Go</button>
`

describe('FormFieldset', () => {
  it('marks the fieldset itself disabled, which is what disables the subtree', () => {
    const wrapper = mount(FormFieldset, { props: { disabled: true }, slots: { default: fields } })

    expect(wrapper.attributes('disabled')).toBeDefined()
  })

  it('cannot assert the INHERITED state here — jsdom does not implement it', () => {
    // Worth stating rather than quietly asserting something weaker. In a real
    // browser `<fieldset disabled>` disables every descendant control, and
    // neither `element.disabled` nor `:disabled` reports it on the children
    // because the attribute lives only on the fieldset. jsdom implements
    // neither the property nor the selector for inherited disabling, so this
    // assertion is INVERTED on purpose: it documents the gap, and it fails
    // loudly the day jsdom gains the feature, at which point the check above
    // should become the real subtree assertion.
    //
    // The behaviour that matters is covered where a real engine runs it:
    // `tests/e2e/form-busy.spec.ts`.
    const wrapper = mount(FormFieldset, { props: { disabled: true }, slots: { default: fields } })
    const element = wrapper.get('[data-testid="text"]').element as HTMLInputElement

    expect(element.disabled).toBe(false)
    expect(element.matches(':disabled')).toBe(false)
  })

  it('leaves them alone when idle', () => {
    const wrapper = mount(FormFieldset, { slots: { default: fields } })

    const element = wrapper.get('[data-testid="text"]').element as HTMLInputElement

    expect(element.disabled).toBe(false)
    expect(wrapper.attributes('disabled')).toBeUndefined()
  })

  it('resets the user-agent styles that would otherwise move the form', () => {
    // `min-w-0` is the load-bearing one: a fieldset defaults to
    // `min-width: min-content` and refuses to shrink inside a flex or grid
    // parent, so wrapping existing markup without it visibly changes layout.
    const wrapper = mount(FormFieldset, { slots: { default: fields } })

    expect(wrapper.classes()).toContain('min-w-0')
    expect(wrapper.classes()).toContain('border-0')
    expect(wrapper.classes()).toContain('p-0')
    expect(wrapper.classes()).toContain('m-0')
  })
})
