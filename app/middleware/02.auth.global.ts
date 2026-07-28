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
