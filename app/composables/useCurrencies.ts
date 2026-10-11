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
// Bumped by `invalidate` so a fetch already in flight cannot write pre-edit data back.
let generation = 0

export function useCurrencies() {
  const { apiFetch } = useApi()

  /** Resolves with the catalogue, fetching it once; rejects when the fetch fails. */
  async function ensureLoaded(): Promise<CurrencyRecord[]> {
    if (list.value !== null) return list.value

    const started = generation
    inFlight ??= apiFetch<CurrenciesResponse>('/currencies')
      .then((response) => {
        // A write landed mid-flight: this payload is stale, so hand back the fresh load.
        if (started !== generation) return ensureLoaded()
        list.value = response.data
        return response.data
      })
      .finally(() => {
        if (started === generation) inFlight = null
      })

    return inFlight
  }

  /** Drops the cache so the next `ensureLoaded` refetches (after a catalogue write). */
  function invalidate(): void {
    generation += 1
    inFlight = null
    list.value = null
  }

  return { currencies: readonly(list), ensureLoaded, invalidate }
}
