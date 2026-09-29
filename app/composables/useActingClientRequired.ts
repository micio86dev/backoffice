/**
 * useActingClientRequired — "pick a client first" for tenant-scoped writes.
 *
 * A superadmin has no organization of their own. Until they choose a client in
 * the navbar switcher, creating an avatar template, importing templates or
 * adding a project question cannot complete: the API refuses each with HTTP 409
 * `organization_context_required`. Screens use this to say so BEFORE the click
 * rather than after it.
 *
 * The decision itself is `needsActingClient` (nav-visibility.ts), the same rule
 * that narrows the sidebar. This composable only feeds it: the published
 * `clients.viewAny` ability (never `is_superadmin`) and the server-side
 * selection.
 *
 * Fails OPEN: an unreadable identity or selection answers `false`. The server
 * enforces regardless, and hiding a working action because one read failed is
 * worse than letting the 409 explain itself.
 */
import { onMounted, ref } from 'vue'
import { needsActingClient } from '../utils/nav-visibility'
import { useCurrentUser } from './useCurrentUser'
import { useSuperadmin } from './useSuperadmin'

/** The notice's DOM id — what disabled controls point `aria-describedby` at. */
export const ACTING_CLIENT_NOTICE_ID = 'acting-client-required-notice'

export function useActingClientRequired() {
  const actingClientRequired = ref(false)

  onMounted(async () => {
    try {
      const { ensureLoaded, can } = useCurrentUser()
      await ensureLoaded()

      const canSwitchClients = can('clients.viewAny')
      if (!canSwitchClients) return

      const { acting_organization_id } = await useSuperadmin().fetchClients()

      actingClientRequired.value = needsActingClient({
        canSwitchClients,
        actingClientId: acting_organization_id ?? null,
      })
    } catch {
      actingClientRequired.value = false
    }
  })

  return { actingClientRequired }
}
