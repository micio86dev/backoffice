import { test, expect, type Page, type Route } from '@playwright/test'
import { abilitiesFor } from './fixtures/abilities'

/**
 * Reusable interview link, create flow, end to end (reusable-interview-links,
 * design AD-17, DESIGN.md 16.18).
 *
 * An operator ticks the reusable checkbox in the Invite drawer, optionally names
 * the link, creates it, and gets a link that never expires and can be used many
 * times. The panel states that BEFORE the Copy control, and the full URL is
 * shown exactly once.
 *
 * Same convention as `entry-link.spec.ts`: no live backend, API calls are
 * intercepted at the network layer with fixtures shaped like the real resources,
 * and locators are role/label based. The UI runs in Italian (`locale: 'it-IT'`
 * in playwright.config.ts), so every accessible name below is the Italian copy.
 * Runs on both the chromium and webkit projects.
 *
 * The links list, the Disable action and the participant origin line belong to
 * the next slice and extend this file.
 */

const ACTIVE_PROJECT = {
  id: 2,
  organization_id: 1,
  framework_version_id: 3,
  slug: 'active-project',
  name: 'Active Project',
  assessment_type: 'standard',
  role_code: 'FLL',
  language: 'en',
  status: 'active',
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
  // A project with no competencies cannot run an interview, and the table
  // withholds the invite action for it, so this one carries a competency.
  competencies: [{ id: 11, code: 'COM', position: 0 }],
}

const DRAFT_PROJECT = {
  ...ACTIVE_PROJECT,
  id: 3,
  slug: 'draft-project',
  name: 'Draft Project',
  status: 'draft',
}

/** 43 base64url characters after the marker, as the api generates them. */
const ENTRY_URL =
  'https://interview.example.com/it/interview/reusable#beai_rl_9AuXUvnfk8dgg-mOHfBcWFbQ98k_MXZ5SChgVAqzCpY'

/** The create response, as `ReusableInterviewLinkController::store` returns it. */
function createdResponse(label: string | null) {
  return {
    data: {
      id: 'rlk_01HZ0000000000000000000000',
      label,
      token_prefix: 'beai_rl_9AuXUvnf',
      lang: 'en',
      status: 'active',
      uses_count: 0,
      last_used_at: null,
      created_by: { name: 'Operator One' },
      created_at: '2026-10-01T10:00:00.000000Z',
      disabled_at: null,
    },
    entry_url: ENTRY_URL,
  }
}

async function jsonRoute(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

function isDataRequest(route: Route): boolean {
  return route.request().resourceType() !== 'document'
}

interface Captured {
  /** JSON bodies of every `POST /projects/2/reusable-links`, in order. */
  reusableBodies: unknown[]
  /** How many times `POST /entry-links` was called: the reusable flow must never call it. */
  entryLinkCalls: number
}

interface Options {
  role?: 'operator' | 'viewer'
  /** What `POST /projects/2/reusable-links` answers; defaults to a 201. */
  createAnswer?: (body: Record<string, unknown>) => { status: number; body: unknown }
}

async function mockAdminApi(page: Page, options: Options = {}): Promise<Captured> {
  const role = options.role ?? 'operator'
  const captured: Captured = { reusableBodies: [], entryLinkCalls: 0 }

  await page.route(
    (url) => url.pathname === '/auth/login',
    (route) =>
      jsonRoute(route, {
        access_token: 'e2e-access-token',
        refresh_token: 'e2e-refresh',
        token_type: 'bearer',
      })
  )

  // The ability map, not `/profile`: the UI gates its controls on `can()` and
  // fails CLOSED without it, so an unmocked `/auth/me` means no Invite action at
  // all (see `entry-link.spec.ts`).
  await page.route(
    (url) => url.pathname === '/auth/me',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            user: {
              id: 1,
              name: 'Operator One',
              email: 'operator@example.com',
              locale: 'it',
              photo_url: null,
            },
            organization: { id: 1, name: 'Acme' },
            roles: [role],
            abilities: abilitiesFor([role]),
          })
        : route.continue()
  )

  await page.route(
    (url) => url.pathname === '/profile',
    (route) =>
      jsonRoute(route, {
        data: {
          id: 1,
          name: 'Operator One',
          email: 'operator@example.com',
          locale: 'en',
          role,
          organization: { id: 1, name: 'Acme' },
          photo_url: null,
        },
      })
  )

  await page.route(
    (url) => url.pathname === '/projects',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, { data: [ACTIVE_PROJECT, DRAFT_PROJECT] })
        : route.continue()
  )

  await page.route(
    (url) => /^\/framework\/roles\/[A-Z]+\/competencies$/.test(url.pathname),
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: [] }) : route.continue())
  )

  await page.route(
    (url) => url.pathname === '/entry-links',
    (route) => {
      captured.entryLinkCalls += 1

      return jsonRoute(route, { entry_url: 'https://interview.example.com/interview/x' }, 201)
    }
  )

  await page.route(
    (url) => url.pathname === '/projects/2/reusable-links',
    (route) => {
      if (route.request().method() !== 'POST') return route.continue()

      const body = route.request().postDataJSON() as Record<string, unknown>
      captured.reusableBodies.push(body)

      const answer = options.createAnswer?.(body)

      return answer
        ? jsonRoute(route, answer.body, answer.status)
        : jsonRoute(
            route,
            createdResponse(typeof body['label'] === 'string' ? body['label'] : null),
            201
          )
    }
  )

  return captured
}

async function login(page: Page): Promise<void> {
  // The access token is memory-only: every full page load fires
  // `POST /auth/refresh`, so it needs a mock or the session never rehydrates.
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
  await page.getByLabel('Email').fill('operator@example.com')
  await page.getByLabel('Password').fill('secret-password')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL('/')
}

/**
 * Records what the app writes to the clipboard.
 *
 * Reading the real clipboard back needs `clipboard-read`, a permission only
 * Chromium grants; WebKit refuses the name. Capturing the `writeText` argument
 * instead observes the same fact — what Copy puts there — on both engines.
 */
async function recordClipboardWrites(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const writes: string[] = []

    ;(window as unknown as { __clipboardWrites: string[] }).__clipboardWrites = writes
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (text: string) => {
          writes.push(text)

          return Promise.resolve()
        },
      },
      configurable: true,
    })
  })
}

async function openInviteDrawer(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Progetti' }).click()
  await expect(page).toHaveURL('/projects')

  await page
    .getByRole('row', { name: /Active Project/ })
    .getByRole('button', { name: 'Invita candidato' })
    .click()
}

const CHECKBOX_NAME = /link di colloquio riutilizzabile che non scade mai/
const LINK_NAME_LABEL = 'Nome del link'

test.describe('Reusable interview link: create flow (reusable-interview-links)', () => {
  test('an operator creates a reusable link; the disclosure precedes the URL and Copy', async ({
    page,
  }) => {
    const captured = await mockAdminApi(page)
    await recordClipboardWrites(page)
    await login(page)
    await openInviteDrawer(page)

    const checkbox = page.getByRole('checkbox', { name: CHECKBOX_NAME })

    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toBeChecked()

    await checkbox.check()

    // HIDDEN, not disabled: the candidate fields are gone from the page.
    await expect(page.getByLabel('Riferimento candidato')).toHaveCount(0)
    await expect(page.getByLabel('Nome visualizzato')).toHaveCount(0)
    await expect(page.getByTestId('entry-link-form-email')).toHaveCount(0)

    await page.getByLabel(LINK_NAME_LABEL).fill('Stand fiera di Milano')
    await page.getByRole('button', { name: 'Genera link' }).click()

    // The request: ONLY the label, to the reusable endpoint, never the
    // single-use one.
    expect(captured.reusableBodies).toEqual([{ label: 'Stand fiera di Milano' }])
    expect(captured.entryLinkCalls).toBe(0)

    // The disclosure is visible without any interaction ...
    const disclosure = page.getByTestId('entry-link-disclosure')
    const neverExpires = page.getByTestId('entry-link-never-expires')
    const url = page.getByTestId('entry-link-url')
    const copy = page.getByRole('button', { name: 'Copia' })

    await expect(disclosure).toBeVisible()
    await expect(disclosure).toContainText('non scade')
    await expect(neverExpires).toContainText('Non scade mai · Riutilizzabile')
    await expect(url).toHaveText(ENTRY_URL)
    await expect(copy).toBeVisible()

    // ... and ABOVE the URL and the Copy control.
    const [disclosureBox, neverExpiresBox, urlBox, copyBox] = await Promise.all([
      disclosure.boundingBox(),
      neverExpires.boundingBox(),
      url.boundingBox(),
      copy.boundingBox(),
    ])

    expect(disclosureBox!.y).toBeLessThan(neverExpiresBox!.y)
    expect(neverExpiresBox!.y).toBeLessThan(urlBox!.y)
    expect(urlBox!.y).toBeLessThan(copyBox!.y)

    // The single-use statements and controls are absent.
    await expect(page.getByRole('button', { name: 'Genera nuovo link' })).toHaveCount(0)
    await expect(page.getByTestId('entry-link-expiry')).toHaveCount(0)
    await expect(page.getByText(/monouso/)).toHaveCount(0)

    // Copy puts the COMPLETE URL, fragment included, on the clipboard.
    await copy.click()
    const writes = await page.evaluate(
      () => (window as unknown as { __clipboardWrites: string[] }).__clipboardWrites
    )

    expect(writes).toEqual([ENTRY_URL])
    expect(writes[0]).toContain('#beai_rl_')
  })

  test('an empty Link name creates the link with an empty payload', async ({ page }) => {
    const captured = await mockAdminApi(page)
    await login(page)
    await openInviteDrawer(page)

    await page.getByRole('checkbox', { name: CHECKBOX_NAME }).check()
    await page.getByRole('button', { name: 'Genera link' }).click()

    await expect(page.getByTestId('entry-link-url')).toHaveText(ENTRY_URL)
    expect(captured.reusableBodies).toEqual([{}])
  })

  test('the link is shown once: reopening the drawer shows no URL', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)
    await openInviteDrawer(page)

    await page.getByRole('checkbox', { name: CHECKBOX_NAME }).check()
    await page.getByRole('button', { name: 'Genera link' }).click()
    await expect(page.getByTestId('entry-link-url')).toHaveText(ENTRY_URL)

    await page.getByRole('button', { name: 'Chiudi' }).click()
    await expect(page.getByTestId('entry-link-url')).toHaveCount(0)

    await page
      .getByRole('row', { name: /Active Project/ })
      .getByRole('button', { name: 'Invita candidato' })
      .click()

    // A fresh form, with the checkbox unticked again, and the token nowhere.
    await expect(page.getByRole('checkbox', { name: CHECKBOX_NAME })).not.toBeChecked()
    await expect(page.getByTestId('entry-link-url')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('beai_rl_')
  })

  test('a server 422 on the label lands under the Link name field', async ({ page }) => {
    await mockAdminApi(page, {
      createAnswer: () => ({
        status: 422,
        body: {
          message: 'The label may not be greater than 120 characters.',
          errors: { label: ['Il nome del link e troppo lungo.'] },
        },
      }),
    })
    await login(page)
    await openInviteDrawer(page)

    await page.getByRole('checkbox', { name: CHECKBOX_NAME }).check()
    await page.getByLabel(LINK_NAME_LABEL).fill('Stand')
    await page.getByRole('button', { name: 'Genera link' }).click()

    const field = page.getByLabel(LINK_NAME_LABEL)

    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Il nome del link e troppo lungo.')).toBeVisible()
    await expect(page.getByTestId('entry-link-url')).toHaveCount(0)
  })

  test('a Link name over 120 characters is refused before any request', async ({ page }) => {
    const captured = await mockAdminApi(page)
    await login(page)
    await openInviteDrawer(page)

    await page.getByRole('checkbox', { name: CHECKBOX_NAME }).check()
    await page.getByLabel(LINK_NAME_LABEL).fill('x'.repeat(121))
    await page.getByRole('button', { name: 'Genera link' }).click()

    await expect(page.getByLabel(LINK_NAME_LABEL)).toHaveAttribute('aria-invalid', 'true')
    expect(captured.reusableBodies).toEqual([])
  })

  test('a draft project keeps the Invite action disabled, so the checkbox is unreachable', async ({
    page,
  }) => {
    await mockAdminApi(page)
    await login(page)
    await page.getByRole('link', { name: 'Progetti' }).click()
    await expect(page).toHaveURL('/projects')

    const invite = page
      .getByRole('row', { name: /Draft Project/ })
      .getByRole('button', { name: 'Invita candidato' })

    await expect(invite).toBeDisabled()
    await expect(page.getByRole('checkbox', { name: CHECKBOX_NAME })).toHaveCount(0)
  })

  test('a viewer gets no Invite action and therefore no reusable checkbox', async ({ page }) => {
    await mockAdminApi(page, { role: 'viewer' })
    await login(page)
    await page.getByRole('link', { name: 'Progetti' }).click()
    await expect(page).toHaveURL('/projects')
    await expect(page.getByRole('row', { name: /Active Project/ })).toBeVisible()

    await expect(page.getByRole('button', { name: 'Invita candidato' })).toHaveCount(0)
    await expect(page.getByRole('checkbox', { name: CHECKBOX_NAME })).toHaveCount(0)
  })
})
