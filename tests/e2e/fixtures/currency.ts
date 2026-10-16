/**
 * Shared mocks for the organization display currency (organization-currencies).
 *
 * Every cost surface now reads TWO endpoints besides its own: `GET /organization`
 * (the acting organization's `currency_code`, read by the default layout) and
 * `GET /currencies` (the active catalogue). A spec that mocks neither renders
 * plain USD only because both reads fail, which is a fallback path rather than
 * the thing it claims to test. This registers both once, so a cost spec states
 * its currency instead of inheriting one by accident.
 *
 * The EUR row and its rate exist ONLY here: the application and the seeds carry
 * no EUR rate (the owner sets it from the superadmin page).
 *
 * Amounts are asserted against `Intl` evaluated in the browser under test, with
 * the currency CODE in the expected string. A bare `2,00` also matches a wrong
 * currency, which is the defect this file exists to make impossible.
 */
import type { Page, Route } from '@playwright/test'
import type { components } from '../../../types/api'
import { isDataRequest, jsonRoute } from './admin-session'

export type CatalogueRow = components['schemas']['CurrencyResource']
type Organization = components['schemas']['OrganizationResource']

export const USD_ROW: CatalogueRow = {
  code: 'USD',
  symbol: '$',
  decimals: 2,
  rate_per_usd: '1.000000',
  rate_as_of: '2026-10-01',
  is_active: true,
}

/** Fixture-only rate: 1 USD = 0.9 EUR, so 12 USD reads 10,80 EUR. */
export const EUR_RATE = 0.9
export const EUR_ROW: CatalogueRow = {
  code: 'EUR',
  symbol: '€',
  decimals: 2,
  rate_per_usd: String(EUR_RATE),
  rate_as_of: '2026-10-09',
  is_active: true,
}

export interface CurrencyMock {
  /** The organization's code; a `PATCH /organization` updates it, like the api. */
  organizationCurrency: string
  /** Bodies received by `PATCH /organization`. */
  patches: unknown[]
}

interface CurrencyMockOptions {
  organizationCurrency?: string
  /** Rows `GET /currencies` returns, or a status to fail it with. */
  catalogue?: CatalogueRow[] | { failWith: number }
}

function organization(code: string): Organization {
  return {
    id: 1,
    name: 'Acme',
    slug: 'acme',
    primary_color: null,
    background_color: null,
    currency_code: code,
    logo_url: null,
    default_webhook_url: null,
    default_webhook_events: null,
    has_default_webhook_secret: false,
    created_at: null,
    updated_at: null,
  }
}

export async function mockCurrencyContext(
  page: Page,
  options: CurrencyMockOptions = {}
): Promise<CurrencyMock> {
  const state: CurrencyMock = {
    organizationCurrency: options.organizationCurrency ?? 'USD',
    patches: [],
  }
  const catalogue = options.catalogue ?? [USD_ROW]

  await page.route(
    (url) => url.pathname === '/organization',
    async (route: Route) => {
      if (!isDataRequest(route)) return route.continue()

      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON() as { currency_code?: string }
        state.patches.push(body)
        if (body.currency_code) state.organizationCurrency = body.currency_code
      }

      return jsonRoute(route, { data: organization(state.organizationCurrency) })
    }
  )

  await page.route(
    (url) => url.pathname === '/currencies',
    (route) => {
      if (!isDataRequest(route)) return route.continue()

      return 'failWith' in catalogue
        ? jsonRoute(route, { message: 'boom' }, catalogue.failWith)
        : jsonRoute(route, { data: catalogue })
    }
  )

  return state
}

/**
 * `amount` as the browser formats it (the app locale in these specs is `it`),
 * currency code included. Evaluated in the page, never hardcoded, so it follows
 * whatever ICU the engine ships.
 */
export async function expectedMoney(
  page: Page,
  amount: number,
  currency = 'USD',
  decimals = 2
): Promise<string> {
  return page.evaluate(
    ({ amount, currency, decimals }) =>
      new Intl.NumberFormat('it', {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(amount),
    { amount, currency, decimals }
  )
}

/**
 * The visible reconciliation note of a converted amount (`money.convertedNote`,
 * Italian): the original USD amount, the rate and the rate's date, each formatted
 * by the browser under test.
 */
export async function expectedNote(page: Page, usd: number): Promise<string> {
  const rate = await page.evaluate(
    (rate) => new Intl.NumberFormat('it', { maximumFractionDigits: 6 }).format(rate),
    EUR_RATE
  )
  const date = await page.evaluate(
    (asOf) =>
      new Intl.DateTimeFormat('it', { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date(`${asOf}T00:00:00Z`)
      ),
    EUR_ROW.rate_as_of as string
  )

  return `Convertito da ${await expectedMoney(page, usd)} a 1 USD = ${rate} EUR, tasso del ${date}`
}
