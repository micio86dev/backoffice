import { test, expect, type Route } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'

/**
 * Admin flow: login → participant list → participant detail (task 18.2).
 *
 * The Playwright webServer serves a statically generated SPA with no live
 * backend attached (same documented constraint as unsupported-gate.spec.ts:
 * "No live API in this environment"). API calls are intercepted at the
 * network layer with fixtures shaped exactly like the real
 * ParticipantResource/ParticipantDetailResource/login response — the
 * contract itself is enforced separately by `bun run codegen:check` (D13)
 * and the API's own Pest feature-test matrix (PR A3).
 *
 * Role-based locators ONLY (getByRole/getByLabel) — zero CSS class/id
 * selectors, per this project's E2E convention.
 */

const PARTICIPANT = {
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
}

const PARTICIPANT_DETAIL = {
  ...PARTICIPANT,
  timeline: {
    started_at: PARTICIPANT.started_at,
    completed_at: PARTICIPANT.completed_at,
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

// `apiBase` is '' in this SPA (D11 — same-origin, no cross-origin CORS
// hop), so an API path like `/participants/1` is byte-identical to the SPA
// ROUTE `/participants/1`. Matching on pathname alone also intercepts the
// document navigation itself (page.goto('/participants/1')), replacing the
// whole SPA shell with raw JSON — caught by a real failure in this suite
// (the detail page's own heading never rendered because the "page" WAS the
// JSON body). Scoping to non-document resource types (fetch/xhr) fixes it.
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
    (url) => url.pathname === '/dashboard/metrics',
    (route) =>
      jsonRoute(route, {
        data: {
          participants_by_status: { completato: 1 },
          evaluations_by_status: { completato: 1 },
          completion_rate: 1,
          ai_usage: {
            input_tokens: 100,
            output_tokens: 200,
            latency_ms_p50: 500,
            latency_ms_p95: 900,
          },
        },
      })
  )
  await page.route(
    (url) => url.pathname === '/participants',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            data: [PARTICIPANT],
            links: { first: null, last: null, prev: null, next: null },
            meta: { current_page: 1, last_page: 1, total: 1, from: 1, to: 1, per_page: 20 },
          })
        : route.continue()
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

test.describe('Admin flow — login → participant list → participant detail', () => {
  test('an operator can log in, browse the candidate list, and open a candidate detail', async ({
    page,
  }) => {
    await mockAdminApi(page)
    await login(page)

    await page.getByRole('link', { name: 'Candidati' }).click()
    await expect(page).toHaveURL('/participants')
    await expect(page.getByRole('link', { name: 'Mario Rossi' })).toBeVisible()
    // Scoped to the table: the status filter's <option value="completato">
    // shares the same visible text "Completato" and would otherwise make
    // this locator ambiguous (strict-mode violation).
    await expect(page.getByRole('table').getByText('Completato')).toBeVisible()

    await page.getByRole('link', { name: 'Mario Rossi' }).click()
    await expect(page).toHaveURL('/participants/1')
    await expect(page.getByRole('heading', { name: 'Mario Rossi' })).toBeVisible()
    // Session count from the timeline fixture (5) proves the detail payload
    // was actually rendered, not a stale/empty state.
    await expect(page.getByText('5', { exact: true })).toBeVisible()
  })

  test('the candidate list view is WCAG 2.1 AA clean', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)
    await page.getByRole('link', { name: 'Candidati' }).click()
    await expect(page.getByRole('link', { name: 'Mario Rossi' })).toBeVisible()

    await checkA11y(page)
  })

  test('the candidate detail view is WCAG 2.1 AA clean', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)
    await page.goto('/participants/1')
    await expect(page.getByRole('heading', { name: 'Mario Rossi' })).toBeVisible()

    await checkA11y(page)
  })
})
