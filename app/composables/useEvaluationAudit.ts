/**
 * useEvaluationAudit — typed write over
 * `POST /api/participants/{id}/evaluation/audit` (scoring-audit-jev design
 * D12, admin-backoffice spec "An Operator Can Trigger An Audit Run And See
 * Its Status"). Thin wiring over `useApi().apiFetch`, mirroring
 * `useParticipantRecovery.ts` — a 409 refusal is NOT caught here; the
 * caller reads `.data.reason` (via `getErrorReason`) and maps it through
 * `auditRefusalReasonKey` below, never rendering the raw machine string.
 *
 * A successful trigger returns `{status:'queued', evaluation_id}` — a
 * CLIENT-LOCAL signal only (design D9/spec "An Operator Can Trigger…"): the
 * run's own persisted `status` is written exactly once, at completion, and
 * is read back later through `useEvaluationReport().fetchEvaluation()`'s
 * `auditMeta`, never polled from this endpoint.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

export type TriggerAuditResponse =
  paths['/participants/{id}/evaluation/audit']['post']['responses']['202']['content']['application/json']

/**
 * The CLOSED set of machine `reason` codes this route can refuse with
 * (design D12's ordered flow, steps 1/3/5). `lifecycle_not_ready` is
 * documented here despite the GENERATED OpenAPI type omitting it —
 * structurally, not from a missing annotation Scramble merely forgot: that
 * refusal is thrown from `AdminParticipantReader::read()` (step 3, called
 * deep inside `EvaluationAuditController::store()`) and rendered by a
 * GLOBAL exception mapper, `bootstrap/app.php:206`
 * (`$exceptions->render(function (LifecycleNotReadyException $e, ...) {...})`,
 * confirmed by reading that file directly this batch) — never a literal
 * `response()->json(...)` call inside the controller action itself, which is
 * the only shape Scramble's static analysis walks. There is no PHPDoc
 * annotation that would make this reason appear in the generated 409 union;
 * unlike the `EvaluationResource` gap flagged in `useEvaluationReport.ts`
 * (a genuinely fixable missing annotation), this one is a Scramble tracing
 * limit on GLOBAL exception handlers, not a fixable annotation gap. Hand-added
 * so callers do not silently miss the fourth documented reason.
 */
export const AUDIT_REFUSAL_REASONS = [
  'audit_disabled',
  'audit_already_running',
  'audit_lock_unavailable',
  'lifecycle_not_ready',
] as const

export type AuditRefusalReason = (typeof AUDIT_REFUSAL_REASONS)[number]

/**
 * Maps a 409's machine `reason` to its own i18n key (TOTAL function, same
 * shape as `utils/audit.ts`'s `auditOutcomeReasonKey`) — an unrecognised or
 * absent reason falls back to `report.audit.refusal.unknown`, never a bare
 * machine string rendered at the operator.
 */
export function auditRefusalReasonKey(reason: string | null): string {
  return (AUDIT_REFUSAL_REASONS as readonly string[]).includes(reason ?? '')
    ? `report.audit.refusal.${reason}`
    : 'report.audit.refusal.unknown'
}

export function useEvaluationAudit() {
  const { apiFetch } = useApi()

  async function triggerAudit(participantId: number | string): Promise<TriggerAuditResponse> {
    return apiFetch<TriggerAuditResponse>(`/participants/${participantId}/evaluation/audit`, {
      method: 'POST',
    })
  }

  return { triggerAudit }
}
