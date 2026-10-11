/**
 * useCurrencies — the ACTIVE currency catalogue (`GET /api/currencies`).
 *
 * Module-scoped cache plus a single in-flight promise, the shape
 * `useCurrentUser` uses: one fetch per app load however many consumers ask.
 * The catalogue is platform data (no tenant), so sharing it is safe.
 * Types come from the generated client; nothing here is hand-typed.
 */
import { ref, readonly } from 'vue'
import type { paths } from '../../types/api'
import { useApi } from './useApi'

type CurrenciesResponse =
  paths['/currencies']['get']['responses']['200']['content']['application/json']

export type CurrencyRecord = CurrenciesResponse['data'][number]

const list = ref<CurrencyRecord[] | null>(null)
let inFlight: Promise<CurrencyRecord[]> | null = null

export function useCurrencies() {
  const { apiFetch } = useApi()

  /** Resolves with the catalogue, fetching it once; rejects when the fetch fails. */
  async function ensureLoaded(): Promise<CurrencyRecord[]> {
    if (list.value !== null) return list.value

    inFlight ??= apiFetch<CurrenciesResponse>('/currencies')
      .then((response) => (list.value = response.data))
      .finally(() => {
        inFlight = null
      })

    return inFlight
  }

  return { currencies: readonly(list), ensureLoaded }
}
