/**
 * ReportFilters.vue (Unit 7, task 27.2 — RED)
 *
 * The whitelisted filter set (`project_id`, `assessment_type`, `role_code`,
 * `status` via `ToggleGroup`, date range), emits ONE filter object.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ReportFilters from '../../../../app/components/molecules/ReportFilters.vue'

const tMock = (key: string) => key

describe('ReportFilters', () => {
  it('emits a single filter object when the status toggle changes', async () => {
    const wrapper = mount(ReportFilters, {
      props: { projects: [], modelValue: {} },
      global: { mocks: { $t: tMock } },
    })

    const completedButton = wrapper.get('[data-testid="report-filter-status"] button:first-child')
    await completedButton.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ status: 'completed' }])
  })

  it('emits date range fields under evaluated_from/evaluated_to', async () => {
    const wrapper = mount(ReportFilters, {
      props: { projects: [], modelValue: {} },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="report-filter-from"]').setValue('2026-01-01')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ evaluated_from: '2026-01-01' }])
  })

  it('emits the assessment type filter', async () => {
    const wrapper = mount(ReportFilters, {
      props: { projects: [], modelValue: {} },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="report-filter-assessment-type"]').setValue('standard')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ assessment_type: 'standard' }])
  })
})
