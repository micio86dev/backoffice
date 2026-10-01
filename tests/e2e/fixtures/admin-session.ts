/**
 * A signed-in admin session, and typed factories for what the admin API returns.
 *
 * WHY THIS EXISTS. Every spec that touches the admin SPA used to carry its own
 * copy of the same 60 lines: a `/auth/refresh` mock, a `/auth/me` mock, a login
 * helper that typed credentials into the real form, and (in the specs that open
 * a drawer) an `if (await reject.isVisible()) await reject.click()` that
 * dismissed the analytics banner. Three copies drift. The last branch is also a
 * test that behaves differently depending on a race: `isVisible()` answers for
 * the instant it is asked, so on a slow run the banner arrived a frame later and
 * covered the drawer's footer, and on a fast run the branch never executed at
 * all. A fixture answers the banner deterministically, before the page loads.
 *
 * WHAT IT GIVES A TEST
 *
 * - `adminPage`: the `page`, already authenticated. The access token is
 *   memory-only and `00.auth-bootstrap.client.ts` fires `POST /auth/refresh` on
 *   every full page load, so mocking that one endpoint is what signs the user
 *   in: `adminPage.goto('/projects')` lands on Projects with no login form. The
 *   sign-in form itself is exercised by `admin-flow.spec.ts` and is not what
 *   these specs are about.
 * - `role` / `abilities`: options, set per file or per `describe` with
 *   `test.use(...)`. `abilities` overrides the role-derived map for the one case
 *   that needs a user the role table cannot produce (for example "may edit a
 *   project but may not create participants").
 * - The analytics consent is pre-answered ("denied") and the first-login tour
 *   marked as seen, so neither overlay ever sits on top of a drawer.
 *
 * TYPES. The factories return the GENERATED resources (`types/api.ts`), so a
 * field the api adds, renames or drops is a type error here instead of a mock
 * that quietly stopped looking like the real payload. `tests/e2e/**` is outside
 * `nuxi typecheck` (see `abilities.ts`), so nothing in CI checks this file.
 * Check it by hand with a throwaway tsconfig that extends `tsconfig.app.json`
 * and includes `.nuxt/nuxt.d.ts` plus `tests/e2e/**\/*.ts`, then run
 * `bunx tsc -p <that file>` and read only the lines under `tests/e2e/`: the
 * `app/` errors it also prints are `tsc` not understanding `.vue` files.
 */
import { test as base, type Page, type Route } from '@playwright/test'
import type { Abilities, CurrentUser } from '../../../app/composables/useCurrentUser'
import type { components } from '../../../types/api'
import { abilitiesFor } from './abilities'

export type Role = 'admin' | 'operator' | 'viewer'

export type Project = components['schemas']['ProjectResource']
export type Participant = components['schemas']['ParticipantResource']
export type ParticipantDetail = components['schemas']['ParticipantDetailResource']
export type ReusableLink = components['schemas']['ReusableInterviewLinkResource']

interface SessionOptions {
  /** Whose abilities `/auth/me` reports. */
  role: Role
  /** Replaces the role-derived ability map when a test needs a user no role is. */
  abilities: Abilities | undefined
}

interface SessionFixtures {
  /** The page, signed in and with the analytics banner already answered. */
  adminPage: Page
}

export const test = base.extend<SessionOptions & SessionFixtures>({
  role: ['operator', { option: true }],
  abilities: [undefined, { option: true }],

  adminPage: async ({ page, role, abilities }, use) => {
    await answerFirstVisitPrompts(page)
    await signIn(page, role, abilities)
    await use(page)
  },
})

export { expect } from '@playwright/test'

export async function jsonRoute(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

/**
 * The API path and the SPA route share names (`/projects`, `/participants/1`),
 * so a document navigation must fall through to the static server and only a
 * fetch/XHR is answered by a mock.
 */
export function isDataRequest(route: Route): boolean {
  return route.request().resourceType() !== 'document'
}

/** The id `/auth/me` reports; the onboarding "seen" flag is keyed on it. */
const USER_ID = 1

/**
 * Pre-answers the two things a fresh browser profile is asked on first sight,
 * before any script runs: the analytics consent, and the guided tour.
 *
 * Both are overlays that arrive AFTER the page is interactive. The consent
 * banner is fixed to the bottom of the viewport and can sit on top of a drawer's
 * footer; the tour opens over the first page and takes focus. A test that
 * dismisses them with `if (await x.isVisible())` behaves differently depending
 * on a race, so they are answered here, deterministically, instead.
 *
 * - `beai.consent.analytics` is the key `app/utils/analytics-consent.ts` reads;
 *   "denied" is one of the two values it accepts as an answer.
 * - `beai.onboarding.tour-seen.<userId>` is what `onboarding-storage.ts` reads;
 *   "seen" is its only positive value.
 *
 * The write sits in a try/catch because the init script also runs in documents
 * with an opaque origin (`about:blank`), where storage throws.
 */
async function answerFirstVisitPrompts(page: Page): Promise<void> {
  await page.addInitScript((userId) => {
    try {
      window.localStorage.setItem('beai.consent.analytics', 'denied')
      window.localStorage.setItem(`beai.onboarding.tour-seen.${userId}`, 'seen')
    } catch {
      // No storage in this document: nothing to answer.
    }
  }, USER_ID)
}

async function signIn(page: Page, role: Role, abilities: Abilities | undefined): Promise<void> {
  await page.route(
    (url) => url.pathname === '/auth/refresh',
    (route) => jsonRoute(route, { access_token: 'e2e-access-token', token_type: 'bearer' })
  )

  // The ability map, not `/profile`: the UI gates its controls on `can()`, which
  // reads this endpoint and fails CLOSED when it is unmocked, so an unmocked
  // `/auth/me` means a control is not disabled but absent.
  await page.route(
    (url) => url.pathname === '/auth/me',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            user: {
              id: USER_ID,
              name: 'Operator One',
              email: 'operator@example.com',
              locale: 'it',
              photo_url: null,
              is_superadmin: false,
            },
            organization: { id: 1, name: 'Acme' },
            roles: [role],
            abilities: abilities ?? abilitiesFor([role]),
          } satisfies CurrentUser)
        : route.continue()
  )
}

// -- Factories ---------------------------------------------------------------

/** A project an operator CAN invite to: active, with one competency. */
export function projectResource(overrides: Partial<Project> = {}): Project {
  return {
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
    error_redirect_url: null,
    avatar_template_id: 7,
    avatar_template: null,
    webhook_url: null,
    webhook_events: [],
    has_webhook_secret: false,
    deadline_at: null,
    goes_live_at: null,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
    pin_context: null,
    // NOT empty: a project with no competencies cannot run an interview, and the
    // table withholds the invite action rather than offering a link that would
    // 422 at /start.
    competencies: [{ id: 11, code: 'COM', type: 'standard', position: 0 }],
    can: { update: true, delete: false },
    ...overrides,
  }
}

export function participantResource(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 1,
    candidate_ref: 'ref-001',
    display_name: 'Mario Rossi',
    email: 'candidate-1@example.test',
    external_id: null,
    source: null,
    // `null` for a participant that did not start from a reusable link.
    reusable_link: null,
    role_code: 'FLL',
    language: 'it',
    status: 'in_attesa',
    project_id: 2,
    project_name: 'Active Project',
    started_at: null,
    completed_at: null,
    created_at: '2026-03-14T08:30:00Z',
    ...overrides,
  }
}

/** The detail of `row`, in an ELIGIBLE project (active, no go-live or deadline gate). */
export function participantDetail(
  row: Participant,
  overrides: Partial<ParticipantDetail> = {}
): ParticipantDetail {
  return {
    ...row,
    project: {
      id: 2,
      name: 'Active Project',
      status: 'active',
      goes_live_at: null,
      deadline_at: null,
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
      transcript: {
        type: 'text/plain',
        ref: 'transcript',
        url: `/participants/${row.id}/transcript`,
      },
      evaluation_raw: {
        type: 'application/json',
        ref: 'evaluation',
        url: `/participants/${row.id}/evaluation`,
      },
    },
    ...overrides,
  }
}

export function reusableLinkResource(overrides: Partial<ReusableLink> = {}): ReusableLink {
  return {
    id: 'rlk_01HZ0000000000000000000000',
    label: 'Stand fiera di Milano',
    token_prefix: 'beai_rl_9AuXUvnf',
    lang: 'en',
    status: 'active',
    uses_count: 3,
    last_used_at: '2026-10-02T09:30:00.000000Z',
    created_by: { name: 'Operator One' },
    created_at: '2026-10-01T10:00:00.000000Z',
    disabled_at: null,
    ...overrides,
  }
}

// -- Shared API mocks --------------------------------------------------------

/** `GET /projects` plus the framework lookup the invite drawer asks for. */
export async function mockProjectsApi(page: Page, projects: Project[]): Promise<void> {
  await page.route(
    (url) => url.pathname === '/projects',
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: projects }) : route.continue())
  )

  await page.route(
    (url) => /^\/framework\/roles\/[A-Z]+\/competencies$/.test(url.pathname),
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: [] }) : route.continue())
  )
}

/**
 * The participants list and each participant's detail.
 *
 * `rows` is what the list returns: a function receives the request URL, so a
 * spec can implement the filtering the real api does (`q`, `status`) and assert
 * on the rows that actually change instead of on the parameter alone. The detail
 * route serves whichever row it is asked for, so the list and the detail agree.
 * `known` lists every participant whose detail exists; it defaults to the rows of
 * a static list.
 */
export async function mockParticipantsApi(
  page: Page,
  rows: Participant[] | ((url: URL) => Participant[]),
  known: Participant[] = typeof rows === 'function' ? [] : rows
): Promise<void> {
  await page.route(
    (url) => url.pathname === '/participants',
    (route) => {
      if (!isDataRequest(route)) return route.continue()

      const data = typeof rows === 'function' ? rows(new URL(route.request().url())) : rows

      return jsonRoute(route, {
        data,
        links: { first: null, last: null, prev: null, next: null },
        meta: {
          current_page: 1,
          last_page: 1,
          total: data.length,
          from: data.length === 0 ? null : 1,
          to: data.length === 0 ? null : data.length,
          per_page: 20,
        },
      })
    }
  )

  for (const row of known) {
    await page.route(
      (url) => url.pathname === `/participants/${row.id}`,
      (route) =>
        isDataRequest(route) ? jsonRoute(route, { data: participantDetail(row) }) : route.continue()
    )
    await page.route(
      (url) => url.pathname === `/participants/${row.id}/evaluation`,
      (route) =>
        jsonRoute(
          route,
          {
            error: 'lifecycle_not_ready',
            resource: 'evaluation',
            current_status: 'in_attesa',
            required_status: 'completato',
          },
          409
        )
    )
  }
}
