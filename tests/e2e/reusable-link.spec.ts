import type { Locator, Page } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'
import { abilitiesFor } from './fixtures/abilities'
import {
  expect,
  jsonRoute,
  isDataRequest,
  mockParticipantsApi,
  mockProjectsApi,
  participantResource,
  projectResource,
  reusableLinkResource,
  test,
  type Participant,
  type ReusableLink,
} from './fixtures/admin-session'

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
 * who is never offered any of it.
 *
 * The third block is the participant detail origin line (B6c): "Avviato da link
 * riutilizzabile: <label>", the bare line when the link has no label, and
 * nothing at all for an ordinary participant, for every role that can read it.
 *
 * TWO RULES THIS FILE FOLLOWS, because both were broken here once:
 *
 * - A value captured by a mock is read only AFTER a web-first assertion has seen
 *   the UI state that follows the request. A bare `expect(captured...)` straight
 *   after `click()` races the request it is checking.
 * - "No request was sent" is never proven by a count read at one instant, which
 *   is zero just as well when the request has not left yet. It is proven by what
 *   happens next: a refused submit is followed by a corrected one and the traffic
 *   must be exactly the corrected request; a panel that must not mount is
 *   compared with a drawer that must, in the same test.
 */

const ACTIVE_PROJECT = projectResource()
const DRAFT_PROJECT = projectResource({
  id: 3,
  slug: 'draft-project',
  name: 'Draft Project',
  status: 'draft',
})

/** 43 base64url characters after the marker, as the api generates them. */
const ENTRY_URL =
  'https://interview.example.com/it/interview/reusable#beai_rl_9AuXUvnfk8dgg-mOHfBcWFbQ98k_MXZ5SChgVAqzCpY'

const LINK_ID = 'rlk_01HZ0000000000000000000000'

/** The create response, as `ReusableInterviewLinkController::store` returns it. */
function createdResponse(label: string | null) {
  return {
    data: reusableLinkResource({ label, uses_count: 0, last_used_at: null }),
    entry_url: ENTRY_URL,
  }
}

/** The origin an admin participant read carries: `null` for an ordinary participant. */
type ReusableLinkMarker = Participant['reusable_link']

function participantRow(
  id: number,
  displayName: string,
  reusableLink: ReusableLinkMarker
): Participant {
  return participantResource({
    id,
    candidate_ref: `ref-00${id}`,
    display_name: displayName,
    email: `candidate-${id}@example.test`,
    reusable_link: reusableLink,
  })
}

/** What `POST /projects/2/reusable-links` answers when it is not the default 201. */
type CreateAnswer = { status: number; body: unknown } | 'network-error'

interface Captured {
  /** JSON bodies of every `POST /projects/2/reusable-links`, in order. */
  reusableBodies: unknown[]
  /** How many times `POST /entry-links` was called: the reusable flow must never call it. */
  entryLinkCalls: number
  /** How many times `GET /projects/2/reusable-links` was asked. */
  listCalls: number
  /** The link id of every `DELETE /projects/2/reusable-links/{id}`, in order. */
  disableCalls: string[]
  /**
   * EVERY request the page made to a reusable-links path, whatever the project id
   * or the method (`"GET /projects/2/reusable-links"`). Counting only the
   * project-2 route would miss a panel that asked about some other project.
   */
  reusableRequests: string[]
}

interface Options {
  /** What `POST /projects/2/reusable-links` answers; defaults to a 201. */
  createAnswer?: (body: Record<string, unknown>) => CreateAnswer | undefined
  /** The links the server holds for project 2 before the test starts. */
  links?: ReusableLink[]
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
  /** The participants the admin API holds; the list and the detail both serve them. */
  participants?: Participant[]
}

async function mockAdminApi(page: Page, options: Options = {}): Promise<Captured> {
  const captured: Captured = {
    reusableBodies: [],
    entryLinkCalls: 0,
    listCalls: 0,
    disableCalls: [],
    reusableRequests: [],
  }
  // The server's own state: a create appends, a DELETE disables, a list reads.
  const links: ReusableLink[] = [...(options.links ?? [])]
  let listFailures = options.failListTimes ?? 0
  let staleReads = 0

  page.on('request', (request) => {
    const { pathname } = new URL(request.url())

    if (/\/reusable-links(?:\/|$)/.test(pathname)) {
      captured.reusableRequests.push(`${request.method()} ${pathname}`)
    }
  })

  await mockProjectsApi(page, [ACTIVE_PROJECT, DRAFT_PROJECT])

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

      if (answer === 'network-error') return route.abort('failed')
      if (answer) return jsonRoute(route, answer.body, answer.status)

      const created = createdResponse(typeof body['label'] === 'string' ? body['label'] : null)

      // The server remembers it: it is the first row of the project's list from now on.
      links.unshift(created.data)

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

  if ((options.participants ?? []).length > 0) {
    await mockParticipantsApi(page, options.participants ?? [])
  }

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
  await page.goto('/projects')

  await page
    .getByRole('row', { name: /Active Project/ })
    .getByRole('button', { name: 'Invita candidato' })
    .click()
}

const CHECKBOX_NAME = /link di colloquio riutilizzabile che non scade mai/
const LINK_NAME_LABEL = 'Nome del link'
const SUBMIT_NAME = 'Genera link'
const SAVE_ERROR = 'Non è stato possibile generare questo link di accesso.'

/** The X in the corner of the drawer: the vendored `SheetContent` close control. */
function cornerClose(page: Page): Locator {
  return page.locator('button[data-slot="sheet-close"]')
}

/** The "Chiudi" button of the footer, shown once a link exists. Not the corner X. */
function footerClose(page: Page): Locator {
  return page
    .getByRole('button', { name: 'Chiudi' })
    .and(page.locator(':not([data-slot="sheet-close"])'))
}

function reusableCheckbox(page: Page): Locator {
  return page.getByRole('checkbox', { name: CHECKBOX_NAME })
}

async function createReusableLink(page: Page, label: string | null): Promise<void> {
  await reusableCheckbox(page).check()

  if (label !== null) await page.getByLabel(LINK_NAME_LABEL).fill(label)

  await page.getByRole('button', { name: SUBMIT_NAME }).click()
}

test.describe('Reusable interview link: create flow (reusable-interview-links)', () => {
  test('an operator creates a reusable link; the disclosure precedes the URL and Copy', async ({
    adminPage: page,
  }) => {
    const captured = await mockAdminApi(page)
    await recordClipboardWrites(page)
    await openInviteDrawer(page)

    const checkbox = reusableCheckbox(page)

    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toBeChecked()

    await checkbox.check()

    // HIDDEN, not disabled: the candidate fields are gone from the page.
    await expect(page.getByLabel('Riferimento candidato')).toHaveCount(0)
    await expect(page.getByLabel('Nome visualizzato')).toHaveCount(0)
    await expect(page.getByTestId('entry-link-form-email')).toHaveCount(0)

    await page.getByLabel(LINK_NAME_LABEL).fill('Stand fiera di Milano')
    await page.getByRole('button', { name: SUBMIT_NAME }).click()

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

    // The request: ONLY the label, to the reusable endpoint. Read after the UI
    // state that follows the response, never straight after the click.
    expect(captured.reusableBodies).toEqual([{ label: 'Stand fiera di Milano' }])

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
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __clipboardWrites: string[] }).__clipboardWrites
        )
      )
      .toEqual([ENTRY_URL])

    // The single-use endpoint was never involved: read last, once everything the
    // flow does has happened.
    expect(captured.entryLinkCalls).toBe(0)
  })

  test('an empty Link name creates the link with an empty payload', async ({ adminPage: page }) => {
    const captured = await mockAdminApi(page)
    await openInviteDrawer(page)

    await createReusableLink(page, null)

    await expect(page.getByTestId('entry-link-url')).toHaveText(ENTRY_URL)
    expect(captured.reusableBodies).toEqual([{}])
  })

  test('the link is shown once: reopening the drawer shows no URL', async ({ adminPage: page }) => {
    await mockAdminApi(page)
    await openInviteDrawer(page)

    await createReusableLink(page, null)
    await expect(page.getByTestId('entry-link-url')).toHaveText(ENTRY_URL)

    // Both ways out of the drawer are named in the UI language. The corner X used
    // to carry a hard-coded English "Close", read out in English by a screen reader.
    await expect(cornerClose(page)).toHaveAccessibleName('Chiudi')
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0)

    await footerClose(page).click()
    await expect(page.getByTestId('entry-link-url')).toHaveCount(0)

    await page
      .getByRole('row', { name: /Active Project/ })
      .getByRole('button', { name: 'Invita candidato' })
      .click()

    // A fresh form, with the checkbox unticked again, and the token nowhere.
    await expect(reusableCheckbox(page)).not.toBeChecked()
    await expect(page.getByTestId('entry-link-url')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('beai_rl_')
  })

  test('a server 422 on the label lands under the Link name field', async ({ adminPage: page }) => {
    await mockAdminApi(page, {
      createAnswer: () => ({
        status: 422,
        body: {
          message: 'The label may not be greater than 120 characters.',
          errors: { label: ['Il nome del link e troppo lungo.'] },
        },
      }),
    })
    await openInviteDrawer(page)

    await createReusableLink(page, 'Stand')

    const field = page.getByLabel(LINK_NAME_LABEL)

    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Il nome del link e troppo lungo.')).toBeVisible()
    await expect(page.getByTestId('entry-link-url')).toHaveCount(0)
    // Mapped onto its own field, so the generic banner stays away.
    await expect(page.getByTestId('entry-link-form-banner')).toHaveCount(0)
  })

  test('a Link name over 120 characters is refused before any request; 120 is accepted', async ({
    adminPage: page,
  }) => {
    const captured = await mockAdminApi(page)
    await openInviteDrawer(page)

    await reusableCheckbox(page).check()

    const name = page.getByLabel(LINK_NAME_LABEL)

    await name.fill('x'.repeat(121))
    await page.getByRole('button', { name: SUBMIT_NAME }).click()

    await expect(page.getByTestId('entry-link-form-link-name-error')).toHaveText(
      'Inserisci al massimo 120 caratteri.'
    )
    await expect(name).toHaveAttribute('aria-invalid', 'true')

    // One character fewer and the SAME form submits. The ONLY request the server
    // saw is this one: had the refused submit gone out, it would be the first body.
    await name.fill('x'.repeat(120))
    await page.getByRole('button', { name: SUBMIT_NAME }).click()

    await expect(page.getByTestId('entry-link-url')).toHaveText(ENTRY_URL)
    expect(captured.reusableBodies).toEqual([{ label: 'x'.repeat(120) }])
  })

  // 403 (not allowed), 500 (the server broke) and a dropped connection are three
  // different ways for the create call to end WITHOUT a link. None of them may
  // show a URL, leave a token in the page, or leave the form stuck.
  const FAILURES: [string, CreateAnswer][] = [
    ['a 403', { status: 403, body: { message: 'This action is unauthorized.' } }],
    ['a 500', { status: 500, body: { message: 'Server Error' } }],
    ['a network error', 'network-error'],
  ]

  for (const [name, answer] of FAILURES) {
    test(`creating a link that ends in ${name} shows an error and never a link`, async ({
      adminPage: page,
    }) => {
      const captured = await mockAdminApi(page, { createAnswer: () => answer })
      await openInviteDrawer(page)

      await createReusableLink(page, 'Stand')

      await expect(page.getByTestId('entry-link-form-banner')).toContainText(SAVE_ERROR)
      await expect(page.getByTestId('entry-link-url')).toHaveCount(0)
      await expect(page.getByTestId('entry-link-disclosure')).toHaveCount(0)
      await expect(page.locator('body')).not.toContainText('beai_rl_')

      // The failure is not pinned on the Link name field, and the form can be
      // submitted again (the in-flight flag was released).
      await expect(page.getByLabel(LINK_NAME_LABEL)).toHaveAttribute('aria-invalid', 'false')
      await expect(page.getByRole('button', { name: SUBMIT_NAME })).toBeEnabled()

      // A create is not idempotent, so the client must not have retried it.
      expect(captured.reusableBodies).toEqual([{ label: 'Stand' }])
    })
  }

  test('ticking the checkbox removes the whole candidate form; unticking brings it back', async ({
    adminPage: page,
  }) => {
    await mockAdminApi(page)
    await openInviteDrawer(page)

    // The pieces of the single-use form, each by the SAME locator before and after.
    const singleUsePieces: Locator[] = [
      page.getByLabel('Riferimento candidato'),
      page.getByLabel('Nome visualizzato'),
      page.getByTestId('entry-link-form-email'),
      page.getByTestId('entry-link-form-external-reference'),
      page.getByRole('group', { name: 'Riferimento esterno' }),
      page.getByTestId('entry-link-form-timing'),
      page.getByRole('group', { name: 'Quando' }),
      page.getByTestId('entry-link-form-send-email'),
    ]

    for (const piece of singleUsePieces) await expect(piece).toBeVisible()
    await expect(page.getByLabel(LINK_NAME_LABEL)).toHaveCount(0)

    await reusableCheckbox(page).check()

    for (const piece of singleUsePieces) await expect(piece).toHaveCount(0)
    await expect(page.getByLabel(LINK_NAME_LABEL)).toBeVisible()
    await expect(page.getByRole('button', { name: SUBMIT_NAME })).toBeVisible()

    await reusableCheckbox(page).uncheck()

    for (const piece of singleUsePieces) await expect(piece).toBeVisible()
    await expect(page.getByLabel(LINK_NAME_LABEL)).toHaveCount(0)
  })

  // The candidate fields are REMOVED, but the values typed into them are still
  // held by the form. The reusable submit must read none of them.
  const TYPED_BEFORE_TICKING: [string, string | null, unknown][] = [
    ['with a name', 'Stand', { label: 'Stand' }],
    ['without a name', null, {}],
  ]

  for (const [name, label, expectedBody] of TYPED_BEFORE_TICKING) {
    test(`candidate values and a reference typed before ticking stay out of the request, ${name}`, async ({
      adminPage: page,
    }) => {
      const captured = await mockAdminApi(page)
      await openInviteDrawer(page)

      await page.getByLabel('Riferimento candidato').fill('typed-before')
      await page.getByLabel('Nome visualizzato').fill('Typed Before')
      await page.getByTestId('entry-link-form-email').fill('typed-before@example.test')
      await page.getByLabel('ID esterno', { exact: true }).fill('4471')
      await page.getByLabel('Origine', { exact: true }).fill('Acme ATS')

      await createReusableLink(page, label)

      await expect(page.getByTestId('entry-link-url')).toHaveText(ENTRY_URL)
      expect(captured.reusableBodies).toEqual([expectedBody])
      expect(captured.entryLinkCalls).toBe(0)
    })
  }

  test('a draft project keeps the Invite action disabled, so the checkbox is unreachable', async ({
    adminPage: page,
  }) => {
    await mockAdminApi(page)
    await page.goto('/projects')

    const invite = page
      .getByRole('row', { name: /Draft Project/ })
      .getByRole('button', { name: 'Invita candidato' })

    await expect(invite).toBeDisabled()
    await expect(reusableCheckbox(page)).toHaveCount(0)
  })

  test('the created link panel is accessible', async ({ adminPage: page }) => {
    await mockAdminApi(page)
    await openInviteDrawer(page)

    await checkA11y(page)

    await createReusableLink(page, 'Stand fiera di Milano')
    await expect(page.getByTestId('entry-link-url')).toHaveText(ENTRY_URL)

    await checkA11y(page)
  })
})

test.describe('Reusable interview link: a viewer', () => {
  test.use({ role: 'viewer' })

  test('gets no Invite action and therefore no reusable checkbox', async ({ adminPage: page }) => {
    await mockAdminApi(page)
    await page.goto('/projects')
    await expect(page.getByRole('row', { name: /Active Project/ })).toBeVisible()

    await expect(page.getByRole('button', { name: 'Invita candidato' })).toHaveCount(0)
    await expect(reusableCheckbox(page)).toHaveCount(0)
  })
})

const PANEL_NAME = 'Link riutilizzabili'

/**
 * Opens the saved-project drawer of "Active Project" and waits until the part of
 * it that sits NEXT TO the links panel has finished loading.
 *
 * The questions panel is rendered in the same pass, behind the same
 * `editingProject` check, so once its request has been answered and its content
 * is on screen, any sibling that is going to mount has had its chance to. That is
 * what makes a check for the ABSENCE of the links panel mean something.
 */
async function openSavedProjectDrawer(page: Page): Promise<void> {
  const questions = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/projects/2/questions'
  )

  await page
    .getByRole('row', { name: /Active Project/ })
    .getByRole('button', { name: 'Modifica' })
    .click()

  await questions
  await expect(page.getByTestId('project-questions-panel')).toBeVisible()
  // Two frames, so what the response triggered has been rendered and painted.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
}

/** Opens the saved-project drawer of "Active Project" and returns its links panel. */
async function openLinksPanel(page: Page): Promise<Locator> {
  await openSavedProjectDrawer(page)

  const panel = page.getByRole('region', { name: PANEL_NAME })

  await expect(panel).toBeVisible()

  return panel
}

function rowOf(panel: Locator, name: string): Locator {
  return panel.getByRole('listitem').filter({ hasText: name })
}

function confirmDisable(page: Page): Promise<void> {
  return page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Disattiva', exact: true })
    .click()
}

test.describe('Reusable interview links: managing them (reusable-interview-links, B6b)', () => {
  test('an operator creates a link, finds it in the saved-project drawer and disables it', async ({
    adminPage: page,
  }) => {
    const captured = await mockAdminApi(page)
    await openInviteDrawer(page)

    // Create ...
    await createReusableLink(page, 'Stand fiera di Milano')
    await expect(page.getByTestId('entry-link-url')).toHaveText(ENTRY_URL)
    await footerClose(page).click()

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

    await confirmDisable(page)

    // The row is Disabled in place, with no action left and no reload.
    await expect(row).toContainText('Disattivato')
    await expect(row.getByRole('button', { name: /Disattiva link/ })).toHaveCount(0)
    expect(captured.disableCalls).toEqual([LINK_ID])
  })

  test('lists each link with its prefix, creator, usage and status, active ones first', async ({
    adminPage: page,
  }) => {
    await mockAdminApi(page, {
      links: [
        reusableLinkResource(),
        reusableLinkResource({
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
    await page.goto('/projects')

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

  test('each Disable control says which link it disables', async ({ adminPage: page }) => {
    await mockAdminApi(page, {
      links: [
        reusableLinkResource(),
        reusableLinkResource({ id: 'rlk_01HZ2222222222222222222222', label: 'Evento Roma' }),
      ],
    })
    await page.goto('/projects')

    const panel = await openLinksPanel(page)

    await expect(
      panel.getByRole('button', { name: 'Disattiva link: Stand fiera di Milano' })
    ).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Disattiva link: Evento Roma' })).toBeVisible()
  })

  test('cancelling the confirmation sends nothing and leaves the link Active', async ({
    adminPage: page,
  }) => {
    const captured = await mockAdminApi(page, { links: [reusableLinkResource()] })
    await page.goto('/projects')

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

    // Still Active, and nothing sent so far.
    await expect(row).toContainText('Attivo')
    await expect(row.getByRole('button', { name: /Disattiva link/ })).toBeVisible()

    // Now CONFIRM once. The server saw exactly this one DELETE: had either
    // cancel (the button, then Escape) sent one, there would be more entries, and
    // the same list proves the recorder works, so silence before was evidence.
    await row.getByRole('button', { name: /Disattiva link/ }).click()
    await confirmDisable(page)
    await expect(row).toContainText('Disattivato')

    expect(captured.disableCalls).toEqual([LINK_ID])
  })

  // The api answers 204 whether this call disabled the link or it already was. The
  // list below is stale (another tab got there first), so the operator is offered
  // the action again and disables a link that is already disabled.
  test('disabling a link that was already disabled is a plain success', async ({
    adminPage: page,
  }) => {
    const captured = await mockAdminApi(page, {
      links: [reusableLinkResource()],
      staleListAfterDisable: 1,
    })
    await page.goto('/projects')

    const panel = await openLinksPanel(page)
    const row = rowOf(panel, 'Stand fiera di Milano')

    // First disable: the refetch is still stale, so the row reads Active.
    await row.getByRole('button', { name: /Disattiva link/ }).click()
    await confirmDisable(page)
    await expect.poll(() => captured.disableCalls.length).toBe(1)
    await expect(row).toContainText('Attivo')

    // Second disable of the SAME link: the server answers 204 again.
    await row.getByRole('button', { name: /Disattiva link/ }).click()
    await confirmDisable(page)

    await expect(row).toContainText('Disattivato')
    expect(captured.disableCalls).toEqual([LINK_ID, LINK_ID])
    // No error was reported for either call.
    await expect(panel.getByRole('alert')).toHaveCount(0)
  })

  test('a failed disable keeps the link Active and says so', async ({ adminPage: page }) => {
    const captured = await mockAdminApi(page, {
      links: [reusableLinkResource()],
      disableStatus: 500,
    })
    await page.goto('/projects')

    const panel = await openLinksPanel(page)
    const row = rowOf(panel, 'Stand fiera di Milano')

    await row.getByRole('button', { name: /Disattiva link/ }).click()
    await confirmDisable(page)

    await expect(panel.getByRole('alert')).toContainText(
      'Non è stato possibile disattivare il link. Riprova.'
    )
    await expect(row).toContainText('Attivo')
    await expect(row.getByRole('button', { name: /Disattiva link/ })).toBeVisible()
    expect(captured.disableCalls).toHaveLength(1)
  })

  test('a project with no links explains how to create one', async ({ adminPage: page }) => {
    await mockAdminApi(page, { links: [] })
    await page.goto('/projects')

    const panel = await openLinksPanel(page)

    await expect(panel).toContainText('Nessun link riutilizzabile per ora')
    await expect(panel).toContainText('Invita candidato')
    await expect(panel.getByRole('listitem')).toHaveCount(0)
  })

  test('a failed load says so with a retry, never the empty state, and retry recovers', async ({
    adminPage: page,
  }) => {
    // Two 500s: the client's own single retry fails too, so the panel gives up.
    const captured = await mockAdminApi(page, {
      links: [reusableLinkResource()],
      failListTimes: 2,
    })
    await page.goto('/projects')

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

  test('a project being created has no links panel and asks for no links', async ({
    adminPage: page,
  }) => {
    const captured = await mockAdminApi(page, { links: [reusableLinkResource()] })
    await page.goto('/projects')

    await page.getByTestId('projects-new').click()
    await expect(page.getByTestId('project-form')).toBeVisible()
    await expect(cornerClose(page)).toHaveAccessibleName('Chiudi')
    await expect(page.getByRole('region', { name: PANEL_NAME })).toHaveCount(0)

    // Compare with a SAVED project in the same session. That drawer does ask, so
    // the requests recorded here are exactly its own: the create form added none
    // (a new project has no id, so its panel could not have asked about project 2
    // either, which is why every reusable-links path is recorded, not just that one).
    await page.getByRole('button', { name: 'Annulla' }).click()
    await expect(page.getByTestId('project-form')).toHaveCount(0)

    const panel = await openLinksPanel(page)

    await expect(rowOf(panel, 'Stand fiera di Milano')).toBeVisible()
    expect(captured.reusableRequests).toEqual(['GET /projects/2/reusable-links'])
  })

  test('the links panel is accessible', async ({ adminPage: page }) => {
    await mockAdminApi(page, {
      links: [
        reusableLinkResource(),
        reusableLinkResource({
          id: 'rlk_01HZ1111111111111111111111',
          label: null,
          token_prefix: 'beai_rl_ZyXwVuTs',
          status: 'disabled',
          uses_count: 0,
          last_used_at: null,
          disabled_at: '2026-09-25T08:00:00.000000Z',
        }),
      ],
    })
    await page.goto('/projects')

    const panel = await openLinksPanel(page)

    await expect(panel.getByRole('listitem')).toHaveCount(2)
    await checkA11y(page)
  })

  test('the destructive confirmation is accessible', async ({ adminPage: page }) => {
    await mockAdminApi(page, { links: [reusableLinkResource()] })
    await page.goto('/projects')

    const panel = await openLinksPanel(page)

    await rowOf(panel, 'Stand fiera di Milano')
      .getByRole('button', { name: /Disattiva link/ })
      .click()
    await expect(page.getByRole('alertdialog')).toBeVisible()

    await checkA11y(page)
  })
})

test.describe('Reusable interview links: a viewer in the saved-project drawer', () => {
  test.use({ role: 'viewer' })

  // The viewer's drawer is unreachable because editing is gated on
  // `projects.update`. That is ALL this proves; the gate on the panel itself is
  // exercised in the describe below, with a user who CAN open the drawer.
  test('cannot open the drawer, so never meets the links panel', async ({ adminPage: page }) => {
    await mockAdminApi(page, { links: [reusableLinkResource()] })
    await page.goto('/projects')
    await expect(page.getByRole('row', { name: /Active Project/ })).toBeVisible()

    await expect(page.getByRole('button', { name: 'Modifica' })).toHaveCount(0)
  })
})

// Who may open the saved-project drawer is `projects.update`; who may see the
// links panel inside it is `participants.create`. No stock role splits the two
// (an operator has both, a viewer neither), so the gate on the PANEL can only be
// observed with an ability map no role produces: able to edit a project, unable
// to create participants.
const OPERATOR_ABILITIES = abilitiesFor(['operator'])

test.describe('Reusable interview links: an editor who may not create participants', () => {
  test.use({
    abilities: {
      ...OPERATOR_ABILITIES,
      projects: { ...OPERATOR_ABILITIES.projects, update: true },
      participants: { ...OPERATOR_ABILITIES.participants, create: false },
    },
  })

  test('opens the saved-project drawer and gets no links panel and no request for the links', async ({
    adminPage: page,
  }) => {
    const captured = await mockAdminApi(page, { links: [reusableLinkResource()] })
    await page.goto('/projects')

    // The drawer IS reachable for this user, and the Invite action is not.
    await expect(
      page.getByRole('row', { name: /Active Project/ }).getByRole('button', { name: 'Modifica' })
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Invita candidato' })).toHaveCount(0)

    await openSavedProjectDrawer(page)

    await expect(page.getByTestId('project-form')).toBeVisible()
    await expect(page.getByTestId('project-questions-panel')).toBeVisible()
    await expect(page.getByRole('region', { name: PANEL_NAME })).toHaveCount(0)
    expect(captured.reusableRequests).toEqual([])
  })
})

test.describe('Participant detail: reusable link origin (reusable-interview-links, B6c)', () => {
  test('a visitor shows "Started from reusable link: <label>" under the candidate reference', async ({
    adminPage: page,
  }) => {
    await mockAdminApi(page, {
      participants: [
        participantRow(1, 'Visitor One', { id: LINK_ID, label: 'Stand fiera di Milano' }),
      ],
    })
    await page.goto('/participants/1')

    await expect(page.getByRole('heading', { name: 'Visitor One' })).toBeVisible()

    const line = page.getByText('Avviato da link riutilizzabile: Stand fiera di Milano')

    await expect(line).toBeVisible()
    // UNDER the candidate reference, never above the name.
    const heading = await page.getByRole('heading', { name: 'Visitor One' }).boundingBox()
    const reference = await page.getByText(/^ref-001 · FLL/).boundingBox()
    const lineBox = await line.boundingBox()

    expect(heading!.y).toBeLessThan(reference!.y)
    expect(reference!.y).toBeLessThan(lineBox!.y)
  })

  test('a link with no label shows the bare line, with no colon and no label', async ({
    adminPage: page,
  }) => {
    await mockAdminApi(page, {
      participants: [participantRow(1, 'Visitor One', { id: LINK_ID, label: null })],
    })
    await page.goto('/participants/1')

    await expect(page.getByRole('heading', { name: 'Visitor One' })).toBeVisible()
    await expect(page.getByText('Avviato da link riutilizzabile', { exact: true })).toBeVisible()
    await expect(page.getByText(/Avviato da link riutilizzabile:/)).toHaveCount(0)
  })

  test('an ordinary participant shows no origin line at all', async ({ adminPage: page }) => {
    await mockAdminApi(page, {
      participants: [participantRow(1, 'Mario Rossi', null)],
    })
    await page.goto('/participants/1')

    await expect(page.getByRole('heading', { name: 'Mario Rossi' })).toBeVisible()
    await expect(page.getByText(/Avviato da link riutilizzabile/)).toHaveCount(0)
  })

  test('the label is rendered as text: markup in it is shown literally, never injected', async ({
    adminPage: page,
  }) => {
    await mockAdminApi(page, {
      participants: [
        participantRow(1, 'Visitor One', {
          id: LINK_ID,
          label: '<b>x</b><img src=x alt=injected>',
        }),
      ],
    })
    await page.goto('/participants/1')

    await expect(
      page.getByText('Avviato da link riutilizzabile: <b>x</b><img src=x alt=injected>')
    ).toBeVisible()
    await expect(page.getByRole('img', { name: 'injected' })).toHaveCount(0)
    await expect(page.getByText('x', { exact: true })).toHaveCount(0)
  })

  test('the participants list shows no origin column or sub-line for a visitor', async ({
    adminPage: page,
  }) => {
    await mockAdminApi(page, {
      participants: [
        participantRow(1, 'Visitor One', { id: LINK_ID, label: 'Stand fiera di Milano' }),
        participantRow(2, 'Mario Rossi', null),
      ],
    })
    await page.goto('/participants')

    await expect(page.getByRole('row', { name: /Visitor One/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /Mario Rossi/ })).toBeVisible()
    await expect(page.getByText(/Stand fiera di Milano/)).toHaveCount(0)
    await expect(page.getByText(/Avviato da link riutilizzabile/)).toHaveCount(0)
    // Header cells are unchanged: candidate, project, role, status, created.
    await expect(page.getByRole('columnheader')).toHaveCount(5)
  })

  test('the detail page with the origin line is accessible', async ({ adminPage: page }) => {
    await mockAdminApi(page, {
      participants: [
        participantRow(1, 'Visitor One', { id: LINK_ID, label: 'Stand fiera di Milano' }),
      ],
    })
    await page.goto('/participants/1')

    await expect(
      page.getByText('Avviato da link riutilizzabile: Stand fiera di Milano')
    ).toBeVisible()
    await checkA11y(page)
  })
})

test.describe('Participant detail: reusable link origin, as a viewer', () => {
  test.use({ role: 'viewer' })

  test('a viewer sees the origin line too: it is a read', async ({ adminPage: page }) => {
    await mockAdminApi(page, {
      participants: [
        participantRow(1, 'Visitor One', { id: LINK_ID, label: 'Stand fiera di Milano' }),
      ],
    })
    await page.goto('/participants/1')

    await expect(page.getByRole('heading', { name: 'Visitor One' })).toBeVisible()
    await expect(
      page.getByText('Avviato da link riutilizzabile: Stand fiera di Milano')
    ).toBeVisible()
  })
})
