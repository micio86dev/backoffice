/**
 * 03.abilities.global.ts — hides pages the signed-in user may not use.
 *
 * Runs AFTER `02.auth.global.ts`, so it only ever sees a session: an
 * unauthenticated visitor is already on /login and never reaches a check that
 * would answer "no ability" for the uninteresting reason that there is nobody
 * signed in.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not the access control. Every endpoint behind these pages authorizes
 * independently, and an operator who types /settings and gets past this guard
 * still sees nothing but 403s. Removing the page is a product decision — an
 * operator should not be shown a door that is locked — and the lock is on the
 * server.
 *
 * WHY IT ASKS THE SERVER RATHER THAN READING THE ROLE
 * ---------------------------------------------------
 * The required ability below is compared against the map `/auth/me` publishes,
 * and every value in that map is a real policy call on the server. A guard
 * written as `roles.includes('admin')` would be a second copy of the rule,
 * and the copy drifts the moment the policy changes.
 *
 * IT FAILS CLOSED. `can()` answers false for an identity that failed to load,
 * so a transient `/auth/me` error sends the user back to the dashboard rather
 * than opening a page whose every request will be refused.
 */
import type { AbilityKey } from '@/composables/useCurrentUser'
import { useCurrentUser } from '@/composables/useCurrentUser'

/**
 * Route root → the ability that page needs.
 *
 * Keyed by FIRST PATH SEGMENT, matching `02.auth.global.ts`'s `routeRoot`, so
 * `/settings`, `/settings/`, `/en/settings` and any future child route are all
 * covered by one entry — a guard that has to be remembered for each new child
 * page is a guard that will be forgotten for one.
 */
const REQUIRED: Record<string, AbilityKey> = {
  settings: 'users.viewAny',
  'avatar-templates': 'avatarTemplates.viewAny',
}

/**
 * Duplicated from `02.auth.global.ts` rather than shared, deliberately: the
 * two guards must keep agreeing about what a route root IS, and importing one
 * middleware from another to save eight lines couples their load order.
 */
function routeRoot(path: string): string | undefined {
  const segments = path.split('/').filter((segment) => segment !== '')
  const head = segments[0]

  if (head !== undefined && segments.length > 1 && /^[a-z]{2}$/.test(head)) {
    return segments[1]
  }

  return head
}

export default defineNuxtRouteMiddleware(async (to) => {
  const root = routeRoot(to.path)
  if (root === undefined) return

  const required = REQUIRED[root]
  if (required === undefined) return

  const { ensureLoaded, can } = useCurrentUser()

  try {
    // Cached after the first call and shared with the shell, so this adds a
    // request on cold load only — the same single `/auth/me` SidebarNav
    // already needs to render.
    await ensureLoaded()
  } catch {
    // Fail closed: an identity we could not load grants nothing.
    return navigateTo('/')
  }

  if (!can(required)) {
    return navigateTo('/')
  }
})
