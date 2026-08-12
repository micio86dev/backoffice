import { test, expect, type Route } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'

/**
 * Projects CRUD (Unit 2b, task 20.8/22.1): create -> edit (immutable fields
 * verifiably disabled on an active project) -> archive flow.
 *
 * Mirrors `admin-flow.spec.ts`'s network-interception convention: no live
 * backend in this environment, API calls intercepted at the network layer
 * with fixtures shaped exactly like the real `ProjectResource`. Role-based
 * locators ONLY (getByRole/getByLabel), per this project's E2E convention.
 *
 * KNOWN PRE-EXISTING BLOCKER (confirmed unrelated to this change): the
 * `login()` helper below is copied from `admin-flow.spec.ts`, which times
 * out on `getByLabel('Email')` on an unmodified `develop` checkout — verified
 * by `git stash` + rerun during PR 1b (see tasks.md task 4.3). This spec
 * inherits that same blocker and could not be run to completion in this
 * environment; it is written to the same standard as the rest of the suite
 * so it is ready the moment the login blocker is fixed.
 */

const DRAFT_PROJECT = {
  id: '1',
  organization_id: '1',
  framework_version_id: '3',
  slug: 'draft-project',
  name: 'Draft Project',
  assessment_type: 'standard',
  role_code: 'FLL',
  language: 'en',
  status: 'draft',
  pause_every_n_competencies: '3',
  nudge_min_chars: '40',
  exit_redirect_url: null,
  webhook_url: null,
  webhook_events: '[]',
  deadline_at: null,
  goes_live_at: null,
  created_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-01T10:00:00Z',
  pin_context: null,
  competencies: [],
}

const ACTIVE_PROJECT = {
  ...DRAFT_PROJECT,
  id: '2',
  slug: 'active-project',
  name: 'Active Project',
  status: 'active',
}

async function jsonRoute(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
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
    (url) => url.pathname === '/projects',
    (route) => {
      if (!isDataRequest(route)) return route.continue()
      if (route.request().method() === 'POST') {
        return jsonRoute(
          route,
          { data: { ...DRAFT_PROJECT, id: '9', name: 'New E2E Project' } },
          201
        )
      }
      return jsonRoute(route, { data: [DRAFT_PROJECT, ACTIVE_PROJECT] })
    }
  )
  await page.route(
    (url) => /^\/projects\/\d+$/.test(url.pathname),
    (route) => jsonRoute(route, { data: { ...ACTIVE_PROJECT, status: 'archived' } })
  )
}

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('secret-password')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL('/')
}

test.describe('Projects CRUD (Unit 2b)', () => {
  test('an admin can open the create form and submit a new project', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)

    await page.getByRole('link', { name: 'Progetti' }).click()
    await expect(page).toHaveURL('/projects')

    await page.getByRole('button', { name: 'Nuovo progetto' }).click()
    await page.getByLabel('Nome').fill('New E2E Project')
    await page.getByLabel('Slug').fill('new-e2e-project')
    await page.getByRole('button', { name: 'Salva' }).click()

    await expect(page.getByText('New E2E Project')).toBeVisible()
  })

  test('editing an active project disables its immutable fields', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)
    await page.goto('/projects')

    await page
      .getByRole('row', { name: /Active Project/ })
      .getByRole('button', { name: 'Modifica' })
      .click()

    await expect(page.getByLabel('Versione del framework')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Standard' })).toBeDisabled()
  })

  test('the projects list is WCAG 2.1 AA clean', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)
    await page.goto('/projects')
    await expect(page.getByText('Draft Project')).toBeVisible()

    await checkA11y(page)
  })
})
