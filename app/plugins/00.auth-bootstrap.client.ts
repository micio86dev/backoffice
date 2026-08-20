/**
 * 00.auth-bootstrap.client.ts — awaited silent refresh before the router's
 * auth guard evaluates (backoffice-session-refresh-hardening design D9).
 *
 * Nuxt awaits every non-`parallel` async client plugin before the initial
 * route resolves — THAT is the guarantee, not the `00.` prefix. The prefix
 * only keeps the ordering intent readable next to the existing
 * `i18n-base-url.client.ts` (`enforce: 'pre'`).
 *
 * useAuth's access token is memory-only (D2/D4), so a reload always starts
 * with an empty session. Without this plugin, 02.auth.global.ts would
 * redirect an operator who still holds a valid refresh cookie to /login on
 * every single reload — flashing the login page even though the session is
 * genuinely still alive server-side.
 *
 * The plugin cannot know whether a `beai_refresh` cookie exists (that is the
 * point of HttpOnly), so it always attempts exactly one
 * `POST /api/auth/refresh` with `credentials: 'include'` — one extra request
 * per cold load, the whole cost of this design.
 *
 * Calls `useAuth().refresh()` DIRECTLY, never `useApi()`: `useApi()`
 * redirects to /login on failure, and a redirect issued during boot risks a
 * loop. Any rejection is swallowed, the session is left empty, and the
 * plugin resolves normally — a throwing plugin would prevent the app from
 * booting into /login at all.
 */
import { useAuth } from '@/composables/useAuth'

export default defineNuxtPlugin({
  name: 'auth-bootstrap',
  async setup() {
    const { refresh } = useAuth()

    try {
      await refresh()
    } catch {
      // No valid refresh cookie (or the refresh itself failed) — leave the
      // session empty. 02.auth.global.ts's normal unauthenticated path
      // (redirect to /login) handles it from here.
    }
  },
})
