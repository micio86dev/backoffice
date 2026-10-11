import type { Page } from '@playwright/test'
import {
  test,
  expect,
  isDataRequest,
  jsonRoute,
  answerFirstVisitPrompts,
  mockParticipantsApi,
  participantDetail,
  participantResource,
} from './fixtures/admin-session'
import { checkA11y } from './fixtures/a11y'
import { abilitiesFor } from './fixtures/abilities'
import {
  EUR_ROW,
  USD_ROW,
  expectedMoney,
  expectedNote,
  mockCurrencyContext,
  type CatalogueRow,
} from './fixtures/currency'

/**
 * Organization display currency, end to end (organization-currencies OC-08).
 *
 * Amounts are stored and computed in USD; the organization only changes how they
 * are SHOWN. The rule each test protects is the one an operator would be misled
 * by: a converted figure is approximate (`≈` + a spoken "circa"), says where it
 * came from in visible text (original USD amount, rate, date), and anything short
 * of a usable currency reads as plain USD instead of a guess.
 *
 * The EUR rate (0.9) lives only in `fixtures/currency.ts`; no app code or seed
 * carries one. Expected strings are formatted by the browser under test.
 */

const METRICS = {
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

const PARTICIPANT = participantResource({ id: 1, status: 'completato' })

function reviewFixture() {
  return {
    id: 100,
    participant_id: 1,
    competency_code: 'COL',
    question_index: 0,
    provider: 'heygen',
    provider_session_ref: 'sess_1',
    status: 'ended',
    ended_reason: 'completed',
    started_at: '2026-03-14T09:00:00Z',
    ended_at: '2026-03-14T09:10:00Z',
    duration_seconds: 600,
    integrity: {
      score: 0,
      band: 'low',
      coverage_complete: true,
      unavailable_layers: [],
      total: 0,
      counts: {},
      events: [],
      second_monitor: false,
      tab_hidden_sec: 0,
      face_absent_sec: 0,
      looking_away_sec: 0,
      multiple_faces_sec: 0,
      second_voice_sec: 0,
      fullscreen_exits: 0,
      clipboard_copies: 0,
      clipboard_pastes: 0,
    },
    snapshots: [],
    cost: {
      avatar: { provider: 'heygen', minutes: 10, usd: 2 },
      llm: { estimated_usd: 0.5, actual_usd: null },
      is_estimate: true,
    },
  }
}

/** The three cost pages' own data; identity and currency come from the caller. */
async function mockCostPages(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/dashboard/metrics',
    (route) => (isDataRequest(route) ? jsonRoute(route, METRICS) : route.continue())
  )
  await page.route(
    (url) => url.pathname === '/dashboard/activity',
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: [] }) : route.continue())
  )
  await mockParticipantsApi(page, [PARTICIPANT])
  // Registered after the generic detail mock, so it wins: a priced interview.
  await page.route(
    (url) => url.pathname === '/participants/1',
    (route) =>
      isDataRequest(route)
        ? jsonRoute(route, {
            data: participantDetail(PARTICIPANT, {
              cost: {
                amount: 12,
                currency: 'USD',
                is_estimate: true,
                sessions_estimated: 1,
                sessions_total: 1,
              },
            }),
          })
        : route.continue()
  )
  await page.route(
    (url) => url.pathname === '/interview-sessions/100/review',
    (route) =>
      isDataRequest(route) ? jsonRoute(route, { data: reviewFixture() }) : route.continue()
  )
  await page.route(
    (url) => url.pathname === '/participants/1/sessions',
    (route) => (isDataRequest(route) ? jsonRoute(route, { data: [] }) : route.continue())
  )
}

/** The `≈`-prefixed figure, its spoken form, and the visible note, on one tile. */
async function expectConverted(
  page: Page,
  scope: ReturnType<Page['getByTestId']>,
  noteScope: ReturnType<Page['getByTestId']>,
  usd: number
): Promise<void> {
  // Plain float product: exact for every fixture amount used here (12, 8, 4, 2, 0.5 at
  // 0.9); a new amount sitting on a half-cent boundary would need the app's own rounding.
  const eur = await expectedMoney(page, usd * 0.9, 'EUR')

  // The figure itself is `≈ <euro>` and spoken as "circa <euro>"; the original
  // USD amount appears only in the note, never as the headline.
  await expect(scope.getByRole('img', { name: `circa ${eur}` })).toHaveText(`≈ ${eur}`)
  await expect(noteScope).toHaveText(await expectedNote(page, usd))
}

test.describe('Organization currency — admin', () => {
  test.use({ role: 'admin' })

  test('switching to EUR in Settings converts the dashboard, participant detail and session review', async ({
    adminPage: page,
  }) => {
    const org = await mockCurrencyContext(page, { catalogue: [USD_ROW, EUR_ROW] })
    await mockCostPages(page)

    await page.goto('/settings')
    const select = page.getByTestId('currency-select')
    await expect(select).toHaveValue('USD')
    await select.selectOption('EUR')
    await page.getByTestId('currency-submit').click()

    await expect(page.getByTestId('currency-banner')).toContainText(
      'La valuta di visualizzazione è stata salvata.'
    )
    expect(org.patches).toEqual([{ currency_code: 'EUR' }])

    await page.goto('/')
    await expectConverted(
      page,
      page.getByTestId('dashboard-cost'),
      page.getByTestId('dashboard-cost-note'),
      12
    )
    // The breakdown line converts too, never mixing currencies on one tile.
    const detail = page.getByTestId('dashboard-cost-detail')
    await expect(detail).toContainText(await expectedMoney(page, 8 * 0.9, 'EUR'))
    await expect(detail).toContainText(await expectedMoney(page, 4 * 0.9, 'EUR'))

    await page.goto('/participants/1')
    await expectConverted(
      page,
      page.getByTestId('interview-cost'),
      page.getByTestId('interview-cost-note'),
      12
    )

    await page.goto('/interview-sessions/100')
    await expectConverted(
      page,
      page.getByTestId('cost-avatar'),
      page.getByTestId('cost-avatar-note'),
      2
    )
    await expectConverted(
      page,
      page.getByTestId('cost-llm-estimated'),
      page.getByTestId('cost-llm-estimated-note'),
      0.5
    )
  })

  test('a failing catalogue read falls back to plain USD, with no approximation', async ({
    adminPage: page,
  }) => {
    await mockCurrencyContext(page, { organizationCurrency: 'EUR', catalogue: { failWith: 500 } })
    await mockCostPages(page)

    await page.goto('/')

    const cost = page.getByTestId('dashboard-cost')
    await expect(cost).toContainText(await expectedMoney(page, 12))
    await expect(cost).not.toContainText('≈')
    await expect(cost).not.toContainText('€')
    await expect(page.getByTestId('dashboard-cost-note')).toHaveCount(0)
    await expect(cost.getByRole('img')).toHaveCount(0)
  })

  test('the settings currency form is WCAG 2.1 AA clean', async ({ adminPage: page }) => {
    await mockCurrencyContext(page, { catalogue: [USD_ROW, EUR_ROW] })

    await page.goto('/settings')
    await expect(page.getByTestId('currency-select')).toBeVisible()

    await checkA11y(page)
  })

  test('a converted cost view is WCAG 2.1 AA clean', async ({ adminPage: page }) => {
    await mockCurrencyContext(page, { organizationCurrency: 'EUR', catalogue: [USD_ROW, EUR_ROW] })
    await mockCostPages(page)

    await page.goto('/interview-sessions/100')
    await expect(page.getByTestId('cost-avatar-note')).toBeVisible()
    await checkA11y(page)

    await page.goto('/')
    await expect(page.getByTestId('dashboard-cost-note')).toBeVisible()
    await checkA11y(page)
  })
})

// `/settings` is gated on `users.viewAny` (admin), so operators and viewers never
// reach the currency control: they read the converted amounts and nothing else.
for (const role of ['operator', 'viewer'] as const) {
  test.describe(`Organization currency — ${role}`, () => {
    test.use({ role })

    test(`reads converted amounts and cannot reach the currency setting`, async ({
      adminPage: page,
    }) => {
      const org = await mockCurrencyContext(page, {
        organizationCurrency: 'EUR',
        catalogue: [USD_ROW, EUR_ROW],
      })
      await mockCostPages(page)

      await page.goto('/')
      await expectConverted(
        page,
        page.getByTestId('dashboard-cost'),
        page.getByTestId('dashboard-cost-note'),
        12
      )

      await page.goto('/settings')
      await expect(page).toHaveURL('/')
      await expect(page.getByTestId('currency-select')).toHaveCount(0)
      expect(org.patches).toEqual([])
    })
  })
}

test.describe('Organization currency — superadmin catalogue', () => {
  const rows: CatalogueRow[] = [
    USD_ROW,
    EUR_ROW,
    {
      code: 'GBP',
      symbol: '£',
      decimals: 2,
      rate_per_usd: null,
      rate_as_of: null,
      is_active: false,
    },
  ]

  async function openCatalogue(
    page: Page,
    onWrite: (method: string, url: string, body: unknown) => number
  ) {
    await answerFirstVisitPrompts(page)
    await page.route(
      (url) => url.pathname === '/auth/refresh',
      (route) => jsonRoute(route, { access_token: 'e2e-access-token', token_type: 'bearer' })
    )
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
    // A superadmin belongs to no organization: the api answers `data: null`.
    await page.route(
      (url) => url.pathname === '/organization',
      (route) => (isDataRequest(route) ? jsonRoute(route, { data: null }) : route.continue())
    )
    await page.route(
      (url) => url.pathname.startsWith('/admin/currencies'),
      (route) => {
        if (!isDataRequest(route)) return route.continue()
        const request = route.request()
        if (request.method() === 'GET') return jsonRoute(route, { data: rows })

        const status = onWrite(request.method(), request.url(), request.postDataJSON())
        return status === 200
          ? jsonRoute(route, { data: EUR_ROW })
          : jsonRoute(route, { message: 'currency_in_use' }, status)
      }
    )

    await page.goto('/settings')
    await page.getByRole('tab', { name: 'Valute' }).click()
    await expect(page.getByTestId('currency-row-EUR')).toBeVisible()
  }

  test('editing a rate sends it as a decimal string with its date', async ({ page }) => {
    const writes: Array<{ method: string; url: string; body: unknown }> = []
    await openCatalogue(page, (method, url, body) => {
      writes.push({ method, url, body })
      return 200
    })

    await page.getByTestId('currency-edit-EUR').click()
    await page.getByTestId('currency-edit-form-rate').fill('0.92')
    await page.getByTestId('currency-edit-form-as-of').fill('2026-10-10')
    await page.getByRole('button', { name: 'Modifica', exact: true }).last().click()

    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0]?.method).toBe('PATCH')
    expect(new URL(writes[0]!.url).pathname).toBe('/admin/currencies/EUR')
    expect(writes[0]?.body).toEqual({
      symbol: '€',
      decimals: 2,
      rate_per_usd: '0.92',
      rate_as_of: '2026-10-10',
    })
  })

  test('deactivating a currency an organization uses shows the localized refusal', async ({
    page,
  }) => {
    await openCatalogue(page, () => 409)

    await page.getByTestId('currency-toggle-EUR').click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Disattiva' }).click()

    const banner = page.getByTestId('currency-conflict')
    await expect(banner).toHaveText(
      "Un'organizzazione usa ancora questa valuta, quindi non può essere disattivata né eliminata."
    )
    // The slug is mapped to copy, never shown raw.
    await expect(banner).not.toContainText('currency_in_use')
  })

  test('the catalogue panel is WCAG 2.1 AA clean', async ({ page }) => {
    await openCatalogue(page, () => 200)

    await checkA11y(page)
  })
})
