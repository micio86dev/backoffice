/**
 * CurrencyForm.vue (organization-currencies, OC-07a) — the admin's display
 * currency select inside the organization settings section.
 *
 * Admin edits and saves `currency_code`; operator and viewer read it. The
 * `currency_unavailable` slug is localized from the real locale files.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { currentUserStub } from '../../support/abilities'
import { realI18n } from '../../support/i18n'
import CurrencyForm from '../../../../app/components/organisms/CurrencyForm.vue'

vi.stubGlobal('useI18n', () => realI18n())

const updateOrganization = vi.fn()
const ensureLoaded = vi.fn()

vi.mock('@/composables/useOrganization', () => ({
  useOrganization: () => ({ updateOrganization }),
}))

vi.mock('@/composables/useCurrencies', () => ({
  useCurrencies: () => ({
    currencies: ref([
      { code: 'USD', symbol: '$', decimals: 2, rate_per_usd: '1', rate_as_of: '2026-10-01' },
      { code: 'EUR', symbol: '€', decimals: 2, rate_per_usd: '0.89', rate_as_of: '2026-10-01' },
    ]),
    ensureLoaded,
  }),
}))

const role = { current: 'admin' }
vi.mock('@/composables/useCurrentUser', () => ({
  useCurrentUser: () => currentUserStub(role.current),
}))

const SELECT = '[data-testid="currency-select"]'

function mountForm(currencyCode = 'USD') {
  return mount(CurrencyForm, {
    props: { organization: { currency_code: currencyCode } as never },
    global: { mocks: { $t: (k: string) => k } },
  })
}

function validationError(code: string) {
  return Object.assign(new Error('422'), {
    status: 422,
    data: { errors: { currency_code: [code] } },
  })
}

beforeEach(() => {
  role.current = 'admin'
  ensureLoaded.mockReset().mockResolvedValue([])
  updateOrganization.mockReset().mockResolvedValue({ data: {} })
})

describe('CurrencyForm', () => {
  it('lists the active currencies as code and symbol, with the current one selected', async () => {
    const wrapper = mountForm('EUR')
    await flushPromises()

    const options = wrapper.get(SELECT).findAll('option')
    expect(options.map((o) => o.text())).toEqual(['USD ($)', 'EUR (€)'])
    expect((wrapper.get(SELECT).element as HTMLSelectElement).value).toBe('EUR')
  })

  it('saves the selected code', async () => {
    const wrapper = mountForm('USD')
    await flushPromises()

    await wrapper.get(SELECT).setValue('EUR')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateOrganization).toHaveBeenCalledWith({ currency_code: 'EUR' })
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it.each(['operator', 'viewer'])('is read-only for %s: no select, no save', async (who) => {
    role.current = who
    const wrapper = mountForm('EUR')
    await flushPromises()

    expect(wrapper.find(SELECT).exists()).toBe(false)
    expect(wrapper.get('[data-testid="currency-value"]').text()).toBe('EUR (€)')

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(updateOrganization).not.toHaveBeenCalled()
  })

  it('shows currency_unavailable localized, not the raw slug', async () => {
    updateOrganization.mockRejectedValue(validationError('currency_unavailable'))
    const wrapper = mountForm('USD')
    await flushPromises()

    await wrapper.get(SELECT).setValue('EUR')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const key = 'settings.currency.serverError.currency_unavailable'
    // `t` is the identity on the key; `te` checks both real locale files.
    expect(realI18n().te(key)).toBe(true)
    expect(wrapper.get('[data-testid="currency-error"]').text()).toBe(key)
  })

  it('shows a generic banner on a failure with no field payload', async () => {
    updateOrganization.mockRejectedValue(new Error('network'))
    const wrapper = mountForm('USD')
    await flushPromises()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="currency-banner"]').exists()).toBe(true)
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
})
