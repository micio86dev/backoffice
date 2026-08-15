/**
 * useCurrentUser — identity and roles of the signed-in operator
 * (user-profile-self-service, design D6).
 *
 * Wraps `GET /auth/me`. Module-scoped shared state + a module-scoped
 * in-flight promise — the SAME "poor-man's store" single-flight shape as
 * `useAuth.ts:24-29`'s `refreshInFlight` — so a page that renders both the
 * shell identity (`SidebarNav`) and any other consumer (e.g. `/profile`)
 * issues exactly ONE `GET /auth/me` per page load, and repeated navigations
 * reuse the cache rather than re-fetching (admin-backoffice spec,
 * "Current-User State Is Fetched Once And Shared").
 *
 * Cleared by a module-scoped `watch(accessToken, …)` on `useAuth`'s ref: a
 * new session (or a cleared one) must never see a stale identity.
 * `useAuth.ts` imports nothing from this module, so there is no import
 * cycle.
 *
 * Client-side role checks (the `roles` computed) are for AFFORDANCE ONLY.
 * The server enforces; this decides what is worth showing.
 *
 * Invalidation after a profile edit: callers invoke `refresh()` (one
 * `/auth/me`) rather than patching the cache from a `/profile` response —
 * `/profile`'s resource shape and `/auth/me`'s envelope are two different
 * contracts and must not become two sources of truth for the same fields.
 */
import { computed, ref, watch } from 'vue'
import { useApi } from './useApi'
import { useAuth } from './useAuth'

export interface CurrentUser {
  user: { id: number; name: string; email: string; locale: string }
  organization: { id: number; name: string } | null
  roles: string[]
}

// Module-scoped state — intentionally NOT inside the useCurrentUser()
// function body, so every call site shares the same cached identity and the
// same in-flight fetch.
const current = ref<CurrentUser | null>(null)
let inFlight: Promise<CurrentUser> | null = null

watch(useAuth().accessToken, (token) => {
  if (token === null) current.value = null
})

async function load(): Promise<CurrentUser> {
  const { apiFetch } = useApi()
  const response = await apiFetch<CurrentUser>('/auth/me')
  current.value = response
  return response
}

export function useCurrentUser() {
  /**
   * Returns the cached current user, fetching it if this is the first call
   * (or the cache was cleared). Concurrent callers before the fetch settles
   * share the SAME in-flight promise — never more than one request in
   * flight at a time.
   */
  async function ensureLoaded(): Promise<CurrentUser> {
    if (current.value !== null) return current.value
    if (inFlight !== null) return inFlight

    inFlight = load().finally(() => {
      inFlight = null
    })

    return inFlight
  }

  /**
   * Forces a fresh `GET /auth/me`, replacing the cache, regardless of
   * whether a cached value already exists — the one call site that must
   * see server-fresh data (e.g. right after a profile save).
   */
  async function refresh(): Promise<CurrentUser> {
    inFlight = load().finally(() => {
      inFlight = null
    })

    return inFlight
  }

  const user = computed(() => current.value?.user ?? null)
  const roles = computed(() => current.value?.roles ?? [])

  return { ensureLoaded, refresh, user, roles }
}
