import { test, expect, type Route } from '@playwright/test'

/**
 * Participant recovery, end to end (participant-error-recovery, design D9).
 *
 * Mirrors `entry-link.spec.ts`'s network-interception convention: no live
 * backend, API calls intercepted at the network layer with fixtures shaped
 * exactly like the real resources. Role-based locators ONLY
 * (getByRole/getByLabel), per this project's E2E convention.
 *
 * KNOWN PRE-EXISTING BLOCKER (documented in `entry-link.spec.ts` /
 * `projects-crud.spec.ts`, verified independently for this file too): the
 * `login()` helper times out on `getByLabel('Email')` on an unmodified
 * checkout, unrelated to this change. This spec is written to the same
 * standard as the rest of the suite so it is ready the moment that blocker
 * is fixed.
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

// A candidate stranded in `errore` — an Upstream provider failure at
// competency 2, exactly the scenario the recovery action exists for.
const FAILED_PARTICIPANT = {
  id: 1,
  candidate_ref: 'ref-001',
  display_name: 'Mario Rossi',
  role_code: 'FLL',
  language: 'it',
  status: 'errore',
  project_id: 2,
  started_at: '2026-03-14T08:00:00Z',
  completed_at: null,
  created_at: '2026-03-14T08:30:00Z',
}

const FAILED_PARTICIPANT_DETAIL = {
  ...FAILED_PARTICIPANT,
  project: {
    id: ACTIVE_PROJECT.id,
    name: ACTIVE_PROJECT.name,
    status: ACTIVE_PROJECT.status,
    goes_live_at: ACTIVE_PROJECT.goes_live_at,
    deadline_at: ACTIVE_PROJECT.deadline_at,
  },
  timeline: { started_at: FAILED_PARTICIPANT.started_at, completed_at: null, session_count: 1 },
  files: {
    transcript: null,
    evaluation_raw: null,
  },
}

const SESSIONS = [
  {
    id: 10,
    competency_code: 'PRS',
    question_index: 0,
    provider: 'heygen',
    status: 'completed',
    ended_reason: 'completed',
    started_at: '2026-03-14T08:00:00Z',
    ended_at: '2026-03-14T08:05:00Z',
    duration_seconds: 300,
    integrity_event_count: 0,
  },
  {
    id: 11,
    competency_code: 'STG',
    question_index: 1,
    provider: 'heygen',
    status: 'error',
    ended_reason: 'error',
    started_at: '2026-03-14T08:05:00Z',
    ended_at: null,
    duration_seconds: null,
    integrity_event_count: 0,
  },
]

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

  // operator role — eligible to recover (ParticipantPolicy::recover, design D4).
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
    (url) => url.pathname === '/participants',
    (route) => {
      if (!isDataRequest(route)) return route.continue()
      return jsonRoute(route, {
        data: [FAILED_PARTICIPANT],
        links: { first: null, last: null, prev: null, next: null },
        meta: { current_page: 1, last_page: 1, total: 1, from: 1, to: 1, per_page: 20 },
      })
    }
  )

  await page.route(
    (url) => url.pathname === '/participants/1',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, { data: FAILED_PARTICIPANT_DETAIL })
        : route.continue()
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
          current_status: 'errore',
          required_status: 'completato',
        }),
      })
  )

  await page.route(
    (url) => url.pathname === '/participants/1/sessions',
    (route) => jsonRoute(route, { data: SESSIONS })
  )

  await page.route(
    (url) => url.pathname === '/participants/1/recover',
    (route) =>
      jsonRoute(route, {
        status: 'in_attesa',
        competencies_reset: ['STG'],
        utterances_discarded: 1,
      })
  )
}

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill('operator@example.com')
  await page.getByLabel('Password').fill('secret-password')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL('/')
}

test.describe('Participant recovery (participant-error-recovery)', () => {
  test('an operator recovers a failed participant; the status badge updates, no page reload', async ({
    page,
  }) => {
    await mockAdminApi(page)
    await login(page)

    await page.getByRole('link', { name: 'Candidati' }).click()
    await expect(page).toHaveURL('/participants')
    await page.getByRole('link', { name: 'Mario Rossi' }).click()
    await expect(page).toHaveURL('/participants/1')

    // The recovery action is visible ONLY because status === 'errore'.
    await page.getByRole('button', { name: 'Riapri valutazione' }).first().click()

    // Confirm step: the failed competency is named, data loss is disclosed.
    // (Scoped to the panel's own competency list — "STG" also appears in the
    // unrelated session review table elsewhere on the page.)
    await expect(page.getByTestId('participant-recover-competency')).toHaveText('STG')
    await expect(page.getByText(/eliminata definitivamente/)).toBeVisible()

    await page.getByRole('button', { name: 'Riapri valutazione' }).last().click()

    // Success — badge reflects the new status without a full reload.
    await expect(page.getByText('Valutazione riaperta')).toBeVisible()
    await expect(page.getByText('In attesa')).toBeVisible()
  })
})
