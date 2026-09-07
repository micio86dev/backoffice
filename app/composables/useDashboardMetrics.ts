/**
 * useDashboardMetrics — GET /api/dashboard/metrics (D7).
 *
 * BOTH response types are aliases of the generated client. Nothing here is
 * hand-maintained.
 *
 * They used to be hand-written interfaces, defended with "Scramble cannot trace
 * a shape through a passthrough `toArray()`". That was never true — the API
 * resources were simply missing `@scramble-return`, while their constructor
 * `@param` had spelled the shapes out all along. The excuse outlived the fact
 * and was extended to a second type that never needed it: the activity row was
 * already fully typed in the spec.
 *
 * Both copies caused real damage. The activity row declared
 * `project_name: string | null` — correct against the PHP, and therefore
 * silently absorbing a PUBLISHED contract that said non-nullable, leaving a
 * wrong spec shipping to every other consumer. And renaming `costs.total_usd`
 * on the API failed nothing at all: not the drift check, not a typecheck, and
 * the figure an operator reconciles against an invoice rendered from
 * `undefined`.
 *
 * With the API resources annotated and these aliased, that rename is now
 * `TS2339` here — verified by mutating the generated type. The class docblock
 * that claimed the metrics resource "NEVER carries a cost/currency field", seven
 * lines above a `@param` declaring `costs`, is corrected in the same pass: what
 * is true is the different statement that there is no BILLING schema — no MRR,
 * no invoices, no plan.
 */ import { useApi } from './useApi'
import type { components, operations } from '../../types/api'

export type DashboardMetrics = components['schemas']['DashboardMetricsResource']

export interface DashboardMetricsResponse {
  data: DashboardMetrics
}

/**
 * One row of the recent-activity feed.
 *
 * See the file docblock: both types are aliases now, for the same reason. This
 * one used to carry its own justification claiming the metrics schema "is still
 * a bare object" — false since `@scramble-return` was added to
 * `DashboardMetricsResource`, and left standing next to a file docblock that
 * said the opposite. Two claims about one schema, and the wrong one was the
 * load-bearing excuse for hand-writing an interface here.
 */
export type DashboardActivityRow = components['schemas']['DashboardActivityResource']

export interface DashboardActivityResponse {
  data: DashboardActivityRow[]
}

/**
 * An inclusive range of DAYS, `YYYY-MM-DD`. Both ends optional; omitting both
 * means all time, which is what every caller got before this existed.
 *
 * GENERATED, like the two response types above — and it could not have been
 * until now. The API validated `from`/`to` inside a static helper, which
 * Scramble cannot see, so the spec published no parameters at all and
 * `types/api.ts` emitted `query?: never` for both endpoints. The entire filter
 * lived in this file and in the API's parser with nothing between them: rename
 * a parameter server-side and the only symptom was a dashboard quietly
 * reporting all time.
 *
 * `NonNullable` because the generated `query` is optional at the operation
 * level; the members inside it are what this type is for.
 */
export type DashboardRange = NonNullable<operations['dashboard.metrics']['parameters']['query']>

export function useDashboardMetrics() {
  const { apiFetch } = useApi()

  /**
   * The date range, as the API expects it.
   *
   * Both endpoints take the SAME range and the caller passes one object to
   * both, so the tiles and the activity list cannot end up describing
   * different periods — a dashboard that contradicts itself says nothing on
   * screen about it.
   */
  function rangeQuery(range?: DashboardRange): string {
    if (!range?.from && !range?.to) return ''

    const params = new URLSearchParams()
    if (range.from) params.set('from', range.from)
    if (range.to) params.set('to', range.to)

    return `?${params.toString()}`
  }

  async function fetchMetrics(range?: DashboardRange): Promise<DashboardMetricsResponse> {
    return apiFetch<DashboardMetricsResponse>(`/dashboard/metrics${rangeQuery(range)}`)
  }

  async function fetchActivity(range?: DashboardRange): Promise<DashboardActivityResponse> {
    return apiFetch<DashboardActivityResponse>(`/dashboard/activity${rangeQuery(range)}`)
  }

  return { fetchMetrics, fetchActivity }
}
