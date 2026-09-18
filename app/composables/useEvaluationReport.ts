/**
 * useEvaluationReport — typed read over GET /api/participants/{id}/evaluation
 * (D2 Evaluation scope, D6, D9).
 *
 * `EvaluationReportData`/`EvaluationCompetencyResult`/`EvaluationBehavior`/
 * `EvaluationAuditVerdict` are ALL DERIVED from the generated
 * `types/api.ts` schema now (`components['schemas']['EvaluationResource']`)
 * — nothing here is hand-typed for that portion. Until api commit
 * `42cfd1f` (`fix(scoring-audit): type EvaluationResource's toArray for
 * Scramble`, scoring-audit-jev follow-up), `EvaluationResource` exported as
 * a generic `{[key: string]: unknown}` because
 * `AdminEvaluationSerializer::toArray()` carried no `@scramble-return`
 * annotation; that commit added one (mirroring `CompetencyResource`/
 * `FrameworkVersionResource`'s existing pattern), and Scramble now emits the
 * real shape, including the `audit` sub-object — confirmed by reading the
 * regenerated `types/api.ts` directly this batch.
 *
 * `EvaluationScoringMeta`/`EvaluationAuditMeta` (`meta.scoring`/`meta.audit`)
 * remain HAND-TYPED — a genuine, disclosed, structural exception, not a gap
 * anyone missed. See their own docblocks below for why.
 *
 * `behaviors[].score` is `number | null`: the server pre-maps its `-1`
 * "unassessable" sentinel to `null` before it ever reaches the wire — see
 * app/utils/bars.ts for why callers don't need to special-case either shape.
 *
 * A rejection (409 lifecycle_not_ready / 403 / 404 / network) is NOT caught
 * here — the caller (the participant detail page) is responsible for
 * distinguishing those states (D4's whole reason for choosing 409 over a
 * generic error).
 *
 * `fetchEvaluation()` returns `{ data, meta, auditMeta }` (D7,
 * bars-full-scale-1-5; `auditMeta` added by scoring-audit-jev P6, design D9):
 * `meta` is the Evaluation's scoring provenance (`prompt_version`,
 * `model_version`, `framework_version` — the resolved string, never the FK
 * id), unwrapped from the API response's `meta.scoring` sibling of `data`.
 * `auditMeta` is the LATEST audit run's own provenance/counters, unwrapped
 * from `meta.audit`, or `null` when the evaluation has never been audited
 * (`AdminEvaluationSerializer::auditMeta()` — legitimately `null`, unlike
 * `behaviors[].audit`, which is never a missing key). Nothing is computed
 * here; this is a pure read-through of what the API already exposes.
 */
import type { components } from '../../types/api'
import { useApi } from './useApi'

/**
 * `EvaluationResource`'s generated shape — an index signature over
 * competency code (`AdminEvaluationSerializer::serialize()` keys the
 * response by competency code, so the type cannot name the keys, only the
 * value shape every one of them shares).
 */
type RawEvaluationResource = components['schemas']['EvaluationResource']

/** One competency's result — the generated index signature's value type. */
export type EvaluationCompetencyResult = RawEvaluationResource[string]

/** One indicator's row, including its `audit` verdict. */
export type EvaluationBehavior = EvaluationCompetencyResult['behaviors'][number]

/**
 * One indicator's audit verdict (scoring-audit-jev design D9,
 * `AdminEvaluationSerializer::serializeAudit()`). ADDITIVE ONLY — never a
 * missing key on `EvaluationBehavior`, even for an indicator that was never
 * audited (`status: 'never_audited'`).
 *
 * `status` is typed `string` by the generated schema (the PHPDoc shape
 * behind it declares `status: string`, not a literal union) — the closed
 * five-value wire vocabulary (`judged`/`unavailable`/`malformed`/`skipped`/
 * `never_audited`) is enforced at the DATABASE CHECK and the serializer, not
 * expressible in this generated type. `utils/audit.ts`'s mapping functions
 * treat it as an open string with a safe fallback for exactly this reason.
 */
export type EvaluationAuditVerdict = EvaluationBehavior['audit']

export type EvaluationReportData = RawEvaluationResource

/**
 * `meta.scoring` — the Evaluation's scoring provenance, unwrapped from
 * `EvaluationResource::with()`'s `meta` envelope.
 *
 * HAND-TYPED, DISCLOSED, STRUCTURAL EXCEPTION — not a gap anyone missed.
 * Confirmed by reading the installed `dedoc/scramble` vendor source directly
 * (api commit `42cfd1f`'s own docblock on `EvaluationResource::with()`
 * records the same finding): `JsonResourceTypeToSchema::toSchema()` resolves
 * a JsonResource's exported schema EXCLUSIVELY from a `MethodCallReferenceType`
 * on `toArray()` — `with()` is never invoked, referenced, or merged by
 * either `JsonResourceExtension` or `JsonResourceTypeToSchema`. No
 * `@scramble-return` annotation on `with()` can change this; Scramble simply
 * never looks. This is NOT the same class of gap `behaviors[].audit` had
 * (a missing annotation on an inspected method) — it is a tool limitation on
 * a method Scramble structurally never inspects. Restructuring
 * `EvaluationResource` so `meta` traveled through `toArray()` instead of
 * `with()` would fix it, but risks breaking every existing `meta.scoring`
 * consumer and is explicitly out of scope for this fix (per the api commit's
 * own docblock). `EvaluationKeySetTest.php` (api) remains the compensating
 * drift guard for this shape.
 */
export interface EvaluationScoringMeta {
  prompt_version: string
  model_version: string
  framework_version: string
}

/**
 * `meta.audit` — one audit RUN's own provenance and counters (design D9,
 * `AdminEvaluationSerializer::auditMeta()`), or `null` when the evaluation
 * has never been audited. Same disclosed exception as `EvaluationScoringMeta`
 * above — both travel through `EvaluationResource::with()`, which Scramble
 * structurally never inspects (see that interface's docblock for the full
 * account). Mirrors `EvaluationScoringMeta`'s shape, one grain over (run,
 * not evaluation).
 */
export interface EvaluationAuditMeta {
  run_id: number
  status: 'completed' | 'partial' | 'failed'
  judge_model_version: string
  audit_prompt_version: string
  created_at: string
  indicators_total: number
  indicators_judged: number
  indicators_skipped: number
  indicators_unavailable: number
  indicators_malformed: number
}

interface EvaluationResponse {
  data: EvaluationReportData
  meta: { scoring: EvaluationScoringMeta; audit: EvaluationAuditMeta | null }
}

export function useEvaluationReport() {
  const { apiFetch } = useApi()

  async function fetchEvaluation(id: number | string): Promise<{
    data: EvaluationReportData
    meta: EvaluationScoringMeta
    auditMeta: EvaluationAuditMeta | null
  }> {
    const response = await apiFetch<EvaluationResponse>(`/participants/${id}/evaluation`)
    return { data: response.data, meta: response.meta.scoring, auditMeta: response.meta.audit }
  }

  return { fetchEvaluation }
}
