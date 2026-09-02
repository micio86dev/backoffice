/**
 * ClientSwitcher — which client a superadmin is looking at.
 *
 * Presentational: props in, events out. The shell owns the API call and the
 * reload, so this can be tested without either.
 *
 * A native <select> and no new dependency. It is keyboard-operable, announced
 * correctly and searchable by typing in every browser this product supports —
 * a custom listbox would have to re-earn all of that.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ClientSwitcher from '../../../../app/components/organisms/ClientSwitcher.vue'

const tMock = (key: string) => key
const CLIENTS = [
  { id: 2, name: 'Acme' },
  { id: 7, name: 'Globex' },
]

function mountSwitcher(actingId: number | null = null) {
  return mount(ClientSwitcher, {
    props: { clients: CLIENTS, actingClientId: actingId },
    global: { mocks: { $t: tMock } },
  })
}

describe('ClientSwitcher', () => {
  it('offers every client plus an all-clients option', () => {
    const options = mountSwitcher().findAll('option')

    // Three: the two clients and "all". Without the all-option a superadmin
    // who selected one client could never get back to the whole view.
    expect(options).toHaveLength(3)
    expect(options[0].attributes('value')).toBe('')
    expect(options[1].text()).toBe('Acme')
  })

  it('shows which client is active', () => {
    expect(
      (mountSwitcher(7).get('[data-testid="client-switcher"]').element as HTMLSelectElement).value
    ).toBe('7')
  })

  it('emits the chosen client id', async () => {
    const wrapper = mountSwitcher()

    await wrapper.get('[data-testid="client-switcher"]').setValue('2')

    expect(wrapper.emitted('change')?.[0]?.[0]).toBe(2)
  })

  it('emits null for the all-clients option, never an empty string', async () => {
    // The API distinguishes them: `null` clears the selection, and a `""`
    // would fail validation as a non-integer and leave the superadmin scoped
    // to whatever they had before, with no visible reason.
    const wrapper = mountSwitcher(2)

    await wrapper.get('[data-testid="client-switcher"]').setValue('')

    expect(wrapper.emitted('change')?.[0]?.[0]).toBeNull()
  })

  it('is labelled, not just placeholdered', () => {
    // A bare select in a topbar is an unlabelled control: the visible text is
    // the CURRENT VALUE, which tells a screen reader nothing about what
    // changing it does.
    const select = mountSwitcher().get('[data-testid="client-switcher"]')

    expect(select.attributes('aria-label')).toBeTruthy()
  })
})
