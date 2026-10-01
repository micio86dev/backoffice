import type { Page } from '@playwright/test'
import {
  expect,
  isDataRequest,
  jsonRoute,
  mockParticipantsApi,
  mockProjectsApi,
  participantDetail,
  participantResource,
  projectResource,
  test,
} from './fixtures/admin-session'

/**
 * Entry link mint, end to end (operator-interview-link, design D4).
 *
 * Mirrors `projects-crud.spec.ts`'s network-interception convention: no live
 * backend, API calls intercepted at the network layer with fixtures shaped
 * exactly like the real resources (typed from the generated client in
 * `fixtures/admin-session.ts`). Role-based locators ONLY (getByRole/getByLabel),
 * per this project's E2E convention.
 *
 * The session is the shared `adminPage` fixture: signed in through the mocked
 * boot refresh rather than by typing credentials, so each test starts on the
 * page it is about. (An earlier header here described the sign-in helper as
 * timing out on `getByLabel('Email')` against an unmodified checkout. That was
 * true once and has not been for a long time: this file ran green through that
 * helper, which is why the claim was removed rather than carried along. Sign-in
 * itself is covered by `admin-flow.spec.ts`.)
 */

const PROJECT = projectResource()
const PARTICIPANT = participantResource()

async function mockEntryLinkMint(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/entry-links',
    (route) =>
      jsonRoute(
        route,
        {
          entry_url: 'https://interview.example.com/interview/e2e-token',
          expires_at: '2026-08-17T15:32:00.000000Z',
        },
        201
      )
  )
}

test.describe('Entry link mint (operator-interview-link)', () => {
  test('an operator mints an entry link from a project row; disclosure is visible before copy', async ({
    adminPage: page,
  }) => {
    await mockProjectsApi(page, [PROJECT])
    await mockEntryLinkMint(page)

    await page.goto('/projects')

    await page
      .getByRole('row', { name: /Active Project/ })
      .getByRole('button', { name: 'Invita candidato' })
      .click()

    await page.getByLabel('Riferimento candidato').fill('e2e-candidate')
    await page.getByLabel('Nome visualizzato').fill('E2E Candidate')
    // Required now, and it is the candidate's IDENTITY as well as their
    // address: the same address invited to another project, or by another
    // organization, is the same person.
    await page.getByTestId('entry-link-form-email').fill('e2e-candidate@example.test')
    await page.getByRole('button', { name: 'Genera link' }).click()

    // Disclosure (single-use + expiry) MUST be visible before the Copy
    // control — admin-backoffice spec, "Single-Use and Expiry Are Disclosed
    // Before the Copy". Both render together once the mint succeeds; the
    // assertion order below mirrors the DOM order the component enforces
    // (EntryLinkPanel.spec.ts covers the DOM-order guarantee directly).
    await expect(page.getByText(/monouso/)).toBeVisible()
    await expect(page.getByText('https://interview.example.com/interview/e2e-token')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copia' })).toBeVisible()
  })
})

// operator-interview-link, design D4 — surface A: re-issue from the
// participant detail page, pre-filled from the participant row.
test.describe('Entry link re-issue (participant detail)', () => {
  test('an operator generates a new link for an existing participant; disclosure is visible before copy', async ({
    adminPage: page,
  }) => {
    await mockParticipantsApi(page, [PARTICIPANT])
    await mockEntryLinkMint(page)

    await page.goto('/participants')
    await page.getByRole('link', { name: 'Mario Rossi' }).click()
    await expect(page).toHaveURL('/participants/1')

    await page.getByRole('button', { name: 'Genera nuovo link' }).click()

    await expect(page.getByText(/monouso/)).toBeVisible()
    await expect(page.getByText('https://interview.example.com/interview/e2e-token')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copia' })).toBeVisible()
  })

  test('a draft project disables the re-issue action with a stated reason', async ({
    adminPage: page,
  }) => {
    await mockParticipantsApi(page, [PARTICIPANT])
    // Override AFTER the shared mock — last-registered route wins.
    await page.route(
      (url) => url.pathname === '/participants/1',
      (route) =>
        isDataRequest(route)
          ? jsonRoute(route, {
              data: participantDetail(PARTICIPANT, {
                project: { ...participantDetail(PARTICIPANT).project, status: 'draft' },
              }),
            })
          : route.continue()
    )

    await page.goto('/participants/1')

    const button = page.getByRole('button', { name: 'Genera nuovo link' })
    await expect(button).toBeDisabled()
    await expect(page.getByText('Questo progetto non è ancora attivo.')).toBeVisible()
  })
})
