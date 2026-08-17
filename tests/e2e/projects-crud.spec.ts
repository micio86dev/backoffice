import { test, expect, type Route } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'

/**
 * Projects CRUD (Unit 2b, task 20.8/22.1): create -> edit (immutable fields
 * verifiably disabled on an active project) -> archive flow.
 *
 * Mirrors `admin-flow.spec.ts`'s network-interception convention: no live
 * backend in this environment, API calls intercepted at the network layer
 * with fixtures shaped exactly like the real `ProjectResource`. Role-based
 * locators ONLY (getByRole/getByLabel), per this project's E2E convention.
 *
 * KNOWN PRE-EXISTING BLOCKER (confirmed unrelated to this change): the
 * `login()` helper below is copied from `admin-flow.spec.ts`, which times
 * out on `getByLabel('Email')` on an unmodified `develop` checkout — verified
 * by `git stash` + rerun during PR 1b (see tasks.md task 4.3). This spec
 * inherits that same blocker and could not be run to completion in this
 * environment; it is written to the same standard as the rest of the suite
 * so it is ready the moment the login blocker is fixed.
 */

const DRAFT_PROJECT = {
  id: 1,
  organization_id: 1,
  framework_version_id: 3,
  slug: 'draft-project',
  name: 'Draft Project',
  assessment_type: 'standard',
  role_code: 'FLL',
  language: 'en',
  status: 'draft',
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
  competencies: [],
}

const ACTIVE_PROJECT = {
  ...DRAFT_PROJECT,
  id: 2,
  slug: 'active-project',
  name: 'Active Project',
  status: 'active',
}

// bars-coverage-visibility Phase 4 D7 — a project that already holds a
// competency with no BARS anchors for its role. Draft, so the edit form is
// not locked and the remediation path (uncheck, save) is reachable.
const UNCOVERED_PROJECT = {
  ...DRAFT_PROJECT,
  id: 3,
  slug: 'uncovered-project',
  name: 'Uncovered Project',
  status: 'draft',
  competencies: [{ id: 3, code: 'JDG', type: 'standard', position: 0 }],
}

// Mixed bars_available (bars-coverage-visibility) — reused by mockAdminApi's
// default `/framework/roles/*/competencies` route below AND by the
// uncovered-competency test, which re-registers the same route (last
// registered wins) purely to document why JDG is the fixture's uncovered one.
const MIXED_COVERAGE_COMPETENCIES = [
  { id: 1, code: 'PRS', name: 'Problem Solving', type: 'standard', bars_available: true },
  { id: 2, code: 'COM', name: 'Communication', type: 'standard', bars_available: true },
  { id: 3, code: 'JDG', name: 'Judgement', type: 'standard', bars_available: false },
]

async function jsonRoute(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

function isDataRequest(route: Route): boolean {
  return route.request().resourceType() !== 'document'
}

async function mockAdminApi(page: import('@playwright/test').Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/auth/login',
    (route) =>
      jsonRoute(route, {
        access_token: 'e2e-access-token',
        refresh_token: 'e2e-refresh',
        token_type: 'bearer',
      })
  )
  // Stateful on purpose. A POST that returns 201 while every subsequent GET
  // keeps returning the ORIGINAL list makes "the new project appears in the
  // table" unprovable — the assertion could only ever fail, no matter how
  // correct the page was. Persisting the created row here is what turns this
  // into a real test of the create-then-refetch round trip.
  const created: Record<string, unknown>[] = []

  await page.route(
    (url) => url.pathname === '/projects',
    (route) => {
      if (!isDataRequest(route)) return route.continue()
      if (route.request().method() === 'POST') {
        const project = { ...DRAFT_PROJECT, id: 9, name: 'New E2E Project' }
        created.push(project)

        return jsonRoute(route, { data: project }, 201)
      }

      return jsonRoute(route, {
        data: [DRAFT_PROJECT, ACTIVE_PROJECT, UNCOVERED_PROJECT, ...created],
      })
    }
  )
  await page.route(
    (url) => /^\/projects\/\d+$/.test(url.pathname),
    (route) => jsonRoute(route, { data: { ...ACTIVE_PROJECT, status: 'archived' } })
  )

  // A `standard` project requires a role AND at least one competency assigned
  // to it — enforced by StoreProjectRequest's cross-field rules and mirrored in
  // the form. Without this mock the competency picker renders "no competencies
  // available", so the form can never be completed and the create test can only
  // ever fail on validation rather than on the behaviour it means to cover.
  //
  // MIXED coverage (bars-coverage-visibility): JDG carries bars_available:
  // false so the picker's disable-for-selection rule has something real to
  // exercise across every test that shares this default mock.
  await page.route(
    (url) => /^\/framework\/roles\/[A-Z]+\/competencies$/.test(url.pathname),
    (route) => {
      if (!isDataRequest(route)) return route.continue()

      return jsonRoute(route, { data: MIXED_COVERAGE_COMPETENCIES })
    }
  )
}

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('secret-password')
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page).toHaveURL('/')
}

test.describe('Projects CRUD (Unit 2b)', () => {
  test('an admin can open the create form and submit a new project', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)

    await page.getByRole('link', { name: 'Progetti' }).click()
    await expect(page).toHaveURL('/projects')

    await page.getByRole('button', { name: 'Nuovo progetto' }).click()
    await page.getByLabel('Nome').fill('New E2E Project')
    await page.getByLabel('Slug').fill('new-e2e-project')

    // A standard assessment needs a role and at least one competency. Filling
    // only name and slug used to leave the form correctly refusing to submit —
    // the test was driving an invalid form and blaming the page for it.
    await page.getByRole('combobox', { name: 'Ruolo' }).click()
    await page.getByRole('option', { name: 'Contributore individuale' }).click()
    await page.getByLabel('Problem Solving').check()

    await page.getByRole('button', { name: 'Salva' }).click()

    await expect(page.getByText('New E2E Project')).toBeVisible()
  })

  test('editing an active project disables its immutable fields', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)
    await page.goto('/projects')

    await page
      .getByRole('row', { name: /Active Project/ })
      .getByRole('button', { name: 'Modifica' })
      .click()

    await expect(page.getByLabel('Versione del framework')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Standard' })).toBeDisabled()
  })

  // dates-and-destructive-actions, design.md D7 — archive no longer fires on
  // the first click; cancelling the confirmation leaves the project
  // untouched (no PATCH sent, status stays active).
  test('cancelling the archive confirmation leaves the project active', async ({ page }) => {
    await mockAdminApi(page)

    let patchCount = 0
    // Registered AFTER mockAdminApi — Playwright tries the LAST-registered
    // matching route first, so this override (which counts PATCH calls)
    // wins over mockAdminApi's own /projects/:id route for this test.
    await page.route(
      (url) => /^\/projects\/\d+$/.test(url.pathname),
      (route) => {
        if (route.request().method() === 'PATCH') patchCount += 1
        return jsonRoute(route, { data: { ...ACTIVE_PROJECT, status: 'archived' } })
      }
    )
    await login(page)
    await page.goto('/projects')

    await page
      .getByRole('row', { name: /Active Project/ })
      .getByRole('button', { name: 'Modifica' })
      .click()

    await page.getByRole('button', { name: 'Archivia' }).click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Annulla' })).toBeVisible()

    await dialog.getByRole('button', { name: 'Annulla' }).click()
    await expect(dialog).toBeHidden()

    expect(patchCount).toBe(0)

    // The edit dialog is still open (cancelling the ARCHIVE confirmation
    // only closes that nested dialog) — the archive trigger is still
    // offered, which is only true if the project is still active.
    await expect(page.getByRole('button', { name: 'Archivia' })).toBeVisible()

    // Closing the edit dialog and returning to the list, the row still
    // reads its ORIGINAL status — cancelling touched nothing.
    await page.keyboard.press('Escape')
    await expect(page.getByRole('row', { name: /Active Project/ })).toBeVisible()
  })

  // bars-coverage-visibility Phase 4 D7 — disable-for-selection, never for
  // deselection, end to end: create refuses an uncovered competency; the
  // edit form for a project that already holds one lets the operator see it
  // and remove it; reopening confirms it is gone.
  test('an uncovered competency is disabled on create, and can be removed from an existing project via the edit form', async ({
    page,
  }) => {
    await mockAdminApi(page)

    // Stateful PATCH/GET so "reopen -> gone" is provable — mirrors the
    // create test's stateful POST above, applied to the edit path instead.
    let patchedCompetencies: Array<{
      id: number
      code: string
      type: string
      position: number
    }> | null = null
    await page.route(
      (url) => /^\/projects\/\d+$/.test(url.pathname),
      (route) => {
        if (route.request().method() !== 'PATCH') return route.continue()
        const body = route.request().postDataJSON() as { competency_ids?: number[] }
        const ids = body.competency_ids ?? []
        patchedCompetencies = MIXED_COVERAGE_COMPETENCIES.filter((c) => ids.includes(c.id)).map(
          (c, position) => ({ id: c.id, code: c.code, type: c.type, position })
        )
        return jsonRoute(route, {
          data: { ...UNCOVERED_PROJECT, competencies: patchedCompetencies },
        })
      }
    )
    await page.route(
      (url) => url.pathname === '/projects',
      (route) => {
        if (!isDataRequest(route)) return route.continue()
        if (route.request().method() === 'POST') return route.continue()
        const current = patchedCompetencies
          ? { ...UNCOVERED_PROJECT, competencies: patchedCompetencies }
          : UNCOVERED_PROJECT
        return jsonRoute(route, { data: [DRAFT_PROJECT, ACTIVE_PROJECT, current] })
      }
    )

    await login(page)
    await page.getByRole('link', { name: 'Progetti' }).click()
    await expect(page).toHaveURL('/projects')

    // CREATE: an uncovered competency (Judgement, bars_available: false)
    // cannot be newly selected.
    await page.getByRole('button', { name: 'Nuovo progetto' }).click()
    await page.getByRole('combobox', { name: 'Ruolo' }).click()
    await page.getByRole('option', { name: 'Contributore individuale' }).click()
    await expect(page.getByLabel('Judgement')).toBeDisabled()
    await page.keyboard.press('Escape')

    // EDIT: the already-attached uncovered competency renders checked AND
    // enabled — the edit form is the remediation path, not a second trap.
    await page
      .getByRole('row', { name: /Uncovered Project/ })
      .getByRole('button', { name: 'Modifica' })
      .click()
    const judgementCheckbox = page.getByLabel('Judgement')
    await expect(judgementCheckbox).toBeChecked()
    await expect(judgementCheckbox).toBeEnabled()

    await judgementCheckbox.uncheck()
    await page.getByRole('button', { name: 'Salva' }).click()

    // REOPEN: it is gone.
    await page
      .getByRole('row', { name: /Uncovered Project/ })
      .getByRole('button', { name: 'Modifica' })
      .click()
    await expect(page.getByLabel('Judgement')).not.toBeChecked()
  })

  test('the projects list is WCAG 2.1 AA clean', async ({ page }) => {
    await mockAdminApi(page)
    await login(page)
    await page.goto('/projects')
    await expect(page.getByText('Draft Project')).toBeVisible()

    await checkA11y(page)
  })
})
