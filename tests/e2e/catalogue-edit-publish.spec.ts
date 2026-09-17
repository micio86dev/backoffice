import { test, expect, type Route, type Page } from '@playwright/test'
import { abilitiesFor } from './fixtures/abilities'

/**
 * `/catalogue` — the platform-superadmin authoring surface over the
 * framework catalogue (framework-catalogue-authoring PR10/PR10b/PR10c,
 * DESIGN.md §8.2.10, PR12 task 43.1).
 *
 * Uses the `injectSession` + `/auth/me` mock pattern from
 * `sidebar-navigation.spec.ts`/`clients.spec.ts`, not the `login()` helper
 * `projects-crud.spec.ts` documents as pre-existing-broken in this
 * environment: `injectSession` mocks the boot plugin's own
 * `POST /auth/refresh` before the app boots, which is the path that
 * actually populates `useAuth`'s memory-only session on a fresh load.
 *
 * A superadmin holds no Spatie role (`roles: []`) — `is_superadmin` alone
 * carries the identity, same as `clients.spec.ts`'s own first superadmin
 * mock in this suite.
 *
 * `reka-ui`'s `Tabs` mounts panels LAZILY — only the active section's panel
 * ever fetches — so each test below only mocks the endpoints the section it
 * actually visits calls. `defaultQuestions` is the page's own default
 * active section (`pages/catalogue/index.vue`), so its two endpoints
 * (`/catalogue/competencies`, `/catalogue/default-questions`) are mocked in
 * every test regardless of which section the test itself is about.
 */

function isDataRequest(route: Route): boolean {
  return route.request().resourceType() !== 'document'
}

/** The trailing numeric id segment of a REST path, e.g. `.../competencies/11` → `11`. */
function idFromPath(route: Route): number {
  const segments = new URL(route.request().url()).pathname.split('/')
  return Number(segments[segments.length - 1])
}

function jsonRoute(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

/**
 * The analytics consent banner is fixed to the bottom of the viewport and
 * intercepts clicks on anything underneath it — same fixture dismissal as
 * `profile.spec.ts`/`reports-index.spec.ts`. Every test below interacts with
 * controls at the bottom of the section rail, so this is called
 * unconditionally after every `page.goto('/catalogue')`.
 */
async function dismissConsent(page: Page): Promise<void> {
  await page.getByTestId('analytics-consent-reject').click()
  await expect(page.getByTestId('analytics-consent')).toBeHidden()
}

async function injectSession(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/auth/refresh',
    (route) => jsonRoute(route, { access_token: 'e2e-catalogue-token', token_type: 'bearer' })
  )
}

async function mockSuperadmin(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/auth/me',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            user: {
              id: 1,
              name: 'Root',
              email: 'root@example.com',
              locale: 'it',
              photo_url: null,
              is_superadmin: true,
            },
            organization: null,
            roles: [],
            abilities: abilitiesFor({ roles: [], isSuperadmin: true }),
          })
        : route.continue()
  )
}

async function mockOrgAdmin(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/auth/me',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            user: {
              id: 2,
              name: 'Ada Lovelace',
              email: 'ada@example.com',
              locale: 'it',
              photo_url: null,
              is_superadmin: false,
            },
            organization: { id: 1, name: 'Acme' },
            roles: ['admin'],
            abilities: abilitiesFor(['admin']),
          })
        : route.continue()
  )
}

function revision(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    state: 'published',
    is_baseline: true,
    label: null,
    published_at: '2026-01-01T00:00:00Z',
    parent_revision_id: null,
    ...overrides,
  }
}

const DRAFT_REVISION = revision({
  id: 2,
  state: 'draft',
  is_baseline: false,
  label: 'September revision',
  published_at: null,
  parent_revision_id: 1,
})

/** A mutable box, same pattern as `clients.spec.ts`'s `actingOrganizationId` — flips BETWEEN requests without re-registering the route. */
function mockRevision(page: Page, box: { value: Record<string, unknown> | null }): Promise<void> {
  return page.route(
    (url) => url.pathname === '/catalogue/revisions/current',
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: box.value }) : route.continue())
  )
}

function mockCompetencies(page: Page, data: Record<string, unknown>[] = []): Promise<void> {
  return page.route(
    (url) => url.pathname === '/catalogue/competencies',
    (route) =>
      isDataRequest(route) && route.request().method() === 'GET'
        ? jsonRoute(route, { data })
        : route.continue()
  )
}

function mockDefaultQuestions(page: Page, data: Record<string, unknown>[] = []): Promise<void> {
  return page.route(
    (url) => url.pathname === '/catalogue/default-questions',
    (route) =>
      isDataRequest(route) && route.request().method() === 'GET'
        ? jsonRoute(route, { data })
        : route.continue()
  )
}

test.describe('Catalogue — reachability and the security half', () => {
  test('a superadmin sees the Catalogue nav entry and it opens the catalogue page', async ({
    page,
  }) => {
    await injectSession(page)
    await mockSuperadmin(page)
    await mockRevision(page, { value: revision() })
    await mockCompetencies(page)
    await mockDefaultQuestions(page)

    await page.goto('/catalogue')
    await dismissConsent(page)

    const nav = page.getByRole('navigation', { name: 'Navigazione principale' })
    await expect(nav.getByRole('link', { name: 'Catalogo' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Catalogo', level: 1 })).toBeVisible()
    await expect(page.getByTestId('catalogue-revision-header')).toBeVisible()
  })

  // The security half — an org admin has every TENANT ability there is and
  // must still be refused this PLATFORM-scope page (`catalogue.manage` is
  // keyed off `is_superadmin`, never a Spatie role — D12).
  test('an org admin has no Catalogue nav entry and is redirected away from /catalogue', async ({
    page,
  }) => {
    await injectSession(page)
    await mockOrgAdmin(page)
    // Defense in depth: if the client-side route guard were ever raced, the
    // endpoint itself must still refuse.
    await page.route(
      (url) => url.pathname === '/catalogue/revisions/current',
      (route) => jsonRoute(route, { message: 'Forbidden' }, 403)
    )

    await page.goto('/catalogue')
    await dismissConsent(page)

    await expect(page).toHaveURL('/')
    const nav = page.getByRole('navigation', { name: 'Navigazione principale' })
    await expect(nav.getByRole('link', { name: 'Catalogo' })).toHaveCount(0)
  })
})

test.describe('Catalogue — default questions can auto-open a draft', () => {
  test('editing a default question opens a draft and the revision header shows it', async ({
    page,
  }) => {
    // A default-question write can be the FIRST catalogue write on the
    // platform, which auto-opens a draft server-side (PR3's
    // `OpenDraftRevision`, via `DefaultQuestionController::update()`'s own
    // `ResolvesOpenDraftRevision` trait) — the page's own revision header
    // must resync to show it (the fix this PR12 slice exercises end to end:
    // `CatalogueDefaultQuestionsPanel` now emits `refresh-revision`).
    const revisionBox: { value: Record<string, unknown> | null } = { value: revision() }

    await injectSession(page)
    await mockSuperadmin(page)
    await mockRevision(page, revisionBox)
    await mockCompetencies(page, [
      { id: 11, code: 'COL', revision_id: 1, type: 'standard', name: {}, definition: {} },
    ])
    await mockDefaultQuestions(page, [
      {
        id: 201,
        revision_id: 1,
        competency_id: 11,
        position: 0,
        text: { en: 'Existing default question.', it: 'Domanda predefinita esistente.' },
      },
    ])
    await page.route(
      (url) => url.pathname === '/catalogue/default-questions/201',
      (route) => {
        if (route.request().method() !== 'PATCH') return route.continue()
        // The write that opens the draft — the server flips the platform's
        // current revision, which the NEXT `/catalogue/revisions/current`
        // fetch (triggered by the panel's own `refresh-revision` emit) picks up.
        revisionBox.value = DRAFT_REVISION
        return jsonRoute(route, {
          data: {
            id: 201,
            revision_id: 2,
            competency_id: 11,
            position: 0,
            text: { en: 'Edited default question.', it: 'Domanda predefinita esistente.' },
          },
        })
      }
    )

    await page.goto('/catalogue')
    await dismissConsent(page)

    await expect(page.getByTestId('catalogue-revision-state')).toContainText('Pubblicata')

    await page.getByTestId('question-edit-201').click()
    await page.getByTestId('question-text-en').fill('Edited default question.')
    await page.getByTestId('question-save').click()

    await expect(page.getByTestId('catalogue-revision-state')).toContainText('Bozza')
  })
})

test.describe('Catalogue — competency CRUD, behind ConfirmDialog for delete', () => {
  test('creates, edits and deletes a competency', async ({ page }) => {
    const competencies = [
      {
        id: 11,
        code: 'COL',
        revision_id: 2,
        type: 'standard',
        name: { en: 'Collaboration' },
        definition: { en: 'Works well with others.' },
      },
      {
        id: 22,
        code: 'STG',
        revision_id: 2,
        type: 'standard',
        name: { en: 'Strategy' },
        definition: { en: 'Thinks ahead.' },
      },
    ]

    await injectSession(page)
    await mockSuperadmin(page)
    await mockRevision(page, { value: DRAFT_REVISION })
    await mockDefaultQuestions(page)
    await page.route(
      (url) => url.pathname === '/catalogue/competencies',
      (route) => {
        if (!isDataRequest(route)) return route.continue()
        if (route.request().method() === 'POST') {
          const created = {
            id: 33,
            code: 'INN',
            revision_id: 2,
            type: 'standard',
            name: { en: 'Innovation' },
            definition: { en: 'Brings new ideas.' },
          }
          competencies.push(created)
          return jsonRoute(route, { data: created }, 201)
        }
        return jsonRoute(route, { data: competencies })
      }
    )
    await page.route(
      (url) => /^\/catalogue\/competencies\/\d+$/.test(url.pathname),
      (route) => {
        const id = idFromPath(route)
        if (route.request().method() === 'PATCH') {
          const target = competencies.find((c) => c.id === id)
          if (target) target.name = { en: 'Collaboration (updated)' }
          return jsonRoute(route, { data: target })
        }
        if (route.request().method() === 'DELETE') {
          const index = competencies.findIndex((c) => c.id === id)
          if (index !== -1) competencies.splice(index, 1)
          return route.fulfill({ status: 204 })
        }
        return route.continue()
      }
    )

    await page.goto('/catalogue')
    await dismissConsent(page)
    await page.getByRole('tab', { name: /^Competenze/ }).click()

    await expect(page.getByTestId('competency-edit-11')).toBeVisible()

    // CREATE
    await page.getByTestId('competencies-new').click()
    await page.getByTestId('competency-form-code').fill('INN')
    await page.getByTestId('competency-form-name-en').fill('Innovation')
    await page.getByTestId('competency-form-definition-en').fill('Brings new ideas.')
    await page.getByTestId('form-drawer-save').click()
    await expect(page.getByTestId('competency-edit-33')).toBeVisible()

    // EDIT
    await page.getByTestId('competency-edit-11').click()
    await page.getByTestId('competency-form-name-en').fill('Collaboration (updated)')
    await page.getByTestId('form-drawer-save').click()
    await expect(page.getByText('Collaboration (updated)')).toBeVisible()

    // DELETE — behind ConfirmDialog, never on the first click
    await page.getByTestId('competency-delete-22').click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByTestId('confirm-dialog-confirm').click()
    await expect(page.getByTestId('competency-edit-22')).toHaveCount(0)
  })
})

test.describe('Catalogue — role competency assignment, detach behind ConfirmDialog', () => {
  test('detaching an assigned competency from a role requires confirmation', async ({ page }) => {
    const roles = [
      {
        id: 1,
        code: 'ICO',
        revision_id: 2,
        name: { en: 'Individual Contributor' },
        responsibilities: { en: 'Individual work.' },
        competency_ids: [11],
      },
    ]
    const competencies = [
      {
        id: 11,
        code: 'COL',
        revision_id: 2,
        type: 'standard',
        name: { en: 'Collaboration' },
        definition: {},
      },
    ]

    await injectSession(page)
    await mockSuperadmin(page)
    await mockRevision(page, { value: DRAFT_REVISION })
    await mockDefaultQuestions(page)
    await mockCompetencies(page, competencies)
    await page.route(
      (url) => url.pathname === '/catalogue/roles',
      (route) => (isDataRequest(route) ? jsonRoute(route, { data: roles }) : route.continue())
    )

    let putPayload: { competency_ids: number[] } | null = null
    await page.route(
      (url) => url.pathname === '/catalogue/roles/1/competencies',
      (route) => {
        putPayload = route.request().postDataJSON() as { competency_ids: number[] }
        const target = roles[0]
        if (target) target.competency_ids = putPayload.competency_ids
        return jsonRoute(route, { data: target })
      }
    )

    await page.goto('/catalogue')
    await dismissConsent(page)
    await page.getByRole('tab', { name: /^Ruoli/ }).click()

    await page.getByTestId('role-competencies-1').click()
    await expect(page.getByTestId('role-competency-row-11')).toBeVisible()

    await page.getByTestId('role-competency-remove-11').click()
    await page.getByTestId('form-drawer-save').click()

    // A save that would DETACH an already-assigned competency is confirmed —
    // adding/reordering never gates behind this dialog (RoleCompetenciesForm
    // own doctrine).
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByTestId('confirm-dialog-confirm').click()

    await expect.poll(() => putPayload).toEqual({ competency_ids: [] })
    // The drawer closes once the save succeeds.
    await expect(page.getByTestId('role-competencies-form')).toHaveCount(0)
  })
})

test.describe('Catalogue — BARS indicator create', () => {
  test('creates an indicator for a competency/role pair', async ({ page }) => {
    const indicators: Record<string, unknown>[] = [
      {
        id: 101,
        revision_id: 2,
        role_id: 1,
        competency_id: 11,
        position: 0,
        text: { en: 'First indicator' },
        anchor_5: { en: 'A5' },
        anchor_3: { en: 'A3' },
        anchor_1: { en: 'A1' },
      },
    ]
    const competencies = [
      { id: 11, code: 'COL', revision_id: 2, type: 'standard', name: {}, definition: {} },
    ]
    const roles = [
      { id: 1, code: 'ICO', revision_id: 2, name: {}, responsibilities: {}, competency_ids: [11] },
    ]

    await injectSession(page)
    await mockSuperadmin(page)
    await mockRevision(page, { value: DRAFT_REVISION })
    await mockDefaultQuestions(page)
    await mockCompetencies(page, competencies)
    await page.route(
      (url) => url.pathname === '/catalogue/roles',
      (route) => (isDataRequest(route) ? jsonRoute(route, { data: roles }) : route.continue())
    )
    await page.route(
      (url) => url.pathname === '/catalogue/bars-indicators',
      (route) => {
        if (!isDataRequest(route)) return route.continue()
        if (route.request().method() === 'POST') {
          const payload = route.request().postDataJSON()
          const created = { id: 102, revision_id: 2, ...payload }
          indicators.push(created)
          return jsonRoute(route, { data: created }, 201)
        }
        return jsonRoute(route, { data: indicators })
      }
    )

    await page.goto('/catalogue')
    await dismissConsent(page)
    await page.getByRole('tab', { name: /^Indicatori/ }).click()

    await page.getByTestId('indicators-new').click()
    await page.getByRole('combobox', { name: 'Competenza' }).click()
    await page.getByRole('option', { name: 'COL' }).click()
    await page.getByRole('combobox', { name: 'Ruolo' }).click()
    await page.getByRole('option', { name: 'ICO', exact: true }).click()
    await page.getByTestId('bars-indicator-form-text-en').fill('Second indicator')
    await page.getByTestId('bars-indicator-form-anchor5-en').fill('A5 new')
    await page.getByTestId('bars-indicator-form-anchor3-en').fill('A3 new')
    await page.getByTestId('bars-indicator-form-anchor1-en').fill('A1 new')
    await page.getByTestId('form-drawer-save').click()

    await expect(page.getByText('Second indicator')).toBeVisible()
  })
})

test.describe('Catalogue — publish', () => {
  test('publishing succeeds and the revision is frozen — a subsequent edit is refused', async ({
    page,
  }) => {
    const revisionBox: { value: Record<string, unknown> | null } = { value: DRAFT_REVISION }
    const indicators = [
      {
        id: 101,
        revision_id: 2,
        role_id: 1,
        competency_id: 11,
        position: 0,
        text: { en: 'First indicator' },
        anchor_5: { en: 'Original A5' },
        anchor_3: { en: 'A3' },
        anchor_1: { en: 'A1' },
      },
    ]
    const competencies = [
      { id: 11, code: 'COL', revision_id: 2, type: 'standard', name: {}, definition: {} },
    ]
    const roles = [
      { id: 1, code: 'ICO', revision_id: 2, name: {}, responsibilities: {}, competency_ids: [11] },
    ]

    await injectSession(page)
    await mockSuperadmin(page)
    await mockRevision(page, revisionBox)
    await mockDefaultQuestions(page)
    await mockCompetencies(page, competencies)
    await page.route(
      (url) => url.pathname === '/catalogue/roles',
      (route) => (isDataRequest(route) ? jsonRoute(route, { data: roles }) : route.continue())
    )
    await page.route(
      (url) => url.pathname === '/catalogue/bars-indicators',
      (route) => (isDataRequest(route) ? jsonRoute(route, { data: indicators }) : route.continue())
    )
    await page.route(
      (url) => url.pathname === '/catalogue/bars-indicators/101',
      (route) => {
        if (route.request().method() !== 'PATCH') return route.continue()
        // Once the revision is published there is no open draft left for
        // this row to belong to — the controller's own `findOrFail` scoped
        // to the open draft 404s (PR3's docblock on
        // `BarsIndicatorController::update()`).
        if (revisionBox.value?.['state'] === 'published') {
          return jsonRoute(route, { message: 'Not Found' }, 404)
        }
        const indicator = indicators[0]
        if (indicator) indicator.anchor_5 = { en: 'Edited A5' }
        return jsonRoute(route, { data: indicator })
      }
    )
    await page.route(
      (url) => url.pathname === '/catalogue/revisions/publish',
      (route) => {
        revisionBox.value = revision({
          id: 2,
          state: 'published',
          is_baseline: false,
          label: 'September revision',
          published_at: '2026-09-16T00:00:00Z',
          parent_revision_id: 1,
        })
        return jsonRoute(route, { data: revisionBox.value })
      }
    )

    await page.goto('/catalogue')
    await dismissConsent(page)
    await page.getByRole('tab', { name: /^Indicatori/ }).click()

    // Edit succeeds while the revision is still a draft.
    await page.getByTestId('indicator-edit-101').click()
    await page.getByTestId('bars-indicator-form-anchor5-en').fill('Edited A5')
    await page.getByTestId('form-drawer-save').click()
    await expect(page.getByTestId('bars-indicator-form')).toHaveCount(0)

    // Publish, behind ConfirmDialog.
    await expect(page.getByTestId('catalogue-revision-state')).toContainText('Bozza')
    await page.getByTestId('catalogue-publish').click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByTestId('confirm-dialog-confirm').click()

    await expect(page.getByTestId('catalogue-revision-state')).toContainText('Pubblicata')
    await expect(page.getByTestId('catalogue-publish')).toHaveCount(0)

    // Frozen: a subsequent write attempt against the now-published revision
    // is refused — the form banner shows it, the drawer stays open, and the
    // edit never applies.
    await page.getByTestId('indicator-edit-101').click()
    await page.getByTestId('bars-indicator-form-anchor5-en').fill('Should never save')
    await page.getByTestId('form-drawer-save').click()

    await expect(page.getByTestId('bars-indicator-form-banner')).toContainText(
      'Questa risorsa non è stata trovata.'
    )
    await expect(page.getByTestId('bars-indicator-form')).toBeVisible()
  })

  test('a failing publish sweep lists every violation and leaves the revision a draft', async ({
    page,
  }) => {
    await injectSession(page)
    await mockSuperadmin(page)
    await mockRevision(page, { value: DRAFT_REVISION })
    await mockDefaultQuestions(page)
    await mockCompetencies(page)
    await page.route(
      (url) => url.pathname === '/catalogue/revisions/publish',
      (route) =>
        jsonRoute(
          route,
          {
            violations: [
              {
                rule: 'roles_closed_set',
                subject: 'revision:2',
                detail: 'expected at most 5 roles, found 6',
              },
              {
                rule: 'some_future_rule_this_page_has_no_copy_for',
                subject: 'revision:2',
                detail: 'z',
              },
            ],
          },
          422
        )
    )

    await page.goto('/catalogue')
    await dismissConsent(page)

    await page.getByTestId('catalogue-publish').click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByTestId('confirm-dialog-confirm').click()

    const violations = page.getByTestId('catalogue-publish-violations')
    await expect(violations).toBeVisible()
    await expect(violations).toContainText('Troppi ruoli')
    await expect(violations).toContainText('expected at most 5 roles, found 6')
    await expect(violations).toContainText('revision:2')
    // A rule this page has no translated copy for still renders — the raw
    // rule name, not a blank string.
    await expect(violations).toContainText('some_future_rule_this_page_has_no_copy_for')

    await expect(page.getByTestId('catalogue-revision-state')).toContainText('Bozza')
    await expect(page.getByTestId('catalogue-publish-error')).toHaveCount(0)
  })
})
