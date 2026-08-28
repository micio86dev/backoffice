import { test, expect, type Page, type Route } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'

/**
 * Self-service password reset, end to end (api v0.36.0's `/auth/forgot-password`
 * and `/auth/reset-password`).
 *
 * Everything here happens WITHOUT a session — that is the point of the flow,
 * and the property most easily broken by a future change to the global auth
 * guard. Each spec navigates cold and asserts it did not land on /login.
 *
 * The reset URL is not invented by this suite: `SendPasswordResetLinkJob.php:135`
 * mints `{origin}/reset-password/{token}?email={urlencoded email}`, and
 * `RESET_URL` below is that shape verbatim.
 */

const TOKEN = 'e2e-single-use-reset-token'
const EMAIL = 'ada@example.com'
const RESET_URL = `/reset-password/${TOKEN}?email=${encodeURIComponent(EMAIL)}`

async function jsonRoute(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

/**
 * The 202 body verbatim from `ForgotPasswordController.php` — identical for a
 * real address, an unknown one and a deactivated account, because the
 * controller has no branch. The UI must not be able to tell them apart either.
 */
async function mockForgotPassword(page: Page, status = 202): Promise<void> {
  await page.route(
    (url) => url.pathname.endsWith('/auth/forgot-password'),
    (route) =>
      jsonRoute(
        route,
        status === 202
          ? {
              message:
                'If an account exists for that address, a password reset link has been sent.',
            }
          : { message: 'Too Many Attempts.' },
        status
      )
  )
}

async function mockResetPassword(page: Page, status = 200, body?: unknown): Promise<void> {
  await page.route(
    (url) => url.pathname.endsWith('/auth/reset-password'),
    (route) =>
      jsonRoute(
        route,
        body ?? {
          message:
            'Your password has been reset. Every device you were signed in on must sign in again.',
        },
        status
      )
  )
}

test.describe('forgot password', () => {
  test('is reachable from the sign-in page, which previously offered no way out', async ({
    page,
  }) => {
    await page.goto('/login')
    await expect(page.getByTestId('login-form')).toBeVisible()

    await page.getByTestId('login-forgot-password').click()

    await expect(page).toHaveURL('/forgot-password')
    await expect(page.getByTestId('forgot-password-form')).toBeVisible()
  })

  test('is reachable directly while logged out, and is not bounced to /login', async ({ page }) => {
    await page.goto('/forgot-password')

    await expect(page.getByTestId('forgot-password-form')).toBeVisible()
    await expect(page).toHaveURL('/forgot-password')
    await checkA11y(page)
  })

  /**
   * The non-enumeration property, observed from the outside: two addresses
   * whose real-world outcomes differ produce the same rendered string.
   */
  test('acknowledges any address with one identical, non-committal message', async ({ page }) => {
    await mockForgotPassword(page)

    const outcomes: string[] = []
    for (const address of ['ada@example.com', 'nobody-at-all@example.com']) {
      await page.goto('/forgot-password')
      await page.getByTestId('forgot-password-email').fill(address)
      await page.getByTestId('forgot-password-submit').click()

      const banner = page.getByTestId('forgot-password-banner')
      await expect(banner).toBeVisible()
      outcomes.push(((await banner.textContent()) ?? '').trim())
    }

    expect(outcomes[0]).toBe(outcomes[1])
    // Nothing that claims an inbox was reached, and no echo of the address.
    expect(outcomes[0]).not.toContain('ada@example.com')
    expect(outcomes[0]?.toLowerCase()).toContain('se esiste un account')
  })

  // throttle:6,1 — a user who mistypes twice and retries will meet this.
  test('explains a 429 instead of failing generically', async ({ page }) => {
    await mockForgotPassword(page, 429)

    await page.goto('/forgot-password')
    await page.getByTestId('forgot-password-email').fill('ada@example.com')
    await page.getByTestId('forgot-password-submit').click()

    await expect(page.getByTestId('forgot-password-banner')).toContainText('Troppe richieste')
  })

  test('surfaces a server 422 on the field it names', async ({ page }) => {
    await page.route(
      (url) => url.pathname.endsWith('/auth/forgot-password'),
      (route) =>
        jsonRoute(
          route,
          {
            message: 'The given data was invalid.',
            errors: { email: ['The email field must be a valid email address.'] },
          },
          422
        )
    )

    await page.goto('/forgot-password')
    await page.getByTestId('forgot-password-email').fill('ada@example.com')
    await page.getByTestId('forgot-password-submit').click()

    await expect(page.getByTestId('forgot-password-email-error')).toContainText(
      'must be a valid email address'
    )
  })
})

test.describe('reset password', () => {
  test('opens the emailed link shape, prefilled, without a session', async ({ page }) => {
    await page.goto(RESET_URL)

    await expect(page.getByTestId('reset-password-form')).toBeVisible()
    await expect(page.getByTestId('reset-password-email')).toHaveValue(EMAIL)
    // Not bounced to /login by the global auth guard.
    expect(new URL(page.url()).pathname).toBe(`/reset-password/${TOKEN}`)
    await checkA11y(page)
  })

  test('sends the token from the path and the email from the query', async ({ page }) => {
    let sent: unknown = null
    await page.route(
      (url) => url.pathname.endsWith('/auth/reset-password'),
      async (route) => {
        sent = route.request().postDataJSON()
        await jsonRoute(route, { message: 'ok' })
      }
    )

    await page.goto(RESET_URL)
    await page.getByTestId('reset-password-password').fill('a-brand-new-password')
    await page.getByTestId('reset-password-confirmation').fill('a-brand-new-password')
    await page.getByTestId('reset-password-submit').click()

    await expect(page.getByTestId('reset-password-success')).toBeVisible()
    expect(sent).toEqual({
      token: TOKEN,
      email: EMAIL,
      password: 'a-brand-new-password',
      password_confirmation: 'a-brand-new-password',
    })
  })

  test('clears the spent token out of the address bar on success', async ({ page }) => {
    await mockResetPassword(page)

    await page.goto(RESET_URL)
    await page.getByTestId('reset-password-password').fill('a-brand-new-password')
    await page.getByTestId('reset-password-confirmation').fill('a-brand-new-password')
    await page.getByTestId('reset-password-submit').click()

    await expect(page.getByTestId('reset-password-success')).toBeVisible()
    expect(page.url()).not.toContain(TOKEN)
    // …and the success state survives the rewrite, rather than collapsing into
    // the invalid-link branch the token-less URL would otherwise select.
    await expect(page.getByTestId('reset-password-signin')).toBeVisible()
  })

  test('explains a truncated link instead of 404ing or showing a form that cannot succeed', async ({
    page,
  }) => {
    await page.goto('/reset-password')

    await expect(page.getByTestId('reset-password-invalid-link')).toBeVisible()
    await expect(page.getByTestId('reset-password-form')).toHaveCount(0)
    await expect(page.getByTestId('reset-password-request-new')).toBeVisible()
    await checkA11y(page)
  })

  /**
   * `ResetPasswordController::fail()` answers unknown user, deactivated user,
   * invalid token and expired token with ONE 422 keyed on `token` — a field
   * this page renders no control for, so the message can only arrive through
   * the form-level banner.
   */
  test('surfaces the generic expired-link 422 at form level, with a way to get a new link', async ({
    page,
  }) => {
    await mockResetPassword(page, 422, {
      message: 'The given data was invalid.',
      errors: { token: ['This password reset link is invalid or has expired. Request a new one.'] },
    })

    await page.goto(RESET_URL)
    await page.getByTestId('reset-password-password').fill('a-brand-new-password')
    await page.getByTestId('reset-password-confirmation').fill('a-brand-new-password')
    await page.getByTestId('reset-password-submit').click()

    await expect(page.getByTestId('reset-password-banner')).toContainText('invalid or has expired')
    await page.getByTestId('reset-password-request-new').click()
    await expect(page.getByTestId('forgot-password-form')).toBeVisible()
  })

  test('explains a 429 instead of failing generically', async ({ page }) => {
    await mockResetPassword(page, 429, { message: 'Too Many Attempts.' })

    await page.goto(RESET_URL)
    await page.getByTestId('reset-password-password').fill('a-brand-new-password')
    await page.getByTestId('reset-password-confirmation').fill('a-brand-new-password')
    await page.getByTestId('reset-password-submit').click()

    await expect(page.getByTestId('reset-password-banner')).toContainText('Troppi tentativi')
  })

  test('refuses a mismatched confirmation locally, never spending the single-use token', async ({
    page,
  }) => {
    let called = false
    await page.route(
      (url) => url.pathname.endsWith('/auth/reset-password'),
      async (route) => {
        called = true
        await jsonRoute(route, { message: 'ok' })
      }
    )

    await page.goto(RESET_URL)
    await page.getByTestId('reset-password-password').fill('a-brand-new-password')
    await page.getByTestId('reset-password-confirmation').fill('a-different-password')
    await page.getByTestId('reset-password-submit').click()

    await expect(page.getByTestId('reset-password-confirmation-error')).toBeVisible()
    expect(called).toBe(false)
  })
})
