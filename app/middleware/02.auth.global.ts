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

const PUBLIC_PATHS = ['/unsupported', '/login', '/health']

export default defineNuxtRouteMiddleware((to) => {
  if (PUBLIC_PATHS.some((path) => to.path.endsWith(path))) {
    return
  }

  const { isAuthenticated } = useAuth()
  if (!isAuthenticated.value) {
    return navigateTo('/login')
  }
})
