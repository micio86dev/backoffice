/**
 * useSuperadmin — the client list and the acting-organization switch.
 *
 * The switch is SERVER-SIDE by ratified design: this composable asks the API
 * to record which client the superadmin is looking at, and never sends an
 * organization id alongside ordinary requests. A client-supplied lever would
 * have to be honoured correctly by every endpoint, and one mistake is a
 * cross-tenant leak.
 */
import { watch } from 'vue'
import type { paths } from '../../types/api'
import { useApi } from './useApi'
import { useAuth } from './useAuth'

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

// Module-scoped, intentionally NOT inside the `useSuperadmin()` body — the
// point is that every call site shares ONE in-flight request, and state
// declared inside the function is per-call and shares nothing.
//
// Deliberately IN-FLIGHT ONLY, with no settled cache. `useCurrentUser` caches
// because identity does not change under you; the acting-client selection is
// exactly the thing that DOES, and `setActingClient()` below is followed by a
// full page reload for that reason. A cached client list would survive a
// switch and answer the next page with the previous selection — the failure
// that reload exists to prevent.
let clientsInFlight: Promise<ClientsResponse> | null = null

// Same discipline `useCurrentUser` applies to its cache: a logout must not
// leave one tenant's request resolving into the next session.
watch(useAuth().accessToken, (token) => {
  if (token === null) clientsInFlight = null
})

export function useSuperadmin() {
  const { apiFetch } = useApi()

  /**
   * SINGLE-FLIGHT. `NavBar` and `SidebarNav` both call this on mount, so every
   * superadmin page load fired TWO concurrent `GET /admin/organizations` —
   * same request, same answer, twice, on every navigation.
   *
   * Concurrent callers share the one promise; once it settles the next caller
   * starts a fresh request. That is the whole guarantee, and it is the right
   * size for this data: the two shells mount together, which is precisely the
   * window a single-flight closes, while a later call must be allowed to see a
   * selection that changed in between.
   */
  async function fetchClients(): Promise<ClientsResponse> {
    if (clientsInFlight !== null) return clientsInFlight

    clientsInFlight = apiFetch<ClientsResponse>('/admin/organizations').finally(() => {
      clientsInFlight = null
    })

    return clientsInFlight
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
