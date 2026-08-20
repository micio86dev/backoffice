import { test, expect } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'

/**
 * SA-11 — Unsupported experience gate test.
 *
 * This spec runs under the `mobile` Playwright project (device: Pixel 7)
 * and also under desktop projects (chromium / webkit) to verify the page
 * itself is accessible.
 *
 * The mobile project asserts:
 * - The unsupported-gate page exists and is reachable at /unsupported
 * - The gate element with data-testid="unsupported-gate" is visible
 * - Full app features are NOT shown (the gate blocks them)
 *
 * Note: In C1 the mobile detection / redirect logic is scaffolded structurally.
 * The actual middleware that detects mobile and redirects → /unsupported
 * will be implemented in C7 (interview port).
 */
test.describe('SA-11 — Unsupported experience gate', () => {
  test('unsupported page renders the gate element', async ({ page }) => {
    // Navigate directly to the unsupported page
    await page.goto('/unsupported')

    // Verify the gate is shown (SA-11)
    await expect(page.getByTestId('unsupported-gate')).toBeVisible()
  })

  test('unsupported page does NOT render full admin features', async ({ page }) => {
    await page.goto('/unsupported')

    // Verify no admin-specific health-status element is present
    await expect(page.getByTestId('health-status')).not.toBeVisible()
  })

  test('unsupported page passes WCAG 2.1 AA accessibility check', async ({ page }) => {
    await page.goto('/unsupported')
    await checkA11y(page)
  })

  test('matches the unsupported gate visual baseline', async ({ page }) => {
    await page.goto('/unsupported')
    await expect(page.getByTestId('unsupported-gate')).toBeVisible()
    // Visual regression: overlay against the committed baseline to catch UI changes.
    await expect(page).toHaveScreenshot('unsupported-gate.png', { fullPage: true })
  })
})

test.describe('SA-11 — every admin route redirects at a mobile viewport (task 15.1)', () => {
  // Explicit 375px viewport regardless of which project runs this file — the
  // `mobile` project's own device viewport would already satisfy this, but
  // `chromium`/`webkit` run the full suite (this file included) at their
  // normal desktop viewport, where the SA-11 gate would NOT fire and these
  // assertions would be meaningless. Forcing the viewport here makes the test
  // literally match the spec scenario ("GIVEN a viewport width of 375px") on
  // every project, not just the one whose device preset happens to be narrow.
  test.use({ viewport: { width: 375, height: 667 } })

  // Every route that exists as of this PR. B1: the pre-auth /login page and
  // the authenticated dashboard shell (/). B2: the participant list and a
  // participant detail route (fixed id — SA-11 fires in the browser-gate
  // middleware, before the page ever mounts/fetches, so no live data is
  // needed for this assertion). The report viewer (B3) doesn't exist yet —
  // it must be added here when that PR lands, so SA-11 coverage doesn't
  // silently go stale.
  const ADMIN_ROUTES = ['/', '/login', '/participants', '/participants/1']

  for (const route of ADMIN_ROUTES) {
    test(`${route} renders /unsupported at a mobile viewport when unauthenticated`, async ({
      page,
    }) => {
      await page.goto(route)
      await expect(page.getByTestId('unsupported-gate')).toBeVisible()
      await expect(page).toHaveURL(/\/unsupported$/)
    })
  }

  test('an authenticated visitor is STILL sent to /unsupported at a mobile viewport (the browser gate runs before the auth gate)', async ({
    page,
  }) => {
    // No live API in this environment, and the access token is memory-only
    // (backoffice-session-refresh-hardening D2) — sessionStorage injection no
    // longer establishes a session. Instead, mock the boot plugin's own
    // POST /auth/refresh (00.auth-bootstrap.client.ts, D9) to succeed, which
    // is the ONLY way a fresh page load becomes authenticated now. Proves the
    // SA-11 gate fires regardless of auth state, without depending on a
    // running backend for a UI-only assertion.
    await page.route(
      (url) => url.pathname === '/auth/refresh',
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ access_token: 'e2e-fake-session-token', token_type: 'bearer' }),
        })
    )

    await page.goto('/')

    await expect(page.getByTestId('unsupported-gate')).toBeVisible()
    await expect(page).toHaveURL(/\/unsupported$/)
    // A positive settle signal BEFORE the count(0) check below — the
    // container's data-testid can be present in the DOM before Vue/i18n has
    // finished hydrating, which would let `toHaveCount(0)` pass on an EARLY
    // poll simply because nothing has rendered yet, not because the gate
    // correctly withheld the sidebar (generated-client-truth-and-session-
    // safety D7: `toHaveCount(0)` is a false-pass risk independent of the
    // webkit-specific failure this file's tasks.md entry investigates).
    // The heading's translated text requires the FULL component tree
    // (i18n resolved) to be in place, which the bare container div does not.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // The full admin shell (sidebar nav) must never render at this viewport.
    // Role-based, not `[data-slot="sidebar"]`: AGENTS.md forbids CSS locators,
    // and the landmark is asserted to EXIST by SidebarNav.spec.ts, so this
    // count-0 assertion cannot be satisfied by simply deleting the role.
    await expect(page.getByRole('navigation')).toHaveCount(0)
  })
})
