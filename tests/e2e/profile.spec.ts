import { test, expect, type Route, type Page } from '@playwright/test'

/**
 * profile.spec.ts (user-profile-self-service, design D8, task 8.1).
 *
 * Mocked API, `getByRole` locators (AGENTS.md): view the profile, edit
 * name/email/locale, a wrong current password surfaces a field error, and a
 * successful password change swaps the session token (design D3 — the
 * acting request token is re-minted, not exempted).
 */

const ORGANIZATION = {
  id: 1,
  name: 'Acme',
  slug: 'acme',
  default_webhook_url: null,
  default_webhook_events: null,
  has_default_webhook_secret: false,
  created_at: null,
  updated_at: null,
}

const ME = {
  user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', locale: 'en' },
  organization: { id: 1, name: 'Acme' },
  roles: ['operator'],
}

function profileData(overrides: Partial<(typeof PROFILE)['data']> = {}) {
  return { ...PROFILE.data, ...overrides }
}

const PROFILE = {
  data: {
    id: 1,
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    locale: 'en',
    role: 'operator',
    organization: { id: 1, name: 'Acme' },
  },
}

async function jsonRoute(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

function isDataRequest(route: Route): boolean {
  return route.request().resourceType() !== 'document'
}

async function mockAdminApi(page: Page): Promise<void> {
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
    (url) => url.pathname === '/organization',
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: ORGANIZATION }) : route.continue())
  )
  await page.route(
    (url) => url.pathname === '/auth/me',
    (route) => (isDataRequest(route) ? jsonRoute(route, ME) : route.continue())
  )
}

async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill('ada@example.com')
  await page.getByLabel('Password').fill('secret-password')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL('/')
}

/**
 * The analytics consent banner is fixed to the bottom of the viewport and
 * sits over page content, swallowing clicks on anything underneath it —
 * same fixture dismissal as reports-index.spec.ts. Dismissed through the
 * app's own control, not by seeding its storage key.
 */
async function dismissConsent(page: Page): Promise<void> {
  await page.getByTestId('analytics-consent-reject').click()
  await expect(page.getByTestId('analytics-consent')).toBeHidden()
}

test.describe('Profile page (user-profile-self-service)', () => {
  test('shows the signed-in user, editable account details, and read-only role/organization', async ({
    page,
  }) => {
    await mockAdminApi(page)
    await page.route(
      (url) => url.pathname === '/profile',
      (route) => (isDataRequest(route) ? jsonRoute(route, PROFILE) : route.continue())
    )
    await login(page)
    await page.goto('/profile')
    await dismissConsent(page)

    await expect(page.getByRole('textbox', { name: 'Nome' })).toHaveValue('Ada Lovelace')
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue(
      'ada@example.com'
    )
    await expect(page.getByText('Operatore')).toBeVisible()
    // The topbar ALSO shows the organization name (NavBar.vue), so this
    // targets the profile page's own read-only organization display, not
    // the bare string — same disambiguation as settings-tabs.spec.ts.
    await expect(page.getByTestId('profile-organization')).toHaveText('Acme')
    // No control anywhere can change the role — role stays admin-only.
    await expect(page.getByRole('combobox', { name: 'Ruolo' })).toHaveCount(0)
  })

  test('editing name, email and locale submits PATCH /api/profile only', async ({ page }) => {
    await mockAdminApi(page)
    let lastPatchBody: unknown = null
    await page.route(
      (url) => url.pathname === '/profile',
      (route) => {
        if (!isDataRequest(route)) return route.continue()
        if (route.request().method() === 'PATCH') {
          lastPatchBody = route.request().postDataJSON()
          return jsonRoute(route, { data: profileData({ name: 'Grace Hopper', locale: 'it' }) })
        }
        return jsonRoute(route, PROFILE)
      }
    )
    await login(page)
    await page.goto('/profile')
    await dismissConsent(page)

    await page.getByRole('textbox', { name: 'Nome' }).fill('Grace Hopper')
    await page.getByRole('combobox', { name: 'Lingua' }).click()
    await page.getByRole('option', { name: 'IT' }).click()
    await page.getByRole('button', { name: 'Salva' }).click()

    await expect(page.getByRole('textbox', { name: 'Nome' })).toHaveValue('Grace Hopper')
    expect(lastPatchBody).toMatchObject({
      name: 'Grace Hopper',
      email: 'ada@example.com',
      locale: 'it',
    })
  })

  test('a wrong current password surfaces a field error, not a banner', async ({ page }) => {
    await mockAdminApi(page)
    await page.route(
      (url) => url.pathname === '/profile',
      (route) => (isDataRequest(route) ? jsonRoute(route, PROFILE) : route.continue())
    )
    await page.route(
      (url) => url.pathname === '/profile/password',
      (route) =>
        jsonRoute(
          route,
          {
            message: 'Validation failed',
            errors: { current_password: ['The provided password does not match.'] },
          },
          422
        )
    )
    await login(page)
    await page.goto('/profile')
    await dismissConsent(page)

    await page.getByLabel('Password attuale', { exact: true }).fill('wrong-password')
    await page.getByLabel('Nuova password', { exact: true }).fill('a-new-password-123')
    await page.getByLabel('Conferma nuova password').fill('a-new-password-123')
    await page.getByRole('button', { name: 'Cambia password' }).click()

    await expect(page.getByText('The provided password does not match.')).toBeVisible()
  })

  test('a successful password change swaps the session token', async ({ page }) => {
    await mockAdminApi(page)
    await page.route(
      (url) => url.pathname === '/profile',
      (route) => (isDataRequest(route) ? jsonRoute(route, PROFILE) : route.continue())
    )
    let sawNewToken = false
    await page.route(
      (url) => url.pathname === '/profile/password',
      (route) =>
        jsonRoute(route, { access_token: 'brand-new-token-after-change', token_type: 'bearer' })
    )
    // Any request AFTER the password change carrying the new token proves
    // the swap happened (design D3 — the acting request token is re-minted).
    await page.route(
      (url) => url.pathname === '/auth/me',
      (route) => {
        if (route.request().headers()['authorization'] === 'Bearer brand-new-token-after-change') {
          sawNewToken = true
        }
        return isDataRequest(route) ? jsonRoute(route, ME) : route.continue()
      }
    )
    await login(page)
    await page.goto('/profile')
    await dismissConsent(page)

    await page.getByLabel('Password attuale', { exact: true }).fill('current-pass')
    await page.getByLabel('Nuova password', { exact: true }).fill('a-new-password-123')
    await page.getByLabel('Conferma nuova password').fill('a-new-password-123')
    await page.getByRole('button', { name: 'Cambia password' }).click()

    // Fields reset on success (ProfilePasswordForm clears them after a
    // successful change) — the field-level signal that the submit resolved,
    // without asserting on the ambiguous "Cambia password" text (both the
    // section heading and the submit button carry it).
    await expect(page.getByLabel('Password attuale', { exact: true })).toHaveValue('')
    await page.waitForTimeout(200)
    expect(sawNewToken).toBe(true)
  })
})
