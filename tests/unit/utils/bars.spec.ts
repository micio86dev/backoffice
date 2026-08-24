/**
 * bars.ts (PR B3, task 19.1; widened to {1,2,3,4,5,-1} — bars-full-scale-1-5
 * PR 2, task 2.1)
 *
 * Pure BARS rendering-state helpers, correctness-critical per DESIGN.md §8.3:
 *   - Indicator scores are one integer from {1,2,3,4,5} ∪ {-1}; `-1`/`null`
 *     means UNASSESSABLE, never a numeric chip. `4`/`2` are residual levels
 *     and MUST render as their own distinct, non-neutral chip state — NEVER
 *     `unassessable` (D6, admin-backoffice spec "Indicator Chip Mapping Never
 *     Launders Out-Of-Domain Values Into Unassessable").
 *   - Any other numeric value (0, 6, a decimal, NaN) is a data-integrity bug
 *     and MUST map to an explicit `invalid` state — also never laundered
 *     into `unassessable`, which would hide the defect from the operator.
 *   - Competency mean thresholds: <2.5 error, 2.5–3.5 warning, >3.5 success;
 *     `null` (all-unassessable) renders neutral, never as if it were 0.
 */
import { describe, it, expect } from 'vitest'
import { indicatorChipState, competencyMeanState } from '../../../app/utils/bars'

describe('indicatorChipState', () => {
  it('maps 1 to error', () => {
    expect(indicatorChipState(1)).toBe('error')
  })

  it('maps 3 to warning', () => {
    expect(indicatorChipState(3)).toBe('warning')
  })

  it('maps 5 to success', () => {
    expect(indicatorChipState(5)).toBe('success')
  })

  it('maps null (API-mapped sentinel) to unassessable', () => {
    expect(indicatorChipState(null)).toBe('unassessable')
  })

  it('maps raw -1 (reference-fixture sentinel) to unassessable', () => {
    expect(indicatorChipState(-1)).toBe('unassessable')
  })

  it('maps 2 to below-mid (residual level, distinct from unassessable)', () => {
    expect(indicatorChipState(2)).toBe('below-mid')
    expect(indicatorChipState(2)).not.toBe('unassessable')
  })

  it('maps 4 to above-mid (residual level, distinct from unassessable)', () => {
    expect(indicatorChipState(4)).toBe('above-mid')
    expect(indicatorChipState(4)).not.toBe('unassessable')
  })

  it('maps out-of-domain integer 0 to invalid, never unassessable', () => {
    expect(indicatorChipState(0)).toBe('invalid')
    expect(indicatorChipState(0)).not.toBe('unassessable')
  })

  it('maps out-of-domain integer 6 to invalid, never unassessable', () => {
    expect(indicatorChipState(6)).toBe('invalid')
    expect(indicatorChipState(6)).not.toBe('unassessable')
  })

  it('maps a decimal (2.5) to invalid, never unassessable', () => {
    expect(indicatorChipState(2.5)).toBe('invalid')
    expect(indicatorChipState(2.5)).not.toBe('unassessable')
  })

  it('maps NaN to invalid, never unassessable', () => {
    expect(indicatorChipState(Number.NaN)).toBe('invalid')
    expect(indicatorChipState(Number.NaN)).not.toBe('unassessable')
  })
})

describe('competencyMeanState', () => {
  it('is error below 2.5', () => {
    expect(competencyMeanState(2.33)).toBe('error')
  })

  it('is warning at exactly 2.5 (lower boundary is inclusive of warning)', () => {
    expect(competencyMeanState(2.5)).toBe('warning')
  })

  it('is warning at exactly 3.5 (upper boundary is inclusive of warning)', () => {
    expect(competencyMeanState(3.5)).toBe('warning')
  })

  it('is success above 3.5', () => {
    expect(competencyMeanState(3.67)).toBe('success')
  })

  it('is unassessable when mean is null (all indicators unassessable — never 0)', () => {
    expect(competencyMeanState(null)).toBe('unassessable')
  })
})
