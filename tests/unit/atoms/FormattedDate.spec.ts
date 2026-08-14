/**
 * FormattedDate.vue (dates-and-destructive-actions, design D1/D9)
 *
 * The single render path for any `*_at` field: wraps `formatDate`
 * (`app/utils/format.ts:6-11`, signature untouched — see format.spec.ts) and
 * adds an opt-in `show-zone` prop that appends a locale-aware timezone
 * suffix via `Intl.DateTimeFormat(...).formatToParts` (never string surgery,
 * never `resolvedOptions().timeZone`, which is not locale-aware).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FormattedDate from '@/components/atoms/FormattedDate.vue'

const tMock = (key: string) => key

describe('FormattedDate', () => {
  it('renders an em dash for a null value', () => {
    const wrapper = mount(FormattedDate, {
      props: { value: null, locale: 'en' },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toBe('–')
  })

  it('renders the locale-aware formatted value via formatDate', () => {
    const wrapper = mount(FormattedDate, {
      props: { value: '2026-03-14T10:30:00Z', locale: 'en' },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toBe(
      new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date('2026-03-14T10:30:00Z')
      )
    )
  })

  it('produces a different string for the it locale than for en', () => {
    const en = mount(FormattedDate, {
      props: { value: '2026-03-14T10:30:00Z', locale: 'en' },
      global: { mocks: { $t: tMock } },
    })
    const it = mount(FormattedDate, {
      props: { value: '2026-03-14T10:30:00Z', locale: 'it' },
      global: { mocks: { $t: tMock } },
    })

    expect(en.text()).not.toBe(it.text())
  })

  it('appends a timeZoneName suffix when show-zone is set', () => {
    const wrapper = mount(FormattedDate, {
      props: { value: '2026-03-14T10:30:00Z', locale: 'en', showZone: true },
      global: { mocks: { $t: tMock } },
    })

    const zonePart = new Intl.DateTimeFormat('en', { timeZoneName: 'short' })
      .formatToParts(new Date('2026-03-14T10:30:00Z'))
      .find((part) => part.type === 'timeZoneName')?.value

    expect(wrapper.text()).toContain(zonePart)
  })

  it('does NOT append a timezone suffix when show-zone is absent (default)', () => {
    const wrapper = mount(FormattedDate, {
      props: { value: '2026-03-14T10:30:00Z', locale: 'en' },
      global: { mocks: { $t: tMock } },
    })

    const zonePart = new Intl.DateTimeFormat('en', { timeZoneName: 'short' })
      .formatToParts(new Date('2026-03-14T10:30:00Z'))
      .find((part) => part.type === 'timeZoneName')?.value

    expect(wrapper.text()).not.toContain(zonePart)
  })

  it('renders an em dash for a null value even with show-zone set (no dangling suffix)', () => {
    const wrapper = mount(FormattedDate, {
      props: { value: null, locale: 'en', showZone: true },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toBe('–')
  })
})
