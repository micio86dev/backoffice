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
import type { paths } from '../../types/api'
import { useApi } from './useApi'
import { useAuth } from './useAuth'

/**
 * DERIVED FROM THE GENERATED CLIENT, never hand-written.
 *
 * `/auth/me` is a contract owned by the API repository; a hand-maintained copy
 * of its shape here is a second source of truth across three repositories,
 * which CLAUDE.md forbids by design. `bun run codegen` regenerates
 * `types/api.ts` from the committed `openapi.json`, so a field that changes
 * server-side becomes a type error here rather than an `undefined` at runtime.
 */
export type CurrentUser =
  paths['/auth/me']['get']['responses']['200']['content']['application/json']

/**
 * What this user may do, RESOLVED BY THE SERVER'S POLICIES — the same ones
 * that guard the endpoints. Read this instead of the `roles` array:
 * `roles.includes('admin')` is a second copy of an authorization rule written
 * in a second language, and the copy drifts the moment the policy changes,
 * silently and in the permissive direction.
 */
export type Abilities = CurrentUser['abilities']

/** Every ability the server publishes, as `group.action`. */
export type AbilityKey = {
  [G in keyof Abilities]: `${G & string}.${keyof Abilities[G] & string}`
}[keyof Abilities]

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
  const abilities = computed(() => current.value?.abilities ?? null)

  /**
   * FAILS CLOSED. An unloaded identity, a failed `/auth/me`, or an ability
   * the server did not publish all answer `false` — so a transient error
   * hides an action rather than offering one that will come back 403.
   */
  function can(ability: AbilityKey): boolean {
    const [group, action] = ability.split('.') as [keyof Abilities, string]
    const group_ = abilities.value?.[group] as Record<string, boolean> | undefined

    return group_?.[action] === true
  }

  return { ensureLoaded, refresh, user, roles, abilities, can }
}
