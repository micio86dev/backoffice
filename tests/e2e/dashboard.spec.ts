import { test, expect, type Route, type Page } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'
import { abilitiesFor } from './fixtures/abilities'

/*
 * LOCATOR POLICY, stated because this spec used to break it everywhere.
 *
 * Elements that carry a ROLE are located by it: the metrics failure is
 * `role="alert"` (the shadcn Alert), the feed is an `<ol>` so `role="list"`,
 * its failure line is `role="status"`, and each candidate is a link with an
 * accessible name. A `getByTestId` passes on an element with a broken role, no
 * accessible name and no keyboard reachability; a `getByRole` cannot — which is
 * the entire reason the rule exists. The accessible scaffolding was already
 * built here and simply was not used.
 *
 * The KPI tiles used to be the documented exception here: shadcn's CardTitle
 * and CardDescription render plain `<div>`s, so a tile had no role and no
 * programmatic label-to-value association to locate by. That exception was an
 * accessibility gap wearing a locator's clothes, so it was CLOSED rather than
 * documented again — `MetricCard` now renders `role="group"` with
 * `aria-labelledby` pointing at its label. `getByRole('group', { name })`
 * therefore asserts the accessible NAME as a side effect, which is exactly what
 * a test id can never do: a tile that loses its label still passes a testid
 * lookup and fails this one.
 *
 * `data-testid` survives in exactly one place: `activity-empty`. Its container
 * is located by role first, and the test id only selects WHICH of the feed's
 * three mutually exclusive states rendered — a distinction no role expresses,
 * since empty and populated are both the same list.
 */

/**
 * One KPI tile, by its accessible name.
 *
 * `role="group"` + `aria-labelledby` is what `MetricCard` renders, so this
 * asserts the tile is announceable at the same time as it asserts the number:
 * strip the label association and every one of these fails, which is the
 * property the previous `getByTestId` could not have.
 */
function tile(page: Page, name: string) {
  return page.getByRole('group', { name })
}

/**
 * `/` (`pages/index.vue`) — the backoffice HOME (dashboard-e2e).
 *
 * The dashboard was covered by NAME only: six existing specs mock
 * `/dashboard/metrics` to reach somewhere else (session reload, sidebar
 * navigation, the admin flow), and none of them assert a KPI tile, the
 * activity feed, or the period filter. This is the first spec that actually
 * exercises the page.
 *
 * Route-mocked, not seeded (design.md D3): every other backoffice e2e spec
 * mocks its API with `page.route(...)` and builds identity through
 * `abilitiesFor(...)`; the aggregate this page renders has its own tests in
 * `api`, so this spec is only about the PAGE.
 */

function isDataRequest(route: Route): boolean {
  return route.request().resourceType() !== 'document'
}

function jsonRoute(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

/** Mocks the boot plugin's `POST /auth/refresh` so a fresh load is authenticated. */
async function injectSession(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/auth/refresh',
    (route) => jsonRoute(route, { access_token: 'e2e-dashboard-token', token_type: 'bearer' })
  )
}

async function mockOrgAdmin(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/auth/me',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            user: {
              id: 1,
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

/**
 * Chosen deliberately small and round: below 1000 for the latency figures so
 * no engine's digit-grouping threshold is even in play, and a 5-digit token
 * total so grouping unambiguously applies. The exact rendered string is never
 * hardcoded here (see `expectedNumber`/`expectedPercent`/`expectedUsd`) — it
 * is computed by the SAME browser running the assertion, so the test cannot
 * drift from whatever ICU/CLDR version that engine ships.
 */
const METRICS_FIXTURE = {
  data: {
    participants_by_status: { in_corso: 3, completato: 5 },
    evaluations_by_status: {},
    completion_rate: 0.75,
    ai_usage: {
      input_tokens: 30000,
      output_tokens: 20000,
      latency_ms_p50: 500,
      latency_ms_p95: 900,
    },
    costs: { scoring_usd: 8, conversation_usd: 4, total_usd: 12, currency: 'USD' },
  },
}

/**
 * The activity panel, scoped by its own landmark.
 *
 * `RecentActivity` is a `<section aria-labelledby>`, so it IS a named region —
 * and scoping to it is what makes the role locators usable at all: the sidebar
 * is built from lists too, so a bare `getByRole('list')` resolves to nine
 * elements. Scoping asserts the structure rather than working around it.
 *
 * Playwright runs `locale: 'it-IT'`, so the name is the Italian heading.
 */
const ACTIVITY_REGION = 'Attività recente'

function activityPanel(page: Page) {
  return page.getByRole('region', { name: ACTIVITY_REGION })
}

const ACTIVITY_ROWS = [
  {
    id: 101,
    candidate_ref: 'ref-1',
    display_name: 'Mario Rossi',
    status: 'completato',
    project_name: 'Progetto Alpha',
    updated_at: '2026-08-01T10:00:00Z',
  },
  {
    id: 102,
    candidate_ref: 'ref-2',
    display_name: 'Anna Bianchi',
    status: 'in_corso',
    project_name: null,
    updated_at: '2026-08-02T11:00:00Z',
  },
]

function mockMetrics(page: Page, body: unknown = METRICS_FIXTURE, status = 200): Promise<void> {
  return page.route(
    (url) => url.pathname === '/dashboard/metrics',
    (route) => (isDataRequest(route) ? jsonRoute(route, body, status) : route.continue())
  )
}

function mockActivity(page: Page, rows: typeof ACTIVITY_ROWS = ACTIVITY_ROWS): Promise<void> {
  return page.route(
    (url) => url.pathname === '/dashboard/activity',
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: rows }) : route.continue())
  )
}

/** The feed's OWN read failing, with the metrics read perfectly fine. */
function mockActivityFailure(page: Page, status = 500): Promise<void> {
  return page.route(
    (url) => url.pathname === '/dashboard/activity',
    (route) =>
      isDataRequest(route) ? jsonRoute(route, { message: 'boom' }, status) : route.continue()
  )
}

/**
 * Expected formatted strings, computed IN THE BROWSER under test with the
 * exact same `Intl` call `format.ts` makes — never hardcoded — so the
 * assertion cannot drift from whatever ICU/CLDR a given Chromium/WebKit
 * build ships (Node, Chromium and WebKit have disagreed on Italian digit
 * grouping in the 1000-9999 range before).
 */
async function expectedNumber(page: Page, value: number): Promise<string> {
  return page.evaluate((v) => new Intl.NumberFormat('it').format(v), value)
}

async function expectedPercent(page: Page, ratio: number): Promise<string> {
  return page.evaluate(
    (v) => new Intl.NumberFormat('it', { style: 'percent', maximumFractionDigits: 0 }).format(v),
    ratio
  )
}

async function expectedUsd(page: Page, usd: number): Promise<string> {
  return page.evaluate(
    (v) =>
      new Intl.NumberFormat('it', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v),
    usd
  )
}

test.describe('Dashboard — KPI tiles and recent activity', () => {
  test('the five KPI tiles render their values', async ({ page }) => {
    await injectSession(page)
    await mockOrgAdmin(page)
    await mockMetrics(page)
    await mockActivity(page)

    await page.goto('/')

    const totalParticipants = await expectedNumber(page, 8)
    const completionRate = await expectedPercent(page, 0.75)
    const tokensUsed = await expectedNumber(page, 50000)
    const p50 = await expectedNumber(page, 500)
    const p95 = await expectedNumber(page, 900)
    const scoring = await expectedUsd(page, 8)
    const conversation = await expectedUsd(page, 4)
    const total = await expectedUsd(page, 12)

    await expect(tile(page, 'Candidati totali')).toContainText(totalParticipants)
    await expect(tile(page, 'Tasso di completamento')).toContainText(completionRate)
    await expect(tile(page, 'Token AI utilizzati')).toContainText(tokensUsed)
    // `ms` sits inside EACH value, not once at the end of the joining template.
    // Gluing it to the end produced "not measured / not measured ms" the moment
    // a percentile was null — the unit has to travel with a number or not at
    // all, so both halves carry it.
    await expect(tile(page, 'Latenza AI (p50 / p95)')).toContainText(`${p50} ms / ${p95} ms`)
    // The currency comes from the FIXTURE, not from a symbol assumed here. The
    // page used to bake `$` into the i18n string in both locales while
    // `useDashboardMetrics` typed `costs.currency` and its docblock said it was
    // "carried rather than assumed" — on a figure an operator may reconcile
    // against an invoice. Reading it from the same place the page does is what
    // makes this assertion able to catch that assumption coming back.
    const currency = METRICS_FIXTURE.data.costs.currency
    await expect(tile(page, 'Spesa AI e avatar')).toContainText(`${currency} ${total}`)
    await expect(tile(page, 'Spesa AI e avatar')).toContainText(`${currency} ${scoring}`)
    await expect(tile(page, 'Spesa AI e avatar')).toContainText(`${currency} ${conversation}`)
  })

  test('the recent-activity feed renders its rows', async ({ page }) => {
    await injectSession(page)
    await mockOrgAdmin(page)
    await mockMetrics(page)
    await mockActivity(page)

    await page.goto('/')

    await expect(activityPanel(page).getByRole('list')).toBeVisible()
    const links = activityPanel(page).getByRole('link')
    await expect(links).toHaveCount(2)
    await expect(links.nth(0)).toHaveText('Mario Rossi')
    await expect(links.nth(1)).toHaveText('Anna Bianchi')
    await expect(page.getByTestId('activity-empty')).toHaveCount(0)
  })

  test('an empty activity feed renders its empty state, not a blank panel', async ({ page }) => {
    await injectSession(page)
    await mockOrgAdmin(page)
    await mockMetrics(page)
    await mockActivity(page, [])

    await page.goto('/')

    await expect(page.getByTestId('activity-empty')).toBeVisible()
    await expect(activityPanel(page).getByRole('list')).toHaveCount(0)
  })

  test('a failed activity read says so, and never claims there are no candidates', async ({
    page,
  }) => {
    // The state nobody covered, and it was WRONG. The page swallowed the
    // rejection into `activity.value = []`, and RecentActivity branches on
    // `rows.length === 0` alone — so a 403 or a 500 rendered "No candidates
    // yet. They appear here as soon as the calling system creates one."
    //
    // That is not a degraded panel. It is a confident, affirmative statement
    // about the operator's own data, made without having read it — and on the
    // first screen a B2B tenant sees. `error-state.ts`'s docblock names this
    // exact failure: "letting a rejection fall through into an EMPTY state that
    // looks like success".
    //
    // The counters must still render: the metrics read succeeded, and refusing
    // to show them because a secondary panel failed reports the wrong problem.
    await injectSession(page)
    await mockOrgAdmin(page)
    await mockMetrics(page)
    await mockActivityFailure(page)

    await page.goto('/')

    await expect(activityPanel(page).getByRole('status')).toBeVisible()
    await expect(page.getByTestId('activity-empty')).toHaveCount(0)
    await expect(activityPanel(page).getByRole('list')).toHaveCount(0)
    // And the dashboard is NOT in its error state — the metrics were fine.
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(tile(page, 'Candidati totali')).toBeVisible()
  })
})

test.describe('Dashboard — failure states (design.md D4)', () => {
  // "No candidates yet" and "we could not fetch it" must never look alike —
  // a failed metrics load must never fall through to the empty-feed state.
  test('a failed metrics load renders the error state, never the feed empty state', async ({
    page,
  }) => {
    await injectSession(page)
    await mockOrgAdmin(page)
    await mockMetrics(page, { message: 'Internal Server Error' }, 500)
    // No /dashboard/activity mock: index.vue's load() never reaches the
    // activity fetch once the metrics call throws (nested try/catch), so
    // registering one here would assert a request that never happens.

    await page.goto('/')

    const error = page.getByRole('alert')
    await expect(error).toBeVisible()
    await expect(error).toHaveAttribute('data-state', 'error')
    await expect(error).toHaveClass(/destructive/)
    await expect(page.getByTestId('activity-empty')).toHaveCount(0)
    await expect(activityPanel(page).getByRole('list')).toHaveCount(0)
  })

  // A 409 is temporal and self-resolving; it must render as a neutral notice,
  // not the same destructive red as a genuine failure.
  test('a 409 renders not-ready, never the destructive variant', async ({ page }) => {
    await injectSession(page)
    await mockOrgAdmin(page)
    await mockMetrics(page, { message: 'Not ready' }, 409)

    await page.goto('/')

    const error = page.getByRole('alert')
    await expect(error).toBeVisible()
    await expect(error).toHaveAttribute('data-state', 'not-ready')
    await expect(error).not.toHaveClass(/destructive/)
  })
})

test.describe('Dashboard — period filter (design.md D2)', () => {
  // THE single highest-value assertion in this change: the filter drives BOTH
  // endpoints, so capturing only one re-querying would pass against the
  // defect worth catching — the tiles and the activity list silently
  // describing two DIFFERENT periods.
  test('selecting a period re-queries BOTH endpoints with the same range', async ({ page }) => {
    let lastMetricsQuery: string | null = null
    let lastActivityQuery: string | null = null

    await injectSession(page)
    await mockOrgAdmin(page)
    await page.route(
      (url) => url.pathname === '/dashboard/metrics',
      (route) => {
        if (!isDataRequest(route)) return route.continue()
        lastMetricsQuery = new URL(route.request().url()).search
        return jsonRoute(route, METRICS_FIXTURE)
      }
    )
    await page.route(
      (url) => url.pathname === '/dashboard/activity',
      (route) => {
        if (!isDataRequest(route)) return route.continue()
        lastActivityQuery = new URL(route.request().url()).search
        return jsonRoute(route, { data: ACTIVITY_ROWS })
      }
    )

    await page.goto('/')
    await expect(tile(page, 'Candidati totali')).toBeVisible()

    const year = new Date().getFullYear()
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/dashboard/metrics') && r.url().includes(`from=${year}-01-01`)
      ),
      page.waitForResponse(
        (r) => r.url().includes('/dashboard/activity') && r.url().includes(`from=${year}-01-01`)
      ),
      page.getByRole('combobox', { name: 'Anno' }).selectOption(String(year)),
    ])

    expect(lastMetricsQuery).toBe(`?from=${year}-01-01&to=${year}-12-31`)
    expect(lastActivityQuery).toBe(lastMetricsQuery)
  })

  test('clearing the year clears the month and returns to all-time', async ({ page }) => {
    await injectSession(page)
    await mockOrgAdmin(page)
    await mockMetrics(page)
    await mockActivity(page)

    await page.goto('/')
    await expect(tile(page, 'Candidati totali')).toBeVisible()

    const year = new Date().getFullYear()
    const yearSelect = page.getByRole('combobox', { name: 'Anno' })
    const monthSelect = page.getByRole('combobox', { name: 'Mese' })

    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/dashboard/metrics') && r.url().includes(`from=${year}-01-01`)
      ),
      yearSelect.selectOption(String(year)),
    ])
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/dashboard/metrics') && r.url().includes(`from=${year}-03-01`)
      ),
      monthSelect.selectOption('3'),
    ])
    await expect(monthSelect).toHaveValue('3')

    await Promise.all([
      // Back to all-time: no `from`/`to` at all, not merely a different range.
      page.waitForResponse((r) => r.url().includes('/dashboard/metrics') && !r.url().includes('?')),
      yearSelect.selectOption(''),
    ])

    await expect(yearSelect).toHaveValue('')
    await expect(monthSelect).toHaveValue('')
    await expect(monthSelect).toBeDisabled()
  })
})

test.describe('Dashboard — accessibility', () => {
  test('the dashboard is WCAG 2.1 AA clean', async ({ page }) => {
    await injectSession(page)
    await mockOrgAdmin(page)
    await mockMetrics(page)
    await mockActivity(page)

    await page.goto('/')
    await expect(tile(page, 'Candidati totali')).toBeVisible()

    await checkA11y(page)
  })
})
