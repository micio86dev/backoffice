/**
 * CurrencyCatalogPanel.vue (organization-currencies OC-07b.1).
 *
 * The superadmin's view of the WHOLE catalogue (inactive rows included). What
 * matters here: the rate always travels as a decimal STRING with its date, the
 * USD row offers nothing destructive, activation is refused client-side
 * without a rate, and every server refusal reads as localized copy, never a
 * raw machine slug.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { waitForTestId } from '../../support/wait-for'

const tMock = (key: string) => key
const listCurrencies = vi.fn()
const createCurrency = vi.fn()
const updateCurrency = vi.fn()
const removeCurrency = vi.fn()

vi.mock('../../../../app/composables/useCurrencyCatalogue', () => ({
  useCurrencyCatalogue: () => ({ listCurrencies, createCurrency, updateCurrency, removeCurrency }),
}))

const CurrencyCatalogPanel = (
  await import('../../../../app/components/organisms/CurrencyCatalogPanel.vue')
).default

const usd = {
  code: 'USD',
  symbol: '$',
  decimals: 2,
  rate_per_usd: '1',
  rate_as_of: null,
  is_active: true,
}
const eurNoRate = {
  code: 'EUR',
  symbol: '€',
  decimals: 2,
  rate_per_usd: null,
  rate_as_of: null,
  is_active: false,
}
const gbp = {
  code: 'GBP',
  symbol: '£',
  decimals: 2,
  rate_per_usd: '0.8',
  rate_as_of: '2026-10-01',
  is_active: true,
}

const rejection = (status: number, data: object) =>
  Object.assign(new Error(String(status)), { status, data })

const mounted: Array<{ unmount: () => void }> = []

async function mountPanel() {
  const wrapper = mount(CurrencyCatalogPanel, {
    global: { mocks: { $t: tMock } },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

function setValue(testId: string, value: string): void {
  const input = document.body.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)
  input!.value = value
  input!.dispatchEvent(new Event('input'))
}

async function submit(formId: string): Promise<void> {
  // `Input` emits its v-model passively (a watcher), so let typed values land first.
  await flushPromises()
  document.body
    .querySelector<HTMLFormElement>(`[data-testid="${formId}"]`)
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
}

async function confirmDialog(): Promise<void> {
  const button = await waitForTestId('confirm-dialog-confirm')
  button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flushPromises()
}

beforeEach(() => {
  listCurrencies.mockReset().mockResolvedValue([usd, eurNoRate, gbp])
  createCurrency.mockReset().mockResolvedValue(undefined)
  updateCurrency.mockReset().mockResolvedValue(undefined)
  removeCurrency.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  try {
    for (const wrapper of mounted.splice(0)) wrapper.unmount()
  } finally {
    document.body.innerHTML = ''
  }
})

describe('CurrencyCatalogPanel — listing', () => {
  it('lists every row with symbol, decimals, rate and date, and flags the rate-less inactive one', async () => {
    const wrapper = await mountPanel()

    expect(wrapper.findAll('[data-testid^="currency-row-"]')).toHaveLength(3)
    const gbpRow = wrapper.get('[data-testid="currency-row-GBP"]').text()
    expect(gbpRow).toContain('£')
    expect(gbpRow).toContain('0.8')
    expect(wrapper.get('[data-testid="currency-row-EUR"]').text()).toContain(
      'currencies.status.noRate'
    )
    expect(wrapper.find('[data-testid="currency-no-rate-GBP"]').exists()).toBe(false)
  })
})

describe('CurrencyCatalogPanel — failed load', () => {
  it('shows the error, not the empty-catalogue line', async () => {
    listCurrencies.mockRejectedValueOnce(rejection(500, {}))
    const wrapper = await mountPanel()

    expect(wrapper.get('[data-testid="currency-conflict"]').text()).toBe('currencies.loadError')
    expect(wrapper.text()).not.toContain('currencies.empty')
  })
})

describe('CurrencyCatalogPanel — accessible names', () => {
  it('names the currency in every row action so rows are distinguishable', async () => {
    const wrapper = await mountPanel()

    for (const id of ['edit', 'toggle', 'delete']) {
      expect(wrapper.get(`[data-testid="currency-${id}-GBP"]`).text()).toContain('GBP')
    }
  })
})

describe('CurrencyCatalogPanel — create', () => {
  it('sends the rate as a decimal STRING with its date', async () => {
    const wrapper = await mountPanel()
    await wrapper.get('[data-testid="currency-new"]').trigger('click')
    await waitForTestId('currency-form')

    setValue('currency-form-code', 'CHF')
    setValue('currency-form-symbol', 'Fr')
    setValue('currency-form-decimals', '2')
    setValue('currency-form-rate', '0.912345')
    setValue('currency-form-as-of', '2026-10-09')
    await submit('currency-form')

    expect(createCurrency).toHaveBeenCalledWith({
      code: 'CHF',
      symbol: 'Fr',
      decimals: 2,
      rate_per_usd: '0.912345',
      rate_as_of: '2026-10-09',
    })
  })

  it('omits the rate and date when neither is typed, and refuses a malformed rate without calling the API', async () => {
    const wrapper = await mountPanel()
    await wrapper.get('[data-testid="currency-new"]').trigger('click')
    await waitForTestId('currency-form')
    setValue('currency-form-code', 'SEK')
    setValue('currency-form-symbol', 'kr')
    setValue('currency-form-decimals', '2')
    setValue('currency-form-rate', '1,5')
    setValue('currency-form-as-of', '2026-10-09')
    await submit('currency-form')

    expect(createCurrency).not.toHaveBeenCalled()
    expect(document.body.querySelector('[data-testid="currency-form-rate-error"]')).not.toBeNull()

    setValue('currency-form-rate', '')
    setValue('currency-form-as-of', '')
    await submit('currency-form')

    expect(createCurrency).toHaveBeenCalledWith({ code: 'SEK', symbol: 'kr', decimals: 2 })
  })

  it('renders a 422 slug as localized copy, never the raw code', async () => {
    createCurrency.mockRejectedValueOnce(
      rejection(422, { errors: { code: ['currency_code_taken'] } })
    )
    const wrapper = await mountPanel()
    await wrapper.get('[data-testid="currency-new"]').trigger('click')
    await waitForTestId('currency-form')
    setValue('currency-form-code', 'GBP')
    setValue('currency-form-symbol', '£')
    setValue('currency-form-decimals', '2')
    await submit('currency-form')

    const text = document.body.textContent ?? ''
    expect(text).toContain('currencies.serverError.currency_code_taken')
    expect(text).not.toMatch(/(?<!\.)currency_code_taken/)
  })
})

describe('CurrencyCatalogPanel — edit', () => {
  it('sends rate and date together (rate as a string) and keeps the code read-only', async () => {
    const wrapper = await mountPanel()
    await wrapper.get('[data-testid="currency-edit-GBP"]').trigger('click')
    await waitForTestId('currency-edit-form')

    expect(
      document.body.querySelector<HTMLInputElement>('[data-testid="currency-edit-form-code"]')
        ?.disabled
    ).toBe(true)
    setValue('currency-edit-form-rate', '0.81')
    setValue('currency-edit-form-as-of', '2026-10-10')
    await submit('currency-edit-form')

    expect(updateCurrency).toHaveBeenCalledWith('GBP', {
      symbol: '£',
      decimals: 2,
      rate_per_usd: '0.81',
      rate_as_of: '2026-10-10',
    })
  })

  it('refuses to blank the rate and date of a row that already has a rate', async () => {
    const wrapper = await mountPanel()
    await wrapper.get('[data-testid="currency-edit-GBP"]').trigger('click')
    await waitForTestId('currency-edit-form')
    setValue('currency-edit-form-rate', '')
    setValue('currency-edit-form-as-of', '')
    await submit('currency-edit-form')

    expect(updateCurrency).not.toHaveBeenCalled()
    expect(
      document.body.querySelector('[data-testid="currency-edit-form-rate-error"]')?.textContent
    ).toContain('currencies.validation.rateStored')
  })

  it('still saves a symbol-only edit on a row with no stored rate', async () => {
    const wrapper = await mountPanel()
    await wrapper.get('[data-testid="currency-edit-EUR"]').trigger('click')
    await waitForTestId('currency-edit-form')
    setValue('currency-edit-form-symbol', 'EUR')
    await submit('currency-edit-form')

    expect(updateCurrency).toHaveBeenCalledWith('EUR', { symbol: 'EUR', decimals: 2 })
  })

  it('validates the symbol length on the trimmed value', async () => {
    const wrapper = await mountPanel()
    await wrapper.get('[data-testid="currency-edit-GBP"]').trigger('click')
    await waitForTestId('currency-edit-form')
    setValue('currency-edit-form-symbol', '  £       ')
    await submit('currency-edit-form')

    expect(updateCurrency).toHaveBeenCalledWith('GBP', {
      symbol: '£',
      decimals: 2,
      rate_per_usd: '0.8',
      rate_as_of: '2026-10-01',
    })
  })

  it('USD edits the symbol only: no rate, date or decimals fields, nothing but the symbol sent', async () => {
    const wrapper = await mountPanel()
    await wrapper.get('[data-testid="currency-edit-USD"]').trigger('click')
    await waitForTestId('currency-edit-form')

    expect(document.body.querySelector('[data-testid="currency-edit-form-rate"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="currency-edit-form-as-of"]')).toBeNull()
    setValue('currency-edit-form-symbol', 'US$')
    await submit('currency-edit-form')

    expect(updateCurrency).toHaveBeenCalledWith('USD', { symbol: 'US$' })
  })
})

describe('CurrencyCatalogPanel — activate, deactivate, delete', () => {
  it('activates and deactivates through is_active only', async () => {
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="currency-toggle-GBP"]').trigger('click')
    await confirmDialog()
    expect(updateCurrency).toHaveBeenCalledWith('GBP', { is_active: false })
  })

  it('activation is disabled, with an explanation, while there is no rate', async () => {
    const wrapper = await mountPanel()

    const toggle = wrapper.get('[data-testid="currency-toggle-EUR"]')
    expect(toggle.attributes('aria-disabled')).toBe('true')
    expect(toggle.attributes('aria-describedby')).toBe('currency-activation-hint-EUR')
    await toggle.trigger('click')
    expect(updateCurrency).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="currency-activation-hint-EUR"]').text()).toContain(
      'currencies.activationRequiresRate'
    )
  })

  it('deletes only after confirmation', async () => {
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="currency-delete-GBP"]').trigger('click')
    expect(removeCurrency).not.toHaveBeenCalled()
    await confirmDialog()

    expect(removeCurrency).toHaveBeenCalledWith('GBP')
  })

  it.each(['currency_in_use', 'currency_usd_immutable'])(
    'renders the 409 %s as localized copy',
    async (slug) => {
      removeCurrency.mockRejectedValueOnce(rejection(409, { message: slug }))
      const wrapper = await mountPanel()

      await wrapper.get('[data-testid="currency-delete-GBP"]').trigger('click')
      await confirmDialog()

      const banner = wrapper.get('[data-testid="currency-conflict"]').text()
      expect(banner).toBe(`currencies.conflict.${slug}`)
    }
  )

  it('the 409 on deactivate is localized too', async () => {
    updateCurrency.mockRejectedValueOnce(rejection(409, { message: 'currency_in_use' }))
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="currency-toggle-GBP"]').trigger('click')
    await confirmDialog()

    expect(wrapper.get('[data-testid="currency-conflict"]').text()).toBe(
      'currencies.conflict.currency_in_use'
    )
  })

  it.each([
    [403, 'currencies.error.forbidden'],
    [404, 'currencies.error.notFound'],
    [409, 'currencies.error.notReady'],
  ])(
    'a %i without a known slug has its own copy, distinct from a plain failure',
    async (status, copy) => {
      updateCurrency.mockRejectedValueOnce(rejection(status, {}))
      const wrapper = await mountPanel()

      await wrapper.get('[data-testid="currency-toggle-GBP"]').trigger('click')
      await confirmDialog()

      expect(wrapper.get('[data-testid="currency-conflict"]').text()).toBe(copy)
    }
  )

  it('a 500 falls back to the generic action error', async () => {
    updateCurrency.mockRejectedValueOnce(rejection(500, {}))
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="currency-toggle-GBP"]').trigger('click')
    await confirmDialog()

    expect(wrapper.get('[data-testid="currency-conflict"]').text()).toBe('currencies.actionError')
  })

  it('USD row shows no delete and no deactivate control', async () => {
    const wrapper = await mountPanel()

    expect(wrapper.find('[data-testid="currency-delete-USD"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="currency-toggle-USD"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="currency-edit-USD"]').exists()).toBe(true)
  })
})

describe('currencies.* copy', () => {
  const slugs = [
    'currency_code_invalid',
    'currency_code_taken',
    'currency_code_immutable',
    'currency_symbol_invalid',
    'currency_decimals_invalid',
    'currency_rate_invalid',
    'currency_rate_as_of_invalid',
    'currency_active_invalid',
    'currency_activation_requires_rate',
  ]
  for (const locale of ['en', 'it']) {
    it(`${locale} carries a message for every server slug and both conflicts`, () => {
      const catalogue = JSON.parse(
        readFileSync(join(__dirname, `../../../../i18n/locales/${locale}.json`), 'utf8')
      ) as {
        currencies: {
          serverError: Record<string, string>
          conflict: Record<string, string>
          error: Record<string, string>
        }
      }

      for (const slug of slugs) expect(catalogue.currencies.serverError[slug]).toBeTruthy()
      expect(catalogue.currencies.conflict.currency_in_use).toBeTruthy()
      expect(catalogue.currencies.conflict.currency_usd_immutable).toBeTruthy()
      for (const key of ['forbidden', 'notFound', 'notReady'])
        expect(catalogue.currencies.error[key]).toBeTruthy()
    })
  }
})
