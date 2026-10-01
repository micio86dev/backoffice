import type { Locator, Page } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'
import {
  expect,
  jsonRoute,
  mockParticipantsApi,
  mockProjectsApi,
  participantResource,
  projectResource,
  test,
  type Participant,
} from './fixtures/admin-session'

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
 *
 * HOW "NO REQUEST WAS SENT" IS PROVEN. A count read straight after a click can be
 * zero only because the request has not left yet, and a negative that holds at
 * one instant proves nothing about the next. So a refused submit is followed by
 * a CORRECTED submit, and the assertion is that the captured traffic is exactly
 * the corrected request: had the refused one gone out, it would be the first
 * body (or a second one), whatever the timing.
 */

const PROJECT = projectResource()

interface Reference {
  external_id: number | null
  source: string | null
}

const NO_REFERENCE: Reference = { external_id: null, source: null }
const ACME_REFERENCE: Reference = { external_id: 4471, source: 'Acme ATS' }
const ID_ONLY: Reference = { external_id: 4471, source: null }
const SOURCE_ONLY: Reference = { external_id: null, source: 'Acme ATS' }
const MARKUP = '<b>x</b><img src=x alt=injected>'

/** An admin participants row, as `Admin\ParticipantResource` returns it. */
function row(id: number, displayName: string, reference: Reference): Participant {
  return participantResource({
    id,
    candidate_ref: `ref-00${id}`,
    display_name: displayName,
    email: `candidate-${id}@example.test`,
    ...reference,
  })
}

interface Captured {
  /** JSON bodies of every `POST /entry-links`, in order. */
  entryLinkBodies: Record<string, unknown>[]
  /** The `q` query parameter of every `GET /participants`, in order. */
  searchTerms: (string | null)[]
}

interface Options {
  /** What `POST /entry-links` answers; defaults to a 201 with an entry URL. */
  entryLinkAnswer?: () => { status: number; body: unknown }
}

/**
 * What `GET /participants?q=` does in `Api\ParticipantController::index`: a
 * case-insensitive substring on `candidate_ref`, `display_name` and `source`,
 * plus EXACT equality on `external_id` when the trimmed term is a whole number.
 * Mirroring it is what lets a test assert on the rows that change, not just on
 * the parameter that was sent.
 */
function matchesTerm(participant: Participant, rawTerm: string | null): boolean {
  if (rawTerm === null || rawTerm === '') return true

  const term = rawTerm.toLowerCase()
  const text = [participant.candidate_ref, participant.display_name, participant.source ?? '']

  if (text.some((value) => value.toLowerCase().includes(term))) return true

  return /^\d+$/.test(rawTerm.trim()) && participant.external_id === Number(rawTerm.trim())
}

/** Intercepts the admin API. The detail route serves whichever participant it is asked for. */
async function mockAdminApi(
  page: Page,
  participants: Participant[],
  options: Options = {}
): Promise<Captured> {
  const captured: Captured = { entryLinkBodies: [], searchTerms: [] }

  await mockProjectsApi(page, [PROJECT])

  await page.route(
    (url) => url.pathname === '/entry-links',
    async (route) => {
      captured.entryLinkBodies.push(route.request().postDataJSON() as Record<string, unknown>)

      const answer = options.entryLinkAnswer?.() ?? {
        status: 201,
        body: {
          entry_url: 'https://interview.example.com/interview/e2e-token',
          expires_at: '2026-08-17T15:32:00.000000Z',
        },
      }

      await jsonRoute(route, answer.body, answer.status)
    }
  )

  await mockParticipantsApi(
    page,
    (url) => {
      const term = url.searchParams.get('q')

      captured.searchTerms.push(term)

      return participants.filter((participant) => matchesTerm(participant, term))
    },
    participants
  )

  return captured
}

const ENTRY_URL = 'https://interview.example.com/interview/e2e-token'

/** The request the invite form sends when only the three required fields are filled. */
const REQUIRED_ONLY_BODY = {
  project_id: PROJECT.id,
  candidate_ref: 'e2e-candidate',
  display_name: 'E2E Candidate',
  email: 'e2e-candidate@example.test',
  send_email: true,
}

/** Opens the invite form from the project row and fills the required fields. */
async function openInviteForm(page: Page): Promise<void> {
  await page.goto('/projects')

  await page
    .getByRole('row', { name: /Active Project/ })
    .getByRole('button', { name: 'Invita candidato' })
    .click()

  await page.getByLabel('Riferimento candidato').fill('e2e-candidate')
  await page.getByLabel('Nome visualizzato').fill('E2E Candidate')
  await page.getByLabel('Email del candidato').fill('e2e-candidate@example.test')
}

function externalIdField(page: Page): Locator {
  return page.getByLabel('ID esterno', { exact: true })
}

function sourceField(page: Page): Locator {
  return page.getByLabel('Origine', { exact: true })
}

async function submitInvite(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Genera link' }).click()
}

const EXTERNAL_ID_INVALID = 'Inserisci un numero intero da 1 a 9007199254740991.'

test.describe('Invite form: external reference fieldset', () => {
  test('an operator invites a candidate with a reference; both values reach the request', async ({
    adminPage: page,
  }) => {
    const captured = await mockAdminApi(page, [row(1, 'Mario Rossi', NO_REFERENCE)])
    await openInviteForm(page)

    await externalIdField(page).fill('4471')
    await sourceField(page).fill('  Acme ATS  ')
    await submitInvite(page)

    await expect(page.getByText(ENTRY_URL)).toBeVisible()

    // The WHOLE body, not a subset: nothing else rides along with the pair.
    expect(captured.entryLinkBodies).toEqual([
      { ...REQUIRED_ONLY_BODY, external_id: 4471, source: 'Acme ATS' },
    ])
    // A NUMBER, not "4471": the API rejects a numeric string.
    expect(typeof captured.entryLinkBodies[0]!['external_id']).toBe('number')
  })

  test('an invite without a reference sends neither key', async ({ adminPage: page }) => {
    const captured = await mockAdminApi(page, [row(1, 'Mario Rossi', NO_REFERENCE)])
    await openInviteForm(page)

    await submitInvite(page)

    await expect(page.getByText(ENTRY_URL)).toBeVisible()
    expect(captured.entryLinkBodies).toEqual([REQUIRED_ONLY_BODY])
  })

  test('an invite with only an External ID sends exactly that key', async ({ adminPage: page }) => {
    const captured = await mockAdminApi(page, [row(1, 'Mario Rossi', NO_REFERENCE)])
    await openInviteForm(page)

    await externalIdField(page).fill('4471')
    await submitInvite(page)

    await expect(page.getByText(ENTRY_URL)).toBeVisible()
    expect(captured.entryLinkBodies).toEqual([{ ...REQUIRED_ONLY_BODY, external_id: 4471 }])
  })

  test('an invite with only a Source sends exactly that key', async ({ adminPage: page }) => {
    const captured = await mockAdminApi(page, [row(1, 'Mario Rossi', NO_REFERENCE)])
    await openInviteForm(page)

    await sourceField(page).fill('Acme ATS')
    await submitInvite(page)

    await expect(page.getByText(ENTRY_URL)).toBeVisible()
    expect(captured.entryLinkBodies).toEqual([{ ...REQUIRED_ONLY_BODY, source: 'Acme ATS' }])
  })

  test('values that are only whitespace count as empty and send neither key', async ({
    adminPage: page,
  }) => {
    const captured = await mockAdminApi(page, [row(1, 'Mario Rossi', NO_REFERENCE)])
    await openInviteForm(page)

    await externalIdField(page).fill('   ')
    await sourceField(page).fill('   ')
    await submitInvite(page)

    await expect(page.getByText(ENTRY_URL)).toBeVisible()
    expect(captured.entryLinkBodies).toEqual([REQUIRED_ONLY_BODY])
  })

  test('an invalid External ID is refused in the form, before any request', async ({
    adminPage: page,
  }) => {
    const captured = await mockAdminApi(page, [row(1, 'Mario Rossi', NO_REFERENCE)])
    await openInviteForm(page)

    const externalId = externalIdField(page)
    await externalId.fill('abc')
    await externalId.blur()

    await expect(page.getByText(EXTERNAL_ID_INVALID)).toBeVisible()
    await expect(externalId).toHaveAttribute('aria-invalid', 'true')

    await submitInvite(page)
    await expect(page.getByText(EXTERNAL_ID_INVALID)).toBeVisible()

    // Correct it and submit again: the ONLY request is the corrected one.
    await externalId.fill('4471')
    await submitInvite(page)

    await expect(page.getByText(ENTRY_URL)).toBeVisible()
    expect(captured.entryLinkBodies).toEqual([{ ...REQUIRED_ONLY_BODY, external_id: 4471 }])
  })

  // `0` and below, decimals, signs, exponents, an embedded space and 2^53: every
  // one of them fails validateExternalId, and every one must stop at the form.
  for (const value of ['0', '-1', '1.5', '+5', '1e3', '4 471', '9007199254740992']) {
    test(`an External ID of "${value}" is refused client-side and nothing is sent`, async ({
      adminPage: page,
    }) => {
      const captured = await mockAdminApi(page, [row(1, 'Mario Rossi', NO_REFERENCE)])
      await openInviteForm(page)

      const externalId = externalIdField(page)
      await externalId.fill(value)
      await submitInvite(page)

      await expect(page.getByTestId('entry-link-form-external-id-error')).toHaveText(
        EXTERNAL_ID_INVALID
      )
      await expect(externalId).toHaveAttribute('aria-invalid', 'true')

      await externalId.fill('4471')
      await submitInvite(page)

      await expect(page.getByText(ENTRY_URL)).toBeVisible()
      expect(captured.entryLinkBodies).toEqual([{ ...REQUIRED_ONLY_BODY, external_id: 4471 }])
    })
  }

  // The two ends of the accepted range, and a value padded with spaces that is
  // trimmed before it is parsed.
  const ACCEPTED_IDS: [string, number][] = [
    ['1', 1],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
    ['  12  ', 12],
  ]

  for (const [typed, sent] of ACCEPTED_IDS) {
    test(`an External ID of "${typed}" is accepted and sent as the number ${sent}`, async ({
      adminPage: page,
    }) => {
      const captured = await mockAdminApi(page, [row(1, 'Mario Rossi', NO_REFERENCE)])
      await openInviteForm(page)

      await externalIdField(page).fill(typed)
      await submitInvite(page)

      await expect(page.getByText(ENTRY_URL)).toBeVisible()
      expect(captured.entryLinkBodies).toEqual([{ ...REQUIRED_ONLY_BODY, external_id: sent }])
    })
  }

  test('a Source of 181 characters is refused client-side and nothing is sent', async ({
    adminPage: page,
  }) => {
    const captured = await mockAdminApi(page, [row(1, 'Mario Rossi', NO_REFERENCE)])
    await openInviteForm(page)

    const source = sourceField(page)
    await source.fill('a'.repeat(181))
    await submitInvite(page)

    await expect(page.getByTestId('entry-link-form-source-error')).toHaveText(
      'Inserisci al massimo 180 caratteri.'
    )
    await expect(source).toHaveAttribute('aria-invalid', 'true')

    await source.fill('Acme ATS')
    await submitInvite(page)

    await expect(page.getByText(ENTRY_URL)).toBeVisible()
    expect(captured.entryLinkBodies).toEqual([{ ...REQUIRED_ONLY_BODY, source: 'Acme ATS' }])
  })

  test('a Source of exactly 180 characters is accepted, measured after trimming', async ({
    adminPage: page,
  }) => {
    const captured = await mockAdminApi(page, [row(1, 'Mario Rossi', NO_REFERENCE)])
    await openInviteForm(page)

    // 180 characters plus padding: 184 typed, 180 sent.
    await sourceField(page).fill(`  ${'a'.repeat(180)}  `)
    await submitInvite(page)

    await expect(page.getByText(ENTRY_URL)).toBeVisible()
    expect(captured.entryLinkBodies).toEqual([{ ...REQUIRED_ONLY_BODY, source: 'a'.repeat(180) }])
  })

  test('a server 422 on external_id lands under the External ID field only', async ({
    adminPage: page,
  }) => {
    await mockAdminApi(page, [row(1, 'Mario Rossi', NO_REFERENCE)], {
      entryLinkAnswer: () => ({
        status: 422,
        body: {
          message: 'The external id is invalid.',
          errors: { external_id: ['Questo ID esterno non è accettato.'] },
        },
      }),
    })
    await openInviteForm(page)

    await externalIdField(page).fill('4471')
    await submitInvite(page)

    const error = page.getByTestId('entry-link-form-external-id-error')

    await expect(error).toHaveText('Questo ID esterno non è accettato.')
    await expect(externalIdField(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(externalIdField(page)).toHaveAttribute(
      'aria-describedby',
      'entry-link-form-external-id-error'
    )

    // Not under the sibling field, and the reason is not repeated in a banner.
    await expect(sourceField(page)).toHaveAttribute('aria-invalid', 'false')
    await expect(page.getByTestId('entry-link-form-source-error')).toHaveCount(0)
    await expect(page.getByTestId('entry-link-form-banner')).toHaveCount(0)
    await expect(page.getByText(ENTRY_URL)).toHaveCount(0)
  })

  test('a server 422 on source lands under the Source field only', async ({ adminPage: page }) => {
    await mockAdminApi(page, [row(1, 'Mario Rossi', NO_REFERENCE)], {
      entryLinkAnswer: () => ({
        status: 422,
        body: {
          message: 'The source is invalid.',
          errors: { source: ['Questa origine non è accettata.'] },
        },
      }),
    })
    await openInviteForm(page)

    await sourceField(page).fill('Acme ATS')
    await submitInvite(page)

    await expect(page.getByTestId('entry-link-form-source-error')).toHaveText(
      'Questa origine non è accettata.'
    )
    await expect(sourceField(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(sourceField(page)).toHaveAttribute(
      'aria-describedby',
      'entry-link-form-source-error'
    )

    await expect(externalIdField(page)).toHaveAttribute('aria-invalid', 'false')
    await expect(page.getByTestId('entry-link-form-external-id-error')).toHaveCount(0)
    await expect(page.getByTestId('entry-link-form-banner')).toHaveCount(0)
  })

  test('a server error with no field in it shows the generic banner and no field error', async ({
    adminPage: page,
  }) => {
    await mockAdminApi(page, [row(1, 'Mario Rossi', NO_REFERENCE)], {
      entryLinkAnswer: () => ({ status: 500, body: { message: 'Server Error' } }),
    })
    await openInviteForm(page)

    await externalIdField(page).fill('4471')
    await submitInvite(page)

    await expect(page.getByTestId('entry-link-form-banner')).toContainText(
      'Non è stato possibile generare questo link di accesso.'
    )
    await expect(page.getByTestId('entry-link-form-external-id-error')).toHaveCount(0)
    await expect(page.getByTestId('entry-link-form-source-error')).toHaveCount(0)
  })

  test('the drawer with the fieldset, and with a field error showing, is accessible', async ({
    adminPage: page,
  }) => {
    await mockAdminApi(page, [row(1, 'Mario Rossi', NO_REFERENCE)])
    await openInviteForm(page)

    await expect(page.getByTestId('entry-link-form-external-reference')).toBeVisible()
    await checkA11y(page)

    await externalIdField(page).fill('abc')
    await externalIdField(page).blur()
    await expect(page.getByTestId('entry-link-form-external-id-error')).toBeVisible()
    await checkA11y(page)
  })
})

test.describe('Participants list: external reference sub-line', () => {
  test('each row shows the parts of the reference it has, and a row without one shows nothing', async ({
    adminPage: page,
  }) => {
    await mockAdminApi(page, [
      row(1, 'Mario Rossi', ACME_REFERENCE),
      row(2, 'Giulia Bianchi', ID_ONLY),
      row(3, 'Luca Verdi', SOURCE_ONLY),
      row(4, 'Anna Neri', NO_REFERENCE),
    ])
    await page.goto('/participants')

    // The same test id on every assertion below: a renamed id fails the
    // positive checks first, so the negative one can never pass vacuously.
    const lineOf = (name: RegExp) =>
      page.getByRole('row', { name }).getByTestId('external-reference-value')

    await expect(lineOf(/Mario Rossi/)).toHaveText('Acme ATS · #4471')
    await expect(lineOf(/Giulia Bianchi/)).toHaveText('#4471')
    await expect(lineOf(/Luca Verdi/)).toHaveText('Acme ATS')

    const withoutReference = page.getByRole('row', { name: /Anna Neri/ })

    await expect(withoutReference).toBeVisible()
    await expect(withoutReference.getByTestId('external-reference')).toHaveCount(0)
    await expect(page.getByTestId('external-reference')).toHaveCount(3)
  })

  test('markup in the Source is shown as text in the list, never injected', async ({
    adminPage: page,
  }) => {
    await mockAdminApi(page, [row(1, 'Mario Rossi', { external_id: 7, source: MARKUP })])
    await page.goto('/participants')

    const reference = page
      .getByRole('row', { name: /Mario Rossi/ })
      .getByTestId('external-reference')

    await expect(reference.getByTestId('external-reference-value')).toHaveText(`${MARKUP} · #7`)
    await expect(reference.locator('b, img')).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'injected' })).toHaveCount(0)
  })

  test('searching filters the rows: by source, by exact External ID, and back to all', async ({
    adminPage: page,
  }) => {
    const captured = await mockAdminApi(page, [
      row(1, 'Mario Rossi', ACME_REFERENCE),
      row(2, 'Giulia Bianchi', { external_id: 9001, source: 'Workday' }),
      row(3, 'Luca Verdi', NO_REFERENCE),
    ])
    await page.goto('/participants')

    const mario = page.getByRole('row', { name: /Mario Rossi/ })
    const giulia = page.getByRole('row', { name: /Giulia Bianchi/ })
    const luca = page.getByRole('row', { name: /Luca Verdi/ })

    // Everyone is listed before any search.
    await expect(mario).toBeVisible()
    await expect(giulia).toBeVisible()
    await expect(luca).toBeVisible()

    const search = page.getByLabel('Cerca', { exact: true })

    // By source, case-insensitively.
    await search.fill('ACME')
    await search.press('Enter')
    await expect.poll(() => captured.searchTerms.at(-1)).toBe('ACME')
    await expect(mario).toBeVisible()
    await expect(giulia).toHaveCount(0)
    await expect(luca).toHaveCount(0)

    // By External ID: exact, so a number the id merely CONTAINS finds nothing.
    await search.fill('9001')
    await search.press('Enter')
    await expect.poll(() => captured.searchTerms.at(-1)).toBe('9001')
    await expect(giulia).toBeVisible()
    await expect(mario).toHaveCount(0)

    await search.fill('900')
    await search.press('Enter')
    await expect.poll(() => captured.searchTerms.at(-1)).toBe('900')
    await expect(
      page.getByText('Nessun candidato corrisponde ai filtri selezionati.')
    ).toBeVisible()
    await expect(giulia).toHaveCount(0)

    // Clearing the term sends no `q` at all, and everyone is back.
    await search.fill('')
    await search.press('Enter')
    await expect.poll(() => captured.searchTerms.at(-1)).toBeNull()
    await expect(mario).toBeVisible()
    await expect(giulia).toBeVisible()
    await expect(luca).toBeVisible()
  })

  test('the list with reference sub-lines is accessible', async ({ adminPage: page }) => {
    await mockAdminApi(page, [
      row(1, 'Mario Rossi', ACME_REFERENCE),
      row(2, 'Anna Neri', NO_REFERENCE),
    ])
    await page.goto('/participants')

    await expect(
      page.getByRole('row', { name: /Mario Rossi/ }).getByTestId('external-reference')
    ).toBeVisible()
    await checkA11y(page)
  })
})

test.describe('Participant detail: external reference line and re-issue', () => {
  test('the detail header shows the labelled reference line', async ({ adminPage: page }) => {
    await mockAdminApi(page, [row(1, 'Mario Rossi', ACME_REFERENCE)])
    await page.goto('/participants/1')

    await expect(page.getByRole('heading', { name: 'Mario Rossi' })).toBeVisible()
    await expect(page.getByTestId('external-reference')).toHaveText(
      'ID esterno 4471 · Origine Acme ATS'
    )
  })

  const ONE_PART: [string, Reference, string][] = [
    ['an External ID alone', ID_ONLY, 'ID esterno 4471'],
    ['a Source alone', SOURCE_ONLY, 'Origine Acme ATS'],
  ]

  for (const [name, reference, line] of ONE_PART) {
    test(`the detail header shows ${name} with no separator and no empty label`, async ({
      adminPage: page,
    }) => {
      await mockAdminApi(page, [row(1, 'Mario Rossi', reference)])
      await page.goto('/participants/1')

      await expect(page.getByRole('heading', { name: 'Mario Rossi' })).toBeVisible()
      await expect(page.getByTestId('external-reference')).toHaveText(line)
    })
  }

  test('markup in the Source is shown as text on the detail page, never injected', async ({
    adminPage: page,
  }) => {
    await mockAdminApi(page, [row(1, 'Mario Rossi', { external_id: null, source: MARKUP })])
    await page.goto('/participants/1')

    const reference = page.getByTestId('external-reference')

    await expect(reference.getByTestId('external-reference-value')).toHaveText(`Origine ${MARKUP}`)
    await expect(reference.locator('b, img')).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'injected' })).toHaveCount(0)
  })

  test('a participant without a reference shows no reference line', async ({ adminPage: page }) => {
    // The positive twin of this negative is 'the detail header shows the
    // labelled reference line', which finds the SAME test id: renaming it fails
    // that test first, so this count of zero cannot pass for the wrong reason.
    await mockAdminApi(page, [row(1, 'Mario Rossi', NO_REFERENCE)])
    await page.goto('/participants/1')

    await expect(page.getByRole('heading', { name: 'Mario Rossi' })).toBeVisible()
    await expect(page.getByTestId('external-reference')).toHaveCount(0)
  })

  test('re-issuing a link carries the stored reference through', async ({ adminPage: page }) => {
    const captured = await mockAdminApi(page, [row(1, 'Mario Rossi', ACME_REFERENCE)])
    await page.goto('/participants/1')

    await page.getByRole('button', { name: 'Genera nuovo link' }).click()

    await expect(page.getByText(ENTRY_URL)).toBeVisible()
    expect(captured.entryLinkBodies).toHaveLength(1)
    expect(captured.entryLinkBodies[0]).toMatchObject({
      candidate_ref: 'ref-001',
      external_id: 4471,
      source: 'Acme ATS',
    })
  })

  test('re-issuing a link carries only the half of the reference that is stored', async ({
    adminPage: page,
  }) => {
    const captured = await mockAdminApi(page, [row(1, 'Mario Rossi', ID_ONLY)])
    await page.goto('/participants/1')

    await page.getByRole('button', { name: 'Genera nuovo link' }).click()

    await expect(page.getByText(ENTRY_URL)).toBeVisible()
    expect(captured.entryLinkBodies).toHaveLength(1)
    expect(captured.entryLinkBodies[0]).toMatchObject({ external_id: 4471 })
    expect(Object.keys(captured.entryLinkBodies[0]!)).not.toContain('source')
  })

  test('re-issuing a link for a participant without a reference sends neither key', async ({
    adminPage: page,
  }) => {
    const captured = await mockAdminApi(page, [row(1, 'Mario Rossi', NO_REFERENCE)])
    await page.goto('/participants/1')

    await page.getByRole('button', { name: 'Genera nuovo link' }).click()

    await expect(page.getByText(ENTRY_URL)).toBeVisible()
    expect(captured.entryLinkBodies).toHaveLength(1)
    expect(Object.keys(captured.entryLinkBodies[0]!)).not.toContain('external_id')
    expect(Object.keys(captured.entryLinkBodies[0]!)).not.toContain('source')
  })

  test('the detail page with the reference line is accessible', async ({ adminPage: page }) => {
    await mockAdminApi(page, [row(1, 'Mario Rossi', ACME_REFERENCE)])
    await page.goto('/participants/1')

    await expect(page.getByTestId('external-reference')).toBeVisible()
    await checkA11y(page)
  })
})
