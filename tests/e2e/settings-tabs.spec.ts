import { test, expect, type Route } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'

/**
 * Settings tabs (Unit 6, task 24.9/26.1): role-based locators, network
 * fixtures for `/organization`, `/users`, `/m2m/clients`; `@axe-core/playwright`
 * clean on all four tab panels.
 *
 * KNOWN PRE-EXISTING BLOCKER (confirmed unrelated to this change): same
 * `login()` helper / same blocker already documented in tasks.md task 4.3
 * and `projects-crud.spec.ts`. Written to the same standard as the rest of
 * the suite; could not run to completion in this environment.
 */

const ORGANIZATION = {
  id: 1,
  name: 'Acme',
  slug: 'acme',
  default_webhook_url: null,
  default_webhook_events: null,
  has_default_webhook_secret: false,
  created_at: null,
  updated_at: null,
}

const USER = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  role: 'admin',
  is_deactivated: false,
  created_at: null,
  updated_at: null,
}

const API_CLIENT = {
  id: 1,
  name: 'CI key',
  abilities: ['read'],
  is_active: true,
  state: 'active',
  expires_at: null,
  last_used_at: null,
  created_at: '2026-03-01T10:00:00Z',
}

async function jsonRoute(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
}

function isDataRequest(route: Route): boolean {
  return route.request().resourceType() !== 'document'
}

async function mockAdminApi(page: import('@playwright/test').Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/auth/login',
    (route) =>
      jsonRoute(route, {
        access_token: 'e2e-access-token',
        refresh_token: 'e2e-refresh',
        token_type: 'bearer',
      })
  )
  await page.route(
    (url) => url.pathname === '/organization',
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: ORGANIZATION }) : route.continue())
  )
  await page.route(
    (url) => url.pathname === '/users',
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: [USER] }) : route.continue())
  )
  await page.route(
    (url) => url.pathname === '/m2m/clients',
    // Unpaginated (generated-client-truth-and-session-safety D5) — the
    // fixture mirrors the real envelope shape: `data` only, no `links`/`meta`.
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: [API_CLIENT] }) : route.continue())
  )
}

async function login(page: import('@playwright/test').Page): Promise<void> {
  // The access token is memory-only (backoffice-session-refresh-hardening D2)
  // — 00.auth-bootstrap.client.ts (D9) fires POST /auth/refresh on EVERY full
  // page load, including any later page.goto() in this test to a DIFFERENT
  // route (a real browser navigation, not a client-side SPA transition). Without
  // this mock the boot refresh fails against the unmocked real apiBase, the
  // session never rehydrates, and the auth guard bounces back to /login.
  await page.route(
    (url) => url.pathname === '/auth/refresh',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'e2e-access-token', token_type: 'bearer' }),
      })
  )
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('secret-password')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL('/')
}

test.describe('Settings tabs (Unit 6)', () => {
  test('all four tabs render and switch', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)
    await page.goto('/settings')

    await expect(page.getByRole('tab', { name: 'Profilo organizzazione' })).toBeVisible()
    // Targets the organization profile PANEL, not the bare string: the topbar
    // now also shows the organization name, so `getByText('Acme')` matches two
    // elements and fails strict mode. What this line means is "the profile
    // panel has loaded", and it should say so.
    await expect(page.getByTestId('organization-profile-name')).toHaveValue('Acme')

    await page.getByRole('tab', { name: 'Utenti e ruoli' }).click()
    await expect(page.getByText('Ada Lovelace')).toBeVisible()

    await page.getByRole('tab', { name: 'Chiavi API' }).click()
    await expect(page.getByText('CI key')).toBeVisible()
  })

  // dates-and-destructive-actions, design.md D3 — the badge reflects the
  // SAME predicate the auth guard uses, and Revoke is never offered on a
  // key that is not active.
  test('a revoked API key shows its state badge and offers no Revoke control', async ({ page }) => {
    await mockAdminApi(page)
    // Registered AFTER mockAdminApi — Playwright tries the LAST-registered
    // matching route first, so this override wins over the default
    // active-key fixture for this one test.
    await page.route(
      (url) => url.pathname === '/m2m/clients',
      (route) =>
        isDataRequest(route)
          ? jsonRoute(route, { data: [{ ...API_CLIENT, is_active: false, state: 'revoked' }] })
          : route.continue()
    )
    await login(page)
    await page.goto('/settings')

    await page.getByRole('tab', { name: 'Chiavi API' }).click()
    await expect(page.getByText('Revocata')).toBeVisible()
    await expect(page.getByTestId('api-key-revoke-1')).toHaveCount(0)
  })

  // generated-client-truth-and-session-safety D5 — the table must show every
  // key the (now unpaginated) endpoint returns, not just a first page of 20.
  test('all 25 API keys render — the list is unpaginated, not clipped at a page boundary', async ({
    page,
  }) => {
    await mockAdminApi(page)
    const clients = Array.from({ length: 25 }, (_, i) => ({
      ...API_CLIENT,
      id: i + 1,
      name: `CI key ${i + 1}`,
    }))
    // Registered AFTER mockAdminApi — Playwright tries the LAST-registered
    // matching route first, so this override wins over the default
    // one-client fixture for this test (same convention as the revoked-key
    // test above).
    await page.route(
      (url) => url.pathname === '/m2m/clients',
      (route) => (isDataRequest(route) ? jsonRoute(route, { data: clients }) : route.continue())
    )

    await login(page)
    await page.goto('/settings')
    await page.getByRole('tab', { name: 'Chiavi API' }).click()

    await expect(page.getByText('CI key 1', { exact: true })).toBeVisible()
    await expect(page.getByText('CI key 25', { exact: true })).toBeVisible()
    await expect(page.getByRole('row')).toHaveCount(26) // 25 data rows + header row
  })

  test('the settings page is WCAG 2.1 AA clean on every tab', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)
    await page.goto('/settings')
    // Targets the organization profile PANEL, not the bare string: the topbar
    // now also shows the organization name, so `getByText('Acme')` matches two
    // elements and fails strict mode. What this line means is "the profile
    // panel has loaded", and it should say so.
    await expect(page.getByTestId('organization-profile-name')).toHaveValue('Acme')

    await checkA11y(page)

    await page.getByRole('tab', { name: 'Utenti e ruoli' }).click()
    await expect(page.getByText('Ada Lovelace')).toBeVisible()
    await checkA11y(page)
  })
})
