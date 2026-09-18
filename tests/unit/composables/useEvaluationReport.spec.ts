/**
 * useEvaluationReport.ts (PR B3, task 20.1 support; widened return shape for
 * scoring provenance — bars-full-scale-1-5 D7, task 2.8)
 *
 * Typed read over GET /api/participants/{id}/evaluation. The generated
 * `types/api.ts` schema for `EvaluationResource` is a generic
 * `{[key: string]: unknown}` (Scramble's passthrough-toArray() limitation,
 * already documented for `AdminEvaluationSerializer`/`DashboardMetrics` in
 * prior B2 batches) — this composable hand-types the response to match
 * `AdminEvaluationSerializer::serializeCompetencyResult()` exactly
 * (api/app/Services/Admin/AdminEvaluationSerializer.php:96-119).
 *
 * `fetchEvaluation()` returns `{ data, meta }` — `meta.scoring` carries the
 * Evaluation's `prompt_version`/`model_version`/`framework_version` (D7), a
 * response SIBLING of `data`, never merged into the competency map.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  EvaluationScoringMeta,
  EvaluationAuditMeta,
} from '../../../app/composables/useEvaluationReport'

/**
 * `EvaluationScoringMeta`/`EvaluationAuditMeta` are the ONE genuinely
 * hand-typed pair left in this composable (`meta.scoring`/`meta.audit` —
 * Scramble structurally never inspects `JsonResource::with()`, so no
 * generated equivalent can exist; see `useEvaluationReport.ts`'s own
 * docblocks). The compensating drift guard for the REST of the shape is the
 * generated `types/api.ts` snapshot (`bun run codegen:check`); for THESE two
 * interfaces specifically, that guard does not reach — `EvaluationKeySetTest.php`
 * (api) pins the same class of shape on the server side, but that test lives
 * in a different repo this one's own CI may not always run alongside.
 *
 * This is the LOCAL, backoffice-side pin: a literal fixture typed against
 * each interface. TypeScript's excess-property checking on an object LITERAL
 * assigned to a typed `const` catches BOTH directions of drift at
 * `bun run typecheck` time — a field ADDED to the interface fails here with
 * a missing-property error (TS2741/TS2739) until the fixture is updated to
 * match, and a field REMOVED from the interface fails with an excess-property
 * error (TS2353) on whatever the fixture still declares. The runtime
 * `Object.keys()` assertion below is the same pin, restated so it also shows
 * up in a `bun run test:unit` failure message, not only a typecheck one.
 */
describe('useEvaluationReport — meta.scoring / meta.audit shape is pinned locally (drift guard)', () => {
  it('EvaluationScoringMeta carries exactly the documented keys', () => {
    const fixture: EvaluationScoringMeta = {
      prompt_version: '2.0.0',
      model_version: 'claude-haiku-4-5-20251001',
      framework_version: '1.4.0',
    }

    expect(Object.keys(fixture).sort()).toEqual(
      ['framework_version', 'model_version', 'prompt_version'].sort()
    )
  })

  it('EvaluationAuditMeta carries exactly the documented keys', () => {
    const fixture: EvaluationAuditMeta = {
      run_id: 7,
      status: 'completed',
      judge_model_version: 'jev-1',
      audit_prompt_version: '1.0.0',
      created_at: '2026-09-18T10:00:00+00:00',
      indicators_total: 10,
      indicators_judged: 10,
      indicators_skipped: 0,
      indicators_unavailable: 0,
      indicators_malformed: 0,
    }

    expect(Object.keys(fixture).sort()).toEqual(
      [
        'audit_prompt_version',
        'created_at',
        'indicators_judged',
        'indicators_malformed',
        'indicators_skipped',
        'indicators_total',
        'indicators_unavailable',
        'judge_model_version',
        'run_id',
        'status',
      ].sort()
    )
  })
})

describe('useEvaluationReport', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('fetchEvaluation(id) calls GET /participants/{id}/evaluation and returns { data, meta }', async () => {
    const evaluationData = {
      SLF: {
        score: 4,
        reliability: '67%',
        behaviors: [
          { indicator: 'a', score: 5, explanation: 'x', excerpts: ['e1'] },
          { indicator: 'b', score: 3, explanation: 'y', excerpts: ['e2'] },
          { indicator: 'c', score: null, explanation: 'z', excerpts: [] },
        ],
      },
    }
    const scoringMeta = {
      prompt_version: '2.0.0',
      model_version: 'claude-haiku-4-5-20251001',
      framework_version: '1.4.0',
    }
    const apiFetchMock = vi
      .fn()
      .mockResolvedValue({ data: evaluationData, meta: { scoring: scoringMeta } })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useEvaluationReport } = await import('../../../app/composables/useEvaluationReport')
    const { fetchEvaluation } = useEvaluationReport()

    const result = await fetchEvaluation(42)

    expect(apiFetchMock).toHaveBeenCalledWith('/participants/42/evaluation')
    expect(result.data).toEqual(evaluationData)
    expect(result.meta).toEqual(scoringMeta)
  })

  it('propagates a rejection (e.g. 409 lifecycle_not_ready) to the caller unchanged', async () => {
    const notReadyError = Object.assign(new Error('conflict'), { status: 409 })
    const apiFetchMock = vi.fn().mockRejectedValue(notReadyError)
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useEvaluationReport } = await import('../../../app/composables/useEvaluationReport')
    const { fetchEvaluation } = useEvaluationReport()

    await expect(fetchEvaluation(42)).rejects.toBe(notReadyError)
  })

  // scoring-audit-jev P6.2 — the backend's ADDITIVE `behaviors[].audit`
  // (design D9) and its `meta.audit` sibling now surface through this
  // composable, verbatim, alongside `meta.scoring`. Field names copied from
  // the REAL api response shape (`AdminEvaluationSerializer::serializeAudit()`
  // / `::auditMeta()`), not the design doc's code sketch — `outcome_reason`,
  // never `reason` (the same C-E/D9 drift already corrected api-side).
  it('surfaces behaviors[].audit and meta.audit verbatim alongside meta.scoring', async () => {
    const evaluationData = {
      SLF: {
        score: 4,
        reliability: '67%',
        behaviors: [
          {
            indicator: 'a',
            score: 5,
            explanation: 'x',
            excerpts: ['e1'],
            unassessable_reason: null,
            audit: { status: 'judged', support_probability: 0.82, outcome_reason: null },
          },
          {
            indicator: 'b',
            score: null,
            explanation: '',
            excerpts: [],
            unassessable_reason: 'model_declared',
            audit: { status: 'never_audited', support_probability: null, outcome_reason: null },
          },
        ],
        unscorable_reason: null,
      },
    }
    const scoringMeta = {
      prompt_version: '2.0.0',
      model_version: 'claude-haiku-4-5-20251001',
      framework_version: '1.4.0',
    }
    const auditMeta = {
      run_id: 7,
      status: 'completed',
      judge_model_version: 'jev-1',
      audit_prompt_version: '1.0.0',
      created_at: '2026-09-18T10:00:00+00:00',
      indicators_total: 2,
      indicators_judged: 1,
      indicators_skipped: 0,
      indicators_unavailable: 0,
      indicators_malformed: 0,
    }
    const apiFetchMock = vi.fn().mockResolvedValue({
      data: evaluationData,
      meta: { scoring: scoringMeta, audit: auditMeta },
    })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useEvaluationReport } = await import('../../../app/composables/useEvaluationReport')
    const { fetchEvaluation } = useEvaluationReport()

    const result = await fetchEvaluation(42)

    expect(result.data.SLF?.behaviors[0]?.audit).toEqual({
      status: 'judged',
      support_probability: 0.82,
      outcome_reason: null,
    })
    expect(result.data.SLF?.behaviors[1]?.audit).toEqual({
      status: 'never_audited',
      support_probability: null,
      outcome_reason: null,
    })
    expect(result.auditMeta).toEqual(auditMeta)
    expect(result.meta).toEqual(scoringMeta)
  })

  // meta.audit legitimately renders `null` for a never-audited evaluation
  // (design D9's own EvaluationResource docblock: "meta.audit is null", not
  // "never a missing key" — that stronger guarantee is behaviors[].audit only).
  it('returns auditMeta: null when the evaluation has never been audited', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue({
      data: {},
      meta: {
        scoring: { prompt_version: '1', model_version: 'm', framework_version: 'f' },
        audit: null,
      },
    })
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useEvaluationReport } = await import('../../../app/composables/useEvaluationReport')
    const { fetchEvaluation } = useEvaluationReport()

    const result = await fetchEvaluation(42)

    expect(result.auditMeta).toBeNull()
  })
})
