/**
 * useSuperadmin — the client list and the acting-organization switch.
 *
 * The switch is SERVER-SIDE by ratified design: this composable asks the API
 * to record which client the superadmin is looking at, and never sends an
 * organization id alongside ordinary requests. A client-supplied lever would
 * have to be honoured correctly by every endpoint, and one mistake is a
 * cross-tenant leak.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

export type ClientsResponse =
  paths['/admin/organizations']['get']['responses']['200']['content']['application/json']

export type Client = ClientsResponse['data'][number]

export function useSuperadmin() {
  const { apiFetch } = useApi()

  async function fetchClients(): Promise<ClientsResponse> {
    return apiFetch<ClientsResponse>('/admin/organizations')
  }

  /**
   * Select a client, or `null` to see them all again.
   *
   * The caller reloads afterwards rather than patching state in place: every
   * list, count and report on the screen was fetched under the previous
   * selection, and refreshing them one by one would leave whichever the
   * developer forgot showing another tenant's data. A reload is the only
   * version of this that cannot be half-done.
   */
  async function setActingClient(organizationId: number | null): Promise<void> {
    await apiFetch('/admin/acting-organization', {
      method: 'PUT',
      body: { organization_id: organizationId },
    })
  }

  return { fetchClients, setActingClient }
}
