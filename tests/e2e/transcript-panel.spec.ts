import { test, expect, type Route } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'

/**
 * Turn-by-turn transcript panel, end to end (operator-participant-visibility
 * PR4, D2/D7). This is the operator's ORIGINAL report, closed: a participant
 * stuck at `in_corso` with stored turns the old gate hid entirely.
 *
 * Mirrors `admin-flow.spec.ts`'s network-interception convention: no live
 * backend, API calls intercepted at the network layer with fixtures shaped
 * exactly like the real `ParticipantDetailResource`/`TranscriptResource`.
 * Role-based locators ONLY (getByRole/getByLabel/getByTestId) — zero CSS
 * class/id selectors, per this project's E2E convention.
 */

// Stranded at in_corso — exactly the operator's original report: the
// interview is still running, three sessions started, one finished.
const IN_CORSO_PARTICIPANT = {
  id: 1,
  candidate_ref: 'ref-001',
  display_name: 'Mario Rossi',
  role_code: 'FLL',
  language: 'it',
  status: 'in_corso',
  project_id: 1,
  started_at: '2026-03-14T09:00:00Z',
  completed_at: null,
  created_at: '2026-03-14T08:30:00Z',
}

const IN_CORSO_DETAIL = {
  ...IN_CORSO_PARTICIPANT,
  timeline: { started_at: IN_CORSO_PARTICIPANT.started_at, completed_at: null, session_count: 3 },
  progress: { done: 1, total: 18 },
  elapsed: { seconds: 300, sessions_counted: 1, sessions_total: 3 },
  cost: {
    amount: 0.62,
    currency: 'USD',
    is_estimate: true,
    sessions_estimated: 1,
    sessions_total: 3,
  },
  files: {
    transcript: {
      type: 'text/plain',
      ref: 'transcript',
      url: '/participants/1/transcript/download',
    },
    evaluation_raw: null,
  },
}

// The 27-stored-turns incident, in miniature: two sessions, each carrying an
// avatar prompt AND a candidate answer — the exact shape the old gate hid.
const IN_CORSO_TRANSCRIPT = {
  is_partial: true,
  sessions: [
    {
      session_id: 100,
      competency_code: 'INN',
      question_index: 0,
      utterances: [
        {
          speaker: 'avatar',
          text: 'Tell me about a time you proposed a new approach.',
          ts: '2026-03-14T09:05:00Z',
        },
        {
          speaker: 'candidate',
          text: 'At my previous role I redesigned our onboarding flow.',
          ts: '2026-03-14T09:05:20Z',
        },
      ],
    },
    {
      session_id: 101,
      competency_code: 'COL',
      question_index: 1,
      utterances: [
        {
          speaker: 'avatar',
          text: 'Describe a time you worked closely with a difficult colleague.',
          ts: '2026-03-14T09:10:00Z',
        },
        {
          speaker: 'candidate',
          text: 'We disagreed on the release plan, so I scheduled a 1:1.',
          ts: '2026-03-14T09:10:25Z',
        },
      ],
    },
  ],
}

const IN_ATTESA_PARTICIPANT = {
  id: 2,
  candidate_ref: 'ref-002',
  display_name: 'Anna Bianchi',
  role_code: 'FLL',
  language: 'it',
  status: 'in_attesa',
  project_id: 1,
  started_at: null,
  completed_at: null,
  created_at: '2026-03-14T08:30:00Z',
}

const IN_ATTESA_DETAIL = {
  ...IN_ATTESA_PARTICIPANT,
  timeline: { started_at: null, completed_at: null, session_count: 0 },
  progress: { done: 0, total: 18 },
  elapsed: { seconds: null, sessions_counted: 0, sessions_total: 0 },
  cost: {
    amount: null,
    currency: 'USD',
    is_estimate: true,
    sessions_estimated: 0,
    sessions_total: 0,
  },
  files: { transcript: null, evaluation_raw: null },
}

async function jsonRoute(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

// `apiBase` is '' in this SPA (D11 — same-origin), so an API path like
// `/participants/1` is byte-identical to the SPA ROUTE `/participants/1`;
// scoping to non-document resource types keeps the document navigation
// itself from being intercepted (same fix documented in admin-flow.spec.ts).
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
    (url) => url.pathname === '/profile',
    (route) =>
      jsonRoute(route, {
        data: {
          id: 1,
          name: 'Operator One',
          email: 'operator@example.com',
          locale: 'it',
          role: 'operator',
          organization: { id: 1, name: 'Acme' },
          photo_url: null,
        },
      })
  )
  await page.route(
    (url) => url.pathname === '/participants',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            data: [IN_CORSO_PARTICIPANT, IN_ATTESA_PARTICIPANT],
            links: { first: null, last: null, prev: null, next: null },
            meta: { current_page: 1, last_page: 1, total: 2, from: 1, to: 2, per_page: 20 },
          })
        : route.continue()
  )
  await page.route(
    (url) => url.pathname === '/participants/1',
    (route) =>
      isDataRequest(route) ? jsonRoute(route, { data: IN_CORSO_DETAIL }) : route.continue()
  )
  await page.route(
    (url) => url.pathname === '/participants/1/transcript',
    (route) => jsonRoute(route, { data: IN_CORSO_TRANSCRIPT })
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
          current_status: 'in_corso',
          required_status: 'completato',
        }),
      })
  )
  await page.route(
    (url) => url.pathname === '/participants/1/sessions',
    (route) => jsonRoute(route, { data: [] })
  )
  await page.route(
    (url) => url.pathname === '/participants/2',
    (route) =>
      isDataRequest(route) ? jsonRoute(route, { data: IN_ATTESA_DETAIL }) : route.continue()
  )
  await page.route(
    (url) => url.pathname === '/participants/2/evaluation',
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
  await page.route(
    (url) => url.pathname === '/participants/2/sessions',
    (route) => jsonRoute(route, { data: [] })
  )
}

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill('operator@example.com')
  await page.getByLabel('Password').fill('secret-password')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL('/')
}

test.describe('Transcript panel (operator-participant-visibility PR4, D2/D7)', () => {
  test('an operator reads progress/elapsed/cost, then reads the partial transcript grouped by question with both speakers', async ({
    page,
  }) => {
    await mockAdminApi(page)
    await login(page)

    await page.getByRole('link', { name: 'Candidati' }).click()
    await page.getByRole('link', { name: 'Mario Rossi' }).click()
    await expect(page).toHaveURL('/participants/1')

    // Progress/elapsed/estimated cost — the five facts PR3 already surfaces.
    await expect(page.getByTestId('interview-progress')).toContainText('1 / 18')
    await expect(page.getByTestId('interview-elapsed')).toBeVisible()
    await expect(page.getByTestId('interview-cost')).toBeVisible()

    // The transcript panel: visible (in_corso is now reachable, D1), the
    // partial label ABOVE the turns, and both speakers' turns present,
    // grouped by question (both competency codes render as distinct groups).
    const panel = page.getByTestId('transcript-panel')
    await expect(panel).toBeVisible()
    await expect(page.getByTestId('transcript-partial')).toBeVisible()
    // Exact heading text — "COL" alone would substring-match inside the
    // Italian partial-label copy ("...il COLloquio non è ancora...").
    await expect(panel.getByRole('heading', { name: 'INN — Domanda 1' })).toBeVisible()
    await expect(panel.getByRole('heading', { name: 'COL — Domanda 2' })).toBeVisible()
    await expect(panel.getByText('Tell me about a time you proposed a new approach.')).toBeVisible()
    await expect(
      panel.getByText('At my previous role I redesigned our onboarding flow.')
    ).toBeVisible()
    await expect(
      panel.getByText('Describe a time you worked closely with a difficult colleague.')
    ).toBeVisible()
    await expect(
      panel.getByText('We disagreed on the release plan, so I scheduled a 1:1.')
    ).toBeVisible()
  })

  test('the transcript panel is covered by the page a11y run', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)

    // Click-through navigation, not a direct `page.goto()` reload — the JWT
    // is memory-only by design (useAuth.ts: "a reload therefore always
    // starts unauthenticated in memory"), and this environment's known,
    // pre-existing blocker on the reload path is documented in
    // admin-flow.spec.ts's own "candidate detail view is WCAG 2.1 AA clean"
    // failure. Staying in-SPA keeps this a real, currently-passable check.
    await page.getByRole('link', { name: 'Candidati' }).click()
    await page.getByRole('link', { name: 'Mario Rossi' }).click()
    await expect(page).toHaveURL('/participants/1')
    await expect(page.getByTestId('transcript-panel')).toBeVisible()

    await checkA11y(page)
  })

  test('an in_attesa participant offers no transcript panel and no enabled download control', async ({
    page,
  }) => {
    await mockAdminApi(page)
    await login(page)

    await page.getByRole('link', { name: 'Candidati' }).click()
    await page.getByRole('link', { name: 'Anna Bianchi' }).click()
    await expect(page).toHaveURL('/participants/2')
    await expect(page.getByRole('heading', { name: 'Anna Bianchi' })).toBeVisible()

    await expect(page.getByTestId('transcript-panel')).not.toBeVisible()
    await expect(page.getByTestId('download-transcript')).toBeDisabled()
  })
})
