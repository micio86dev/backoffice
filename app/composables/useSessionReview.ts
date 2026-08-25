/**
 * useSessionReview — the interview session review surface (C11).
 *
 * Hand-typed for the same reason as the dashboard composables: Scramble cannot
 * trace a shape through a JsonResource `toArray()`. Source of truth is
 * `api/app/Http/Resources/Admin/SessionReviewResource.php`.
 */
import { useApi } from './useApi'

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
   * Avatar minutes only, and always an estimate. LLM token spend is absent by
   * design: `ai_requests` carries no session id, so it cannot be attributed to
   * one session without inventing the link.
   */
  cost: {
    avatar: { provider: string; minutes: number; usd: number } | null
    is_estimate: true
  }
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
