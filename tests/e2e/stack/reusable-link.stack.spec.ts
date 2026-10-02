import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { resolveStackUrl } from '../support/stack-url'

/**
 * Reusable interview link against the REAL stack (opt-in tier, BEAI_E2E_STACK=1).
 *
 * No `page.route`, no mocks: the browser talks to the running backoffice, whose
 * nginx proxies `/api/` to the real api and its real database. This is the tier
 * that would have caught `relation "reusable_interview_links" does not exist`
 * (2026-10-02), which every mocked suite is structurally blind to.
 *
 * It WRITES one real row (a reusable link labelled `e2e-stack-<timestamp>`) in
 * the local dev database and removes it again through the real API, always.
 */

const ADMIN_EMAIL = process.env['BEAI_E2E_ADMIN_EMAIL']
const ADMIN_PASSWORD = process.env['BEAI_E2E_ADMIN_PASSWORD']

const LABEL_PREFIX = 'e2e-stack-'
const CHECKBOX_NAME = /link di colloquio riutilizzabile che non scade mai/
const LINK_NAME_LABEL = 'Nome del link'
const SUBMIT_NAME = 'Genera link'
const PANEL_NAME = 'Link riutilizzabili'

interface LinkRow {
  id: string
  label: string | null
}

const CREATE_PATH = /^\/api\/projects\/([^/]+)\/reusable-links$/

// Per-test state, reset in beforeEach: both browser projects run this file in one
// worker, and a stale label or error list must never leak from one to the next.
let label = ''
let createAttempted = false
let projectId: string | null = null
let serverErrors: string[] = []

test.beforeEach(() => {
  label = `${LABEL_PREFIX}${Date.now()}`
  createAttempted = false
  projectId = null
  serverErrors = []
})

function credentials(): { email: string; password: string } {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      'Set BEAI_E2E_ADMIN_EMAIL and BEAI_E2E_ADMIN_PASSWORD to the admin of a DEDICATED e2e ' +
        'organization in your LOCAL dev data (provisioned with `php artisan ' +
        'beai:provision-organization`, see docs/dev-setup.md). No default credentials are committed.'
    )
  }

  return { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
}

function describe5xx(method: string, url: string, status: number): string {
  return `${status} ${method} ${new URL(url).pathname}`
}

async function signIn(page: Page): Promise<void> {
  // Safe even if this spec is run without the config: refuse a non-local origin
  // before the password is typed anywhere.
  resolveStackUrl()

  const { email, password } = credentials()

  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)

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

/**
 * Remove every link this test created. It must never fail silently: a swallowed
 * error here leaves a live `e2e-stack-*` link in the database while the test
 * stays green. It signs in again for a fresh token (the test's own may have
 * expired, or never been obtained) and throws, with status and path only, on any
 * non-ok answer. The list endpoint is not paginated (it returns `->get()`), so one
 * call sees every link of the project.
 */
async function sweep(request: APIRequestContext): Promise<void> {
  if (!createAttempted) return

  resolveStackUrl()

  if (projectId === null) {
    throw new Error(`Cleanup: a create was attempted for "${label}" but its project id is unknown.`)
  }

  const login = await request.post('/api/auth/login', {
    data: credentials(),
    headers: { Accept: 'application/json' },
  })

  if (!login.ok()) throw new Error(`Cleanup sign-in failed: HTTP ${login.status()} /api/auth/login`)

  const token = ((await login.json()) as { access_token?: string }).access_token

  if (!token) throw new Error('Cleanup sign-in returned no access token.')

  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  const base = `/api/projects/${projectId}/reusable-links`
  const list = await request.get(base, { headers })

  if (!list.ok()) throw new Error(`Cleanup list failed: HTTP ${list.status()} ${base}`)

  const rows = ((await list.json()) as { data: LinkRow[] }).data

  for (const row of rows.filter((candidate) => candidate.label === label)) {
    const gone = await request.delete(`${base}/${row.id}`, { headers })

    if (![204, 404].includes(gone.status())) {
      throw new Error(`Cleanup delete failed: HTTP ${gone.status()} ${base}/${row.id}`)
    }
  }
}

test.afterEach(async ({ request }) => {
  // Surfaced on ANY outcome (a failed earlier expect must not hide it), softly so
  // it never masks the original failure. Method, path and status only.
  if (serverErrors.length > 0) {
    test.info().annotations.push({ type: '5xx', description: serverErrors.join(', ') })
  }

  expect.soft(serverErrors, `5xx answers from /api/: ${serverErrors.join(', ')}`).toEqual([])

  await sweep(request)
})

test('creating a reusable link on the real stack answers 201 and no /api call is a 5xx', async ({
  page,
}) => {
  // Captured from the REQUEST at the moment the create is issued, so a page that
  // closes before the response arrives cannot lose the project id.
  page.on('request', (request) => {
    const create = CREATE_PATH.exec(new URL(request.url()).pathname)

    if (create && request.method() === 'POST') {
      createAttempted = true
      projectId = create[1] ?? null
    }
  })

  page.on('response', (response) => {
    const { pathname } = new URL(response.url())

    if (pathname.startsWith('/api/') && response.status() >= 500) {
      serverErrors.push(describe5xx(response.request().method(), response.url(), response.status()))
    }
  })

  await signIn(page)
  await page.goto('/projects')

  const inviteButtons = page.getByRole('button', { name: 'Invita candidato' })

  await expect(
    inviteButtons.first(),
    'No project with an "Invita candidato" action in the logged-in organization: create or ' +
      'publish one in the local backoffice first (this test never creates projects).'
  ).toBeVisible({ timeout: 15_000 })

  const row = page.getByRole('row').filter({ has: inviteButtons }).first()

  await row.getByRole('button', { name: 'Invita candidato' }).click()
  await page.getByRole('checkbox', { name: CHECKBOX_NAME }).check()
  await page.getByLabel(LINK_NAME_LABEL).fill(label)

  const created = page.waitForResponse(
    (response) =>
      /^\/api\/projects\/[^/]+\/reusable-links$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST'
  )

  await page.getByRole('button', { name: SUBMIT_NAME }).click()

  const response = await created

  expect(response.status(), `POST ${new URL(response.url()).pathname}`).toBe(201)
  await expect(page.getByTestId('entry-link-url')).toContainText('beai_rl_')

  // Listed: close the drawer, open the saved project's drawer, find the new row.
  await page
    .getByRole('button', { name: 'Chiudi' })
    .and(page.locator(':not([data-slot="sheet-close"])'))
    .click()
  await row.getByRole('button', { name: 'Modifica' }).click()

  const panel = page.getByRole('region', { name: PANEL_NAME })

  await expect(panel.getByRole('listitem').filter({ hasText: label })).toBeVisible()
})
