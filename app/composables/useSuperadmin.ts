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

/**
 * `GET /admin/clients` — the superadmin console's directory, one row per
 * organization with the platform-wide statistics the page renders (design
 * D3). Distinct from `ClientsResponse` above: `ClientDirectory`'s
 * identity-only `{id, name}` contract (the topbar switcher) is never widened
 * to carry these fields, so the two response shapes stay two types.
 */
export type ClientOverviewResponse =
  paths['/admin/clients']['get']['responses']['200']['content']['application/json']

export type ClientOverviewRow = ClientOverviewResponse['data'][number]

export function useSuperadmin() {
  const { apiFetch } = useApi()

  async function fetchClients(): Promise<ClientsResponse> {
    return apiFetch<ClientsResponse>('/admin/organizations')
  }

  /** Every client with its platform-wide statistics — the `/clients` console page. */
  async function fetchClientOverview(): Promise<ClientOverviewResponse> {
    return apiFetch<ClientOverviewResponse>('/admin/clients')
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

  return { fetchClients, fetchClientOverview, setActingClient }
}
