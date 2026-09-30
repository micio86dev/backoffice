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
  await page.route(
    (url) => url.pathname === '/avatar-templates/field-specs',
    (route) =>
      jsonRoute(route, {
        data: {
          heygen: [{ key: 'avatarId', type: 'text', label_key: 'avatar_templates.field.avatarId' }],
          tavus: [],
        },
      })
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
