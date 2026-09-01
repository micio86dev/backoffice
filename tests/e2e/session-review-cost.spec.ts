import { test, expect, type Page, type Route } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'
import { abilitiesFor } from './fixtures/abilities'

/**
 * Per-session cost on the interview session review
 * (pluggable-conversation-llm P9, DESIGN.md §8.2.5).
 *
 * Four rules, each with a reason, and each of them is about what an operator
 * would BELIEVE from a number — which is exactly the kind of defect a
 * component spec can miss and a rendered page cannot hide:
 *
 * 1. Two labelled lines, never one combined total. Avatar minutes and
 *    conversation-LLM tokens are different vendors on different meters; the
 *    refusal is ratified verbatim at
 *    `api/app/Services/Proctoring/SessionCostEstimator.php:20-22`.
 * 2. Never a per-minute LLM rate. Input tokens grow quadratically in turn
 *    count, so a rate is meaningless at any other interview length.
 * 3. "Actual" renders only when non-null — permanently null in managed mode.
 * 4. Absent is not zero. No usage row means the model was never run.
 *
 * Network-interception convention as in `transcript-panel.spec.ts`: no live
 * backend, fixtures shaped exactly like `SessionReviewResource`. Role-based
 * and testid locators only.
 */

function reviewFixture(cost: unknown) {
  return {
    id: 100,
    participant_id: 1,
    competency_code: 'COL',
    question_index: 0,
    provider: 'heygen',
    provider_session_ref: 'sess_1',
    status: 'ended',
    ended_reason: 'completed',
    started_at: '2026-03-14T09:00:00Z',
    ended_at: '2026-03-14T09:10:00Z',
    duration_seconds: 600,
    integrity: {
      score: 0,
      band: 'low',
      coverage_complete: true,
      unavailable_layers: [],
      total: 0,
      counts: {},
      events: [],
      second_monitor: false,
      tab_hidden_sec: 0,
      face_absent_sec: 0,
      looking_away_sec: 0,
      multiple_faces_sec: 0,
      second_voice_sec: 0,
      fullscreen_exits: 0,
      clipboard_copies: 0,
      clipboard_pastes: 0,
    },
    snapshots: [],
    cost,
  }
}

// 2.00 avatar against 0.50 LLM over a 600 s session: a combined total would
// read 2,50 and a per-minute LLM rate 0,05. Both forbidden renderings are
// therefore detectable as page text.
const BOTH_METERS = {
  avatar: { provider: 'heygen', minutes: 10, usd: 2 },
  llm: { estimated_usd: 0.5, actual_usd: null },
  is_estimate: true,
}

const SESSION_SUMMARY = {
  id: 100,
  competency_code: 'COL',
  question_index: 0,
  provider: 'heygen',
  status: 'ended',
  ended_reason: 'completed',
  started_at: '2026-03-14T09:00:00Z',
  ended_at: '2026-03-14T09:10:00Z',
  duration_seconds: 600,
  integrity_event_count: 0,
  llm_cost_usd: 0.5,
}

async function jsonRoute(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
}

function isDataRequest(route: Route): boolean {
  return route.request().resourceType() !== 'document'
}

async function mockApi(page: Page, cost: unknown): Promise<void> {
  await page.route(
    (url) => url.pathname === '/auth/login',
    (route) =>
      jsonRoute(route, {
        access_token: 'e2e-access-token',
        refresh_token: 'e2e-refresh',
        token_type: 'bearer',
      })
  )
  // The access token is memory-only, and the boot plugin refreshes on EVERY
  // full page load — including the page.goto() below, which is a real browser
  // navigation. Without this the auth guard bounces back to /login.
  await page.route(
    (url) => url.pathname === '/auth/refresh',
    (route) => jsonRoute(route, { access_token: 'e2e-access-token', token_type: 'bearer' })
  )
  await page.route(
    (url) => url.pathname === '/auth/me',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            user: {
              id: 1,
              name: 'Ada Lovelace',
              email: 'ada@example.com',
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
    (url) => url.pathname === '/interview-sessions/100/review',
    (route) =>
      isDataRequest(route) ? jsonRoute(route, { data: reviewFixture(cost) }) : route.continue()
  )
  await page.route(
    (url) => url.pathname === '/participants/1/sessions',
    (route) =>
      isDataRequest(route) ? jsonRoute(route, { data: [SESSION_SUMMARY] }) : route.continue()
  )
}

async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('secret-password')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL('/')
}

test.describe('Session review — conversation-LLM cost', () => {
  test('shows two labelled meters and never their sum, nor a per-minute rate', async ({ page }) => {
    await mockApi(page, BOTH_METERS)
    await login(page)
    await page.goto('/interview-sessions/100')

    const section = page.getByTestId('session-cost')
    await expect(section).toBeVisible()

    // Each meter, on its own line, with its own figure.
    await expect(page.getByTestId('cost-avatar')).toContainText('2,00')
    await expect(page.getByTestId('cost-llm-estimated')).toContainText('0,50')

    // Rule 1 — the sum has no owner, so it is never rendered.
    await expect(section).not.toContainText('2,50')
    // Rule 2 — 0.50 over 600 s would be 0,05 per minute.
    await expect(section).not.toContainText('0,05')
  })

  // Rule 3.
  test('offers no Actual line while the API reports no actual figure', async ({ page }) => {
    await mockApi(page, BOTH_METERS)
    await login(page)
    await page.goto('/interview-sessions/100')

    await expect(page.getByTestId('cost-llm-estimated')).toBeVisible()
    await expect(page.getByTestId('cost-llm-actual')).toHaveCount(0)
  })

  // Rule 4 — a session whose LLM binding resolved unbound or degraded has no
  // usage row at all. Zero would state a price for a model that never ran.
  test('states the model was never run rather than pricing the session at zero', async ({
    page,
  }) => {
    await mockApi(page, { avatar: BOTH_METERS.avatar, llm: null, is_estimate: true })
    await login(page)
    await page.goto('/interview-sessions/100')

    const llm = page.getByTestId('cost-llm-absent')
    await expect(llm).toBeVisible()
    await expect(llm).not.toContainText('0,00')
    await expect(page.getByTestId('cost-llm-estimated')).toHaveCount(0)
  })

  test('the review page is WCAG 2.1 AA clean with both cost meters rendered', async ({ page }) => {
    await mockApi(page, BOTH_METERS)
    await login(page)
    await page.goto('/interview-sessions/100')

    await expect(page.getByTestId('session-cost')).toBeVisible()

    await checkA11y(page)
  })
})
