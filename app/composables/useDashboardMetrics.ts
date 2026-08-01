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
}

export interface DashboardMetricsResponse {
  data: DashboardMetrics
}

export function useDashboardMetrics() {
  const { apiFetch } = useApi()

  async function fetchMetrics(): Promise<DashboardMetricsResponse> {
    return apiFetch<DashboardMetricsResponse>('/dashboard/metrics')
  }

  return { fetchMetrics }
}
