import { test, expect, type Route, type Page } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'
import { abilitiesFor } from './fixtures/abilities'

/**
 * settings-appearance-logo.spec.ts (image-upload-crop-field).
 *
 * The logo upload in Settings → Aspetto, end to end in a real browser. Three
 * things this covers that no unit test can:
 *
 *   1. A real image DECODES, so `naturalWidth` is a real number and the crop
 *      geometry runs on actual pixels — happy-dom never loads an image, so the
 *      unit specs have to hand those dimensions in.
 *   2. `canvas.toBlob` really encodes, producing the `File` that is posted.
 *      Both are stubbed in the unit suite by necessity.
 *   3. The dialog is axe-clean while OPEN — the state the section spends most
 *      of its interaction time in, and the one a page-level scan never sees.
 */

const ORGANIZATION = {
  id: 1,
  name: 'Acme',
  slug: 'acme',
  primary_color: null as string | null,
  logo_url: null as string | null,
  default_webhook_url: null,
  default_webhook_events: null,
  has_default_webhook_secret: false,
  created_at: null,
  updated_at: null,
}

const LOGO_URL = 'https://cdn.example.test/logo.png'

// A real, decodable 1x1 PNG. The browser must genuinely load it or the crop
// dialog's confirm button never enables and this spec proves nothing.
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

async function mockAdminApi(page: Page, organization = ORGANIZATION): Promise<void> {
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
              is_superadmin: false,
            },
            organization: { id: 1, name: 'Acme' },
            roles: ['admin'],
            abilities: abilitiesFor(['admin']),
          })
        : route.continue()
  )
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
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: organization }) : route.continue())
  )
  await page.route(
    (url) => url.href === LOGO_URL,
    (route) => route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PIXEL_PNG })
  )
}

async function login(page: Page): Promise<void> {
  // The access token is memory-only, and the boot plugin refreshes on every
  // full navigation — unmocked, the session never rehydrates and the guard
  // bounces to /login.
  await page.route(
    (url) => url.pathname === '/auth/refresh',
    (route) => jsonRoute(route, { access_token: 'e2e-access-token', token_type: 'bearer' })
  )
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('secret-password')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL('/')
}

async function openAppearance(page: Page): Promise<void> {
  await page.goto('/settings')
  // The consent banner overlays the bottom of the page and intercepts pointer
  // events on the submit button — dismiss it, exactly as the other specs do.
  await page.getByTestId('analytics-consent-reject').click()
  await expect(page.getByTestId('analytics-consent')).toBeHidden()
  await page.getByRole('tab', { name: 'Aspetto' }).click()
  await expect(page.getByTestId('branding-form')).toBeVisible()
}

async function chooseLogo(page: Page): Promise<void> {
  await page
    .getByTestId('branding-logo-input')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG })
}

test.describe('Settings → Aspetto: the logo upload', () => {
  test('choosing a file opens the crop dialog and uploads NOTHING yet', async ({ page }) => {
    let uploadCalled = false
    await mockAdminApi(page)
    await page.route(
      (url) => url.pathname === '/organization/logo',
      (route) => {
        uploadCalled = true
        return jsonRoute(route, { data: { ...ORGANIZATION, logo_url: LOGO_URL } })
      }
    )
    await login(page)
    await openAppearance(page)

    await chooseLogo(page)

    await expect(page.getByTestId('image-crop-dialog')).toBeVisible()
    expect(uploadCalled).toBe(false)
  })

  test('the crop dialog is accessible while open', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)
    await openAppearance(page)
    await chooseLogo(page)
    await expect(page.getByTestId('image-crop-dialog')).toBeVisible()

    await checkA11y(page)
  })

  test('cancelling leaves the stored logo untouched', async ({ page }) => {
    let uploadCalled = false
    await mockAdminApi(page, { ...ORGANIZATION, logo_url: LOGO_URL })
    await page.route(
      (url) => url.pathname === '/organization/logo',
      (route) => {
        uploadCalled = true
        return jsonRoute(route, { data: { ...ORGANIZATION, logo_url: LOGO_URL } })
      }
    )
    await login(page)
    await openAppearance(page)

    await chooseLogo(page)
    await page.getByTestId('image-crop-cancel').click()

    await expect(page.getByTestId('image-crop-dialog')).toBeHidden()
    await expect(page.getByTestId('branding-logo-preview')).toHaveAttribute('src', LOGO_URL)
    expect(uploadCalled).toBe(false)
  })

  test('a confirmed crop previews immediately and posts on submit', async ({ page }) => {
    const uploads: string[] = []
    await mockAdminApi(page)
    await page.route(
      (url) => url.pathname === '/organization',
      (route) =>
        isDataRequest(route) ? jsonRoute(route, { data: ORGANIZATION }) : route.continue()
    )
    await page.route(
      (url) => url.pathname === '/organization/logo',
      (route) => {
        uploads.push(route.request().method())
        return jsonRoute(route, { data: { ...ORGANIZATION, logo_url: LOGO_URL } })
      }
    )
    await login(page)
    await openAppearance(page)

    await chooseLogo(page)
    await page.getByTestId('image-crop-confirm').click()

    // The preview is a local object URL: visible BEFORE any request, which is
    // the defect this change exists to fix — choosing a file used to change
    // nothing on screen at all.
    const preview = page.getByTestId('branding-logo-preview')
    await expect(preview).toBeVisible()
    await expect(preview).toHaveAttribute('src', /^blob:/)
    expect(uploads).toEqual([])

    await page.getByTestId('branding-submit').click()

    await expect.poll(() => uploads).toEqual(['POST'])
  })

  test('the frame pans from the keyboard', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)
    await openAppearance(page)
    await chooseLogo(page)

    const frame = page.getByTestId('image-crop-frame')
    await frame.focus()
    // Zoom in first: a 1x1 source at minimum contain zoom has no play to pan
    // into, so pressing an arrow correctly changes nothing.
    await frame.press('+')
    await frame.press('+')
    await frame.press('ArrowLeft')

    await expect.poll(async () => Number(await frame.getAttribute('data-offset-x'))).toBeLessThan(0)
  })
})
