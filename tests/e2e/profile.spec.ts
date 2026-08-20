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
  user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', locale: 'en', photo_url: null },
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
    photo_url: null as string | null,
  },
}

// A real, decodable 1x1 PNG — the browser must actually load it for the
// "image appears" assertion below to mean anything (user-avatar-image,
// design D6/task 9.1).
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

async function jsonRoute(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

function isDataRequest(route: Route): boolean {
  return route.request().resourceType() !== 'document'
}

async function mockAdminApi(page: Page, options: { photoUrl?: string | null } = {}): Promise<void> {
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
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            ...ME,
            user: { ...ME.user, photo_url: options.photoUrl ?? ME.user.photo_url },
          })
        : route.continue()
  )
}

async function login(page: Page): Promise<void> {
  // The access token is memory-only (backoffice-session-refresh-hardening D2)
  // — 00.auth-bootstrap.client.ts (D9) fires POST /auth/refresh on EVERY full
  // page load, including any later page.goto() in this test to a DIFFERENT
  // route (a real browser navigation, not a client-side SPA transition). Without
  // this mock the boot refresh fails against the unmocked real apiBase, the
  // session never rehydrates, and the auth guard bounces back to /login.
  await page.route(
    (url) => url.pathname === '/auth/refresh',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'e2e-access-token', token_type: 'bearer' }),
      })
  )
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

  // user-avatar-image (design D6, task 9.1). This case doubles as the
  // detector for the ofetch/FormData assumption in useProfile.ts's
  // uploadPhoto: if apiFetch ever stopped forwarding a FormData body
  // untouched, the mocked POST below would never see a real file and this
  // test would fail loudly rather than the assumption silently rotting.
  const PHOTO_URL = 'https://example.test/photos/current.png'

  test('setting a photo uploads it and the avatar shows it', async ({ page }) => {
    await mockAdminApi(page)
    // Stateful across GET /profile and POST /profile/photo: profile.vue's
    // onSaved reloads via GET /profile after the upload resolves (design
    // D6), so the mock must reflect the upload — a GET that always returns
    // the pre-upload snapshot would make this assertion pass or fail for
    // the wrong reason.
    let currentPhotoUrl: string | null = null
    await page.route(
      (url) => url.pathname === '/profile',
      (route) =>
        isDataRequest(route)
          ? jsonRoute(route, { data: profileData({ photo_url: currentPhotoUrl }) })
          : route.continue()
    )
    await page.route(
      (url) => url.pathname === '/profile/photo',
      (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        currentPhotoUrl = PHOTO_URL
        return jsonRoute(route, { data: profileData({ photo_url: currentPhotoUrl }) })
      }
    )
    await page.route(
      (url) => url.href === PHOTO_URL,
      (route) => route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PIXEL_PNG })
    )
    await login(page)
    await page.goto('/profile')
    await dismissConsent(page)

    await expect(page.getByTestId('profile-photo-avatar-fallback')).toBeVisible()

    await page
      .getByLabel('Carica una foto profilo')
      .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG })

    await expect(page.getByTestId('profile-photo-avatar-image')).toBeVisible()
  })

  // Post-apply verification finding (CRITICAL 2): user-self-service spec.md
  // "A broken or expired photo URL falls back to initials" and admin-
  // backoffice spec.md "A failed photo load falls back to initials in the
  // shell" both require a FAILED load to fall back — SidebarNav.spec.ts
  // (jsdom) cannot distinguish "never finishes loading" from "failed to
  // load", and until now no Playwright case injected a real failure either
  // (both prior cases mocked the photo with status: 200). These two cases
  // close that gap in a real browser, on both surfaces the photo_url reaches
  // (the shell's SidebarFooter, via /auth/me, and /profile's own header +
  // ProfilePhotoForm avatar).
  test('a 404 photo URL falls back to initials, in the shell and on the page', async ({ page }) => {
    await mockAdminApi(page, { photoUrl: PHOTO_URL })
    await page.route(
      (url) => url.pathname === '/profile',
      (route) =>
        isDataRequest(route)
          ? jsonRoute(route, { data: profileData({ photo_url: PHOTO_URL }) })
          : route.continue()
    )
    await page.route(
      (url) => url.href === PHOTO_URL,
      (route) => route.fulfill({ status: 404 })
    )
    await login(page)
    await page.goto('/profile')
    await dismissConsent(page)

    // NOT toHaveCount(0): reka-ui's AvatarImage stays mounted in the DOM
    // whenever photoUrl is truthy (v-if is bound to the URL's presence, not
    // its load status) — the load-failure signal toggles VISIBILITY only,
    // via an internal v-show keyed on imageLoadingStatus. Asserting count(0)
    // here was this test's own first-draft bug, caught by its own RED: the
    // element legitimately exists, hidden, and toHaveCount(0) never
    // distinguishes "hidden" from "absent".
    await expect(page.getByTestId('sidebar-footer-avatar-fallback')).toBeVisible()
    await expect(page.getByTestId('sidebar-footer-avatar-image')).not.toBeVisible()
    await expect(page.getByTestId('profile-photo-avatar-fallback')).toBeVisible()
    await expect(page.getByTestId('profile-photo-avatar-image')).not.toBeVisible()
  })

  test('an aborted photo request falls back to initials, in the shell and on the page', async ({
    page,
  }) => {
    await mockAdminApi(page, { photoUrl: PHOTO_URL })
    await page.route(
      (url) => url.pathname === '/profile',
      (route) =>
        isDataRequest(route)
          ? jsonRoute(route, { data: profileData({ photo_url: PHOTO_URL }) })
          : route.continue()
    )
    await page.route(
      (url) => url.href === PHOTO_URL,
      (route) => route.abort('connectionrefused')
    )
    await login(page)
    await page.goto('/profile')
    await dismissConsent(page)

    // NOT toHaveCount(0): reka-ui's AvatarImage stays mounted in the DOM
    // whenever photoUrl is truthy (v-if is bound to the URL's presence, not
    // its load status) — the load-failure signal toggles VISIBILITY only,
    // via an internal v-show keyed on imageLoadingStatus. Asserting count(0)
    // here was this test's own first-draft bug, caught by its own RED: the
    // element legitimately exists, hidden, and toHaveCount(0) never
    // distinguishes "hidden" from "absent".
    await expect(page.getByTestId('sidebar-footer-avatar-fallback')).toBeVisible()
    await expect(page.getByTestId('sidebar-footer-avatar-image')).not.toBeVisible()
    await expect(page.getByTestId('profile-photo-avatar-fallback')).toBeVisible()
    await expect(page.getByTestId('profile-photo-avatar-image')).not.toBeVisible()
  })

  test('removing a photo goes through ConfirmDialog, then initials return', async ({ page }) => {
    await mockAdminApi(page)
    let currentPhotoUrl: string | null = PHOTO_URL
    let deleteCalled = false
    await page.route(
      (url) => url.pathname === '/profile',
      (route) =>
        isDataRequest(route)
          ? jsonRoute(route, { data: profileData({ photo_url: currentPhotoUrl }) })
          : route.continue()
    )
    await page.route(
      (url) => url.href === PHOTO_URL,
      (route) => route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PIXEL_PNG })
    )
    await page.route(
      (url) => url.pathname === '/profile/photo',
      (route) => {
        if (route.request().method() !== 'DELETE') return route.continue()
        deleteCalled = true
        currentPhotoUrl = null
        return jsonRoute(route, { data: profileData({ photo_url: null }) })
      }
    )
    await login(page)
    await page.goto('/profile')
    await dismissConsent(page)

    await expect(page.getByTestId('profile-photo-avatar-image')).toBeVisible()

    await page.getByRole('button', { name: 'Rimuovi foto' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    expect(deleteCalled).toBe(false)

    await page.getByTestId('confirm-dialog-confirm').click()

    await expect(page.getByTestId('profile-photo-avatar-fallback')).toBeVisible()
    expect(deleteCalled).toBe(true)
  })
})
