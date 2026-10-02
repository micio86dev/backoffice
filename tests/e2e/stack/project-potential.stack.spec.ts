import { expect, test, type Page } from '@playwright/test'
import { resolveStackUrl } from '../support/stack-url'

/**
 * Competencies of a `potential` project against the REAL stack (opt-in tier,
 * BEAI_E2E_STACK=1).
 *
 * Regression for an owner report: creating a "Potenziale" project, MTG and LAT
 * could not be selected, because the api answered `bars_available: false` for
 * them and `CompetencyPicker` disables an option with an explicit `false`.
 * Every mocked suite hands the picker whatever the test author typed, so none
 * of them can see what the real catalogue endpoint answers.
 *
 * Read-only: it opens the create drawer and never submits it, so no project is
 * created and no data is written.
 */

const ADMIN_EMAIL = process.env['BEAI_E2E_ADMIN_EMAIL']
const ADMIN_PASSWORD = process.env['BEAI_E2E_ADMIN_PASSWORD']

const NO_BARS_REASON = /Nessuna ancora comportamentale/
const POTENTIAL_PATH = '/api/framework/potential-competencies'

let serverErrors: string[] = []

test.beforeEach(() => {
  serverErrors = []
})

test.afterEach(() => {
  // Surfaced on ANY outcome, softly, so a failed earlier expect cannot hide it.
  // Method, path and status only.
  if (serverErrors.length > 0) {
    test.info().annotations.push({ type: '5xx', description: serverErrors.join(', ') })
  }

  expect.soft(serverErrors, `5xx answers from /api/: ${serverErrors.join(', ')}`).toEqual([])
})

async function signIn(page: Page): Promise<void> {
  // Refuse a non-local origin before the password is typed anywhere.
  resolveStackUrl()

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      'Set BEAI_E2E_ADMIN_EMAIL and BEAI_E2E_ADMIN_PASSWORD to the admin of a DEDICATED e2e ' +
        'organization in your LOCAL dev data (see docs/dev-setup.md). No default credentials are committed.'
    )
  }

  await page.goto('/login')
  await page.getByTestId('login-email').fill(ADMIN_EMAIL)
  await page.getByTestId('login-password').fill(ADMIN_PASSWORD)

  const login = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth/login' &&
      response.request().method() === 'POST'
  )

  await page.getByTestId('login-submit').click()

  const response = await login

  if (response.status() !== 200) {
    throw new Error(
      `Sign-in answered HTTP ${response.status()}: check BEAI_E2E_ADMIN_EMAIL / ` +
        'BEAI_E2E_ADMIN_PASSWORD against the local dev database.'
    )
  }

  await expect(page).not.toHaveURL(/\/login/)
}

test('the competencies of a potential project (MTG, LAT) are selectable on the real stack', async ({
  page,
}) => {
  page.on('response', (response) => {
    const { pathname } = new URL(response.url())

    if (pathname.startsWith('/api/') && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.request().method()} ${pathname}`)
    }
  })

  await signIn(page)
  await page.goto('/projects')

  await page.getByTestId('projects-new').click()

  const form = page.getByTestId('project-form')

  await expect(form).toBeVisible()

  // Registered BEFORE the click that triggers the request.
  const catalogue = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === POTENTIAL_PATH && response.request().method() === 'GET'
  )

  await page
    .getByTestId('project-form-assessment-type')
    .getByRole('radio', { name: 'Potenziale' })
    .or(
      page.getByTestId('project-form-assessment-type').getByRole('button', { name: 'Potenziale' })
    )
    .click()

  const response = await catalogue

  expect(response.status(), `GET ${POTENTIAL_PATH}`).toBe(200)

  // The other bug this flow guards: a client with no framework versions.
  await expect(
    form.getByTestId('project-form-framework-version').locator('option')
  ).not.toHaveCount(0)

  for (const code of ['MTG', 'LAT']) {
    const box = form.locator(`#competency-${code}`)

    await expect(box, `${code} checkbox`).toBeVisible()
    await expect(box, `${code} must be enabled (bars_available)`).toBeEnabled()
    await expect(form.locator(`#competency-${code}-reason`)).toHaveCount(0)

    await box.click()
    await expect(box, `${code} checked after click`).toBeChecked()

    await box.click()
    await expect(box, `${code} unchecked after second click`).not.toBeChecked()
  }

  await expect(form.getByText(NO_BARS_REASON)).toHaveCount(0)
})
