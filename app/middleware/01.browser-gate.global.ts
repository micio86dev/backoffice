/**
 * 01.browser-gate.global.ts — Browser Support Gate Middleware (SA-11, D11).
 *
 * Ported from `frontend/app/middleware/browser-gate.global.ts`. The backoffice
 * is SPA-only (`ssr: false`) — there is no server-render pass to branch on, so
 * unlike the frontend port this middleware always reads `navigator`/`window`
 * directly (client-only, no `import.meta.server` branch).
 *
 * Numeric filename prefix (`01.`) makes Nuxt's global-middleware execution
 * order explicit: this MUST run before `02.auth.global.ts`, so a mobile
 * visitor is sent to `/unsupported` rather than `/login` (D11).
 *
 * Skip condition: `to.path.endsWith('/unsupported')` covers both `/unsupported`
 * and `/en/unsupported` (i18n-prefixed) — prevents a redirect loop.
 */
import { isSupportedBrowser } from '~/utils/browser-gate'

export default defineNuxtRouteMiddleware((to) => {
  if (to.path.endsWith('/unsupported')) {
    return
  }

  const ua = navigator.userAgent
  const width = window.innerWidth
  if (!isSupportedBrowser(ua, width)) {
    return navigateTo('/unsupported')
  }
})
