/**
 * useApiClients — typed reads/writes over the existing C5 `/m2m/clients`
 * endpoints. The raw key is returned exactly once, on create, alongside the
 * resource — never persisted, never re-fetchable. Thin wiring over
 * `useApi().apiFetch`, mirroring `useParticipants.ts:16-30`.
 */
import type { components } from '../../types/api'
import { useApi } from './useApi'

export type ApiClient = components['schemas']['ApiClientResource']

export interface ApiClientListResponse {
  data: ApiClient[]
}

export interface CreateApiClientPayload {
  name: string
  abilities: string[]
  expires_at?: string | null
}

export interface CreateApiClientResponse {
  data: ApiClient
  api_key: string
}

export function useApiClients() {
  const { apiFetch } = useApi()

  async function listClients(): Promise<ApiClientListResponse> {
    return apiFetch<ApiClientListResponse>('/m2m/clients')
  }

  async function createClient(payload: CreateApiClientPayload): Promise<CreateApiClientResponse> {
    return apiFetch<CreateApiClientResponse>('/m2m/clients', { method: 'POST', body: payload })
  }

  async function revokeClient(id: number | string): Promise<void> {
    await apiFetch<null>(`/m2m/clients/${id}`, { method: 'DELETE' })
  }

  return { listClients, createClient, revokeClient }
}
