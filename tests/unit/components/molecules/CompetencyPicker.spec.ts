/**
 * CompetencyPicker.vue (Unit 2b, task 20.3 — RED)
 *
 * `FieldSet` + `FieldLegend` + `Checkbox` grid (D10 — never a combobox for
 * 14–18 options). Filtering by assessment type / role is the CALLER's
 * responsibility (`ProjectForm.vue` composes the right `options` list); this
 * molecule renders whatever options it is given and tracks selection.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CompetencyPicker from '../../../../app/components/molecules/CompetencyPicker.vue'

const tMock = (key: string) => key

const OPTIONS = [
  { id: 1, code: 'COL', name: 'Collaboration' },
  { id: 2, code: 'COM', name: 'Communication' },
]

describe('CompetencyPicker', () => {
  it('renders a checkbox per option inside a FieldSet/FieldLegend grid', () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: OPTIONS, modelValue: [] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.find('fieldset').exists()).toBe(true)
    expect(wrapper.find('legend').exists()).toBe(true)
    expect(wrapper.findAll('[role="checkbox"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Collaboration')
    expect(wrapper.text()).toContain('Communication')
  })

  it('renders the empty state when there are no options for the current selection', () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: [], modelValue: [] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('projects.competencyPicker.empty')
  })

  it('reflects modelValue as pre-checked boxes', () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: OPTIONS, modelValue: [2] },
      global: { mocks: { $t: tMock } },
    })

    const checkboxes = wrapper.findAll('[role="checkbox"]')
    expect(checkboxes[0]!.attributes('aria-checked')).toBe('false')
    expect(checkboxes[1]!.attributes('aria-checked')).toBe('true')
  })

  it('emits update:modelValue with the toggled id added', async () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: OPTIONS, modelValue: [] },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.findAll('[role="checkbox"]')[0]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[1]])
  })

  it('emits update:modelValue with the toggled id removed', async () => {
    const wrapper = mount(CompetencyPicker, {
      props: { options: OPTIONS, modelValue: [1, 2] },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.findAll('[role="checkbox"]')[0]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[2]])
  })
})
