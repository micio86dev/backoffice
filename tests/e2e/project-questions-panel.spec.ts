import { test, expect, type Route, type Page } from '@playwright/test'
import { abilitiesFor } from './fixtures/abilities'

/**
 * The project edit drawer's own predefined-questions panel
 * (`ProjectQuestionsPanel.vue`) still works after the framework-catalogue-
 * authoring PR10 extraction: its presentational core moved into
 * `QuestionListEditor.vue` — the SAME component `CatalogueDefaultQuestions
 * Panel.vue` now mounts — so `ProjectQuestionsPanel` became a thin
 * container over it (design.md D11). This is the extraction's own
 * regression proof at the E2E layer: PR10's Phase 37 task itself records
 * "duplicating 625 lines is this repo's named, already-paid-for failure
 * mode" as the reason for extracting rather than copying.
 *
 * `injectSession` + `/auth/me` mock pattern, same as
 * `sidebar-navigation.spec.ts`/`clients.spec.ts` — not the `login()` helper
 * `projects-crud.spec.ts` documents as pre-existing-broken in this
 * environment.
 */

function isDataRequest(route: Route): boolean {
  return route.request().resourceType() !== 'document'
}

function jsonRoute(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function injectSession(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/auth/refresh',
    (route) =>
      jsonRoute(route, { access_token: 'e2e-project-questions-token', token_type: 'bearer' })
  )
}

/**
 * The analytics consent banner is fixed to the bottom of the viewport and
 * intercepts clicks on anything underneath it — same fixture dismissal as
 * `profile.spec.ts`/`reports-index.spec.ts`.
 */
async function dismissConsent(page: Page): Promise<void> {
  await page.getByTestId('analytics-consent-reject').click()
  await expect(page.getByTestId('analytics-consent')).toBeHidden()
}

const PROJECT = {
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
  competencies: [{ id: 1, code: 'PRS', type: 'standard', position: 0 }],
}

async function mockBaseline(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/auth/me',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            user: {
              id: 1,
              name: 'Admin One',
              email: 'admin@example.com',
              locale: 'it',
              photo_url: null,
            },
            organization: { id: 1, name: 'Acme' },
            roles: ['admin'],
            abilities: abilitiesFor(['admin']),
          })
        : route.continue()
  )
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
    (url) => url.pathname === '/projects',
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: [PROJECT] }) : route.continue())
  )
  // `ProjectForm` fetches the role's own competency list on mount and emits
  // `update:competencies` with whatever it gets back — an EMPTY result here
  // (the unmocked default) overrides `panelCompetencies`' fallback to the
  // project's OWN already-assigned competencies (`liveCompetencies.value ??
  // editingProject.value?.competencies`, `pages/projects/index.vue`), which
  // is `[]`, not `null`, so `??` never reaches the fallback — the questions
  // panel then reads "no competencies yet" for a project that has one.
  await page.route(
    (url) => /^\/framework\/roles\/[A-Z]+\/competencies$/.test(url.pathname),
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            data: [
              {
                id: 1,
                code: 'PRS',
                name: 'Problem Solving',
                type: 'standard',
                bars_available: true,
              },
            ],
          })
        : route.continue()
  )
}

test.describe('Project edit drawer — predefined questions panel after the QuestionListEditor extraction', () => {
  test('lists, creates and removes a predefined question for an existing project', async ({
    page,
  }) => {
    const questions: {
      id: number
      project_id: number
      competency_id: number
      text: Record<string, string | null>
    }[] = [
      { id: 1, project_id: 1, competency_id: 1, text: { en: 'An existing question.', it: null } },
    ]

    await injectSession(page)
    await mockBaseline(page)
    await page.route(
      (url) => url.pathname === '/projects/1/questions',
      (route) => {
        if (!isDataRequest(route)) return route.continue()
        if (route.request().method() === 'POST') {
          const payload = route.request().postDataJSON() as {
            competency_id: number
            text: Record<string, string | null>
          }
          const created = {
            id: 2,
            project_id: 1,
            competency_id: payload.competency_id,
            text: payload.text,
          }
          questions.push(created)
          return jsonRoute(route, { data: created }, 201)
        }
        return jsonRoute(route, {
          data: questions,
          meta: { max_questions_per_competency: 4 },
        })
      }
    )
    await page.route(
      (url) => url.pathname === '/projects/1/questions/1',
      (route) =>
        route.request().method() === 'DELETE' ? route.fulfill({ status: 204 }) : route.continue()
    )

    await page.goto('/projects')
    await dismissConsent(page)

    await page
      .getByRole('row', { name: /Draft Project/ })
      .getByRole('button', { name: 'Modifica' })
      .click()

    const panel = page.getByTestId('project-questions-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByTestId('question-row-1')).toBeVisible()

    // CREATE
    await panel.getByTestId('question-add-1').click()
    await page.getByTestId('question-text-en').fill('A new predefined question.')
    await page.getByTestId('question-save').click()

    await expect(panel.getByTestId('question-row-2')).toBeVisible()

    // REMOVE — QuestionListEditor's own ConfirmDialog gates the delete.
    await panel.getByTestId('question-remove-1').click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByTestId('confirm-dialog-confirm').click()

    await expect(panel.getByTestId('question-row-1')).toHaveCount(0)
    await expect(panel.getByTestId('question-row-2')).toBeVisible()
  })
})
