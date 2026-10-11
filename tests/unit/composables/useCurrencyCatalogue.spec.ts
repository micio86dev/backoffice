/**
 * useCurrencyCatalogue (organization-currencies OC-07b): the SHAPE of each
 * platform call, and that every write drops the active-list cache the
 * organization select reads.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../../app/composables/useApi', () => ({ useApi: () => ({ apiFetch }) }))

const { useCurrencyCatalogue } = await import('../../../app/composables/useCurrencyCatalogue')
const { useCurrencies } = await import('../../../app/composables/useCurrencies')

const usd = {
  code: 'USD',
  symbol: '$',
  decimals: 2,
  rate_per_usd: '1',
  rate_as_of: null,
  is_active: true,
}

describe('useCurrencyCatalogue', () => {
  beforeEach(() => {
    apiFetch.mockReset()
  })

  it('lists every row from the admin endpoint and unwraps data', async () => {
    apiFetch.mockResolvedValue({ data: [usd] })

    await expect(useCurrencyCatalogue().listCurrencies()).resolves.toEqual([usd])
    expect(apiFetch).toHaveBeenCalledWith('/admin/currencies')
  })

  it('creates with POST, PATCHes by code and DELETEs by code', async () => {
    apiFetch.mockResolvedValue(null)
    const api = useCurrencyCatalogue()

    await api.createCurrency({ code: 'EUR', symbol: '€', decimals: 2 })
    await api.updateCurrency('EUR', { is_active: true })
    await api.removeCurrency('EUR')

    expect(apiFetch.mock.calls).toEqual([
      ['/admin/currencies', { method: 'POST', body: { code: 'EUR', symbol: '€', decimals: 2 } }],
      ['/admin/currencies/EUR', { method: 'PATCH', body: { is_active: true } }],
      ['/admin/currencies/EUR', { method: 'DELETE' }],
    ])
  })

  it('drops the active-list cache after a write so the select reloads', async () => {
    apiFetch.mockResolvedValue({ data: [usd] })
    const active = useCurrencies()
    await active.ensureLoaded()
    expect(active.currencies.value).not.toBeNull()

    await useCurrencyCatalogue().updateCurrency('USD', { symbol: '$' })

    expect(active.currencies.value).toBeNull()
  })

  it('keeps the cache when the write is refused', async () => {
    apiFetch.mockResolvedValueOnce({ data: [usd] })
    const active = useCurrencies()
    await active.ensureLoaded()
    apiFetch.mockRejectedValueOnce(new Error('409'))

    await expect(useCurrencyCatalogue().removeCurrency('USD')).rejects.toThrow()

    expect(active.currencies.value).not.toBeNull()
  })

  it('does not let a fetch that was in flight during a write repopulate the cache', async () => {
    let release: (value: unknown) => void = () => undefined
    apiFetch.mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
    const active = useCurrencies()
    active.invalidate()
    const pending = active.ensureLoaded()
    apiFetch.mockResolvedValueOnce(null)

    apiFetch.mockResolvedValueOnce({ data: [] })

    await useCurrencyCatalogue().updateCurrency('USD', { symbol: '$' })
    release({ data: [usd] })
    await pending

    // The stale payload never lands in the cache; only the post-write refetch does.
    expect(active.currencies.value).toEqual([])
  })

  it('hands a caller that started loading before a write the post-write list, not the stale one', async () => {
    const fresh = { ...usd, symbol: 'US$' }
    let release: (value: unknown) => void = () => undefined
    apiFetch.mockReset()
    apiFetch.mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
    const active = useCurrencies()
    active.invalidate()
    const pending = active.ensureLoaded()

    active.invalidate()
    apiFetch.mockResolvedValueOnce({ data: [fresh] })
    release({ data: [usd] })

    await expect(pending).resolves.toEqual([fresh])
    expect(apiFetch).toHaveBeenCalledTimes(2)
  })
})
