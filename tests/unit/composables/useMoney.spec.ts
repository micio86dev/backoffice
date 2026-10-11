/**
 * useMoney (organization-currencies OC-06): the one entry point every cost
 * surface uses. Conversion is display only (`usd * rate_per_usd`, applied
 * once); anything short of a usable active currency falls back to plain USD,
 * never to a guess or a zero.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const currencyCode = ref<string | null | undefined>('EUR')
const currencies = ref<unknown[] | null>(null)
const ensureLoaded = vi.fn()

vi.mock('../../../app/composables/useOrganization', () => ({
  useOrganization: () => ({ currencyCode }),
}))
vi.mock('../../../app/composables/useCurrencies', () => ({
  useCurrencies: () => ({ currencies, ensureLoaded }),
}))

const t = (key: string, params?: Record<string, unknown>) =>
  params === undefined ? key : `${key}:${JSON.stringify(params)}`

const eur = {
  code: 'EUR',
  symbol: '€',
  decimals: 2,
  rate_per_usd: '0.920000',
  rate_as_of: '2026-10-01',
  is_active: true,
}

const { useMoney } = await import('../../../app/composables/useMoney')

function setup(locale = 'en') {
  vi.stubGlobal(
    'useI18n',
    vi.fn(() => ({ t, locale: ref(locale) }))
  )
  return useMoney()
}

const intl = (locale: string, code: string, value: number) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

describe('useMoney', () => {
  beforeEach(() => {
    currencyCode.value = 'EUR'
    currencies.value = [eur]
    ensureLoaded.mockReset()
    ensureLoaded.mockResolvedValue([])
  })

  it('converts once, marks the amount approximate and exposes the reconciliation note', () => {
    const { money, moneyNote, moneyLabel } = setup('en')

    const amount = intl('en', 'EUR', 0.92)
    expect(money(1)).toBe(`money.approximate:${JSON.stringify({ amount })}`)
    expect(moneyLabel(1)).toBe(`money.approximateLabel:${JSON.stringify({ amount })}`)
    expect(moneyNote(1)).toBe(
      `money.convertedNote:${JSON.stringify({
        usd: intl('en', 'USD', 1),
        rate: '0.92',
        code: 'EUR',
        date: 'Oct 1, 2026',
      })}`
    )
  })

  it('formats the amount and the date in the UI locale', () => {
    const { money, moneyNote } = setup('it')

    expect(money(1)).toContain(JSON.stringify(intl('it', 'EUR', 0.92)).slice(1, -1))
    expect(moneyNote(1)).toContain('1 ott 2026')
    expect(moneyNote(1)).toContain('"rate":"0,92"')
  })

  it('shows plain USD with no approximation and no note when the organization uses USD', () => {
    currencyCode.value = 'USD'
    currencies.value = [{ ...eur, code: 'USD', symbol: '$', rate_per_usd: '1.000000' }]
    const { money, moneyNote, moneyLabel } = setup('en')

    expect(money(2.34567)).toBe('$2.35')
    expect(moneyLabel(2.34567)).toBeNull()
    expect(moneyNote(2.34567)).toBeNull()
  })

  it.each([
    ['an inactive currency', [{ ...eur, is_active: false }], 'EUR'],
    ['a rate-less currency', [{ ...eur, rate_per_usd: null }], 'EUR'],
    ['a zero rate', [{ ...eur, rate_per_usd: '0' }], 'EUR'],
    ['a currency missing from the catalogue', [eur], 'JPY'],
    ['a catalogue that failed to load', null, 'EUR'],
    ['an unknown organization currency', [eur], undefined],
    ['no acting organization', [eur], null],
  ])('falls back to USD for %s', (_label, catalogue, code) => {
    currencies.value = catalogue
    currencyCode.value = code as string | null | undefined
    const { money, moneyNote } = setup('en')

    expect(money(1)).toBe('$1.00')
    expect(moneyNote(1)).toBeNull()
  })

  it('shows a malformed rate date as received instead of throwing during render', () => {
    currencies.value = [{ ...eur, rate_as_of: 'not-a-date' }]
    const { moneyNote } = setup('en')

    expect(moneyNote(1)).toContain('"date":"not-a-date"')
  })

  it('loads the catalogue and swallows a failed fetch', async () => {
    ensureLoaded.mockRejectedValue(new Error('HTTP 500'))

    expect(() => setup()).not.toThrow()
    await Promise.resolve()
    expect(ensureLoaded).toHaveBeenCalledOnce()
  })

  it('re-evaluates when the organization currency changes', () => {
    const { money } = setup('en')
    expect(money(1)).toContain('money.approximate')

    currencyCode.value = 'USD'
    expect(money(1)).toBe('$1.00')
  })
})
