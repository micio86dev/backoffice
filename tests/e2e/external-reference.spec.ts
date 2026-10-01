import { test, expect, type Page, type Route } from '@playwright/test'
import { abilitiesFor } from './fixtures/abilities'

/**
 * Candidate external reference, end to end (candidate-external-reference,
 * design AD-8).
 *
 * The calling system's own `source` and `external_id` for a candidate:
 *
 * - the invite form takes both as an OPTIONAL fieldset and sends them only when
 *   entered (external_id as a NUMBER);
 * - the participants list shows them as a muted sub-line under the candidate
 *   reference, and the detail page as one labelled line — both absent when the
 *   participant has no reference;
 * - re-issuing a link from the detail page carries the stored values through.
 *
 * Same convention as `entry-link.spec.ts`: no live backend, API calls are
 * intercepted at the network layer with fixtures shaped like the real resources,
 * and locators are role/label based. The UI runs in Italian (`locale: 'it-IT'`
 * in playwright.config.ts), so every accessible name below is the Italian copy.
 * Runs on both the chromium and webkit projects.
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

interface Reference {
  external_id: number | null
  source: string | null
}

const NO_REFERENCE: Reference = { external_id: null, source: null }
const ACME_REFERENCE: Reference = { external_id: 4471, source: 'Acme ATS' }

/** An admin participants list row, as `Admin\ParticipantResource` returns it. */
function listRow(id: number, displayName: string, reference: Reference) {
  return {
    id,
    candidate_ref: `ref-00${id}`,
    display_name: displayName,
    email: `candidate-${id}@example.test`,
    role_code: 'FLL',
    language: 'it',
    status: 'in_attesa',
    project_id: 2,
    project_name: 'Active Project',
    started_at: null,
    completed_at: null,
    created_at: '2026-03-14T08:30:00Z',
    // reusable-interview-links: always present on the wire, `null` for a
    // participant that did not start from a reusable link.
    reusable_link: null,
    ...reference,
  }
}

/** The admin participant detail, as `Admin\ParticipantDetailResource` returns it. */
function detail(id: number, displayName: string, reference: Reference) {
  return {
    ...listRow(id, displayName, reference),
    project: {
      id: ACTIVE_PROJECT.id,
      name: ACTIVE_PROJECT.name,
      status: ACTIVE_PROJECT.status,
      goes_live_at: ACTIVE_PROJECT.goes_live_at,
      deadline_at: ACTIVE_PROJECT.deadline_at,
    },
    timeline: { started_at: null, completed_at: null, session_count: 0 },
    progress: { done: 0, total: 3 },
    elapsed: { seconds: null, sessions_counted: 0, sessions_total: 0 },
    cost: {
      amount: null,
      currency: 'USD',
      is_estimate: true,
      sessions_estimated: 0,
      sessions_total: 0,
    },
    files: {
      transcript: { type: 'text/plain', ref: 'transcript', url: `/participants/${id}/transcript` },
      evaluation_raw: {
        type: 'application/json',
        ref: 'evaluation',
        url: `/participants/${id}/evaluation`,
      },
    },
  }
}

async function jsonRoute(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

function isDataRequest(route: Route): boolean {
  return route.request().resourceType() !== 'document'
}

interface Captured {
  /** JSON bodies of every `POST /entry-links`, in order. */
  entryLinkBodies: Record<string, unknown>[]
  /** The `q` query parameter of every `GET /participants`, in order. */
  searchTerms: (string | null)[]
}

/**
 * Intercepts the admin API. `participants` is what the list returns; the detail
 * route serves whichever of them is asked for, so the list and the detail agree
 * on each participant's reference.
 */
async function mockAdminApi(
  page: Page,
  participants: ReturnType<typeof listRow>[]
): Promise<Captured> {
  const captured: Captured = { entryLinkBodies: [], searchTerms: [] }

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
            roles: ['operator'],
            abilities: abilitiesFor(['operator']),
          })
        : route.continue()
  )

  await page.route(
    (url) => url.pathname === '/projects',
    (route) =>
      isDataRequest(route) ? jsonRoute(route, { data: [ACTIVE_PROJECT] }) : route.continue()
  )

  await page.route(
    (url) => /^\/framework\/roles\/[A-Z]+\/competencies$/.test(url.pathname),
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: [] }) : route.continue())
  )

  await page.route(
    (url) => url.pathname === '/entry-links',
    async (route) => {
      captured.entryLinkBodies.push(route.request().postDataJSON() as Record<string, unknown>)
      await jsonRoute(
        route,
        {
          entry_url: 'https://interview.example.com/interview/e2e-token',
          expires_at: '2026-08-17T15:32:00.000000Z',
        },
        201
      )
    }
  )

  await page.route(
    (url) => url.pathname === '/participants',
    (route) => {
      if (!isDataRequest(route)) return route.continue()

      captured.searchTerms.push(new URL(route.request().url()).searchParams.get('q'))

      return jsonRoute(route, {
        data: participants,
        links: { first: null, last: null, prev: null, next: null },
        meta: {
          current_page: 1,
          last_page: 1,
          total: participants.length,
          from: 1,
          to: participants.length,
          per_page: 20,
        },
      })
    }
  )

  // The API path and the SPA route share `/participants/:id`, so a document
  // navigation must fall through (same guard entry-link.spec.ts documents).
  for (const row of participants) {
    await page.route(
      (url) => url.pathname === `/participants/${row.id}`,
      (route) =>
        isDataRequest(route)
          ? jsonRoute(route, {
              data: detail(row.id, row.display_name, {
                external_id: row.external_id,
                source: row.source,
              }),
            })
          : route.continue()
    )
    await page.route(
      (url) => url.pathname === `/participants/${row.id}/evaluation`,
      (route) =>
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'lifecycle_not_ready',
            resource: 'evaluation',
            current_status: 'in_attesa',
            required_status: 'completato',
          }),
        })
    )
  }

  return captured
}

async function login(page: Page): Promise<void> {
  // The access token is memory-only: every full page load fires a boot
  // refresh, so it must be mocked or the auth guard bounces back to /login.
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

/** Opens the invite form from the project row and fills the required fields. */
async function openInviteForm(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Progetti' }).click()
  await expect(page).toHaveURL('/projects')

  await page
    .getByRole('row', { name: /Active Project/ })
    .getByRole('button', { name: 'Invita candidato' })
    .click()

  await page.getByLabel('Riferimento candidato').fill('e2e-candidate')
  await page.getByLabel('Nome visualizzato').fill('E2E Candidate')
  await page.getByLabel('Email del candidato').fill('e2e-candidate@example.test')
}

test.describe('Invite form: external reference fieldset', () => {
  test('an operator invites a candidate with a reference; both values reach the request', async ({
    page,
  }) => {
    const captured = await mockAdminApi(page, [listRow(1, 'Mario Rossi', NO_REFERENCE)])
    await login(page)
    await openInviteForm(page)

    await page.getByLabel('ID esterno', { exact: true }).fill('4471')
    await page.getByLabel('Origine', { exact: true }).fill('  Acme ATS  ')
    await page.getByRole('button', { name: 'Genera link' }).click()

    await expect(page.getByText('https://interview.example.com/interview/e2e-token')).toBeVisible()

    expect(captured.entryLinkBodies).toHaveLength(1)
    const body = captured.entryLinkBodies[0]!
    expect(body).toMatchObject({ external_id: 4471, source: 'Acme ATS' })
    // A NUMBER, not "4471": the API rejects a numeric string.
    expect(typeof body['external_id']).toBe('number')
  })

  test('an invite without a reference sends neither key', async ({ page }) => {
    const captured = await mockAdminApi(page, [listRow(1, 'Mario Rossi', NO_REFERENCE)])
    await login(page)
    await openInviteForm(page)

    await page.getByRole('button', { name: 'Genera link' }).click()

    await expect(page.getByText('https://interview.example.com/interview/e2e-token')).toBeVisible()
    expect(captured.entryLinkBodies).toHaveLength(1)
    expect(Object.keys(captured.entryLinkBodies[0]!)).not.toContain('external_id')
    expect(Object.keys(captured.entryLinkBodies[0]!)).not.toContain('source')
  })

  test('an invalid External ID is refused in the form, before any request', async ({ page }) => {
    const captured = await mockAdminApi(page, [listRow(1, 'Mario Rossi', NO_REFERENCE)])
    await login(page)
    await openInviteForm(page)

    const externalId = page.getByLabel('ID esterno', { exact: true })
    await externalId.fill('abc')
    await externalId.blur()

    await expect(
      page.getByText('Inserisci un numero intero da 1 a 9007199254740991.')
    ).toBeVisible()
    await expect(externalId).toHaveAttribute('aria-invalid', 'true')

    await page.getByRole('button', { name: 'Genera link' }).click()
    await expect(
      page.getByText('Inserisci un numero intero da 1 a 9007199254740991.')
    ).toBeVisible()
    expect(captured.entryLinkBodies).toHaveLength(0)
  })
})

test.describe('Participants list: external reference sub-line', () => {
  test('a row with a reference shows it under the candidate reference; a row without shows nothing', async ({
    page,
  }) => {
    await mockAdminApi(page, [
      listRow(1, 'Mario Rossi', ACME_REFERENCE),
      listRow(2, 'Giulia Bianchi', NO_REFERENCE),
    ])
    await login(page)

    await page.getByRole('link', { name: 'Candidati' }).click()
    await expect(page).toHaveURL('/participants')

    const withReference = page.getByRole('row', { name: /Mario Rossi/ })
    await expect(withReference.getByText('Acme ATS · #4471')).toBeVisible()

    const withoutReference = page.getByRole('row', { name: /Giulia Bianchi/ })
    await expect(withoutReference).toBeVisible()
    await expect(withoutReference.getByTestId('external-reference')).toHaveCount(0)
  })

  test('searching sends the term as q, so a source or an external id finds the row', async ({
    page,
  }) => {
    const captured = await mockAdminApi(page, [listRow(1, 'Mario Rossi', ACME_REFERENCE)])
    await login(page)

    await page.getByRole('link', { name: 'Candidati' }).click()
    await expect(page).toHaveURL('/participants')

    const search = page.getByLabel('Cerca', { exact: true })
    await search.fill('acme')
    await search.press('Enter')
    await expect.poll(() => captured.searchTerms.at(-1)).toBe('acme')

    await search.fill('4471')
    await search.press('Enter')
    await expect.poll(() => captured.searchTerms.at(-1)).toBe('4471')
  })
})

test.describe('Participant detail: external reference line and re-issue', () => {
  test('the detail header shows the labelled reference line', async ({ page }) => {
    await mockAdminApi(page, [listRow(1, 'Mario Rossi', ACME_REFERENCE)])
    await login(page)
    await page.goto('/participants/1')

    await expect(page.getByRole('heading', { name: 'Mario Rossi' })).toBeVisible()
    await expect(page.getByText('ID esterno 4471 · Origine Acme ATS')).toBeVisible()
  })

  test('a participant without a reference shows no reference line', async ({ page }) => {
    await mockAdminApi(page, [listRow(1, 'Mario Rossi', NO_REFERENCE)])
    await login(page)
    await page.goto('/participants/1')

    await expect(page.getByRole('heading', { name: 'Mario Rossi' })).toBeVisible()
    await expect(page.getByTestId('external-reference')).toHaveCount(0)
  })

  test('re-issuing a link carries the stored reference through', async ({ page }) => {
    const captured = await mockAdminApi(page, [listRow(1, 'Mario Rossi', ACME_REFERENCE)])
    await login(page)
    await page.goto('/participants/1')

    await page.getByRole('button', { name: 'Genera nuovo link' }).click()

    await expect(page.getByText('https://interview.example.com/interview/e2e-token')).toBeVisible()
    expect(captured.entryLinkBodies).toHaveLength(1)
    expect(captured.entryLinkBodies[0]).toMatchObject({
      candidate_ref: 'ref-001',
      external_id: 4471,
      source: 'Acme ATS',
    })
  })

  test('re-issuing a link for a participant without a reference sends neither key', async ({
    page,
  }) => {
    const captured = await mockAdminApi(page, [listRow(1, 'Mario Rossi', NO_REFERENCE)])
    await login(page)
    await page.goto('/participants/1')

    await page.getByRole('button', { name: 'Genera nuovo link' }).click()

    await expect(page.getByText('https://interview.example.com/interview/e2e-token')).toBeVisible()
    expect(captured.entryLinkBodies).toHaveLength(1)
    expect(Object.keys(captured.entryLinkBodies[0]!)).not.toContain('external_id')
    expect(Object.keys(captured.entryLinkBodies[0]!)).not.toContain('source')
  })
})
