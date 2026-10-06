import { test, expect, type Page, type Route } from '@playwright/test'
import { answerFirstVisitPrompts } from './fixtures/admin-session'
import { abilitiesFor } from './fixtures/abilities'

/**
 * The HeyGen external voice on the ORGANIZATION templates page
 * (`/avatar-templates`, menu entry "Template avatar"), not only on the platform
 * page. The scope rule is SUPERADMIN only, on both pages.
 *
 * No live backend: every API call is intercepted. The field-spec route answers
 * what the real API answers for each caller — the engine, voice model and voice
 * fields for a superadmin, none of them for anyone else — so the assertions are
 * on what the page renders from each answer and on the body it saves.
 */
const BASE_HEYGEN = [
  { key: 'avatarId', type: 'text', label_key: 'avatar_templates.field.avatarId' },
  {
    key: 'voiceId',
    type: 'text',
    label_key: 'avatar_templates.field.voiceId',
    superseded_by_key: 'ttsEngine',
    superseded_by_values: ['cartesia', 'elevenlabs'],
  },
]

const SUPERADMIN_ONLY = [
  {
    key: 'ttsEngine',
    type: 'select',
    label_key: 'avatar_templates.field.ttsEngine',
    hint_key: 'avatar_templates.hint.heygenTtsEngine',
    options: ['none', 'cartesia', 'elevenlabs'],
    superadmin_only: true,
  },
  {
    key: 'ttsModelName',
    type: 'select',
    label_key: 'avatar_templates.field.ttsModelName',
    options: ['sonic-3.5', 'sonic-3', 'eleven_flash_v2_5', 'eleven_multilingual_v2'],
    options_depend_on: 'ttsEngine',
    options_by_value: {
      cartesia: ['sonic-3.5', 'sonic-3'],
      elevenlabs: ['eleven_flash_v2_5', 'eleven_multilingual_v2'],
    },
    superadmin_only: true,
  },
  {
    key: 'ttsExternalVoiceId',
    type: 'text',
    label_key: 'avatar_templates.field.ttsExternalVoiceId',
    superadmin_only: true,
  },
]

const CARTESIA_VOICES = {
  status: 'ok',
  items: [
    {
      id: 'ca-it',
      provider: 'cartesia',
      label: 'Elena',
      name: 'Elena',
      language: 'it',
      locale: 'it',
      accent: null,
      italian: 'native',
      preview_image_url: null,
      preview_audio_url: null,
      preview_video_url: null,
    },
  ],
}

const isDataRequest = (route: Route): boolean => route.request().resourceType() !== 'document'

const jsonRoute = (route: Route, body: unknown, status = 200): Promise<void> =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

interface Api {
  writes: Array<{ method: string; path: string; body: Record<string, unknown> | null }>
}

async function mockApi(page: Page, kind: 'superadmin' | 'admin'): Promise<Api> {
  await answerFirstVisitPrompts(page)
  const superadmin = kind === 'superadmin'
  const api: Api = { writes: [] }

  await page.route(
    (url) => url.pathname === '/auth/refresh',
    (route) => jsonRoute(route, { access_token: 'e2e-org-templates', token_type: 'bearer' })
  )
  await page.route(
    (url) => url.pathname === '/auth/me',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            user: {
              id: 1,
              name: superadmin ? 'Root' : 'Ada Lovelace',
              email: 'user@example.com',
              locale: 'it',
              photo_url: null,
              is_superadmin: superadmin,
            },
            organization: { id: 1, name: 'Acme' },
            roles: superadmin ? [] : ['admin'],
            abilities: abilitiesFor(superadmin ? { roles: [], isSuperadmin: true } : ['admin']),
          })
        : route.continue()
  )
  await page.route(
    (url) => url.pathname === '/admin/organizations',
    // A superadmin writes org templates AS a client: the page keeps "new" disabled until one
    // is chosen in the switcher, so the mock says the superadmin is acting as Acme.
    (route) => jsonRoute(route, { data: [{ id: 1, name: 'Acme' }], acting_organization_id: 1 })
  )
  await page.route(
    (url) => url.pathname === '/avatar-templates/field-specs',
    (route) =>
      jsonRoute(route, {
        data: {
          heygen: superadmin ? [...BASE_HEYGEN, ...SUPERADMIN_ONLY] : BASE_HEYGEN,
          tavus: [{ key: 'faceId', type: 'text', label_key: 'avatar_templates.field.faceId' }],
        },
      })
  )
  await page.route(
    (url) => url.pathname === '/avatar-templates/catalogue',
    (route) => jsonRoute(route, { data: CARTESIA_VOICES })
  )
  await page.route(
    (url) => url.pathname === '/llm-models' || url.pathname === '/llm-credentials',
    (route) => jsonRoute(route, { data: [] })
  )
  await page.route(
    (url) => url.pathname === '/avatar-templates',
    async (route) => {
      if (!isDataRequest(route)) return route.continue()

      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as Record<string, unknown>
        api.writes.push({ method: 'POST', path: '/avatar-templates', body })

        return jsonRoute(
          route,
          {
            data: {
              id: 50,
              name: String(body.name),
              description: null,
              provider: body.provider,
              config: body.config,
              is_active: false,
              llm_model_id: null,
              llm_credential_id: null,
              llm_sync_status: null,
              llm_synced_at: null,
              llm: { estimated_cost_usd_per_interview: null },
              pal_sync: { status: null, code: null, synced_at: null },
            },
          },
          201
        )
      }

      return jsonRoute(route, { data: [] })
    }
  )

  return api
}

test.describe('Avatar templates page: HeyGen external voice, superadmin only', () => {
  test('a superadmin sees the engine, voice model and voice fields on a new HeyGen template and saves a Cartesia voice', async ({
    page,
  }) => {
    const api = await mockApi(page, 'superadmin')
    await page.goto('/avatar-templates')

    await page.getByTestId('template-new').click()
    await page.getByTestId('template-field-name').fill('Elena su HeyGen')

    // Same labels the owner sees on a Tavus template, now on HeyGen.
    await expect(page.getByText('Motore di sintesi vocale', { exact: true })).toBeVisible()
    await expect(page.getByText('Modello vocale', { exact: true })).toBeVisible()
    await expect(page.getByTestId('template-config-ttsExternalVoiceId')).toBeVisible()

    await page.getByTestId('template-config-ttsEngine').selectOption('cartesia')
    await page.getByTestId('template-config-ttsModelName').selectOption('sonic-3')
    await expect(page.getByTestId('template-config-voiceId')).toHaveCount(0)

    await page.getByTestId('template-config-ttsExternalVoiceId').click()
    await page.getByTestId('template-config-ttsExternalVoiceId-item-ca-it').click()
    await expect(page.getByTestId('template-config-ttsExternalVoiceId-preview')).toBeVisible()

    await page.getByTestId('form-drawer-save').click()

    await expect.poll(() => api.writes.length).toBe(1)
    expect(api.writes[0]?.body).toMatchObject({
      name: 'Elena su HeyGen',
      provider: 'heygen',
      config: { ttsEngine: 'cartesia', ttsModelName: 'sonic-3', ttsExternalVoiceId: 'ca-it' },
    })
    expect((api.writes[0]?.body?.config as Record<string, unknown>).voiceId).toBeUndefined()
  })

  test('a HeyGen bind outage (503 with only a message code) reaches the operator in the form', async ({
    page,
  }) => {
    await mockApi(page, 'superadmin')
    // Registered after mockApi, so it wins for the save only.
    await page.route(
      (url) => url.pathname === '/avatar-templates',
      (route) =>
        isDataRequest(route) && route.request().method() === 'POST'
          ? jsonRoute(route, { message: 'tts_bind_busy' }, 503)
          : route.fallback()
    )
    await page.goto('/avatar-templates')

    await page.getByTestId('template-new').click()
    await page.getByTestId('template-field-name').fill('Elena su HeyGen')
    await page.getByTestId('form-drawer-save').click()

    await expect(page.getByTestId('template-form-errors')).toContainText(
      'Questa voce è in fase di collegamento da un altro salvataggio'
    )
  })

  test('an organization admin never sees those fields: no create control, and the form it would open has none', async ({
    page,
  }) => {
    await mockApi(page, 'admin')
    await page.goto('/avatar-templates')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Creating and editing templates is a superadmin ability; the fields follow it.
    await expect(page.getByTestId('template-new')).toHaveCount(0)
    await expect(page.getByTestId('template-config-ttsEngine')).toHaveCount(0)
    await expect(page.getByTestId('template-config-ttsModelName')).toHaveCount(0)
    await expect(page.getByTestId('template-config-ttsExternalVoiceId')).toHaveCount(0)
  })
})
