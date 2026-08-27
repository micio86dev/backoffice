/**
 * useSessionReview — the interview session review surface (C11).
 *
 * Mostly hand-typed, for the same reason as the dashboard composables:
 * Scramble cannot trace a shape through a JsonResource `toArray()`. Source of
 * truth is `api/app/Http/Resources/Admin/SessionReviewResource.php`.
 *
 * `cost` is the exception and is DERIVED from the generated client — the
 * generator gets that one right, and see its own docblock for why a
 * hand-written copy would be a liability rather than a safeguard. Prefer
 * deriving any future field the generator types correctly; hand-write only
 * what it gets wrong, and say which.
 *
 * `SessionSummaryResource` also carries `llm_cost_usd` (a per-session LLM
 * total, `null` when the session was never billed). It is deliberately NOT
 * surfaced on `SessionSummary` yet: the session LIST does not price sessions
 * today, and adding a bare figure to a list without the two-meter framing the
 * review gives it (DESIGN.md §8.2.5) is how a cost number gets read as a bill.
 */
import { useApi } from './useApi'
import type { components } from '../../types/api'

export interface IntegrityEventRow {
  kind: string
  ts: string
  payload: Record<string, unknown>
}

export interface IntegritySummary {
  score: number
  /**
   * NULL means the system has NO OPINION, not that the risk is low.
   *
   * A detector that never started produces zero events, and zero events used to
   * render as "Rischio basso" — the product asserting a candidate's integrity
   * from observations nobody made. `null` arrives when a layer reported itself
   * unavailable and the measured score is below the medium threshold.
   *
   * `medium` and `high` still arrive under partial coverage: a measurement never
   * taken can only RAISE the true score, so they remain valid lower bounds and
   * withholding them would hide a real finding.
   */
  band: 'low' | 'medium' | 'high' | null
  coverage_complete: boolean
  unavailable_layers: string[]
  total: number
  counts: Record<string, number>
  events: IntegrityEventRow[]
  second_monitor: boolean
  tab_hidden_sec: number
  face_absent_sec: number
  looking_away_sec: number
  multiple_faces_sec: number
  second_voice_sec: number
  fullscreen_exits: number
  clipboard_copies: number
  clipboard_pastes: number
}

export interface SnapshotRow {
  url: string
  taken_at: string
}

export interface SessionSummary {
  id: number
  competency_code: string
  question_index: number
  provider: string
  status: string
  ended_reason: string | null
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  integrity_event_count: number
}

export interface SessionReview extends SessionSummary {
  participant_id: number
  provider_session_ref: string | null
  integrity: IntegritySummary
  snapshots: SnapshotRow[]
  /**
   * TWO meters, never one total, and always an estimate.
   *
   * DERIVED from the generated client rather than restated here. Scramble
   * types `integrity` wrongly (it reports `counts` as a `string` and both
   * `events` and `unavailable_layers` as `unknown[]`), which is why the rest
   * of this interface stays hand-written — but it gets `cost` exactly right,
   * and a hand-written copy of a shape the generator already knows is a
   * second source of truth that can only drift. If the server adds a field
   * here it appears without an edit; if one is removed, this file stops
   * compiling.
   *
   * `avatar` is null when the session cannot be priced (unfinished, or an
   * unrecognised provider). `llm` is null when there is NO usage row at all —
   * the binding resolved unbound or degraded, so nothing was billed. Neither
   * is ever rendered as zero: zero is a price.
   */
  cost: components['schemas']['SessionReviewResource']['cost']
}

export function useSessionReview() {
  const { apiFetch } = useApi()

  async function listSessions(participantId: number | string): Promise<{ data: SessionSummary[] }> {
    return apiFetch<{ data: SessionSummary[] }>(`/participants/${participantId}/sessions`)
  }

  async function fetchReview(sessionId: number | string): Promise<{ data: SessionReview }> {
    return apiFetch<{ data: SessionReview }>(`/interview-sessions/${sessionId}/review`)
  }

  return { listSessions, fetchReview }
}
