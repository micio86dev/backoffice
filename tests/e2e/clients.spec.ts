import { test, expect, type Route, type Page } from '@playwright/test'
import { checkA11y } from './fixtures/a11y'
import { abilitiesFor } from './fixtures/abilities'

/**
 * `/clients` — the superadmin's platform-wide client directory
 * (superadmin-clients-console, Phase 14).
 *
 * Uses the `injectSession` + `/auth/me` mock pattern from
 * `sidebar-navigation.spec.ts`, NOT the `login()` helper `settings-tabs.spec.ts`
 * and `projects-crud.spec.ts` document as pre-existing-broken in this
 * environment (tasks.md task 4.3): `injectSession` mocks the boot plugin's own
 * `POST /auth/refresh` before the app boots, which is the path that actually
 * populates `useAuth`'s memory-only session on a fresh load.
 *
 * THE FIRST SUPERADMIN MOCK IN THIS SUITE. A superadmin holds no Spatie role
 * (`roles: []`) — `is_superadmin` alone carries the identity — so `abilitiesFor`
 * is called with `{ roles: [], isSuperadmin: true }`, never a role string. The
 * generated `CurrentUser['user']` type marks `is_superadmin` required; every
 * other mock in this suite happens to omit it (a known, undisturbed gap —
 * `settings-tabs.spec.ts:239-245`), but a superadmin fixture that omitted it
 * would not just be incomplete, it would silently mock an org admin instead.
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
    (route) => jsonRoute(route, { access_token: 'e2e-clients-console-token', token_type: 'bearer' })
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

const CLIENT_ROWS = [
  {
    id: 1,
    name: 'Acme',
    created_at: '2026-01-10T00:00:00Z',
    projects: 2,
    candidates: 5,
    completed: 3,
    errored: 1,
    last_activity_at: '2026-08-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Globex',
    created_at: '2026-02-15T00:00:00Z',
    projects: 1,
    candidates: 0,
    completed: 0,
    errored: 0,
    last_activity_at: null,
  },
]

/**
 * `GET /admin/clients` — the console page's own fetch. `actingOrganizationId`
 * is a mutable box (not a plain value) so the "act as" test can flip it
 * BETWEEN the pre-click and post-reload requests without re-registering the
 * route — `page.reload()` re-navigates, and Playwright keeps routes
 * registered with `page.route` across a reload.
 */
function mockClientsList(
  page: Page,
  actingOrganizationId: { value: number | null },
  data: typeof CLIENT_ROWS = CLIENT_ROWS
): Promise<void> {
  return page.route(
    (url) => url.pathname === '/admin/clients',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, { data, acting_organization_id: actingOrganizationId.value })
        : route.continue()
  )
}

/**
 * `GET /admin/organizations` — `SidebarNav.vue`'s OWN fetch (never the
 * console page's), needed only because a superadmin's `onMounted` calls
 * `useSuperadmin().fetchClients()` to decide whether to widen the rail to the
 * client-scope items. Left unmocked, the sidebar's own request 404s (caught,
 * so it fails silently) — mocked here so the acting-client state the sidebar
 * shows agrees with what the page shows.
 */
function mockOrganizationsDirectory(
  page: Page,
  actingOrganizationId: { value: number | null }
): Promise<void> {
  return page.route(
    (url) => url.pathname === '/admin/organizations',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            data: CLIENT_ROWS.map(({ id, name }) => ({ id, name })),
            acting_organization_id: actingOrganizationId.value,
          })
        : route.continue()
  )
}

test.describe('Clients console — reachability and the security half', () => {
  test('a superadmin sees the Clients nav entry and it opens the console page', async ({
    page,
  }) => {
    const acting = { value: null as number | null }
    await injectSession(page)
    await mockSuperadmin(page)
    await mockOrganizationsDirectory(page, acting)
    await mockClientsList(page, acting)

    await page.goto('/clients')

    const nav = page.getByRole('navigation', { name: 'Navigazione principale' })
    await expect(nav.getByRole('link', { name: 'Clienti' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Clienti', level: 1 })).toBeVisible()
    await expect(page.getByTestId('clients-table')).toBeVisible()
  })

  // The security half — without this, the suite would only prove the happy
  // path. An org admin has every tenant ability there is and must still be
  // refused this platform-scope page.
  test('an org admin has no Clients nav entry and is redirected away from /clients', async ({
    page,
  }) => {
    await injectSession(page)
    await mockOrgAdmin(page)
    // Defense in depth: if the client-side guard were ever raced, the
    // endpoint itself must still refuse. Asserting the mock exists does not
    // assert it was CALLED — the redirect below is the assertion that a
    // guard deletion would actually fail.
    await page.route(
      (url) => url.pathname === '/admin/clients',
      (route) => jsonRoute(route, { message: 'Forbidden' }, 403)
    )

    await page.goto('/clients')

    await expect(page).toHaveURL('/')
    const nav = page.getByRole('navigation', { name: 'Navigazione principale' })
    await expect(nav.getByRole('link', { name: 'Clienti' })).toHaveCount(0)
  })
})

test.describe('Clients console — table, act-as, and the three states', () => {
  test('the table renders one row per organization with its own statistics', async ({ page }) => {
    const acting = { value: null as number | null }
    await injectSession(page)
    await mockSuperadmin(page)
    await mockOrganizationsDirectory(page, acting)
    await mockClientsList(page, acting)

    await page.goto('/clients')

    await expect(page.getByTestId('client-row-1')).toBeVisible()
    await expect(page.getByTestId('client-row-2')).toBeVisible()

    // Per-cell testids, never a row-wide `toContain` — a neighbouring
    // column's digits can satisfy a loose assertion (design.md D5 comment on
    // `ClientTable.vue`'s own per-cell testids).
    await expect(page.getByTestId('client-projects-1')).toHaveText('2')
    await expect(page.getByTestId('client-candidates-1')).toHaveText('5')
    await expect(page.getByTestId('client-completed-1')).toHaveText('3')
    await expect(page.getByTestId('client-errored-1')).toHaveText('1')

    await expect(page.getByTestId('client-projects-2')).toHaveText('1')
    await expect(page.getByTestId('client-candidates-2')).toHaveText('0')
    // Org 2 has never had a participant — the null last-activity must render
    // the same "–" `formatDate(null)` produces, not a blank cell or a bug.
    await expect(page.getByTestId('client-last-activity-2')).toHaveText('–')
  })

  test('"Act as" on a row switches the client and reloads the page', async ({ page }) => {
    const acting = { value: null as number | null }
    await injectSession(page)
    await mockSuperadmin(page)
    await mockOrganizationsDirectory(page, acting)
    await mockClientsList(page, acting)

    let switchedTo: number | null | undefined
    await page.route(
      (url) => url.pathname === '/admin/acting-organization',
      async (route) => {
        const body = route.request().postDataJSON() as { organization_id: number | null }
        switchedTo = body.organization_id
        acting.value = body.organization_id
        await jsonRoute(route, {})
      }
    )

    await page.goto('/clients')
    await expect(page.getByTestId('client-row-1')).toBeVisible()

    // A reload is the only observable proof the `finally` block ran — the PUT
    // resolving is not enough on its own, since a mutation dropping the
    // `finally` (leaving a bare sequential await+reload) only fails on the
    // REJECTION path, which this test does not exercise. Racing the reload
    // against `waitForRequest`/`waitForResponse` for the SECOND
    // `/admin/clients` GET is what actually distinguishes "reloaded" from
    // "did nothing".
    const [,] = await Promise.all([
      page.waitForResponse((response) => response.url().includes('/admin/clients')),
      page.getByTestId('client-act-as-1').click(),
    ])

    expect(switchedTo).toBe(1)
    // The acted-as row is now current: its own button is disabled and the
    // sr-only "already acting as" marker is present, straight from the
    // acting_organization_id the second /admin/clients response now carries.
    await expect(page.getByTestId('client-act-as-1')).toBeDisabled()
    await expect(page.getByTestId('client-act-as-current-1')).toHaveCount(1)
    await expect(page.getByTestId('client-act-as-2')).toBeEnabled()
  })

  test('zero organizations render the empty state, not an error', async ({ page }) => {
    const acting = { value: null as number | null }
    await injectSession(page)
    await mockSuperadmin(page)
    await mockOrganizationsDirectory(page, acting)
    await mockClientsList(page, acting, [])

    await page.goto('/clients')

    await expect(page.getByTestId('clients-table-empty')).toBeVisible()
    await expect(page.getByTestId('clients-error')).toHaveCount(0)
  })

  // D7's own discipline, made executable at the E2E layer: "no clients yet"
  // and "we could not ask" are different facts, and a failed load must never
  // read as the empty state.
  test('a failed load renders the error state, never the empty table', async ({ page }) => {
    const acting = { value: null as number | null }
    await injectSession(page)
    await mockSuperadmin(page)
    await mockOrganizationsDirectory(page, acting)
    await page.route(
      (url) => url.pathname === '/admin/clients',
      (route) => jsonRoute(route, { message: 'Internal Server Error' }, 500)
    )

    await page.goto('/clients')

    await expect(page.getByTestId('clients-error')).toBeVisible()
    await expect(page.getByTestId('clients-error')).toHaveAttribute('data-state', 'error')
    await expect(page.getByTestId('clients-table')).toHaveCount(0)
    await expect(page.getByTestId('clients-table-empty')).toHaveCount(0)
  })

  test('the console page is WCAG 2.1 AA clean', async ({ page }) => {
    const acting = { value: null as number | null }
    await injectSession(page)
    await mockSuperadmin(page)
    await mockOrganizationsDirectory(page, acting)
    await mockClientsList(page, acting)

    await page.goto('/clients')
    await expect(page.getByTestId('clients-table')).toBeVisible()

    await checkA11y(page)
  })
})
