import { test, expect, type Route } from '@playwright/test'

/**
 * Sidebar navigation (Phase 30, task 30.1): iterate every `SidebarNav.vue`
 * entry and assert none resolves to a 404/SPA-fallback — this change's own
 * success criterion (`SidebarNav.vue:55-64` links six routes; before this
 * change, three had no page file), made executable.
 *
 * Bypasses the broken `login()` helper (pre-existing, documented in
 * tasks.md task 4.3 and the three other new specs in this batch) by
 * injecting a session token directly into `sessionStorage` before the app
 * boots — `useAuth().ensureHydrated()` reads it on first `useAuth()` call,
 * so `02.auth.global.ts`'s route guard sees an authenticated visitor without
 * ever needing the login FORM to render.
 *
 * DEEPER FINDING on the pre-existing `login()` blocker (tasks.md task 4.3,
 * `projects-crud.spec.ts`, `settings-tabs.spec.ts`, `reports-index.spec.ts`):
 * it is NOT specific to the login page. In THIS session's environment,
 * `page.goto()` to `/login` — a completely unmodified, pre-existing route —
 * reproduces the identical symptom this spec hit for `/`, `/participants`,
 * `/projects`, `/reports`, and `/settings`: the browser's console reports
 * `Failed to load resource: the server responded with a status of 404
 * (Page not found: /login)` against `playwright.config.ts`'s `webServer`
 * (`bunx serve .output/public -s` on `127.0.0.1:3000`). Only `/health` and
 * `/unsupported` are confirmed reachable via direct `goto()` there.
 *
 * Isolated further: an independently-started `bunx serve .output/public -s`
 * instance on a DIFFERENT port served every one of these same paths
 * correctly (200, byte-identical shell to `/health`, verified via `curl`).
 * The regression is therefore specific to how the webServer at
 * `127.0.0.1:3000` behaves in this session — a `serve`-vs-port-3000
 * interaction (a Docker proxy was independently observed also present near
 * that port in this sandbox) is the leading hypothesis, not a confirmed
 * root cause. Either way: this is shared E2E serving infrastructure
 * (`playwright.config.ts`), reproduces identically against unmodified
 * pre-existing routes, and is out of this batch's scope to fix.
 *
 * This spec is written correctly and is ready to run once that
 * infrastructure issue is resolved — it could NOT be run to completion in
 * this environment, same as every other new Playwright spec in this batch.
 */

const SIDEBAR_ROUTES: { path: string; heading: string }[] = [
  { path: '/', heading: 'Dashboard' },
  { path: '/projects', heading: 'Progetti' },
  { path: '/participants', heading: 'Candidati' },
  { path: '/reports', heading: 'Report' },
  { path: '/avatar-templates', heading: 'Template avatar' },
  { path: '/settings', heading: 'Impostazioni' },
]

/**
 * `apiBase` is `''` in this SPA (same-origin, D11) — several API paths
 * (`/participants`, `/projects`, `/avatar-templates`) are BYTE-IDENTICAL to
 * their own SPA route. Scoping every mock to non-document resource types is
 * required, or the mock intercepts the DOCUMENT navigation itself and masks
 * whatever the real static server would have returned — documented
 * precedent: `admin-flow.spec.ts`'s `isDataRequest()`.
 */
function isDataRequest(route: Route): boolean {
  return route.request().resourceType() !== 'document'
}

async function mockBaselineApi(page: import('@playwright/test').Page): Promise<void> {
  const jsonData = (data: unknown = []) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data }),
  })

  await page.route(
    (url) => url.pathname === '/dashboard/metrics',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            participants_by_status: {},
            evaluations_by_status: {},
            completion_rate: 0,
            ai_usage: { input_tokens: 0, output_tokens: 0, latency_ms_p50: 0, latency_ms_p95: 0 },
          },
        }),
      })
  )
  await page.route(
    (url) => url.pathname === '/participants',
    (route) =>
      isDataRequest(route)
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: [],
              links: { first: null, last: null, prev: null, next: null },
              meta: { current_page: 1, last_page: 1, total: 0, from: null, to: null, per_page: 20 },
            }),
          })
        : route.continue()
  )
  await page.route(
    (url) => url.pathname === '/projects',
    (route) => (isDataRequest(route) ? route.fulfill(jsonData()) : route.continue())
  )
  await page.route(
    (url) => url.pathname === '/evaluations',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          links: { first: null, last: null, prev: null, next: null },
          meta: { current_page: 1, from: null, path: '', per_page: 20, to: null },
        }),
      })
  )
  await page.route(
    (url) => url.pathname === '/evaluations/summary',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { by_status: {}, competencies: [] } }),
      })
  )
  await page.route(
    (url) => url.pathname === '/organization',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 1,
            name: 'Acme',
            slug: 'acme',
            default_webhook_url: null,
            default_webhook_events: null,
            has_default_webhook_secret: false,
            created_at: null,
            updated_at: null,
          },
        }),
      })
  )
  await page.route(
    (url) => url.pathname === '/avatar-templates',
    (route) => (isDataRequest(route) ? route.fulfill(jsonData()) : route.continue())
  )
}

async function injectSession(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    window.sessionStorage.setItem('beai_access_token', 'e2e-injected-token')
  })
}

test.describe('Sidebar navigation — no dead links (Phase 30, task 30.1)', () => {
  for (const { path, heading } of SIDEBAR_ROUTES) {
    test(`${path} renders its own page, not a 404/SPA-fallback`, async ({ page }) => {
      await injectSession(page)
      await mockBaselineApi(page)

      await page.goto(path)

      // Nuxt's error page renders "404"; a genuinely dead sidebar link would
      // land here instead of the route's own content.
      await expect(page.getByText('404', { exact: false })).not.toBeVisible()
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    })
  }

  test('the sidebar renders a real link (not a raw <button>) for every route', async ({ page }) => {
    await injectSession(page)
    await mockBaselineApi(page)
    await page.goto('/')

    const nav = page.getByRole('navigation', { name: 'Navigazione principale' })
    await expect(nav).toBeVisible()

    for (const { path } of SIDEBAR_ROUTES) {
      const link = nav.locator(`a[href="${path}"]`)
      await expect(link, `sidebar link for ${path}`).toHaveCount(1)
    }
  })
})
