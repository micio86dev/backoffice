import { test, expect, type Route } from '@playwright/test'

/**
 * No-flash-on-reload (backoffice-session-refresh-hardening design D9).
 *
 * The access token is memory-only (D2/D4), so every reload starts with an
 * empty in-memory session. Without 00.auth-bootstrap.client.ts's AWAITED
 * silent refresh running before 02.auth.global.ts's route guard evaluates,
 * an operator reloading a protected page with a genuinely valid refresh
 * cookie would be bounced to /login every time — this spec is the
 * regression guard for that flash.
 *
 * No live API in this environment (same documented constraint as
 * admin-flow.spec.ts / sidebar-navigation.spec.ts): POST /auth/refresh is
 * mocked to succeed, standing in for "the browser still holds a valid
 * beai_refresh cookie".
 */

function isDataRequest(route: Route): boolean {
  return route.request().resourceType() !== 'document'
}

async function mockAuthenticatedSession(page: import('@playwright/test').Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/auth/refresh',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'e2e-reload-token', token_type: 'bearer' }),
      })
  )
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
}

test.describe('Session reload — no /login flash with a valid refresh cookie (D9)', () => {
  test('reloading the dashboard with a valid refresh cookie never renders /login', async ({
    page,
  }) => {
    await mockAuthenticatedSession(page)

    await page.goto('/')
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    // The reload is the assertion: 00.auth-bootstrap.client.ts must settle
    // BEFORE 02.auth.global.ts's guard runs, on every single load — not just
    // the first one.
    await page.reload()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('a reload with NO refresh cookie (refresh fails) correctly lands on /login, not a flash-then-stay', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/auth/refresh',
      (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
    )

    await page.goto('/')

    await expect(page).toHaveURL('/login')
  })
})
