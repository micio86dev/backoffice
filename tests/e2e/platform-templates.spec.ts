import { test, expect, type Page, type Route } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'
import { abilitiesFor } from './fixtures/abilities'

/**
 * Platform (global) avatar templates: the superadmin management page
 * (global-avatar-templates, slice B2).
 *
 * Same convention as `clients.spec.ts` and `project-template-picker-platform`:
 * no live backend, every API call intercepted at the network layer, and the
 * session injected through the boot plugin's `POST /auth/refresh`. Locale is
 * pinned to `it-IT`, so accessible names are Italian.
 *
 * The mock keeps its own in-memory list and records every write, because the
 * assertions that matter are about what was NOT sent: no PATCH before the
 * usage warning is confirmed, none after it is cancelled.
 */

interface Row {
  id: number
  name: string
  provider: 'heygen' | 'tavus'
  is_active: boolean
  usage: { organization_count: number; project_count: number }
}

/** What `GET /admin/avatar-templates/field-specs` serves for the two providers. */
const PLATFORM_FIELD_SPECS = {
  heygen: [
    { key: 'avatarId', type: 'text', label_key: 'avatar_templates.field.avatarId' },
    {
      key: 'voiceId',
      type: 'text',
      label_key: 'avatar_templates.field.voiceId',
      superseded_by_key: 'ttsEngine',
      superseded_by_values: ['cartesia', 'elevenlabs'],
    },
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
      hint_key: 'avatar_templates.hint.heygenTtsModelName',
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
      hint_key: 'avatar_templates.hint.heygenTtsExternalVoiceId',
      superadmin_only: true,
    },
  ],
  tavus: [
    { key: 'faceId', type: 'text', label_key: 'avatar_templates.field.faceId' },
    {
      key: 'ttsEngine',
      type: 'select',
      label_key: 'avatar_templates.field.ttsEngine',
      options: ['tavus-auto', 'cartesia', 'elevenlabs', 'azure'],
    },
  ],
}

const isDataRequest = (route: Route): boolean => route.request().resourceType() !== 'document'

const jsonRoute = (route: Route, body: unknown, status = 200): Promise<void> =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** The full `PlatformAvatarTemplateResource` shape the page renders from. */
function resource(row: Row) {
  return {
    ...row,
    description: null,
    scope: 'platform',
    config: { avatarId: 'av_1' },
    created_at: null,
    updated_at: null,
    llm_model_id: null,
    llm_credential_id: null,
    llm_sync_status: null,
    llm_synced_at: null,
    llm: { estimated_cost_usd_per_interview: null },
    pal_sync: { status: null, code: null, synced_at: null },
  }
}

interface Api {
  rows: Row[]
  writes: Array<{ method: string; path: string; body: Record<string, unknown> | null }>
  /** What DELETE answers; null = 204. */
  deleteConflict: Record<string, unknown> | null
}

async function injectSession(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/auth/refresh',
    (route) => jsonRoute(route, { access_token: 'e2e-platform-templates', token_type: 'bearer' })
  )
}

async function mockIdentity(page: Page, kind: 'superadmin' | 'admin'): Promise<void> {
  const superadmin = kind === 'superadmin'

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
            organization: superadmin ? null : { id: 1, name: 'Acme' },
            roles: superadmin ? [] : ['admin'],
            abilities: abilitiesFor(superadmin ? { roles: [], isSuperadmin: true } : ['admin']),
          })
        : route.continue()
  )
  // SidebarNav's own fetch for a superadmin (acting-client state).
  await page.route(
    (url) => url.pathname === '/admin/organizations',
    (route) => jsonRoute(route, { data: [], acting_organization_id: null })
  )
}

async function mockApi(page: Page, api: Api): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith('/admin/avatar-templates'),
    async (route) => {
      if (!isDataRequest(route)) return route.continue()

      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()
      const id = Number(path.split('/')[3])
      const body = method === 'GET' ? null : (request.postDataJSON() as Record<string, unknown>)
      const row = api.rows.find((candidate) => candidate.id === id)

      // The PLATFORM field specs: the same as the organization route's plus the
      // platform-only external voice fields (`HeygenExternalVoice…` below).
      if (method === 'GET' && path === '/admin/avatar-templates/field-specs') {
        return jsonRoute(route, { data: PLATFORM_FIELD_SPECS })
      }

      if (method === 'GET') return jsonRoute(route, { data: api.rows.map(resource) })
      api.writes.push({ method, path, body })

      if (method === 'POST' && path === '/admin/avatar-templates') {
        const created: Row = {
          id: 100 + api.rows.length,
          name: String(body?.name),
          provider: body?.provider as Row['provider'],
          is_active: false,
          usage: { organization_count: 0, project_count: 0 },
        }
        api.rows.push(created)

        return jsonRoute(route, { data: resource(created) }, 201)
      }
      if (row === undefined) return jsonRoute(route, { message: 'not_found' }, 404)
      if (method === 'POST' && path.endsWith('/duplicate')) {
        const targets = (body?.target_organization_ids ?? []) as number[]

        return jsonRoute(
          route,
          {
            data: targets.map((organizationId, index) => ({
              ...resource(row),
              id: 900 + index,
              scope: 'organization',
              organization_id: organizationId,
              name: String(body?.name ?? row.name),
              is_active: false,
            })),
          },
          201
        )
      }
      if (method === 'POST' && path.endsWith('/activate')) row.is_active = true
      if (method === 'POST' && path.endsWith('/deactivate')) row.is_active = false
      if (method === 'PATCH') row.name = String(body?.name ?? row.name)
      if (method === 'DELETE') {
        if (api.deleteConflict !== null) return jsonRoute(route, api.deleteConflict, 409)
        api.rows = api.rows.filter((candidate) => candidate.id !== id)

        return route.fulfill({ status: 204 })
      }

      return jsonRoute(route, { data: resource(row) })
    }
  )
  // The page must NEVER read the organization specs: they leave the platform-only
  // voice fields out. Any request to that route fails the test through `unexpected`.
  await page.route(
    (url) => url.pathname === '/avatar-templates/field-specs',
    (route) => jsonRoute(route, { message: 'platform page read the organization specs' }, 500)
  )
  // The form loads the LLM pickers; an empty list is a valid answer.
  await page.route(
    (url) => url.pathname === '/llm-models' || url.pathname === '/llm-credentials',
    (route) => jsonRoute(route, { data: [] })
  )
}

const newApi = (rows: Row[] = [], deleteConflict: Api['deleteConflict'] = null): Api => ({
  rows,
  writes: [],
  deleteConflict,
})

const IN_USE: Row = {
  id: 7,
  name: 'Studio voice',
  provider: 'heygen',
  is_active: true,
  usage: { organization_count: 2, project_count: 5 },
}

test.describe('Platform templates: management flow (superadmin)', () => {
  test('sees the nav item and the page, creates a global and offers it', async ({ page }) => {
    const api = newApi()
    await injectSession(page)
    await mockIdentity(page, 'superadmin')
    await mockApi(page, api)

    await page.goto('/platform-templates')

    const nav = page.getByRole('navigation', { name: 'Navigazione principale' })
    await expect(nav.getByRole('link', { name: 'Template piattaforma' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Template piattaforma', level: 1 })
    ).toBeVisible()
    await expect(page.getByTestId('platform-templates-empty')).toBeVisible()
    await checkA11y(page)

    await page.getByTestId('platform-template-new').click()
    await page.getByTestId('template-field-name').fill('Studio voice')
    await page.getByTestId('form-drawer-save').click()

    const row = page.getByTestId('platform-template-row-100')
    await expect(row).toContainText('Studio voice')
    await expect(page.getByTestId('platform-template-state-100')).toHaveText('Ritirato')
    await expect(page.getByTestId('platform-template-usage-100')).toHaveText(
      '0 organizzazioni / 0 progetti'
    )
    // `config` reaches the api as the string-keyed MAP it validates, not a list.
    const created = api.writes.find((write) => write.method === 'POST')
    expect(created?.body).toMatchObject({ name: 'Studio voice', provider: 'heygen' })
    expect(Array.isArray(created?.body?.config)).toBe(false)

    await page.getByTestId('platform-template-offer-100').click()

    await expect(page.getByTestId('platform-template-state-100')).toHaveText('Offerto')
    await expect(page.getByTestId('platform-template-notice')).toHaveAttribute('role', 'status')
  })

  test('a HeyGen bind outage (503 with only a message code) reaches the operator in the form', async ({
    page,
  }) => {
    const api = newApi()
    await injectSession(page)
    await mockIdentity(page, 'superadmin')
    await mockApi(page, api)
    // Registered after mockApi, so it wins for the create only.
    await page.route(
      (url) => url.pathname === '/admin/avatar-templates',
      (route) =>
        isDataRequest(route) && route.request().method() === 'POST'
          ? jsonRoute(route, { message: 'tts_provider_unconfigured' }, 503)
          : route.fallback()
    )

    await page.goto('/platform-templates')
    await page.getByTestId('platform-template-new').click()
    await page.getByTestId('template-field-name').fill('Studio voice')
    await page.getByTestId('form-drawer-save').click()

    await expect(page.getByTestId('template-form-errors')).toContainText(
      'La piattaforma non ha una chiave HeyGen configurata'
    )
  })

  test('warns with the usage counts before an edit: nothing is sent until confirmed', async ({
    page,
  }) => {
    const api = newApi([{ ...IN_USE }])
    await injectSession(page)
    await mockIdentity(page, 'superadmin')
    await mockApi(page, api)

    await page.goto('/platform-templates')
    await page.getByTestId('platform-template-edit-7').click()
    await page.getByTestId('template-field-name').fill('Studio voice v2')
    await page.getByTestId('form-drawer-save').click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('2 organizzazioni / 5 progetti usano questo template')
    expect(api.writes.filter((write) => write.method === 'PATCH')).toHaveLength(0)

    // Cancel: still nothing sent, and the form keeps what was typed.
    await dialog.getByTestId('confirm-dialog-cancel').click()
    await expect(dialog).toHaveCount(0)
    expect(api.writes.filter((write) => write.method === 'PATCH')).toHaveLength(0)
    await expect(page.getByTestId('template-field-name')).toHaveValue('Studio voice v2')

    await page.getByTestId('form-drawer-save').click()
    await page.getByRole('alertdialog').getByTestId('confirm-dialog-confirm').click()

    await expect(page.getByTestId('platform-template-row-7')).toContainText('Studio voice v2')
    expect(api.writes.filter((write) => write.method === 'PATCH')).toHaveLength(1)
  })

  test('cannot delete an in-use global: disabled with the reason, and a 409 shows the counts', async ({
    page,
  }) => {
    const stale: Row = {
      id: 8,
      name: 'Old voice',
      provider: 'tavus',
      is_active: false,
      usage: { organization_count: 0, project_count: 0 },
    }
    const api = newApi([{ ...IN_USE }, stale], {
      error: 'template_in_use',
      message: 'template_in_use',
      organization_count: 2,
      project_count: 3,
    })
    await injectSession(page)
    await mockIdentity(page, 'superadmin')
    await mockApi(page, api)

    await page.goto('/platform-templates')

    const blocked = page.getByTestId('platform-template-delete-7')
    await expect(blocked).toBeDisabled()
    await expect(page.getByTestId('platform-template-delete-reason-7')).toContainText(
      '2 organizzazioni / 5 progetti'
    )

    // Usage read as zero (stale list): the server refuses and says how far it reaches.
    await page.getByTestId('platform-template-delete-8').click()
    await page.getByRole('alertdialog').getByTestId('confirm-dialog-confirm').click()

    const alert = page.getByTestId('platform-template-error')
    await expect(alert).toContainText('2 organizzazioni / 3 progetti usano ancora questo template')
    await expect(page.getByTestId('platform-template-row-8')).toBeVisible()
  })

  test('copies a global into chosen organizations: platform route, payload, result summary', async ({
    page,
  }) => {
    const api = newApi([{ ...IN_USE }])
    await injectSession(page)
    await mockIdentity(page, 'superadmin')
    await mockApi(page, api)
    // Registered after `mockIdentity`, so it wins: the dialog needs real targets.
    await page.route(
      (url) => url.pathname === '/admin/organizations',
      (route) =>
        jsonRoute(route, {
          data: [
            { id: 11, name: 'Acme' },
            { id: 12, name: 'Globex' },
            { id: 13, name: 'Initech' },
          ],
          acting_organization_id: null,
        })
    )

    await page.goto('/platform-templates')
    await page.getByTestId('platform-template-copy-7').click()

    const dialog = page.getByTestId('copy-template-dialog')
    await expect(dialog.getByTestId('copy-template-platform-badge')).toBeVisible()
    await expect(dialog.getByTestId('copy-template-independence')).toBeVisible()

    // Nothing selected: the submit is disabled and nothing has been sent.
    await expect(dialog.getByTestId('copy-template-submit')).toBeDisabled()
    expect(api.writes).toHaveLength(0)

    await dialog.getByRole('checkbox', { name: 'Acme' }).click()
    await dialog.getByRole('checkbox', { name: 'Initech' }).click()
    await dialog.getByTestId('copy-template-name').fill('Studio voice (client)')
    await dialog.getByTestId('copy-template-submit').click()

    // The platform route, never the organization one (which 404s a global id).
    expect(api.writes).toHaveLength(1)
    expect(api.writes[0]).toMatchObject({
      method: 'POST',
      path: '/admin/avatar-templates/7/duplicate',
      body: { target_organization_ids: [11, 13], name: 'Studio voice (client)' },
    })

    const result = dialog.getByTestId('copy-template-result')
    await expect(result).toHaveAttribute('role', 'status')
    await expect(dialog.getByTestId('copy-template-result-title')).toHaveText('2 copie create')
    await expect(dialog.getByTestId('copy-result-900')).toContainText('Acme')
    await expect(dialog.getByTestId('copy-result-901')).toContainText('Initech')

    await dialog.getByTestId('copy-template-done').click()
    await expect(dialog).toHaveCount(0)
    // The copies live in other organizations: the list behind is unchanged.
    await expect(page.getByTestId('platform-template-row-7')).toContainText('Studio voice')
  })
})

test.describe('Platform templates: HeyGen external voice (superadmin)', () => {
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

  async function open(page: Page, api: Api): Promise<void> {
    await injectSession(page)
    await mockIdentity(page, 'superadmin')
    await mockApi(page, api)
    await page.route(
      (url) => url.pathname === '/avatar-templates/catalogue',
      (route) => jsonRoute(route, { data: CARTESIA_VOICES })
    )
    await page.goto('/platform-templates')
  }

  test('picks an engine, then a catalogue voice, and saves them without a native voice id', async ({
    page,
  }) => {
    const api = newApi()
    await open(page, api)

    await page.getByTestId('platform-template-new').click()
    await page.getByTestId('template-field-name').fill('Elena su HeyGen')

    // A native HeyGen voice until an engine is chosen.
    await expect(page.getByTestId('template-config-voiceId')).toBeVisible()

    await page.getByTestId('template-config-ttsEngine').selectOption('cartesia')

    // The vendor voice picker REPLACES the native voice field.
    await expect(page.getByTestId('template-config-voiceId')).toHaveCount(0)
    await page.getByTestId('template-config-ttsExternalVoiceId').click()
    await page.getByTestId('template-config-ttsExternalVoiceId-item-ca-it').click()
    await expect(page.getByTestId('template-config-ttsExternalVoiceId-preview')).toBeVisible()

    await page.getByTestId('form-drawer-save').click()

    await expect(page.getByTestId('platform-template-row-100')).toContainText('Elena su HeyGen')
    const created = api.writes.find((write) => write.method === 'POST')
    expect(created?.body?.config).toEqual({ ttsEngine: 'cartesia', ttsExternalVoiceId: 'ca-it' })
  })

  test('selecting HeyGen on CREATE shows engine, voice model and voice fields at once, and switching provider re-renders', async ({
    page,
  }) => {
    await open(page, newApi())

    await page.getByTestId('platform-template-new').click()
    // HeyGen is the default provider: the fields are there before anything is saved.
    for (const key of ['ttsEngine', 'ttsModelName', 'ttsExternalVoiceId', 'voiceId']) {
      await expect(page.getByTestId(`template-config-${key}`)).toBeVisible()
    }
    await expect(page.getByText('Modello vocale', { exact: true })).toBeVisible()
    await expect(page.getByText('Motore di sintesi vocale', { exact: true })).toBeVisible()

    await page.getByTestId('template-field-provider').selectOption('tavus')
    await expect(page.getByTestId('template-config-faceId')).toBeVisible()
    await expect(page.getByTestId('template-config-ttsModelName')).toHaveCount(0)

    await page.getByTestId('template-field-provider').selectOption('heygen')
    await expect(page.getByTestId('template-config-ttsModelName')).toBeVisible()
    await expect(page.getByTestId('template-config-avatarId')).toBeVisible()
  })

  test('clearing the engine clears the voice and brings the native voice field back', async ({
    page,
  }) => {
    const api = newApi()
    await open(page, api)

    await page.getByTestId('platform-template-new').click()
    await page.getByTestId('template-config-ttsEngine').selectOption('cartesia')
    await page.getByTestId('template-config-ttsExternalVoiceId').click()
    await page.getByTestId('template-config-ttsExternalVoiceId-item-ca-it').click()

    await page.getByTestId('template-config-ttsEngine').selectOption('')

    await expect(page.getByTestId('template-config-ttsExternalVoiceId')).toHaveValue('')
    await expect(page.getByTestId('template-config-voiceId')).toBeVisible()
  })

  test('an engine with no voice is refused before anything is sent', async ({ page }) => {
    const api = newApi()
    await open(page, api)

    await page.getByTestId('platform-template-new').click()
    await page.getByTestId('template-field-name').fill('Senza voce')
    await page.getByTestId('template-config-ttsEngine').selectOption('elevenlabs')
    await page.getByTestId('form-drawer-save').click()

    await expect(page.getByTestId('template-config-ttsExternalVoiceId-error')).toBeVisible()
    expect(api.writes.filter((write) => write.method === 'POST')).toHaveLength(0)
  })

  test('a bind LiveAvatar refuses shows up on the voice field, in Italian, as a 422 (never a crash)', async ({
    page,
  }) => {
    const api = newApi()
    await open(page, api)
    await page.route(
      (url) => url.pathname === '/admin/avatar-templates',
      (route) =>
        route.request().method() === 'POST'
          ? jsonRoute(
              route,
              {
                message: 'The given data was invalid.',
                errors: { 'config.ttsExternalVoiceId': ['tts_voice_bind_failed'] },
              },
              422
            )
          : route.fallback()
    )

    await page.getByTestId('platform-template-new').click()
    await page.getByTestId('template-field-name').fill('Bind rifiutato')
    await page.getByTestId('template-config-ttsEngine').selectOption('cartesia')
    await page.getByTestId('template-config-ttsExternalVoiceId').click()
    await page.getByTestId('template-config-ttsExternalVoiceId-item-ca-it').click()
    await page.getByTestId('form-drawer-save').click()

    await expect(page.getByTestId('template-config-ttsExternalVoiceId-error')).toContainText(
      'collegare la voce a HeyGen'
    )
    // The drawer stays open: the operator's work is not lost.
    await expect(page.getByTestId('template-field-name')).toHaveValue('Bind rifiutato')
  })
})

test.describe('Platform templates: access (org admin)', () => {
  test('an org admin has no nav item and is redirected away on direct navigation', async ({
    page,
  }) => {
    await injectSession(page)
    await mockIdentity(page, 'admin')
    // Defence in depth: the endpoint refuses too. The redirect is the assertion
    // a deleted client-side guard would actually fail.
    await page.route(
      (url) => url.pathname.startsWith('/admin/avatar-templates'),
      (route) => jsonRoute(route, { message: 'Forbidden' }, 403)
    )

    await page.goto('/platform-templates')

    await expect(page).toHaveURL('/')
    const nav = page.getByRole('navigation', { name: 'Navigazione principale' })
    await expect(nav.getByRole('link', { name: 'Template piattaforma' })).toHaveCount(0)
  })
})
