import { test, expect, type Page, type Route } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'

/**
 * Per-template conversation-LLM forecast (pluggable-conversation-llm P9,
 * DESIGN.md §8.2.7).
 *
 * The figure is a TOTAL for one reference interview, never a per-minute rate:
 * input tokens grow quadratically in turn count, because the model is re-sent
 * the whole conversation every turn. A template with no usable model binding
 * reads as "cannot be forecast", never as a forecast of zero.
 *
 * This is also the avatar-templates page's first axe run. The forecast line
 * adds a glossary trigger to a page that had none, and the equivalent
 * structure on the session review turned out to carry a real, serious axe
 * violation that only a rendered-page check found.
 */
function templateFixture(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Recruiter voice',
    description: 'Standard interviewer persona',
    provider: 'heygen',
    config: { avatarId: 'av_1', voiceId: 'vo_1' },
    is_active: true,
    created_at: '2026-08-01T09:00:00Z',
    updated_at: '2026-08-01T09:00:00Z',
    llm_model_id: 3,
    llm_credential_id: 4,
    llm_sync_status: 'synced',
    llm_synced_at: '2026-08-01T09:00:00Z',
    llm: { estimated_cost_usd_per_interview: { minutes: 15, turns: 60, usd: 0.3 } },
    ...over,
  }
}

const FIELD_SPECS = {
  heygen: [{ key: 'avatarId', type: 'text', label_key: 'avatar_templates.field.avatarId' }],
  tavus: [{ key: 'faceId', type: 'text', label_key: 'avatar_templates.field.faceId' }],
}

async function jsonRoute(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
}

function isDataRequest(route: Route): boolean {
  return route.request().resourceType() !== 'document'
}

async function mockApi(page: Page, templates: unknown[]): Promise<void> {
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
          })
        : route.continue()
  )
  await page.route(
    (url) => url.pathname === '/avatar-templates/field-specs',
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: FIELD_SPECS }) : route.continue())
  )
  await page.route(
    (url) => url.pathname === '/avatar-templates',
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: templates }) : route.continue())
  )
}

async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('secret-password')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL('/')
}

test.describe('Avatar templates — conversation-LLM forecast', () => {
  test('states a total for a named reference interview, never a per-minute rate', async ({
    page,
  }) => {
    await mockApi(page, [templateFixture()])
    await login(page)
    await page.goto('/avatar-templates')

    const forecast = page.getByTestId('template-llm-forecast-1')
    await expect(forecast).toBeVisible()
    // The number and the interview it is a total FOR travel together.
    await expect(forecast).toContainText('0,30')
    await expect(forecast).toContainText('15')
    await expect(forecast).toContainText('60')
    // 0.30 over the 15-minute reference interview would be 0,02 per minute.
    await expect(forecast).not.toContainText('0,02')
  })

  test('says an unbound template cannot be forecast rather than forecasting zero', async ({
    page,
  }) => {
    await mockApi(page, [templateFixture({ llm: { estimated_cost_usd_per_interview: null } })])
    await login(page)
    await page.goto('/avatar-templates')

    const forecast = page.getByTestId('template-llm-forecast-1')
    await expect(forecast).toBeVisible()
    // Zero is a price. An unbound template has no price at all.
    await expect(forecast).not.toContainText('0,00')
  })

  test('the templates page is WCAG 2.1 AA clean with the forecast rendered', async ({ page }) => {
    await mockApi(page, [templateFixture()])
    await login(page)
    await page.goto('/avatar-templates')

    await expect(page.getByTestId('template-llm-forecast-1')).toBeVisible()

    await checkA11y(page)
  })
})
