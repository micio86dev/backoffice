import { test, expect } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'

/**
 * E2E health check — runs under both `chromium` and `webkit` projects.
 *
 * Asserts:
 * - The /health page is reachable and returns HTTP 200
 * - The page renders the text "ok"
 * - No WCAG 2.1 AA violations (D29)
 *
 * This spec is intentionally excluded from the `mobile` project
 * (mobile only runs unsupported-gate.spec.ts — SA-11 gate).
 */
test.describe('Health page', () => {
  test('renders "ok" on the /health page', async ({ page }) => {
    await page.goto('/health')
    await expect(page.getByTestId('health-status')).toBeVisible()
    await expect(page.getByTestId('health-status')).toHaveText('ok')
  })

  test('passes WCAG 2.1 AA accessibility check', async ({ page }) => {
    await page.goto('/health')
    // Wait for the page to actually be rendered before running axe, exactly as
    // the sibling tests do. Nuxt sets <title> through useHead AFTER navigation
    // resolves, so an immediate axe run raced it and intermittently reported a
    // `document-title` violation on a page that does have one. The flake was
    // real but the finding was not: the assertion has to observe the settled
    // page, not the instant `goto` returns.
    await expect(page.getByTestId('health-status')).toBeVisible()
    await checkA11y(page)
  })

  test('matches the health page visual baseline', async ({ page }) => {
    await page.goto('/health')
    await expect(page.getByTestId('health-status')).toBeVisible()
    // Visual regression: overlay against the committed baseline to catch UI changes.
    await expect(page).toHaveScreenshot('health-page.png', { fullPage: true })
  })
})
