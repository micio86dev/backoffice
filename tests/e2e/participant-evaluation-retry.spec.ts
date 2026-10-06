import type { Page, Request } from '@playwright/test'
import {
  expect,
  isDataRequest,
  jsonRoute,
  participantDetail,
  participantResource,
  test,
  type ParticipantDetail,
} from './fixtures/admin-session'

/**
 * Operator evaluation retry, end to end (scoring-retry-rt-b, spec
 * admin-backoffice "Operator Evaluation Retry Panel" and "Link Disclosure").
 *
 * Network-interception convention of `participant-recovery.spec.ts` and
 * `entry-link.spec.ts`: no live backend and never a real provider, every API
 * call is answered at the network layer with fixtures typed from the generated
 * client. The session is the shared `adminPage` fixture, whose `/auth/me`
 * ability map already carries `participants.retry`.
 *
 * Backoffice has no browser or viewport gate, so there is deliberately no
 * mobile or unsupported-browser project here.
 */

const PARTICIPANT = participantResource({ id: 1, status: 'completato' })

/** A bearer credential: it must reach the operator's screen and nowhere else. */
const SECRET = 'SECRET-RETRY-TOKEN-7f3a'
const ENTRY_URL = `https://interview.example.com/interview/${SECRET}`
const EXPIRES_AT = '2026-10-07T09:00:00.000000Z'

const PENDING: Partial<ParticipantDetail> = {
  retry_available: true,
  retry_attempt: false,
  retry_authorized_at: null,
}

const AUTHORIZED: Partial<ParticipantDetail> = {
  status: 'in_attesa',
  retry_available: false,
  retry_attempt: true,
  retry_authorized_at: '2026-10-06T09:00:00.000000Z',
}

const REFUSAL_MESSAGES: Record<string, RegExp> = {
  retry_already_consumed: /già stato autorizzato un nuovo colloquio/,
  not_completed: /non ha completato il colloquio/,
  test_mode_participant: /modalità test/,
  evaluation_not_pending: /non è in attesa di un nuovo colloquio/,
  project_inaccessible: /chiuso o fuori dal periodo di disponibilità/,
}

interface Mocked {
  /** Bodies and URLs of every request the page made, for the leak assertions. */
  requests: Request[]
  retryBodies: unknown[]
  setDetail: (overrides: Partial<ParticipantDetail>) => void
}

async function mockParticipant(
  page: Page,
  initial: Partial<ParticipantDetail>,
  retryResponse: { status: number; body: unknown }
): Promise<Mocked> {
  let current = initial
  const mocked: Mocked = {
    requests: [],
    retryBodies: [],
    setDetail: (overrides) => {
      current = overrides
    },
  }

  page.on('request', (request) => mocked.requests.push(request))

  await page.route(
    (url) => url.pathname === '/participants',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            data: [PARTICIPANT],
            links: { first: null, last: null, prev: null, next: null },
            meta: { current_page: 1, last_page: 1, total: 1, from: 1, to: 1, per_page: 20 },
          })
        : route.continue()
  )
  await page.route(
    (url) => url.pathname === '/participants/1',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, { data: participantDetail(PARTICIPANT, current) })
        : route.continue()
  )
  // A pending evaluation is not readable: the lifecycle gate answers 409.
  await page.route(
    (url) => url.pathname === '/participants/1/evaluation',
    (route) =>
      jsonRoute(
        route,
        {
          error: 'lifecycle_not_ready',
          resource: 'evaluation',
          current_status: 'completato',
          required_status: 'completato',
        },
        409
      )
  )
  await page.route(
    (url) => url.pathname === '/participants/1/sessions',
    (route) => jsonRoute(route, { data: [] })
  )
  await page.route(
    (url) => url.pathname === '/participants/1/retry',
    (route) => {
      mocked.retryBodies.push(route.request().postDataJSON())
      if (retryResponse.status === 200) mocked.setDetail(AUTHORIZED)
      return jsonRoute(route, retryResponse.body, retryResponse.status)
    }
  )

  return mocked
}

const SUCCESS = {
  status: 'in_attesa',
  competencies_reset: ['COL', 'STG'],
  entry_url: ENTRY_URL,
  expires_at: EXPIRES_AT,
  email_sent: true,
}

test.describe('Operator evaluation retry (scoring-retry-rt-b)', () => {
  test('an operator confirms the retry, sees the link once with its absolute expiry and the email status', async ({
    adminPage: page,
  }) => {
    const consoleMessages: string[] = []
    page.on('console', (message) => consoleMessages.push(message.text()))
    const mocked = await mockParticipant(page, PENDING, { status: 200, body: SUCCESS })

    await page.goto('/participants/1')

    await page.getByRole('button', { name: 'Autorizza il nuovo colloquio' }).click()

    // The destructive consequences are stated BEFORE anything is sent.
    const disclosure = page.getByTestId('evaluation-retry-disclosure')
    await expect(disclosure).toContainText(/eliminate definitivamente/)
    await expect(disclosure).toContainText(/non sarà leggibile/)
    await expect(disclosure).toContainText(/una sola volta/)
    await expect(disclosure).toContainText(/non può essere ritirato/)
    await expect(disclosure).toContainText(/link monouso/)
    expect(mocked.retryBodies).toHaveLength(0)

    await page.getByTestId('evaluation-retry-reason').fill('  connessione persa  ')
    await page.getByTestId('evaluation-retry-confirm').click()

    // The link, ONCE, with the absolute expiry (never a fixed lifetime) and
    // the email status.
    await expect(page.getByTestId('entry-link-url')).toHaveText(ENTRY_URL)
    await expect(page.getByTestId('entry-link-expiry')).toContainText(/2026/)
    await expect(page.getByTestId('entry-link-expiry')).not.toContainText(/24|30|minut/)
    await expect(page.getByTestId('evaluation-retry-email-status')).toHaveText(
      'Email inviata al candidato.'
    )
    expect(mocked.retryBodies).toEqual([{ reason: 'connessione persa' }])

    // The page refreshed behind the panel: the status badge moved on.
    await expect(page.getByText('In attesa').first()).toBeVisible()

    // The credential is nowhere but on screen: not the page URL, the console,
    // storage, nor any request URL or body (the response is not a request).
    expect(page.url()).not.toContain(SECRET)
    expect(consoleMessages.join('\n')).not.toContain(SECRET)
    const storage = await page.evaluate(() =>
      JSON.stringify([
        Object.entries(window.localStorage),
        Object.entries(window.sessionStorage),
        document.cookie,
      ])
    )
    expect(storage).not.toContain(SECRET)
    for (const request of mocked.requests) {
      expect(request.url()).not.toContain(SECRET)
      expect(request.postData() ?? '').not.toContain(SECRET)
    }

    // Dismissed: the link is gone, and the read-only progress line takes over.
    await page.getByTestId('evaluation-retry-dismiss').click()
    await expect(page.getByTestId('entry-link-url')).toHaveCount(0)
    await expect(page.getByTestId('evaluation-retry-state')).toContainText(
      /Nuovo colloquio autorizzato il .*2026/
    )

    // And it does not come back after a reload.
    await page.reload()
    await expect(page.getByTestId('evaluation-retry-state')).toHaveAttribute(
      'data-state',
      'waiting'
    )
    await expect(page.getByTestId('entry-link-url')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(SECRET)
  })

  test('the link is gone after a reload even when it was never dismissed', async ({
    adminPage: page,
  }) => {
    await mockParticipant(page, PENDING, { status: 200, body: SUCCESS })

    await page.goto('/participants/1')
    await page.getByRole('button', { name: 'Autorizza il nuovo colloquio' }).click()
    await page.getByTestId('evaluation-retry-confirm').click()
    await expect(page.getByTestId('entry-link-url')).toBeVisible()

    await page.reload()

    await expect(page.locator('body')).not.toContainText(SECRET)
    await expect(page.getByTestId('evaluation-retry-state')).toBeVisible()
  })

  test('cancelling the confirm step sends nothing and leaves the action available', async ({
    adminPage: page,
  }) => {
    const mocked = await mockParticipant(page, PENDING, { status: 200, body: SUCCESS })

    await page.goto('/participants/1')
    await page.getByRole('button', { name: 'Autorizza il nuovo colloquio' }).click()
    await page.getByTestId('evaluation-retry-cancel').click()

    await expect(page.getByTestId('evaluation-retry-open')).toBeEnabled()
    expect(mocked.retryBodies).toHaveLength(0)
  })

  for (const [reason, message] of Object.entries(REFUSAL_MESSAGES)) {
    test(`a 409 ${reason} shows its own translated message and disables the action`, async ({
      adminPage: page,
    }) => {
      const mocked = await mockParticipant(page, PENDING, {
        status: 409,
        body: { error: 'retry_refused', reason },
      })

      await page.goto('/participants/1')
      await page.getByRole('button', { name: 'Autorizza il nuovo colloquio' }).click()
      await page.getByTestId('evaluation-retry-confirm').click()

      const alert = page.getByTestId('evaluation-retry-error')
      await expect(alert).toContainText(message)
      // The machine string is never what the operator reads.
      await expect(alert).not.toContainText(reason)
      await expect(page.getByTestId('evaluation-retry-confirm')).toBeDisabled()
      expect(mocked.retryBodies).toHaveLength(1)

      // Back out of the confirm step: the action stays disabled, final refusal.
      await page.getByTestId('evaluation-retry-cancel').click()
      await expect(page.getByTestId('evaluation-retry-open')).toBeDisabled()
      await expect(page.getByTestId('evaluation-retry-error')).toContainText(message)
    })
  }

  test('a participant with a completed evaluation and no retry shows no panel', async ({
    adminPage: page,
  }) => {
    await mockParticipant(page, {}, { status: 200, body: SUCCESS })

    await page.goto('/participants/1')

    await expect(page.getByRole('heading', { name: 'Mario Rossi' })).toBeVisible()
    await expect(page.getByTestId('evaluation-retry-panel')).toHaveCount(0)
  })

  test.describe('as a viewer', () => {
    test.use({ role: 'viewer' })

    test('sees no retry panel while a retry is available (the action is gated by the ability)', async ({
      adminPage: page,
    }) => {
      await mockParticipant(page, PENDING, { status: 200, body: SUCCESS })

      await page.goto('/participants/1')

      await expect(page.getByRole('heading', { name: 'Mario Rossi' })).toBeVisible()
      await expect(page.getByTestId('evaluation-retry-panel')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Autorizza il nuovo colloquio' })).toHaveCount(
        0
      )
    })

    test('sees the Waiting line, without any action, after an operator authorized', async ({
      adminPage: page,
    }) => {
      await mockParticipant(page, AUTHORIZED, { status: 200, body: SUCCESS })

      await page.goto('/participants/1')

      await expect(page.getByTestId('evaluation-retry-state')).toHaveAttribute(
        'data-state',
        'waiting'
      )
      await expect(page.getByTestId('evaluation-retry-open')).toHaveCount(0)
    })
  })
})
