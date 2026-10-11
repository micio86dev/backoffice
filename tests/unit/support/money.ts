/**
 * Test doubles for what `useMoney` reads (organization-currencies OC-06): the
 * acting organization's currency and the active catalogue. Specs register them
 * with `vi.doMock` so no cost surface reaches the network, and flip
 * `moneyState` to put the organization in EUR.
 */
import { ref } from 'vue'

export const EUR_ROW = {
  code: 'EUR',
  symbol: '€',
  decimals: 2,
  rate_per_usd: '0.920000',
  rate_as_of: '2026-10-01',
  is_active: true,
}

export const moneyState = {
  currencyCode: ref<string | null | undefined>('USD'),
  catalogue: ref<unknown[] | null>([]),
}

export function resetMoney(): void {
  moneyState.currencyCode.value = 'USD'
  moneyState.catalogue.value = []
}

export function useEur(): void {
  moneyState.currencyCode.value = 'EUR'
  moneyState.catalogue.value = [EUR_ROW]
}

export const organizationDouble = () => ({
  useOrganization: () => ({ currencyCode: moneyState.currencyCode }),
})

export const currenciesDouble = () => ({
  useCurrencies: () => ({
    currencies: moneyState.catalogue,
    ensureLoaded: () => Promise.resolve([]),
  }),
})
