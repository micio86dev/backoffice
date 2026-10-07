import { test, expect, type Page, type Route } from '@playwright/test'
import { answerFirstVisitPrompts } from './fixtures/admin-session'
import { abilitiesFor } from './fixtures/abilities'

/**
 * Project form: platform (global) avatar templates in the template picker
 * (global-avatar-templates, slice B1).
 *
 * Same network-interception convention as `projects-crud.spec.ts`: no live
 * backend, API calls intercepted at the network layer. Locale is pinned to
 * `it-IT` by playwright.config.ts, so accessible names are Italian.
 *
 * The picker uses native <optgroup>s, so the group labels are asserted on the
 * element attribute; a badge cannot live inside an <option>, so the Platform
 * badge is asserted under the control for the selected template.
 */

const OWN_ACTIVE = {
  id: 2,
  name: 'Own voice',
  provider: 'heygen',
  is_active: true,
  scope: 'organization',
}
const OWN_INACTIVE = {
  id: 3,
  name: 'Own draft',
  provider: 'tavus',
  is_active: false,
  scope: 'organization',
}
const GLOBAL_ACTIVE = {
  id: 1,
  name: 'Platform voice',
  provider: 'tavus',
  is_active: true,
  scope: 'platform',
}
const GLOBAL_RETIRED = {
  id: 9,
  name: 'Old platform voice',
  provider: 'heygen',
  is_active: false,
  scope: 'platform',
}

const PINNED_PROJECT = {
  id: 5,
  organization_id: 1,
  framework_version_id: 3,
  slug: 'pinned-project',
  name: 'Pinned Project',
  assessment_type: 'standard',
  role_code: 'FLL',
  language: 'en',
  status: 'draft',
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
  avatar_template_id: 9,
  avatar_template: {
    id: 9,
    name: 'Old platform voice',
    provider: 'heygen',
    scope: 'platform',
    llm_model: null,
  },
}

async function jsonRoute(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

const isDataRequest = (route: Route): boolean => route.request().resourceType() !== 'document'

async function mockApi(page: Page, options: unknown[], projects: unknown[] = []): Promise<void> {
  await answerFirstVisitPrompts(page)
  const answer = (path: string | RegExp, body: unknown) =>
    page.route(
      (url) => (typeof path === 'string' ? url.pathname === path : path.test(url.pathname)),
      (route) => (isDataRequest(route) ? jsonRoute(route, body) : route.continue())
    )

  await answer('/avatar-templates/options', { data: options })
  await answer('/framework/versions', {
    data: [
      {
        id: 3,
        organization_id: 1,
        version: 'v1.0',
        label: 'Initial',
        is_locked: false,
        created_at: null,
        updated_at: null,
      },
    ],
  })
  await answer(/^\/framework\/roles\/[A-Z]+\/competencies$/, { data: [] })
  await answer('/projects', { data: projects })
  await answer('/auth/me', {
    user: { id: 1, name: 'Admin One', email: 'admin@example.com', locale: 'it', photo_url: null },
    organization: { id: 1, name: 'Acme' },
    roles: ['admin'],
    abilities: abilitiesFor(['admin']),
  })
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
}

async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('secret-password')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL('/')
}

async function openCreateForm(page: Page): Promise<void> {
  await login(page)
  await page.getByRole('link', { name: 'Progetti' }).click()
  await expect(page).toHaveURL('/projects')
  await page.getByRole('button', { name: 'Nuovo progetto' }).click()
}

test.describe('Project template picker: platform templates (B1)', () => {
  test('groups own templates before platform ones and preselects the own active one', async ({
    page,
  }) => {
    await mockApi(page, [GLOBAL_ACTIVE, OWN_ACTIVE, OWN_INACTIVE])
    await openCreateForm(page)

    const picker = page.getByLabel('Template avatar')
    await expect(picker.locator('optgroup')).toHaveCount(2)
    await expect(picker.locator('optgroup').nth(0)).toHaveAttribute(
      'label',
      'La tua organizzazione'
    )
    await expect(picker.locator('optgroup').nth(1)).toHaveAttribute('label', 'Piattaforma')

    // Own ACTIVE wins over the active global, and no badge for an own template.
    await expect(picker).toHaveValue('2')
    await expect(page.getByTestId('project-form-avatar-template-platform')).toHaveCount(0)
  })

  test('shows the Platform badge and only name and provider for a platform template', async ({
    page,
  }) => {
    await mockApi(page, [GLOBAL_ACTIVE, OWN_ACTIVE])
    await openCreateForm(page)

    const picker = page.getByLabel('Template avatar')
    await picker.selectOption('1')

    await expect(page.getByTestId('project-form-avatar-template-platform')).toHaveText(
      'Piattaforma'
    )
    await expect(picker.locator('option[value="1"]')).toHaveText('Platform voice (Tavus)')
  })

  test('does not preselect an inactive own template', async ({ page }) => {
    await mockApi(page, [OWN_INACTIVE])
    await openCreateForm(page)

    await expect(page.getByLabel('Template avatar')).toHaveValue('')
  })

  test('does not offer a retired platform template as a new choice', async ({ page }) => {
    await mockApi(page, [OWN_ACTIVE, GLOBAL_RETIRED])
    await openCreateForm(page)

    await expect(page.getByLabel('Template avatar').locator('option[value="9"]')).toHaveCount(0)
  })

  test('keeps showing the retired platform template a project is pinned to', async ({ page }) => {
    await mockApi(page, [OWN_ACTIVE, GLOBAL_RETIRED], [PINNED_PROJECT])
    await login(page)
    await page.goto('/projects')
    await page
      .getByRole('row', { name: /Pinned Project/ })
      .getByRole('button', { name: 'Modifica' })
      .click()

    const picker = page.getByLabel('Template avatar')
    await expect(picker).toHaveValue('9')
    await expect(picker.locator('option[value="9"]')).toHaveText(
      'Old platform voice (HeyGen) (ritirato)'
    )
  })
})
