import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

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

// Per-test state, reset in beforeEach: both browser projects run this file in one
// worker, and a stale label, token or error list must never leak from one to the next.
let label = ''
let accessToken: string | null = null
let projectId: string | null = null
let serverErrors: string[] = []

test.beforeEach(() => {
  label = `${LABEL_PREFIX}${Date.now()}`
  accessToken = null
  projectId = null
  serverErrors = []
})

function describe5xx(method: string, url: string, status: number): string {
  return `${status} ${method} ${new URL(url).pathname}`
}

async function signIn(page: Page): Promise<void> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      'Set BEAI_E2E_ADMIN_EMAIL and BEAI_E2E_ADMIN_PASSWORD to an admin of your LOCAL dev data ' +
        '(the one you provisioned with `php artisan beai:provision-organization`, see ' +
        'docs/dev-setup.md). No default credentials are committed.'
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

  accessToken = ((await response.json()) as { access_token?: string }).access_token ?? null
  await expect(page).not.toHaveURL(/\/login/)
}

async function sweep(request: APIRequestContext): Promise<number> {
  if (accessToken === null || projectId === null) return 0

  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
  const list = await request.get(`/api/projects/${projectId}/reusable-links`, { headers })

  if (!list.ok()) return 0

  const rows = ((await list.json()) as { data: LinkRow[] }).data
  let removed = 0

  for (const row of rows.filter((candidate) => candidate.label === label)) {
    const gone = await request.delete(`/api/projects/${projectId}/reusable-links/${row.id}`, {
      headers,
    })

    expect([204, 404]).toContain(gone.status())
    removed += 1
  }

  return removed
}

test.afterEach(async ({ request }) => {
  await sweep(request)
})

test('creating a reusable link on the real stack answers 201 and no /api call is a 5xx', async ({
  page,
}) => {
  page.on('response', (response) => {
    const { pathname } = new URL(response.url())
    const create = /^\/api\/projects\/([^/]+)\/reusable-links$/.exec(pathname)

    if (create && response.request().method() === 'POST') projectId = create[1] ?? null

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

  expect(serverErrors, `5xx answers from /api/: ${serverErrors.join(', ')}`).toEqual([])
})
