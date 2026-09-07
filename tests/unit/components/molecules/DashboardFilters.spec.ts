/**
 * DashboardFilters (DESIGN.md §5 — every component has a matching Vitest test)
 *
 * This component had none. `dashboard-period.spec.ts` covers the calendar
 * ARITHMETIC, which is a different thing: the helper being correct says nothing
 * about whether the component calls it with the right period, or clears the
 * month when the year goes away, or disables a control that cannot mean
 * anything yet.
 *
 * It matters more than a filter row usually would. The emitted range drives
 * BOTH `/dashboard/metrics` and `/dashboard/activity` (`pages/index.vue`), so a
 * wrong range does not fail — it quietly makes the tiles and the activity list
 * describe different months, and nothing on screen says so.
 *
 * `currentYear` and `locale` are props precisely so this can be asserted
 * without a clock or a machine locale, which the component's own docblock says
 * is why they exist.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardFilters from '../../../../app/components/molecules/DashboardFilters.vue'

const tMock = (key: string) => key

function mountFilters() {
  return mount(DashboardFilters, {
    props: { currentYear: 2026, yearCount: 4, locale: 'en' },
    global: { mocks: { $t: tMock } },
  })
}

/** The last `change` payload, or undefined when nothing was emitted. */
function lastRange(wrapper: ReturnType<typeof mountFilters>) {
  const events = wrapper.emitted('change')

  return events?.[events.length - 1]?.[0] as { from?: string; to?: string } | undefined
}

describe('DashboardFilters', () => {
  it('offers the requested number of years, newest first, plus an all-time option', () => {
    const options = mountFilters()
      .get('[data-testid="dashboard-year"]')
      .findAll('option')
      .map((option) => option.attributes('value'))

    // '' is all-time, and it is FIRST: clearing the year is the only way to
    // mean "no period at all", so it must never be something to scroll to.
    expect(options).toEqual(['', '2026', '2025', '2024', '2023'])
  })

  it('disables the month until a year is chosen', async () => {
    const wrapper = mountFilters()
    const month = wrapper.get('[data-testid="dashboard-month"]')

    // "March of no year" is not a period. Disabled rather than hidden, so the
    // control does not move everything beside it when a year is picked.
    expect(month.attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="dashboard-year"]').setValue('2025')

    expect(wrapper.get('[data-testid="dashboard-month"]').attributes('disabled')).toBeUndefined()
  })

  it('emits a whole-year range when only a year is chosen', async () => {
    const wrapper = mountFilters()

    await wrapper.get('[data-testid="dashboard-year"]').setValue('2025')

    expect(lastRange(wrapper)).toEqual({ from: '2025-01-01', to: '2025-12-31' })
  })

  it('narrows to the month once one is chosen', async () => {
    const wrapper = mountFilters()

    await wrapper.get('[data-testid="dashboard-year"]').setValue('2025')
    // The option values are 1-based, so index 2 is March.
    await wrapper.get('[data-testid="dashboard-month"]').setValue('3')

    expect(lastRange(wrapper)).toEqual({ from: '2025-03-01', to: '2025-03-31' })
  })

  it('clears the month when the year is cleared, and emits all-time', async () => {
    const wrapper = mountFilters()

    await wrapper.get('[data-testid="dashboard-year"]').setValue('2025')
    await wrapper.get('[data-testid="dashboard-month"]').setValue('3')
    await wrapper.get('[data-testid="dashboard-year"]').setValue('')

    // Not "March of nothing": the month must go with the year, or the control
    // shows a stale month beside "all time" and the emitted range disagrees
    // with what the operator can see.
    expect(
      (wrapper.get('[data-testid="dashboard-month"]').element as HTMLSelectElement).value
    ).toBe('')
    expect(lastRange(wrapper)).toEqual({})
  })

  it('names the months in the reader language rather than the machine one', () => {
    const wrapper = mount(DashboardFilters, {
      props: { currentYear: 2026, locale: 'it' },
      global: { mocks: { $t: tMock } },
    })

    const months = wrapper
      .get('[data-testid="dashboard-month"]')
      .findAll('option')
      .map((option) => option.text())

    // From Intl, not a hardcoded list — the i18n mandate covers this row too.
    expect(months[1]).toBe('gennaio')
    expect(months[3]).toBe('marzo')
  })
})
