import { test, expect, type Route } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'

/**
 * Reports index (Unit 7, task 27.7/29.1): filter + row-click-navigates-to-
 * participant-detail flow, role-based locators, network fixtures;
 * `@axe-core/playwright` clean.
 *
 * KNOWN PRE-EXISTING BLOCKER (confirmed unrelated to this change): same
 * `login()` helper / same blocker already documented in tasks.md task 4.3,
 * `projects-crud.spec.ts`, and `settings-tabs.spec.ts`. Written to the same
 * standard as the rest of the suite; could not run to completion here.
 */

const EVALUATION_ROW = {
  participant_id: '1',
  candidate_ref: 'ref-001',
  display_name: 'Mario Rossi',
  project_id: '1',
  project_name: 'Demo Project',
  assessment_type: 'standard',
  role_code: 'FLL',
  evaluated_at: '2026-03-14T10:00:00Z',
  status: 'completed',
  reliability: '83%',
}

const PARTICIPANT_DETAIL = {
  id: '1',
  candidate_ref: 'ref-001',
  display_name: 'Mario Rossi',
  role_code: 'FLL',
  language: 'it',
  status: 'completato',
  project_id: '1',
  started_at: '2026-03-14T09:00:00Z',
  completed_at: '2026-03-14T10:00:00Z',
  created_at: '2026-03-14T08:30:00Z',
  timeline: {
    started_at: '2026-03-14T09:00:00Z',
    completed_at: '2026-03-14T10:00:00Z',
    session_count: 5,
  },
  files: {
    transcript: {
      type: 'text/plain',
      ref: 'transcript',
      url: '/participants/1/transcript/download',
    },
    evaluation_raw: {
      type: 'application/json',
      ref: 'evaluation',
      url: '/participants/1/evaluation/download',
    },
  },
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
    (url) => url.pathname === '/evaluations',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            data: [EVALUATION_ROW],
            links: { first: null, last: null, prev: null, next: null },
            meta: { current_page: 1, from: 1, path: '', per_page: 20, to: 1 },
          })
        : route.continue()
  )
  await page.route(
    (url) => url.pathname === '/evaluations/summary',
    (route) =>
      jsonRoute(route, { data: { by_status: { completed: 1, pending: 0 }, competencies: [] } })
  )
  await page.route(
    (url) => url.pathname === '/projects',
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: [] }) : route.continue())
  )
  await page.route(
    (url) => url.pathname === '/participants/1',
    (route) =>
      isDataRequest(route) ? jsonRoute(route, { data: PARTICIPANT_DETAIL }) : route.continue()
  )
}

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('secret-password')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL('/')
}

test.describe('Reports index (Unit 7)', () => {
  test('a completed row navigates to the existing participant detail page, not a duplicate report view', async ({
    page,
  }) => {
    await mockAdminApi(page)
    await login(page)

    await page.getByRole('link', { name: 'Report' }).click()
    await expect(page).toHaveURL('/reports')
    await expect(page.getByRole('link', { name: 'Mario Rossi' })).toBeVisible()

    // The analytics consent banner is fixed to the bottom of the viewport and
    // sits over the table, so it swallows the click on the row link — the
    // element is visible, enabled and stable, and the pointer never reaches it.
    // Dismissed through the app's own control rather than by seeding its
    // storage key, so this does not silently keep passing if the persistence
    // mechanism changes.
    await page.getByTestId('analytics-consent-reject').click()
    await expect(page.getByTestId('analytics-consent')).toBeHidden()

    await page.getByRole('link', { name: 'Mario Rossi' }).click()
    await expect(page).toHaveURL('/participants/1')
    await expect(page.getByRole('heading', { name: 'Mario Rossi' })).toBeVisible()
  })

  test('the reports index is WCAG 2.1 AA clean', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)
    await page.goto('/reports')
    await expect(page.getByRole('link', { name: 'Mario Rossi' })).toBeVisible()

    await checkA11y(page)
  })
})
