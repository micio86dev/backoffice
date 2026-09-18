import { test, expect, type Route } from '@playwright/test'
import { abilitiesFor } from './fixtures/abilities'

/**
 * Evaluation audit trigger, end to end (scoring-audit-jev design D9/D12,
 * admin-backoffice spec "An Operator Can Trigger An Audit Run And See Its
 * Status").
 *
 * Mirrors `participant-recovery.spec.ts`'s network-interception convention:
 * no live backend, API calls intercepted at the network layer with fixtures
 * shaped exactly like the real resources. Role-based locators ONLY
 * (getByRole/getByText), per this project's E2E convention.
 *
 * Logs in as an ADMIN, not an operator — `EvaluationPolicy::audit()` is
 * admin-only (design D12), unlike `ParticipantPolicy::recover()`, which
 * admits operator. `EvaluationAuditPanel.vue` itself renders the trigger for
 * every role (see its own docblock: no `can('evaluation.audit')` ability is
 * published by `UserAbilities::for()` to gate on) and relies on the SERVER's
 * 403 for a non-admin — this test exercises the SUCCESS path, which only an
 * admin identity can reach even against the mock.
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

// A candidate whose evaluation is ready to audit — completato, exactly the
// lifecycle gate `AdminParticipantReader::read(…, ParticipantReadScope::Evaluation)`
// requires (design D12 step 3).
const COMPLETED_PARTICIPANT = {
  id: 5,
  candidate_ref: 'ref-005',
  display_name: 'Giulia Bianchi',
  role_code: 'FLL',
  language: 'it',
  status: 'completato',
  project_id: 2,
  started_at: '2026-03-14T08:00:00Z',
  completed_at: '2026-03-14T09:00:00Z',
  created_at: '2026-03-14T08:30:00Z',
}

const COMPLETED_PARTICIPANT_DETAIL = {
  ...COMPLETED_PARTICIPANT,
  project: {
    id: ACTIVE_PROJECT.id,
    name: ACTIVE_PROJECT.name,
    status: ACTIVE_PROJECT.status,
    goes_live_at: ACTIVE_PROJECT.goes_live_at,
    deadline_at: ACTIVE_PROJECT.deadline_at,
  },
  timeline: {
    started_at: COMPLETED_PARTICIPANT.started_at,
    completed_at: '2026-03-14T09:00:00Z',
    session_count: 1,
  },
  progress: { done: 3, total: 3 },
  elapsed: { seconds: 900, sessions_counted: 1, sessions_total: 1 },
  cost: {
    amount: 1.2,
    currency: 'USD',
    is_estimate: true,
    sessions_estimated: 1,
    sessions_total: 1,
  },
  files: { transcript: null, evaluation_raw: null },
}

const SESSIONS = [
  {
    id: 20,
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
]

// The evaluation, never audited — before the trigger.
const EVALUATION_BEHAVIOR = (overrides: Record<string, unknown> = {}) => ({
  indicator: 'Describe products and services accurately',
  score: 5,
  explanation: 'Clear and engaging description.',
  excerpts: ['Durante un pranzo tra colleghi ho dovuto...'],
  unassessable_reason: null,
  audit: { status: 'never_audited', support_probability: null, outcome_reason: null },
  ...overrides,
})

const EVALUATION_BEFORE_AUDIT = {
  data: {
    PRS: {
      score: 5,
      reliability: '100%',
      behaviors: [EVALUATION_BEHAVIOR()],
      unscorable_reason: null,
    },
  },
  meta: {
    scoring: {
      prompt_version: '2.0.0',
      model_version: 'claude-haiku-4-5-20251001',
      framework_version: '1.4.0',
    },
    audit: null,
  },
}

// After the trigger, the operator re-navigates and the run has completed —
// this test does not poll; it simulates a page reload picking up the
// terminal state on the NEXT fetch, per design D9/D12 ("no persisted
// pending/running status to poll").
const EVALUATION_AFTER_AUDIT = {
  data: {
    PRS: {
      score: 5,
      reliability: '100%',
      behaviors: [
        EVALUATION_BEHAVIOR({
          audit: { status: 'judged', support_probability: 0.91, outcome_reason: null },
        }),
      ],
      unscorable_reason: null,
    },
  },
  meta: {
    scoring: {
      prompt_version: '2.0.0',
      model_version: 'claude-haiku-4-5-20251001',
      framework_version: '1.4.0',
    },
    audit: {
      run_id: 7,
      status: 'completed',
      judge_model_version: 'jev-1',
      audit_prompt_version: '1.0.0',
      created_at: '2026-03-14T10:00:00Z',
      indicators_total: 1,
      indicators_judged: 1,
      indicators_skipped: 0,
      indicators_unavailable: 0,
      indicators_malformed: 0,
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

  await page.route(
    (url) => url.pathname === '/auth/me',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            user: {
              id: 1,
              name: 'Admin One',
              email: 'admin@example.com',
              locale: 'it',
              photo_url: null,
            },
            organization: { id: 1, name: 'Acme' },
            roles: ['admin'],
            abilities: abilitiesFor(['admin']),
          })
        : route.continue()
  )

  await page.route(
    (url) => url.pathname === '/profile',
    (route) =>
      jsonRoute(route, {
        data: {
          id: 1,
          name: 'Admin One',
          email: 'admin@example.com',
          locale: 'it',
          role: 'admin',
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
        data: [COMPLETED_PARTICIPANT],
        links: { first: null, last: null, prev: null, next: null },
        meta: { current_page: 1, last_page: 1, total: 1, from: 1, to: 1, per_page: 20 },
      })
    }
  )

  await page.route(
    (url) => url.pathname === '/participants/5',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, { data: COMPLETED_PARTICIPANT_DETAIL })
        : route.continue()
  )

  await page.route(
    (url) => url.pathname === '/participants/5/sessions',
    (route) => jsonRoute(route, { data: SESSIONS })
  )

  // Served ONCE with the never-audited shape, then the audited shape after
  // the trigger — mirroring the real flow: the panel's own 'triggered'
  // handler re-fetches the evaluation. The SECOND response carries a small
  // artificial delay: mocked responses otherwise resolve fast enough that
  // Vue can coalesce the "in progress" → "completed" transition into a
  // single DOM flush before Playwright's assertion ever observes the
  // intermediate state — a real vendor-backed run takes minutes, so this
  // delay is closer to the real timing this scenario means to exercise, not
  // a workaround for a flaky assertion.
  let evaluationFetchCount = 0
  await page.route(
    (url) => url.pathname === '/participants/5/evaluation',
    async (route) => {
      evaluationFetchCount += 1
      if (evaluationFetchCount > 1) await new Promise((resolve) => setTimeout(resolve, 300))
      return jsonRoute(
        route,
        evaluationFetchCount === 1 ? EVALUATION_BEFORE_AUDIT : EVALUATION_AFTER_AUDIT
      )
    }
  )

  await page.route(
    (url) => url.pathname === '/participants/5/evaluation/audit',
    (route) => jsonRoute(route, { status: 'queued', evaluation_id: 5 }, 202)
  )
}

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('secret-password')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL('/')
}

test.describe('Evaluation audit trigger (scoring-audit-jev)', () => {
  test('an admin triggers an audit review and sees the run status change', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)

    await page.getByRole('link', { name: 'Candidati' }).click()
    await expect(page).toHaveURL('/participants')
    await page.getByRole('link', { name: 'Giulia Bianchi' }).click()
    await expect(page).toHaveURL('/participants/5')

    // Before the trigger: no terminal status, no client-local progress yet.
    await expect(page.getByText('Verifica di audit in corso')).toHaveCount(0)

    // The single indicator's OWN AuditFlag, scoped by the AccordionTrigger
    // row it lives on — `ScoreChip` renders no Badge, so this is the only
    // `[data-slot="badge"]` in that row. Before the trigger, it still shows
    // the pre-trigger `never_audited` verdict from the FIRST evaluation
    // fetch.
    const indicatorRow = page.getByRole('button', {
      name: /Describe products and services accurately/,
    })
    const indicatorAuditFlag = indicatorRow.locator('[data-slot="badge"][data-variant]')
    await expect(indicatorAuditFlag).toHaveAttribute('data-variant', 'outline')

    await page.getByRole('button', { name: 'Richiedi una verifica di audit' }).click()

    // Client-local, request-lifecycle signal — never the persisted status.
    await expect(page.getByText('Verifica di audit in corso')).toBeVisible()

    // The panel's own 'triggered' handler re-fetches the evaluation, which
    // now carries the terminal run — the persisted status renders.
    await expect(page.getByText('Verifica di audit completata')).toBeVisible()

    // The re-fetch must ALSO update the per-indicator verdict, not just the
    // panel's own summary badge above: `EVALUATION_AFTER_AUDIT` carries a
    // `judged` verdict with `support_probability: 0.91` for this same
    // indicator, so the individual AuditFlag must flip from `outline`
    // (never_audited) to `info` (judged) and render the probability.
    await expect(indicatorAuditFlag).toHaveAttribute('data-variant', 'info')
    await expect(indicatorAuditFlag).toContainText('91%')
  })
})
