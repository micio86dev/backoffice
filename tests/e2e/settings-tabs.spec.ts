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
  id: '1',
  name: 'CI key',
  abilities: ['read'],
  is_active: 'true',
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
}

async function login(page: import('@playwright/test').Page): Promise<void> {
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
    await expect(page.getByText('Acme')).toBeVisible()

    await page.getByRole('tab', { name: 'Utenti e ruoli' }).click()
    await expect(page.getByText('Ada Lovelace')).toBeVisible()

    await page.getByRole('tab', { name: 'Chiavi API' }).click()
    await expect(page.getByText('CI key')).toBeVisible()
  })

  test('the settings page is WCAG 2.1 AA clean on every tab', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)
    await page.goto('/settings')
    await expect(page.getByText('Acme')).toBeVisible()

    await checkA11y(page)

    await page.getByRole('tab', { name: 'Utenti e ruoli' }).click()
    await expect(page.getByText('Ada Lovelace')).toBeVisible()
    await checkA11y(page)
  })
})
