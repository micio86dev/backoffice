import { test, expect, type Route, type Page } from '@playwright/test'

/**
 * form-clarity-and-console-warnings, D7 — "Password Field Autofill Hygiene"
 * (admin-backoffice spec) and the Chrome autocomplete console warning.
 *
 * DOM assertion, not a `page.on('console')` listener — Chrome's "Input
 * elements should have autocomplete attributes" message is emitted on the
 * DevTools Issues channel, which Playwright does not reliably surface.
 * Asserting instead that every `form input:not([type=file]):not([type=
 * checkbox])` carries a non-empty `autocomplete` is the actual, deterministic
 * contract the warning is about.
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

async function jsonRoute(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

function isDataRequest(route: Route): boolean {
  return route.request().resourceType() !== 'document'
}

async function mockAdminApi(page: Page): Promise<void> {
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
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            data: [API_CLIENT],
            links: { first: null, last: null, prev: null, next: null },
            meta: {
              current_page: 1,
              from: 1,
              last_page: 1,
              links: [],
              path: '',
              per_page: 20,
              to: 1,
              total: 1,
            },
          })
        : route.continue()
  )
  await page.route(
    (url) => url.pathname === '/m2m/abilities',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, { data: ['participants:read', 'projects:read'] })
        : route.continue()
  )
  await page.route(
    (url) => url.pathname === '/projects',
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: [] }) : route.continue())
  )
}

async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('secret-password')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL('/')
}

/** Every real (non-file, non-checkbox) input on the page must self-declare autocomplete. */
async function expectEveryInputToDeclareAutocomplete(page: Page): Promise<void> {
  const inputs = page.locator('form input:not([type="file"]):not([type="checkbox"])')
  const count = await inputs.count()
  expect(count).toBeGreaterThan(0)

  for (let i = 0; i < count; i++) {
    const input = inputs.nth(i)
    const autocomplete = await input.getAttribute('autocomplete')
    const testId = await input.getAttribute('data-testid')
    expect(
      autocomplete,
      `input [data-testid="${testId}"] has no autocomplete attribute`
    ).toBeTruthy()
  }
}

test.describe('every bare input declares autocomplete (admin-backoffice spec, D7)', () => {
  test('the project creation form', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)

    await page.getByRole('link', { name: 'Progetti' }).click()
    await expect(page).toHaveURL('/projects')
    await page.getByRole('button', { name: 'Nuovo progetto' }).click()
    await expect(page.getByTestId('project-form')).toBeVisible()

    await expectEveryInputToDeclareAutocomplete(page)
  })

  test('every settings panel, including the create-key and create-user dialogs', async ({
    page,
  }) => {
    await mockAdminApi(page)
    await login(page)
    await page.goto('/settings')
    await expect(page.getByTestId('organization-profile-name')).toBeVisible()

    // Organization profile panel.
    await expectEveryInputToDeclareAutocomplete(page)

    // Webhook defaults panel.
    await page.getByRole('tab', { name: 'Valori predefiniti webhook' }).click()
    await expect(page.getByTestId('webhook-defaults-url')).toBeVisible()
    await expectEveryInputToDeclareAutocomplete(page)

    // API keys panel — the create-key dialog.
    await page.getByRole('tab', { name: 'Chiavi API' }).click()
    await page.getByTestId('api-keys-new').click()
    await expect(page.getByTestId('api-key-form')).toBeVisible()
    await expectEveryInputToDeclareAutocomplete(page)
    await page.keyboard.press('Escape')

    // Users panel — the create-user dialog.
    await page.getByRole('tab', { name: 'Utenti e ruoli' }).click()
    await page.getByTestId('users-new').click()
    await expect(page.getByTestId('user-form')).toBeVisible()
    await expectEveryInputToDeclareAutocomplete(page)
  })

  // user-profile-self-service, design D8: ProfileDetailsForm keeps
  // autocomplete="off" (the ratified rule); ProfilePasswordForm is the
  // second legitimate exception after login.vue — current-password, then
  // new-password on both new fields, plus a hidden username field.
  test('the /profile account and password forms', async ({ page }) => {
    await mockAdminApi(page)
    await page.route(
      (url) => url.pathname === '/profile',
      (route) =>
        isDataRequest(route)
          ? jsonRoute(route, {
              data: {
                id: 1,
                name: 'Ada Lovelace',
                email: 'ada@example.com',
                locale: 'en',
                role: 'admin',
                organization: { id: 1, name: 'Acme' },
              },
            })
          : route.continue()
    )
    await login(page)
    await page.goto('/profile')

    await expect(page.getByTestId('profile-details-form')).toBeVisible()
    await expect(page.getByTestId('profile-password-form')).toBeVisible()

    await expectEveryInputToDeclareAutocomplete(page)
  })
})
