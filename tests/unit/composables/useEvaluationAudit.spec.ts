/**
 * useEvaluationAudit — typed write over
 * `POST /api/participants/{id}/evaluation/audit` (scoring-audit-jev design
 * D12, admin-backoffice spec "An Operator Can Trigger An Audit Run And See
 * Its Status"). Thin wiring over `useApi().apiFetch`, mirroring
 * `useParticipantRecovery.ts`.
 *
 * A 409 refusal carries one of FOUR documented machine `reason` codes
 * (design D12's ordered flow): `audit_disabled` (step 1, the kill switch),
 * `audit_already_running` / `audit_lock_unavailable` (step 5, the Redis
 * lock), and `lifecycle_not_ready` (step 3, buys the completato gate for
 * free via `AdminParticipantReader`). The generated OpenAPI type only
 * documents the first three — `lifecycle_not_ready` is raised by
 * `LifecycleNotReadyException`, auto-rendered by `bootstrap/app.php` rather
 * than an explicit `response()->json()` call Scramble can trace (the same
 * class of gap already flagged for `EvaluationResource` itself elsewhere in
 * this change) — so it is hand-added to the closed reason set here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('useEvaluationAudit', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('triggerAudit(participantId) POSTs to /participants/{id}/evaluation/audit and returns the 202 body', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue({ status: 'queued', evaluation_id: 42 })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useEvaluationAudit } = await import('../../../app/composables/useEvaluationAudit')
    const { triggerAudit } = useEvaluationAudit()

    const result = await triggerAudit(7)

    expect(apiFetchMock).toHaveBeenCalledWith('/participants/7/evaluation/audit', {
      method: 'POST',
    })
    expect(result).toEqual({ status: 'queued', evaluation_id: 42 })
  })

  it('propagates a 409 refusal to the caller unchanged', async () => {
    const refusal = Object.assign(new Error('conflict'), {
      status: 409,
      data: { reason: 'audit_already_running' },
    })
    const apiFetchMock = vi.fn().mockRejectedValue(refusal)
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useEvaluationAudit } = await import('../../../app/composables/useEvaluationAudit')
    const { triggerAudit } = useEvaluationAudit()

    await expect(triggerAudit(7)).rejects.toBe(refusal)
  })

  it('exposes the closed set of four documented 409 refusal reasons', async () => {
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: vi.fn() }),
    }))

    const { AUDIT_REFUSAL_REASONS } = await import('../../../app/composables/useEvaluationAudit')

    expect(AUDIT_REFUSAL_REASONS).toEqual([
      'audit_disabled',
      'audit_already_running',
      'audit_lock_unavailable',
      'lifecycle_not_ready',
    ])
  })

  it('auditRefusalReasonKey maps each documented reason to its own i18n key, and an unknown reason to the fallback', async () => {
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: vi.fn() }),
    }))

    const { auditRefusalReasonKey } = await import('../../../app/composables/useEvaluationAudit')

    expect(auditRefusalReasonKey('audit_disabled')).toBe('report.audit.refusal.audit_disabled')
    expect(auditRefusalReasonKey('audit_already_running')).toBe(
      'report.audit.refusal.audit_already_running'
    )
    expect(auditRefusalReasonKey('audit_lock_unavailable')).toBe(
      'report.audit.refusal.audit_lock_unavailable'
    )
    expect(auditRefusalReasonKey('lifecycle_not_ready')).toBe(
      'report.audit.refusal.lifecycle_not_ready'
    )
    expect(auditRefusalReasonKey('a_future_reason')).toBe('report.audit.refusal.unknown')
    expect(auditRefusalReasonKey(null)).toBe('report.audit.refusal.unknown')
  })
})
