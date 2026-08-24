/**
 * Pure BARS rendering-state helpers (DESIGN.md §8.3, admin-backoffice spec
 * "BARS Report Viewer Rendering Correctness" / "Indicator Chip Mapping Never
 * Launders Out-Of-Domain Values Into Unassessable").
 *
 * Indicator scores are one integer from {1,2,3,4,5} ∪ {-1} produced by the
 * scoring pipeline (D1/D6, bars-full-scale-1-5). `4` and `2` are RESIDUAL
 * levels — legal only when the evidence matches neither bounding anchor —
 * and render as their own distinct, non-neutral chip state, never
 * `unassessable`. `-1` is the reference-fixture sentinel for "unassessable"
 * (esempio-report-valutazione.json); the live admin API pre-maps `-1` to
 * `null` (`AdminEvaluationSerializer::serializeCompetencyResult()`). Both are
 * treated identically here so callers never special-case which shape they
 * received — `number | null` already covers `-1` as a plain number.
 *
 * Never printed as `-1`/`0`: an unassessable indicator or an all-unassessable
 * competency mean renders as a neutral `–`, never a numeric chip.
 */

export type BarsChipState =
  'error' | 'below-mid' | 'warning' | 'above-mid' | 'success' | 'unassessable' | 'invalid'

const UNASSESSABLE_SENTINEL = -1

/**
 * Indicator-level chip state. `indicatorChipState` is a TOTAL function: every
 * `number | null` input maps to a defined state. A value outside the legal
 * domain {1,2,3,4,5} — 0, 6, a decimal, NaN, Infinity, … — is a
 * data-integrity bug and MUST map to the explicit `invalid` state, NEVER to
 * `unassessable`. Laundering an out-of-domain value into the neutral
 * "not assessable" chip would hide a defect from the operator instead of
 * surfacing it (D6).
 *
 * `Number.isInteger` is checked BEFORE the switch specifically so that `-1`
 * and `null` (legitimate sentinels) are caught first, while a decimal like
 * `2.5` cannot fall into the integer `switch`'s `default` branch by accident
 * of loose equality.
 */
export function indicatorChipState(score: number | null): BarsChipState {
  if (score === null || score === UNASSESSABLE_SENTINEL) return 'unassessable'
  if (!Number.isInteger(score)) return 'invalid' // 2.5, NaN, Infinity, …
  switch (score) {
    case 5:
      return 'success'
    case 4:
      return 'above-mid'
    case 3:
      return 'warning'
    case 2:
      return 'below-mid'
    case 1:
      return 'error'
    default:
      return 'invalid' // 0, 6, -2, …
  }
}

/**
 * Competency-mean chip state. Thresholds per DESIGN.md §8.3: `<2.5 error`,
 * `2.5–3.5 warning` (inclusive both ends), `>3.5 success`. `null` means every
 * indicator in the competency was unassessable — no mean exists, so it is
 * NEVER treated as (and must never render as) `0`.
 */
export function competencyMeanState(mean: number | null): BarsChipState {
  if (mean === null) return 'unassessable'
  if (mean < 2.5) return 'error'
  if (mean <= 3.5) return 'warning'
  return 'success'
}
