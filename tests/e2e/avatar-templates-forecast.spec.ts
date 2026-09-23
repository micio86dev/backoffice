import { test, expect, type Page, type Route } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'
import { abilitiesFor } from './fixtures/abilities'

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

// avatar-template-catalogue PR4: `voiceId` carries `catalogue_resource:
// 'voice'`, `avatarId` deliberately does not — the fixture needs one
// catalogue-backed field and one plain manual-entry field side by side to
// prove the picker only replaces the CONTROL it is wired to (D7).
const FIELD_SPECS = {
  heygen: [
    { key: 'avatarId', type: 'text', label_key: 'avatar_templates.field.avatarId' },
    {
      key: 'voiceId',
      type: 'text',
      label_key: 'avatar_templates.field.voiceId',
      catalogue_resource: 'voice',
    },
  ],
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
            abilities: abilitiesFor(['admin']),
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

// avatar-template-catalogue PR4 (D5/D7): the provider-catalogue picker,
// wired into the same form this file already opens and submits for the
// forecast tests above — extended rather than a new harness (per this
// change's own task instructions).
test.describe('Avatar templates — provider catalogue picker (avatar-template-catalogue PR4)', () => {
  test('picks a HeyGen voice from the catalogue, showing its language, and the manual-entry path stays unchanged', async ({
    page,
  }) => {
    let patchBody: Record<string, unknown> | null = null

    await mockApi(page, [templateFixture()])

    // `avatarTemplates.update` is PLATFORM-gated (`isSuperadmin`), not a plain
    // tenant `admin` ability (tests/unit/support/abilities.ts) — `mockApi`'s
    // shared `/auth/me` stub answers as a tenant admin, which never renders
    // `template-edit-{id}` at all. Overridden here, after `mockApi`, rather
    // than changing the shared helper's default: Playwright dispatches the
    // most-recently-registered matching route first, so this replaces the
    // `/auth/me` handler for this test only, exactly like
    // `catalogue-edit-publish.spec.ts`'s own platform-only override.
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
              abilities: abilitiesFor({ roles: ['admin'], isSuperadmin: true }),
            })
          : route.continue()
    )

    await page.route(
      (url) => url.pathname === '/avatar-templates/catalogue',
      (route) =>
        isDataRequest(route)
          ? jsonRoute(route, {
              data: {
                status: 'ok',
                items: [
                  {
                    id: 'voice-e2e-1',
                    label: 'Recruiter EN',
                    language: 'en',
                    preview_image_url: null,
                    preview_audio_url: null,
                  },
                ],
              },
            })
          : route.continue()
    )
    // Both fulfilled-empty rather than left unmocked: the form loads these
    // in the background on mount (P8's conversation-LLM binding), and an
    // empty catalogue here still carries the template's existing binding
    // through untouched — this test is about the AVATAR/VOICE catalogue,
    // not the LLM one.
    await page.route(
      (url) => url.pathname === '/llm-models',
      (route) => (isDataRequest(route) ? jsonRoute(route, { data: [] }) : route.continue())
    )
    await page.route(
      (url) => url.pathname === '/llm-credentials',
      (route) => (isDataRequest(route) ? jsonRoute(route, { data: [] }) : route.continue())
    )
    await page.route(
      (url) => url.pathname === '/avatar-templates/1',
      async (route) => {
        if (route.request().method() !== 'PATCH') {
          await route.continue()

          return
        }

        patchBody = route.request().postDataJSON()
        await jsonRoute(route, { data: templateFixture() })
      }
    )

    await login(page)
    await page.goto('/avatar-templates')

    // The role-aware first-login guided tour opens over a fresh session
    // (feature/role-aware-onboarding-tour) and would otherwise sit on top of
    // the row actions this test needs to click.
    const tourSkip = page.getByTestId('onboarding-tour-skip')
    if (await tourSkip.isVisible().catch(() => false)) await tourSkip.click()

    await page.getByTestId('template-edit-1').click()
    await expect(page.getByTestId('template-form')).toBeVisible()

    // Open the catalogue picker and see the language it carries — the exact
    // thing an operator needs to catch a preset named for one language but
    // tagged for another (this feature's founding bug, proposal.md).
    const voiceInput = page.getByTestId('template-config-voiceId')
    await voiceInput.click()
    const catalogueItem = page.getByTestId('template-config-voiceId-item-voice-e2e-1')
    await expect(catalogueItem).toBeVisible()
    await expect(catalogueItem).toContainText('en')
    await catalogueItem.click()
    await expect(voiceInput).toHaveValue('voice-e2e-1')

    // The manual-entry path, unchanged: avatarId carries no
    // catalogue_resource in this fixture, so it stays a plain text input.
    await page.getByTestId('template-config-avatarId').fill('manual-avatar-id')

    await page.getByTestId('form-drawer-save').click()
    await expect(page.getByTestId('template-form')).toBeHidden()

    expect(patchBody?.config).toMatchObject({
      voiceId: 'voice-e2e-1',
      avatarId: 'manual-avatar-id',
    })
  })
})
