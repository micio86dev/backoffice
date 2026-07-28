/**
 * bars.ts (PR B3, task 19.1 — RED)
 *
 * Pure BARS rendering-state helpers, correctness-critical per DESIGN.md §8.3:
 *   - Indicator scores are the discrete set {1,3,5}; `-1`/`null` means
 *     UNASSESSABLE, never a numeric chip.
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
