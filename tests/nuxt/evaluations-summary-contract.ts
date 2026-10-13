/**
 * COMPILE-TIME contract test — enforced by `bun run typecheck` (see
 * `candidate-table-contract.ts` for why this lives in `tests/nuxt/`).
 *
 * `reports/index.vue` assigns the summary payload to the hand-written
 * `EvaluationsSummary` with no cast, so every field, `by_status` included, is
 * pinned to the generated schema: any drift between the two stops this file
 * from compiling.
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

export const summaryByStatusMatchesGeneratedSchema: MutuallyAssignable<
  EvaluationsSummary['by_status'],
  SummaryPayload['by_status']
> = true
