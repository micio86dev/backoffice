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

export interface AbilityCatalogResponse {
  data: string[]
}

export function useApiClients() {
  const { apiFetch } = useApi()

  async function listClients(): Promise<ApiClientListResponse> {
    return apiFetch<ApiClientListResponse>('/m2m/clients')
  }

  /**
   * The abilities an API client may be granted.
   *
   * Fetched, never mirrored: the canonical set lives in the API's
   * `config/m2m_abilities.php` and is enforced by `AbilitiesValidator`, so a
   * copy here would go stale the first time an ability is added or removed —
   * and go stale silently, because a name the server no longer accepts looks
   * exactly like a valid one until the create call is refused.
   */
  async function listAbilities(): Promise<AbilityCatalogResponse> {
    return apiFetch<AbilityCatalogResponse>('/m2m/abilities')
  }

  async function createClient(payload: CreateApiClientPayload): Promise<CreateApiClientResponse> {
    return apiFetch<CreateApiClientResponse>('/m2m/clients', { method: 'POST', body: payload })
  }

  async function revokeClient(id: number | string): Promise<void> {
    await apiFetch<null>(`/m2m/clients/${id}`, { method: 'DELETE' })
  }

  return { listClients, listAbilities, createClient, revokeClient }
}
