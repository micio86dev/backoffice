/**
 * CheckboxField — the single checkbox standard (DESIGN.md §16.13).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CheckboxField from '../../../../app/components/molecules/CheckboxField.vue'

function mountField(props: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}) {
  return mount(CheckboxField, {
    props: { id: 'opt', label: 'Send email', ...props },
    attrs,
    attachTo: document.body,
  })
}

const box = (w: ReturnType<typeof mountField>) => w.get('[role="checkbox"]')

describe('CheckboxField', () => {
  it('renders the box BEFORE the label in document order', () => {
    const wrapper = mountField()
    const html = wrapper.html()

    expect(html.indexOf('role="checkbox"')).toBeGreaterThan(-1)
    expect(html.indexOf('role="checkbox"')).toBeLessThan(html.indexOf('Send email'))
  })

  it('names the box through aria-labelledby, not a label-for', () => {
    const wrapper = mountField()
    const labelId = box(wrapper).attributes('aria-labelledby')

    expect(labelId).toBeTruthy()
    expect(wrapper.get(`#${labelId}`).text()).toContain('Send email')
    expect(wrapper.find('label').exists()).toBe(false)
  })

  it('renders description and error UNDER the label, in the same column', () => {
    const wrapper = mountField({ description: 'Hint text', error: 'Bad value' })
    const column = wrapper.get('[data-slot="checkbox-field-content"]')

    const text = column.text()
    expect(text.indexOf('Send email')).toBeLessThan(text.indexOf('Hint text'))
    expect(text.indexOf('Hint text')).toBeLessThan(text.indexOf('Bad value'))
    // The box is NOT inside the text column.
    expect(column.find('[role="checkbox"]').exists()).toBe(false)
  })

  it('wires aria-describedby to the error then the description', () => {
    const wrapper = mountField({ description: 'Hint text', error: 'Bad value' })
    const ids = (box(wrapper).attributes('aria-describedby') ?? '').split(/\s+/)

    expect(ids).toHaveLength(2)
    expect(wrapper.get(`#${ids[0]}`).text()).toBe('Bad value')
    expect(wrapper.get(`#${ids[1]}`).text()).toBe('Hint text')
  })

  it('omits aria-describedby when there is nothing to describe it', () => {
    expect(box(mountField()).attributes('aria-describedby')).toBeUndefined()
  })

  it('appends caller-supplied described-by ids', () => {
    const wrapper = mountField({ description: 'Hint', describedby: 'extra-id' })

    expect(box(wrapper).attributes('aria-describedby')).toContain('extra-id')
  })

  it('marks the box invalid and renders an alert when there is an error', () => {
    const wrapper = mountField({ error: 'Nope' })

    expect(box(wrapper).attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('[role="alert"]').text()).toBe('Nope')
  })

  it('is not invalid without an error', () => {
    expect(box(mountField()).attributes('aria-invalid')).toBeUndefined()
  })

  it('supports the invalid flag without a message', () => {
    expect(box(mountField({ invalid: true })).attributes('aria-invalid')).toBe('true')
  })

  it('shows a required marker only when required', () => {
    expect(mountField().find('abbr').exists()).toBe(false)
    expect(mountField({ required: true }).find('abbr').exists()).toBe(true)
    expect(box(mountField({ required: true })).attributes('aria-required')).toBe('true')
  })

  it('toggles through v-model on click', async () => {
    const wrapper = mountField({ modelValue: false })

    await box(wrapper).trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true])
  })

  it('reflects the checked state', () => {
    expect(box(mountField({ modelValue: true })).attributes('aria-checked')).toBe('true')
    expect(box(mountField({ modelValue: false })).attributes('aria-checked')).toBe('false')
  })

  it('toggles when the label text is clicked', async () => {
    const wrapper = mountField({ modelValue: false })

    await wrapper.get(`#${box(wrapper).attributes('aria-labelledby')}`).trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true])
  })

  it('toggles from the keyboard (Space)', async () => {
    const wrapper = mountField({ modelValue: false })

    await box(wrapper).trigger('keydown', { key: ' ' })
    await box(wrapper).trigger('keyup', { key: ' ' })
    await box(wrapper).trigger('click')

    expect(wrapper.emitted('update:modelValue')?.length).toBeGreaterThan(0)
  })

  it('emits nothing when disabled, from the box or the label', async () => {
    const wrapper = mountField({ modelValue: false, disabled: true })

    await box(wrapper).trigger('click')
    await wrapper.get(`#${box(wrapper).attributes('aria-labelledby')}`).trigger('click')

    expect(box(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('forwards attrs such as data-testid to the box', () => {
    const wrapper = mountField({}, { 'data-testid': 'my-box' })

    expect(wrapper.get('[data-testid="my-box"]').attributes('role')).toBe('checkbox')
  })

  it('uses the id for the box and derives stable ids for its parts', () => {
    const wrapper = mountField({ description: 'd', error: 'e' })

    expect(box(wrapper).attributes('id')).toBe('opt')
    expect(wrapper.find('#opt-label').exists()).toBe(true)
    expect(wrapper.find('#opt-description').exists()).toBe(true)
    expect(wrapper.find('#opt-error').exists()).toBe(true)
  })

  it('accepts overriding part ids and the error test id', () => {
    const wrapper = mountField({
      description: 'd',
      error: 'e',
      descriptionId: 'custom-hint',
      errorId: 'custom-err',
      errorTestId: 'err-tid',
    })

    expect(wrapper.find('#custom-hint').exists()).toBe(true)
    expect(wrapper.get('#custom-err').attributes('data-testid')).toBe('err-tid')
  })

  it('renders the label and description from slots', () => {
    const wrapper = mount(CheckboxField, {
      props: { id: 'slot' },
      slots: { default: '<b>Rich</b>', description: '<i>Desc</i>' },
    })

    expect(wrapper.find('b').text()).toBe('Rich')
    expect(wrapper.find('i').text()).toBe('Desc')
  })

  it('shows a mixed state when indeterminate, and a click selects it', async () => {
    const wrapper = mountField({ indeterminate: true, modelValue: false })

    expect(box(wrapper).attributes('aria-checked')).toBe('mixed')
    expect(box(wrapper).attributes('data-state')).toBe('indeterminate')

    await box(wrapper).trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true])
  })

  it('is not mixed by default', () => {
    expect(box(mountField()).attributes('aria-checked')).toBe('false')
  })
})
