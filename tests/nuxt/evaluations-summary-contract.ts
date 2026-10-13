/**
 * COMPILE-TIME contract test — enforced by `bun run typecheck` (see
 * `candidate-table-contract.ts` for why this lives in `tests/nuxt/`).
 *
 * `reports/index.vue` casts the summary payload to the hand-written
 * `EvaluationsSummary` because Scramble mistypes `by_status` as `unknown[]`
 * (it is a status-keyed object at runtime). That cast would hide any other
 * drift, so everything EXCEPT `by_status` is pinned to the generated schema,
 * and `by_status` is pinned to the known mistype: the day the API fixes it
 * this file stops compiling, which is the cue to drop the cast.
 */
import type { EvaluationsSummary } from '../../app/components/organisms/ReportSummary.vue'
import type { paths } from '../../types/api'

type SummaryPayload =
  paths['/evaluations/summary']['get']['responses']['200']['content']['application/json']['data']

type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

export const summaryCompetenciesMatchGeneratedSchema: MutuallyAssignable<
  EvaluationsSummary['competencies'],
  SummaryPayload['competencies']
> = true

export const summaryKeysMatchGeneratedSchema: MutuallyAssignable<
  keyof EvaluationsSummary,
  keyof SummaryPayload
> = true

/** Fails to compile once Scramble stops emitting `unknown[]` for `by_status`. */
export const summaryByStatusIsStillMistyped: MutuallyAssignable<
  SummaryPayload['by_status'],
  unknown[]
> = true
