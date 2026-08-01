/**
 * Pure BARS rendering-state helpers (DESIGN.md §8.3, admin-backoffice spec
 * "BARS Report Viewer Rendering Correctness").
 *
 * Indicator scores are the discrete set {1,3,5} produced by the scoring
 * pipeline. `-1` is the reference-fixture sentinel for "unassessable"
 * (esempio-report-valutazione.json); the live admin API pre-maps `-1` to
 * `null` (`AdminEvaluationSerializer::serializeCompetencyResult()`). Both are
 * treated identically here so callers never special-case which shape they
 * received — `number | null` already covers `-1` as a plain number.
 *
 * Never printed as `-1`/`0`: an unassessable indicator or an all-unassessable
 * competency mean renders as a neutral `–`, never a numeric chip.
 */

export type BarsChipState = 'error' | 'warning' | 'success' | 'unassessable'

const UNASSESSABLE_SENTINEL = -1

/**
 * Indicator-level chip state. Anything outside {1,3,5} (besides the
 * unassessable sentinels) is a data-integrity bug per DESIGN.md §8.3 ("A
 * chip rendering 2 or 4 is a bug, not a styling choice") — defensively
 * treated as unassessable (neutral) rather than guessing a color, since
 * silently picking error/warning/success for an out-of-contract value would
 * misrepresent the candidate's score.
 */
export function indicatorChipState(score: number | null): BarsChipState {
  if (score === null || score === UNASSESSABLE_SENTINEL) return 'unassessable'
  if (score === 1) return 'error'
  if (score === 3) return 'warning'
  if (score === 5) return 'success'
  return 'unassessable'
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
