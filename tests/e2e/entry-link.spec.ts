import { test, expect, type Route } from '@playwright/test'

/**
 * Entry link mint, end to end (operator-interview-link, design D4).
 *
 * Mirrors `projects-crud.spec.ts`'s network-interception convention: no live
 * backend, API calls intercepted at the network layer with fixtures shaped
 * exactly like the real resources. Role-based locators ONLY
 * (getByRole/getByLabel), per this project's E2E convention.
 *
 * KNOWN PRE-EXISTING BLOCKER (documented in `projects-crud.spec.ts`, verified
 * independently for this file too): the `login()` helper times out on
 * `getByLabel('Email')` on an unmodified checkout, unrelated to this change.
 * This spec is written to the same standard as the rest of the suite so it
 * is ready the moment that blocker is fixed.
 */

const ACTIVE_PROJECT = {
  id: 2,
  organization_id: 1,
  framework_version_id: 3,
  slug: 'active-project',
  name: 'Active Project',
  assessment_type: 'standard',
  role_code: 'FLL',
  language: 'en',
  status: 'active',
  pause_every_n_competencies: 3,
  nudge_min_chars: 40,
  exit_redirect_url: null,
  webhook_url: null,
  webhook_events: [],
  has_webhook_secret: false,
  deadline_at: null,
  goes_live_at: null,
  created_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-01T10:00:00Z',
  pin_context: null,
  competencies: [],
}

const PARTICIPANT = {
  id: 1,
  candidate_ref: 'ref-001',
  display_name: 'Mario Rossi',
  role_code: 'FLL',
  language: 'it',
  status: 'in_attesa',
  project_id: 2,
  started_at: null,
  completed_at: null,
  created_at: '2026-03-14T08:30:00Z',
}

const PARTICIPANT_DETAIL = {
  ...PARTICIPANT,
  // operator-interview-link, design D5: nested project gate fields — an
  // ELIGIBLE project by default (active, no goes_live_at/deadline_at gate).
  project: {
    id: ACTIVE_PROJECT.id,
    name: ACTIVE_PROJECT.name,
    status: ACTIVE_PROJECT.status,
    goes_live_at: ACTIVE_PROJECT.goes_live_at,
    deadline_at: ACTIVE_PROJECT.deadline_at,
  },
  timeline: { started_at: null, completed_at: null, session_count: 0 },
  // The participant detail contract gained progress/elapsed/cost. These mocks
  // are typed the same as the real payload on purpose: leaving them short and
  // making the page defensive instead would hide a genuine API regression
  // behind an optional-chain.
  progress: { done: 0, total: 3 },
  elapsed: { seconds: null, sessions_counted: 0, sessions_total: 0 },
  cost: {
    amount: null,
    currency: 'USD',
    is_estimate: true,
    sessions_estimated: 0,
    sessions_total: 0,
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

  // operator role — eligible to mint (ParticipantPolicy::create, design D2).
  await page.route(
    (url) => url.pathname === '/profile',
    (route) =>
      jsonRoute(route, {
        data: {
          id: 1,
          name: 'Operator One',
          email: 'operator@example.com',
          locale: 'en',
          role: 'operator',
          organization: { id: 1, name: 'Acme' },
          photo_url: null,
        },
      })
  )

  await page.route(
    (url) => url.pathname === '/projects',
    (route) => {
      if (!isDataRequest(route)) return route.continue()
      return jsonRoute(route, { data: [ACTIVE_PROJECT] })
    }
  )

  await page.route(
    (url) => /^\/framework\/roles\/[A-Z]+\/competencies$/.test(url.pathname),
    (route) => {
      if (!isDataRequest(route)) return route.continue()
      return jsonRoute(route, { data: [] })
    }
  )

  await page.route(
    (url) => url.pathname === '/entry-links',
    (route) =>
      jsonRoute(
        route,
        {
          entry_url: 'https://interview.example.com/interview/e2e-token',
          expires_at: '2026-08-17T15:32:00.000000Z',
        },
        201
      )
  )

  await page.route(
    (url) => url.pathname === '/participants',
    (route) => {
      if (!isDataRequest(route)) return route.continue()
      return jsonRoute(route, {
        data: [PARTICIPANT],
        links: { first: null, last: null, prev: null, next: null },
        meta: { current_page: 1, last_page: 1, total: 1, from: 1, to: 1, per_page: 20 },
      })
    }
  )

  // apiBase is '' (same-origin) — `/participants/1` matches BOTH the API
  // path and the SPA route, so document navigations must fall through
  // (isDataRequest guard, mirrors admin-flow.spec.ts's own documented fix).
  await page.route(
    (url) => url.pathname === '/participants/1',
    (route) =>
      isDataRequest(route) ? jsonRoute(route, { data: PARTICIPANT_DETAIL }) : route.continue()
  )
  await page.route(
    (url) => url.pathname === '/participants/1/evaluation',
    (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'lifecycle_not_ready',
          resource: 'evaluation',
          current_status: 'in_attesa',
          required_status: 'completato',
        }),
      })
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
  await page.getByLabel('Email').fill('operator@example.com')
  await page.getByLabel('Password').fill('secret-password')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL('/')
}

test.describe('Entry link mint (operator-interview-link)', () => {
  test('an operator mints an entry link from a project row; disclosure is visible before copy', async ({
    page,
  }) => {
    await mockAdminApi(page)
    await login(page)

    await page.getByRole('link', { name: 'Progetti' }).click()
    await expect(page).toHaveURL('/projects')

    await page
      .getByRole('row', { name: /Active Project/ })
      .getByRole('button', { name: 'Invita candidato' })
      .click()

    await page.getByLabel('Riferimento candidato').fill('e2e-candidate')
    await page.getByLabel('Nome visualizzato').fill('E2E Candidate')
    await page.getByRole('button', { name: 'Genera link' }).click()

    // Disclosure (single-use + expiry) MUST be visible before the Copy
    // control — admin-backoffice spec, "Single-Use and Expiry Are Disclosed
    // Before the Copy". Both render together once the mint succeeds; the
    // assertion order below mirrors the DOM order the component enforces
    // (EntryLinkPanel.spec.ts covers the DOM-order guarantee directly).
    await expect(page.getByText(/monouso/)).toBeVisible()
    await expect(page.getByText('https://interview.example.com/interview/e2e-token')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copia' })).toBeVisible()
  })
})

// operator-interview-link, design D4 — surface A: re-issue from the
// participant detail page, pre-filled from the participant row.
test.describe('Entry link re-issue (participant detail)', () => {
  test('an operator generates a new link for an existing participant; disclosure is visible before copy', async ({
    page,
  }) => {
    await mockAdminApi(page)
    await login(page)

    await page.getByRole('link', { name: 'Candidati' }).click()
    await expect(page).toHaveURL('/participants')
    await page.getByRole('link', { name: 'Mario Rossi' }).click()
    await expect(page).toHaveURL('/participants/1')

    await page.getByRole('button', { name: 'Genera nuovo link' }).click()

    await expect(page.getByText(/monouso/)).toBeVisible()
    await expect(page.getByText('https://interview.example.com/interview/e2e-token')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copia' })).toBeVisible()
  })

  test('a draft project disables the re-issue action with a stated reason', async ({ page }) => {
    await mockAdminApi(page)
    // Override AFTER mockAdminApi — last-registered route wins.
    await page.route(
      (url) => url.pathname === '/participants/1',
      (route) =>
        isDataRequest(route)
          ? jsonRoute(route, {
              data: {
                ...PARTICIPANT_DETAIL,
                project: { ...PARTICIPANT_DETAIL.project, status: 'draft' },
              },
            })
          : route.continue()
    )
    await login(page)
    await page.goto('/participants/1')

    const button = page.getByRole('button', { name: 'Genera nuovo link' })
    await expect(button).toBeDisabled()
    await expect(page.getByText('Questo progetto non è ancora attivo.')).toBeVisible()
  })
})
