/**
 * useCurrencyCatalogue — the PLATFORM currency catalogue (`/admin/currencies`,
 * superadmin only, `currencies.manage`): every row, inactive ones included.
 *
 * No cache of its own: a stale list after a rate edit is worse than a second
 * request. The ACTIVE list behind the organization select lives in
 * `useCurrencies`; every write here drops that cache so the select reloads.
 */
import type { components, paths } from '../../types/api'
import { useApi } from './useApi'
import { useCurrencies } from './useCurrencies'

type ListResponse =
  paths['/admin/currencies']['get']['responses']['200']['content']['application/json']

export type CatalogueCurrency = components['schemas']['CurrencyResource']
export type CreateCurrencyPayload = components['schemas']['StoreCurrencyRequest']
export type UpdateCurrencyPayload = components['schemas']['UpdateCurrencyRequest']

export function useCurrencyCatalogue() {
  const { apiFetch } = useApi()
  const { invalidate } = useCurrencies()

  async function listCurrencies(): Promise<CatalogueCurrency[]> {
    return (await apiFetch<ListResponse>('/admin/currencies')).data
  }

  async function createCurrency(payload: CreateCurrencyPayload): Promise<void> {
    await apiFetch('/admin/currencies', { method: 'POST', body: payload })
    invalidate()
  }

  async function updateCurrency(code: string, payload: UpdateCurrencyPayload): Promise<void> {
    await apiFetch(`/admin/currencies/${code}`, { method: 'PATCH', body: payload })
    invalidate()
  }

  async function removeCurrency(code: string): Promise<void> {
    await apiFetch(`/admin/currencies/${code}`, { method: 'DELETE' })
    invalidate()
  }

  return { listCurrencies, createCurrency, updateCurrency, removeCurrency }
}
