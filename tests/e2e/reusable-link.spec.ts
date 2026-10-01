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
 * Managing the links (B6b) lives in the second describe block: the saved-project
 * drawer's links panel, its list, Disable behind the destructive confirmation
 * (including the idempotent second disable), the empty and load-error states and
 * who is never offered any of it. The participant origin line is not covered
 * here: it needs the api marker the generated client does not carry yet.
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

/** One row of `GET /projects/2/reusable-links`, as the api serialises it. */
interface LinkRow {
  id: string
  label: string | null
  token_prefix: string
  lang: string
  status: 'active' | 'disabled'
  uses_count: number
  last_used_at: string | null
  created_by: { name: string } | null
  created_at: string
  disabled_at: string | null
}

function linkRow(overrides: Partial<LinkRow> = {}): LinkRow {
  return {
    id: 'rlk_01HZ0000000000000000000000',
    label: 'Stand fiera di Milano',
    token_prefix: 'beai_rl_9AuXUvnf',
    lang: 'en',
    status: 'active',
    uses_count: 3,
    last_used_at: '2026-10-02T09:30:00.000000Z',
    created_by: { name: 'Operator One' },
    created_at: '2026-10-01T10:00:00.000000Z',
    disabled_at: null,
    ...overrides,
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
  /** How many times `GET /projects/2/reusable-links` was asked. */
  listCalls: number
  /** The link id of every `DELETE /projects/2/reusable-links/{id}`, in order. */
  disableCalls: string[]
}

interface Options {
  role?: 'operator' | 'viewer'
  /** What `POST /projects/2/reusable-links` answers; defaults to a 201. */
  createAnswer?: (body: Record<string, unknown>) => { status: number; body: unknown }
  /** The links the server holds for project 2 before the test starts. */
  links?: LinkRow[]
  /**
   * Answer the first N list requests with a 500 before answering normally. The
   * http client retries an idempotent GET once on a 5xx, so ONE load failure the
   * operator can see is TWO of these: N = 2 fails the initial load, and the
   * operator's own retry is the third request.
   */
  failListTimes?: number
  /** Answer every DELETE with this status instead of a 204. */
  disableStatus?: number
  /**
   * The first N list requests after a DELETE still report the link as Active, as a
   * view that has not caught up with another tab's write would.
   */
  staleListAfterDisable?: number
}

async function mockAdminApi(page: Page, options: Options = {}): Promise<Captured> {
  const role = options.role ?? 'operator'
  const captured: Captured = {
    reusableBodies: [],
    entryLinkCalls: 0,
    listCalls: 0,
    disableCalls: [],
  }
  // The server's own state: a create appends, a DELETE disables, a list reads.
  const links: LinkRow[] = [...(options.links ?? [])]
  let listFailures = options.failListTimes ?? 0
  let staleReads = 0

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
      if (!isDataRequest(route)) return route.continue()

      if (route.request().method() === 'GET') {
        captured.listCalls += 1

        if (listFailures > 0) {
          listFailures -= 1

          return jsonRoute(route, { message: 'Server Error' }, 500)
        }

        // A view that has not caught up: the link is already disabled on the
        // server, but this read still describes it as Active.
        if (staleReads > 0) {
          staleReads -= 1

          return jsonRoute(route, {
            data: links.map((row) => ({ ...row, status: 'active', disabled_at: null })),
          })
        }

        return jsonRoute(route, { data: links })
      }

      if (route.request().method() !== 'POST') return route.continue()

      const body = route.request().postDataJSON() as Record<string, unknown>
      captured.reusableBodies.push(body)

      const answer = options.createAnswer?.(body)

      if (answer) return jsonRoute(route, answer.body, answer.status)

      const created = createdResponse(typeof body['label'] === 'string' ? body['label'] : null)

      // The server remembers it: it is the first row of the project's list from now on.
      links.unshift(linkRow({ ...created.data, uses_count: 0, last_used_at: null }))

      return jsonRoute(route, created, 201)
    }
  )

  await page.route(
    (url) => /^\/projects\/2\/reusable-links\/[^/]+$/.test(url.pathname),
    (route) => {
      if (route.request().method() !== 'DELETE') return route.continue()

      const id = route.request().url().split('/').pop() ?? ''
      captured.disableCalls.push(id)

      if (options.disableStatus !== undefined) {
        return jsonRoute(route, { message: 'Server Error' }, options.disableStatus)
      }

      // Idempotent, like the api: disabling an already-disabled link is the same 204.
      const row = links.find((candidate) => candidate.id === id)

      if (row !== undefined && row.status === 'active') {
        row.status = 'disabled'
        row.disabled_at = '2026-10-03T08:00:00.000000Z'
        staleReads = options.staleListAfterDisable ?? 0
      }

      return route.fulfill({ status: 204 })
    }
  )

  // What the saved-project drawer asks for besides the links.
  await page.route(
    (url) => url.pathname === '/avatar-templates/options',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            data: [{ id: 7, name: 'Default template', provider: 'heygen', is_active: true }],
          })
        : route.continue()
  )
  await page.route(
    (url) => url.pathname === '/framework/versions',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
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
        : route.continue()
  )
  await page.route(
    (url) => url.pathname === '/projects/2/questions',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, { data: [], meta: { max_questions_per_competency: 4 } })
        : route.continue()
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

const PANEL_NAME = 'Link riutilizzabili'

/** Opens the saved-project drawer of "Active Project" and returns its links panel. */
async function openLinksPanel(page: Page) {
  await page.getByRole('link', { name: 'Progetti' }).click()
  await expect(page).toHaveURL('/projects')

  // The analytics banner is fixed to the bottom of the viewport and can sit on top
  // of the drawer's lower controls; answering it is part of arriving here.
  const reject = page.getByTestId('analytics-consent-reject')

  if (await reject.isVisible()) await reject.click()

  await page
    .getByRole('row', { name: /Active Project/ })
    .getByRole('button', { name: 'Modifica' })
    .click()

  const panel = page.getByRole('region', { name: PANEL_NAME })

  await expect(panel).toBeVisible()

  return panel
}

function rowOf(panel: ReturnType<Page['getByRole']>, name: string) {
  return panel.getByRole('listitem').filter({ hasText: name })
}

test.describe('Reusable interview links: managing them (reusable-interview-links, B6b)', () => {
  test('an operator creates a link, finds it in the saved-project drawer and disables it', async ({
    page,
  }) => {
    const captured = await mockAdminApi(page)
    await login(page)
    await openInviteDrawer(page)

    // Create ...
    await page.getByRole('checkbox', { name: CHECKBOX_NAME }).check()
    await page.getByLabel(LINK_NAME_LABEL).fill('Stand fiera di Milano')
    await page.getByRole('button', { name: 'Genera link' }).click()
    await expect(page.getByTestId('entry-link-url')).toHaveText(ENTRY_URL)
    await page.getByRole('button', { name: 'Chiudi' }).click()

    // ... reopen the SAVED project's drawer: the link is listed with its prefix and
    // zero uses, and the URL is nowhere (it was shown once and is gone).
    const panel = await openLinksPanel(page)
    const row = rowOf(panel, 'Stand fiera di Milano')

    await expect(row).toBeVisible()
    await expect(row).toContainText('beai_rl_9AuXUvnf')
    await expect(row).toContainText('Mai usato')
    await expect(row).toContainText('Attivo')
    await expect(panel).not.toContainText('https://')
    await expect(page.locator('body')).not.toContainText('9AuXUvnfk8dgg')

    // ... disable it through the confirmation: nothing is sent until it is confirmed.
    await row.getByRole('button', { name: /Disattiva link/ }).click()

    const dialog = page.getByRole('alertdialog')

    await expect(dialog).toContainText('Disattivare questo link?')
    await expect(dialog).toContainText('non può essere annullata')
    expect(captured.disableCalls).toEqual([])

    await dialog.getByRole('button', { name: 'Disattiva', exact: true }).click()

    // The row is Disabled in place, with no action left and no reload.
    await expect(row).toContainText('Disattivato')
    await expect(row.getByRole('button', { name: /Disattiva link/ })).toHaveCount(0)
    expect(captured.disableCalls).toEqual(['rlk_01HZ0000000000000000000000'])
  })

  test('lists each link with its prefix, creator, usage and status, active ones first', async ({
    page,
  }) => {
    await mockAdminApi(page, {
      links: [
        linkRow(),
        linkRow({
          id: 'rlk_01HZ1111111111111111111111',
          label: null,
          token_prefix: 'beai_rl_ZyXwVuTs',
          status: 'disabled',
          uses_count: 0,
          last_used_at: null,
          created_by: null,
          disabled_at: '2026-09-25T08:00:00.000000Z',
        }),
      ],
    })
    await login(page)

    const panel = await openLinksPanel(page)
    const items = panel.getByRole('listitem')

    await expect(items).toHaveCount(2)

    // In the order the api sent them: active first.
    await expect(items.nth(0)).toContainText('Stand fiera di Milano')
    await expect(items.nth(1)).toContainText('Link senza nome')

    const active = items.nth(0)

    await expect(active).toContainText('beai_rl_9AuXUvnf')
    await expect(active).toContainText(/Creato il .+ da Operator One/)
    await expect(active).toContainText(/Usato 3 volte · ultimo utilizzo .+/)
    await expect(active).toContainText('Attivo')
    await expect(active.getByRole('button', { name: /Disattiva link/ })).toBeVisible()

    // A disabled, never-used link whose creator is gone: no action, no blank "da".
    const disabled = items.nth(1)

    await expect(disabled).toContainText('beai_rl_ZyXwVuTs')
    await expect(disabled).toContainText(/Creato il /)
    await expect(disabled).not.toContainText(' da ')
    await expect(disabled).toContainText('Mai usato')
    await expect(disabled).toContainText('Disattivato')
    await expect(disabled.getByRole('button', { name: /Disattiva link/ })).toHaveCount(0)

    // Only the prefix, never a URL or a token.
    await expect(panel).not.toContainText('https://')
  })

  test('each Disable control says which link it disables', async ({ page }) => {
    await mockAdminApi(page, {
      links: [linkRow(), linkRow({ id: 'rlk_01HZ2222222222222222222222', label: 'Evento Roma' })],
    })
    await login(page)

    const panel = await openLinksPanel(page)

    await expect(
      panel.getByRole('button', { name: 'Disattiva link: Stand fiera di Milano' })
    ).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Disattiva link: Evento Roma' })).toBeVisible()
  })

  test('cancelling the confirmation sends nothing and leaves the link Active', async ({ page }) => {
    const captured = await mockAdminApi(page, { links: [linkRow()] })
    await login(page)

    const panel = await openLinksPanel(page)
    const row = rowOf(panel, 'Stand fiera di Milano')

    await row.getByRole('button', { name: /Disattiva link/ }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Annulla' }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)

    // Escape closes it too, with the same effect.
    await row.getByRole('button', { name: /Disattiva link/ }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('alertdialog')).toHaveCount(0)

    expect(captured.disableCalls).toEqual([])
    await expect(row).toContainText('Attivo')
    await expect(row.getByRole('button', { name: /Disattiva link/ })).toBeVisible()
  })

  // The api answers 204 whether this call disabled the link or it already was. The
  // list below is stale (another tab got there first), so the operator is offered
  // the action again and disables a link that is already disabled.
  test('disabling a link that was already disabled is a plain success', async ({ page }) => {
    const captured = await mockAdminApi(page, {
      links: [linkRow()],
      staleListAfterDisable: 1,
    })
    await login(page)

    const panel = await openLinksPanel(page)
    const row = rowOf(panel, 'Stand fiera di Milano')

    // First disable: the refetch is still stale, so the row reads Active.
    await row.getByRole('button', { name: /Disattiva link/ }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Disattiva', exact: true })
      .click()
    await expect.poll(() => captured.disableCalls.length).toBe(1)
    await expect(row).toContainText('Attivo')

    // Second disable of the SAME link: the server answers 204 again.
    await row.getByRole('button', { name: /Disattiva link/ }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Disattiva', exact: true })
      .click()

    await expect(row).toContainText('Disattivato')
    expect(captured.disableCalls).toEqual([
      'rlk_01HZ0000000000000000000000',
      'rlk_01HZ0000000000000000000000',
    ])
    // No error was reported for either call.
    await expect(panel.getByRole('alert')).toHaveCount(0)
  })

  test('a failed disable keeps the link Active and says so', async ({ page }) => {
    const captured = await mockAdminApi(page, { links: [linkRow()], disableStatus: 500 })
    await login(page)

    const panel = await openLinksPanel(page)
    const row = rowOf(panel, 'Stand fiera di Milano')

    await row.getByRole('button', { name: /Disattiva link/ }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Disattiva', exact: true })
      .click()

    await expect(panel.getByRole('alert')).toContainText(
      'Non è stato possibile disattivare il link. Riprova.'
    )
    await expect(row).toContainText('Attivo')
    await expect(row.getByRole('button', { name: /Disattiva link/ })).toBeVisible()
    expect(captured.disableCalls).toHaveLength(1)
  })

  test('a project with no links explains how to create one', async ({ page }) => {
    await mockAdminApi(page, { links: [] })
    await login(page)

    const panel = await openLinksPanel(page)

    await expect(panel).toContainText('Nessun link riutilizzabile per ora')
    await expect(panel).toContainText('Invita candidato')
    await expect(panel.getByRole('listitem')).toHaveCount(0)
  })

  test('a failed load says so with a retry, never the empty state, and retry recovers', async ({
    page,
  }) => {
    // Two 500s: the client's own single retry fails too, so the panel gives up.
    const captured = await mockAdminApi(page, { links: [linkRow()], failListTimes: 2 })
    await login(page)

    const panel = await openLinksPanel(page)

    await expect(panel.getByRole('alert')).toContainText(
      'Non è stato possibile caricare i link riutilizzabili.'
    )
    await expect(panel).not.toContainText('Nessun link riutilizzabile per ora')

    await panel.getByRole('button', { name: 'Riprova' }).click()

    await expect(rowOf(panel, 'Stand fiera di Milano')).toBeVisible()
    await expect(panel.getByRole('alert')).toHaveCount(0)
    // Two failed attempts (one load plus the client's retry), then the operator's retry.
    expect(captured.listCalls).toBe(3)
  })

  test('a project being created has no links panel and asks for no links', async ({ page }) => {
    const captured = await mockAdminApi(page, { links: [linkRow()] })
    await login(page)
    await page.getByRole('link', { name: 'Progetti' }).click()
    await expect(page).toHaveURL('/projects')

    const reject = page.getByTestId('analytics-consent-reject')

    if (await reject.isVisible()) await reject.click()

    await page.getByTestId('projects-new').click()
    await expect(page.getByTestId('project-form')).toBeVisible()

    await expect(page.getByRole('region', { name: PANEL_NAME })).toHaveCount(0)
    expect(captured.listCalls).toBe(0)
  })

  test('a viewer gets no links panel, and no request for the links', async ({ page }) => {
    const captured = await mockAdminApi(page, { role: 'viewer', links: [linkRow()] })
    await login(page)
    await page.getByRole('link', { name: 'Progetti' }).click()
    await expect(page).toHaveURL('/projects')
    await expect(page.getByRole('row', { name: /Active Project/ })).toBeVisible()

    // A viewer cannot edit, so the saved-project drawer is not reachable at all.
    await expect(page.getByRole('button', { name: 'Modifica' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: PANEL_NAME })).toHaveCount(0)
    expect(captured.listCalls).toBe(0)
  })
})
