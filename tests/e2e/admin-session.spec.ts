import { abilitiesFor } from './fixtures/abilities'
import { expect, mockProjectsApi, projectResource, test } from './fixtures/admin-session'

/**
 * The shared admin-session fixture, tested on its own (`fixtures/admin-session.ts`).
 *
 * A fixture that silently stops doing its job makes every spec built on it pass
 * for the wrong reason: a banner that is no longer dismissed, a role that is no
 * longer applied. These tests are the fixture's own proof, and each of them has a
 * CONTROL: the thing the fixture suppresses is shown to appear when the fixture's
 * seed is taken away again, so "it is absent" can only mean the seed worked.
 *
 * Specs migrated so far: entry-link, external-reference, reusable-link.
 */

const PROJECT = projectResource()

const CONSENT_KEY = 'beai.consent.analytics'
const TOUR_KEY = 'beai.onboarding.tour-seen.1'

test.describe('Admin session fixture', () => {
  test('signs the page in without the login form', async ({ adminPage: page }) => {
    await mockProjectsApi(page, [PROJECT])

    await page.goto('/projects')

    await expect(page).toHaveURL('/projects')
    await expect(page.getByRole('heading', { name: 'Progetti', level: 1 })).toBeVisible()
    await expect(page.getByRole('row', { name: /Active Project/ })).toBeVisible()
  })

  test('answers the analytics banner before the page loads', async ({ adminPage: page }) => {
    await mockProjectsApi(page, [PROJECT])
    await page.goto('/projects')

    // The page has rendered its data, so anything that mounts with the shell has.
    await expect(page.getByRole('row', { name: /Active Project/ })).toBeVisible()
    await expect(page.getByTestId('analytics-consent')).toHaveCount(0)
  })

  test('CONTROL: without the seed the analytics banner does appear on this page', async ({
    adminPage: page,
  }) => {
    // Runs after the fixture's own init script, so the answer is taken back.
    await page.addInitScript((key) => window.localStorage.removeItem(key), CONSENT_KEY)
    await mockProjectsApi(page, [PROJECT])
    await page.goto('/projects')

    await expect(page.getByTestId('analytics-consent')).toBeVisible()
  })

  test('marks the first-login tour as seen', async ({ adminPage: page }) => {
    await mockProjectsApi(page, [PROJECT])
    await page.goto('/projects')

    await expect(page.getByRole('row', { name: /Active Project/ })).toBeVisible()
    await expect(page.getByTestId('onboarding-tour-skip')).toHaveCount(0)
  })

  test('CONTROL: without the seed the first-login tour does open on this page', async ({
    adminPage: page,
  }) => {
    await page.addInitScript((key) => window.localStorage.removeItem(key), TOUR_KEY)
    await mockProjectsApi(page, [PROJECT])
    await page.goto('/projects')

    await expect(page.getByTestId('onboarding-tour-skip')).toBeVisible()
  })

  test('an operator is offered Invite and Edit', async ({ adminPage: page }) => {
    await mockProjectsApi(page, [PROJECT])
    await page.goto('/projects')

    const row = page.getByRole('row', { name: /Active Project/ })

    await expect(row.getByRole('button', { name: 'Invita candidato' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Modifica' })).toBeVisible()
  })
})

test.describe('Admin session fixture: a viewer', () => {
  test.use({ role: 'viewer' })

  test('is offered neither Invite nor Edit', async ({ adminPage: page }) => {
    await mockProjectsApi(page, [PROJECT])
    await page.goto('/projects')

    await expect(page.getByRole('row', { name: /Active Project/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Invita candidato' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Modifica' })).toHaveCount(0)
  })
})

const OPERATOR_ABILITIES = abilitiesFor(['operator'])

test.describe('Admin session fixture: an ability override', () => {
  test.use({
    abilities: {
      ...OPERATOR_ABILITIES,
      projects: { ...OPERATOR_ABILITIES.projects, update: false },
    },
  })

  test('replaces the role-derived map: Invite stays, Edit goes', async ({ adminPage: page }) => {
    await mockProjectsApi(page, [PROJECT])
    await page.goto('/projects')

    const row = page.getByRole('row', { name: /Active Project/ })

    await expect(row.getByRole('button', { name: 'Invita candidato' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Modifica' })).toHaveCount(0)
  })
})
