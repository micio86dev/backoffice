/**
 * ReportFilters.vue (Unit 7, task 27.2 — RED)
 *
 * The whitelisted filter set (`project_id`, `assessment_type`, `role_code`,
 * `status` via `ToggleGroup`, date range), emits ONE filter object.
 */
import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
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
  it('renders the filters it is given, so the badge and the controls agree', async () => {
    // The badge counts from `modelValue`; the controls used to be uncontrolled
    // behind a `:key` remount. Nothing broke only because `reports/index.vue`
    // seeds `filters` as `{}` — the first hydration from a query string or a
    // saved view would have shown "3 active" over three empty selects.
    const wrapper = mount(ReportFilters, {
      props: {
        modelValue: {
          project_id: 7,
          assessment_type: 'potential',
          role_code: 'FLL',
          // The dates are bound too, and were bound to field names that do not
          // exist (`date_from`/`date_to` instead of `evaluated_from`/
          // `evaluated_to`). Only the typechecker caught it — a binding whose
          // sole guard is the compiler is a binding no test covers.
          evaluated_from: '2026-01-01',
          evaluated_to: '2026-03-31',
        },
        projects: [{ id: 7, name: 'Autumn intake' }],
      },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    const value = (testid: string) =>
      (wrapper.get(`[data-testid="${testid}"]`).element as HTMLSelectElement).value

    expect(value('report-filter-project')).toBe('7')
    expect(value('report-filter-assessment-type')).toBe('potential')
    expect(value('report-filter-role')).toBe('FLL')
    const inputValue = (testid: string) =>
      (wrapper.get(`[data-testid="${testid}"]`).element as HTMLInputElement).value

    expect(inputValue('report-filter-from')).toBe('2026-01-01')
    expect(inputValue('report-filter-to')).toBe('2026-03-31')
    expect(wrapper.get('[data-testid="report-filters-active-count"]').text()).toContain('5')
  })
  it('gives the status filter an accessible name through a real fieldset', () => {
    // A `FieldLabel` with no `for` beside a `role="group"` div is an orphan
    // label: the group has NO accessible name, and a screen reader announces
    // two bare buttons with no way to know they filter status. `legend` is the
    // one element that names a `fieldset` without needing an id at all.
    const wrapper = mount(ReportFilters, {
      props: { modelValue: {}, projects: [] },
      global: { mocks: { $t: tMock } },
    })

    const group = wrapper.get('[data-testid="report-filter-status"]')
    const fieldset = group.element.closest('fieldset')

    expect(fieldset).not.toBeNull()
    expect(fieldset!.querySelector('legend')?.textContent).toContain('reports.filters.status')
  })
})
