/**
 * 02.auth.global.ts — Auth route guard (D11).
 *
 * Redirects an unauthenticated visitor to /login. Numeric filename prefix
 * (`02.`) makes Nuxt's global-middleware execution order explicit: this runs
 * AFTER `01.browser-gate.global.ts`, so a mobile/unsupported visitor lands on
 * `/unsupported` rather than `/login`.
 *
 * Belt-and-braces (D11): this middleware ALSO early-returns on `/login` and
 * `/unsupported` directly, regardless of filename ordering — correctness does
 * not depend on execution order alone. Without this, a mobile visitor whose
 * browser-gate check somehow didn't fire first would be redirected to /login
 * instead of /unsupported, breaking SA-11.
 *
 * `/health` is also exempt: it is a machine-readable infra health check
 * (C1), never a gated admin view, and must stay reachable without a session.
 *
 * PRECONDITION CHANGED (backoffice-session-refresh-hardening D9): this
 * middleware stays SYNCHRONOUS and reads `isAuthenticated` exactly as
 * before, but the access token is now memory-only (D2/D4), so on a cold
 * load `isAuthenticated` would always be false the instant this file runs —
 * UNLESS `00.auth-bootstrap.client.ts`'s awaited silent refresh has already
 * settled first. Nuxt guarantees that ordering (non-`parallel` async
 * plugins resolve before the initial route resolves), which is why this
 * middleware itself never needs to await anything: making it `async` was
 * considered and rejected (D9) — it would run on every navigation, need its
 * own de-duplication, and leave /login racing the guard.
 */
import { useAuth } from '@/composables/useAuth'

/**
 * First path segment of each pre-auth surface, locale prefix excluded.
 *
 * `/forgot-password` and `/reset-password` (self-service-password-reset) are
 * reached, by definition, by someone with no session — a guard that bounces
 * them to /login is a recovery flow nobody can enter.
 */
const PUBLIC_ROOTS = new Set([
  'unsupported',
  'login',
  'health',
  'forgot-password',
  'reset-password',
])

/**
 * The route's own first segment, skipping an `@nuxtjs/i18n` locale prefix.
 *
 * REPLACES an `endsWith` match over full paths, which this change made
 * unworkable: the reset link carries its token as a PATH SEGMENT
 * (`api/app/Jobs/SendPasswordResetLinkJob.php:135`), so
 * `/reset-password/{token}` ends with the token, never with the route. It is
 * also strictly tighter than what it replaces — `endsWith` would have made a
 * hypothetical `/projects/login` public, and this does not.
 *
 * `strategy: 'prefix_except_default'` with `it` as default means the prefix,
 * when present, is a two-letter locale code and never a page: no route in this
 * app has a two-letter first segment.
 */
function routeRoot(path: string): string | undefined {
  const segments = path.split('/').filter((segment) => segment !== '')
  const head = segments[0]

  if (head !== undefined && segments.length > 1 && /^[a-z]{2}$/.test(head)) {
    return segments[1]
  }

  return head
}

export default defineNuxtRouteMiddleware((to) => {
  const root = routeRoot(to.path)
  if (root !== undefined && PUBLIC_ROOTS.has(root)) {
    return
  }

  const { isAuthenticated } = useAuth()
  if (!isAuthenticated.value) {
    return navigateTo('/login')
  }
})
