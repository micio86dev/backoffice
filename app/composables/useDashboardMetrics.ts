/**
 * useDashboardMetrics — GET /api/dashboard/metrics (D7).
 *
 * `DashboardMetricsResource`'s generated schema is a generic
 * `additionalProperties: {}` object — Scramble cannot trace a shape through
 * `DashboardMetricsResource`'s passthrough `toArray()` (same pre-existing
 * limitation already documented for `EvaluationResource` since A2; confirmed
 * NOT a regression). The runtime shape below is hand-typed from
 * `api/app/Http/Controllers/Api/DashboardController.php::metrics()`, which
 * IS the source of truth until Scramble can infer it — no cost/currency
 * field exists anywhere (D7: token usage only, no billing schema).
 */
import { useApi } from './useApi'

export interface DashboardMetrics {
  participants_by_status: Record<string, number>
  evaluations_by_status: Record<string, number>
  completion_rate: number
  ai_usage: {
    input_tokens: number
    output_tokens: number
    latency_ms_p50: number | null
    latency_ms_p95: number | null
  }
  /**
   * What this organization's assessments have cost, in USD.
   *
   * Reported apart as well as summed because the two answer different
   * questions: scoring is per completed evaluation and predictable,
   * conversation is per minute of interview and is the one that moves when
   * candidates talk longer.
   *
   * `currency` is carried rather than assumed — a bare number on a dashboard
   * is read in whatever currency the reader happens to think in.
   */
  costs: {
    scoring_usd: number
    conversation_usd: number
    total_usd: number
    currency: string
  }
}

export interface DashboardMetricsResponse {
  data: DashboardMetrics
}

/**
 * One row of the recent-activity feed.
 *
 * Hand-typed for the same reason as `DashboardMetrics` above: Scramble cannot
 * trace a shape through a JsonResource's `toArray()`. Source of truth is
 * `api/app/Http/Resources/Admin/DashboardActivityResource.php`.
 */
export interface DashboardActivityRow {
  /**
   * Addresses the candidate inside this product, and is what the feed links
   * on. `candidate_ref` below is the CALLING SYSTEM's opaque identifier and
   * addresses nothing here.
   */
  id: number
  candidate_ref: string
  display_name: string
  status: string
  project_name: string | null
  updated_at: string
}

export interface DashboardActivityResponse {
  data: DashboardActivityRow[]
}

export function useDashboardMetrics() {
  const { apiFetch } = useApi()

  async function fetchMetrics(): Promise<DashboardMetricsResponse> {
    return apiFetch<DashboardMetricsResponse>('/dashboard/metrics')
  }

  async function fetchActivity(): Promise<DashboardActivityResponse> {
    return apiFetch<DashboardActivityResponse>('/dashboard/activity')
  }

  return { fetchMetrics, fetchActivity }
}
