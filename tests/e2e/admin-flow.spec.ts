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
  id: 1,
  candidate_ref: 'ref-001',
  display_name: 'Mario Rossi',
  role_code: 'FLL',
  language: 'it',
  status: 'completato',
  project_id: 1,
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
  // The participant detail contract gained progress/elapsed/cost. These mocks
  // are typed the same as the real payload on purpose: leaving them short and
  // making the page defensive instead would hide a genuine API regression
  // behind an optional-chain.
  progress: { done: 5, total: 5 },
  elapsed: { seconds: 1860, sessions_counted: 5, sessions_total: 5 },
  cost: {
    amount: 3.72,
    currency: 'USD',
    is_estimate: true,
    sessions_estimated: 5,
    sessions_total: 5,
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

// SLF fixture per esempio-report-valutazione.json / admin-backoffice spec
// "SLF fixture renders per esempio-report-valutazione.json" scenario: [5,3,-1]
// (API-mapped to null) -> mean 4.0, reliability "67%". COM added as a second,
// fully-assessed competency for a more representative report screenshot.
/**
 * Scoring provenance, the `meta.scoring` sibling of `data` (D7).
 *
 * Values mirror what production stamps; the report renders them as a
 * traceability footnote, so they must be present and well-formed.
 */
const SCORING_META = {
  prompt_version: '3.0.0',
  model_version: 'claude-haiku-4-5-20251001',
  framework_version: '1.4.0',
}

const EVALUATION_REPORT = {
  SLF: {
    score: 4.0,
    reliability: '67%',
    // The API always sends this, null when the competency scored normally.
    // Its absence is what made the report claim "not assessed" beside a real
    // score — the code now tolerates it, and the fixture stops pretending.
    unscorable_reason: null,
    behaviors: [
      {
        indicator: 'Describe products and services accurately',
        score: 5,
        explanation: 'Clear and engaging description of the product.',
        excerpts: ['Durante un pranzo tra colleghi ho dovuto illustrare...'],
      },
      {
        indicator: 'Link own arguments to customer needs and priorities',
        score: 3,
        explanation: 'Solid but improvable link to customer needs.',
        excerpts: ['avevamo parlato direttamente con dei potenziali clienti...'],
      },
      {
        indicator: 'Negotiate to reach solutions that meet the primary interests of customers',
        score: null,
        explanation: 'No relevant example provided; unassessable.',
        excerpts: [],
      },
    ],
  },
  COM: {
    score: 3.67,
    reliability: '100%',
    unscorable_reason: null,
    behaviors: [
      {
        indicator: 'Get the point across clearly and concisely',
        score: 5,
        explanation: 'x',
        excerpts: ['e1'],
      },
      {
        indicator: 'Keep people interested when speaking',
        score: 3,
        explanation: 'y',
        excerpts: ['e2'],
      },
      { indicator: 'Speak effectively in a group', score: 3, explanation: 'z', excerpts: ['e3'] },
    ],
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
  // The access token is memory-only by design, so EVERY hard navigation starts
  // unauthenticated and `plugins/00.auth-bootstrap.client.ts` re-mints it from
  // the refresh cookie before the page renders.
  //
  // Unmocked, that call failed and the app did exactly what it should — sent
  // the operator to the login screen. Every test reaching a page through
  // `page.goto()` then failed on a missing heading or table, which reads as a
  // broken report rather than a missing mock. Tests that navigate by CLICKING
  // passed throughout, because the token was still in memory: that asymmetry is
  // the tell.
  await page.route(
    (url) => url.pathname === '/auth/refresh',
    (route) =>
      jsonRoute(route, {
        access_token: 'e2e-access-token',
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
  await page.route(
    (url) => url.pathname === '/participants/1/evaluation',
    // `meta.scoring` is REQUIRED, not decorative: useEvaluationReport reads
    // `response.meta.scoring` unconditionally (D7, bars-full-scale-1-5). A mock
    // carrying only `data` throws on the property access, the page renders no
    // report at all, and every assertion below fails with "table not found" —
    // which reads as a UI regression rather than a stale fixture. That is what
    // it did from 2026-08-24 until this was fixed.
    (route) => jsonRoute(route, { data: EVALUATION_REPORT, meta: { scoring: SCORING_META } })
  )
  await page.route(
    (url) => url.pathname === '/participants/1/transcript/download',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        headers: { 'Content-Disposition': 'attachment; filename="beai-transcript-ref-001.txt"' },
        body: '=== SLF (question 1) ===\n[2026-03-14T09:05:00Z] candidate: sample answer\n',
      })
  )
  await page.route(
    (url) => url.pathname === '/participants/1/evaluation/download',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Content-Disposition': 'attachment; filename="beai-evaluation-ref-001.json"' },
        body: JSON.stringify(EVALUATION_REPORT),
      })
  )
}

/** A participant whose evaluation is not yet ready — 409 lifecycle_not_ready. */
async function mockNotReadyEvaluation(page: import('@playwright/test').Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/participants/1/evaluation',
    (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'lifecycle_not_ready',
          resource: 'evaluation',
          current_status: 'in_valutazione',
          required_status: 'completato',
        }),
      })
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
    // Progress from the detail fixture proves the payload was actually
    // rendered, not a stale/empty state. This used to pin a bare "5" — the raw
    // session count — which is precisely the unreadable figure this change
    // replaced: five-of-five and five-of-fifteen rendered identically. Pinning
    // the denominator too makes the assertion strictly stronger, and it can no
    // longer pass against a page that has lost the total.
    await expect(page.getByTestId('interview-progress')).toContainText('5 / 5')
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

test.describe('Admin flow — BARS report viewer + downloads (PR B3, D4/D9)', () => {
  test('full flow: login -> list -> detail -> report -> transcript/evaluation download', async ({
    page,
  }) => {
    await mockAdminApi(page)
    await login(page)

    await page.getByRole('link', { name: 'Candidati' }).click()
    await page.getByRole('link', { name: 'Mario Rossi' }).click()
    await expect(page).toHaveURL('/participants/1')

    // Report renders real fetched data (SLF fixture: mean 4.0, reliability 67%).
    // The app's default locale is Italian (same convention as the rest of this
    // suite, e.g. the "Accedi"/"Candidati" locators above) — Intl.NumberFormat
    // renders the mean with a comma decimal separator ("4,0"), not a period.
    // Scoped to the table: "SLF" also labels the excerpts section below it.
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByRole('table').getByText('SLF')).toBeVisible()
    await expect(page.getByText('4,0')).toBeVisible()
    await expect(page.getByText('67%')).toBeVisible()
    // The unassessable third indicator never renders the literal "-1".
    await expect(page.getByText('-1', { exact: true })).not.toBeVisible()

    // Downloads: fetch-then-blob (D9), never a blind window.open — asserted via
    // Playwright's real 'download' event, which only fires for an actual
    // browser-level file download (an anchor[download] click on a blob: URL).
    const transcriptDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Scarica trascrizione' }).click()
    const transcript = await transcriptDownload
    expect(transcript.suggestedFilename()).toContain('transcript')

    const evaluationDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Scarica valutazione (JSON)' }).click()
    const evaluation = await evaluationDownload
    expect(evaluation.suggestedFilename()).toContain('evaluation')
  })

  test('the report grid matches its visual baseline', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)
    await page.goto('/participants/1')
    await expect(page.getByText('4,0')).toBeVisible()

    await expect(page.getByRole('table')).toHaveScreenshot('report-grid.png')
  })

  test('the report view is WCAG 2.1 AA clean', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)
    await page.goto('/participants/1')
    await expect(page.getByText('4,0')).toBeVisible()

    await checkA11y(page)
  })

  test('a 409 (lifecycle_not_ready) renders a distinct "not ready yet" state, not a generic error', async ({
    page,
  }) => {
    await mockAdminApi(page)
    await mockNotReadyEvaluation(page)
    await login(page)
    await page.goto('/participants/1')

    // it.json: report.states.notReady.title -> "Non ancora disponibile"
    // (distinct from report.states.forbidden.title "Accesso negato" and
    // report.states.notFound.title "Non trovato" — see detail.spec.ts's unit
    // coverage of all three states; this E2E test proves the real network
    // 409 reaches this exact branch, not a stubbed composable).
    await expect(page.getByText('Non ancora disponibile')).toBeVisible()
    await expect(page.getByRole('table')).not.toBeVisible()
  })
})
