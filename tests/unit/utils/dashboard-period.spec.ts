/**
 * Turning a month/year choice into the range the API expects.
 *
 * Pure functions, tested by running rather than by reading a template: this is
 * calendar arithmetic, which is where off-by-ones live. The API takes an
 * INCLUSIVE range of days and extends `to` to the end of that day, so the
 * client sends the last day of the month rather than the first of the next —
 * sending an exclusive bound would silently include a day that belongs to the
 * following month.
 */
import { describe, it, expect } from 'vitest'
import { periodToRange, yearsBack } from '../../../app/utils/dashboard-period'

describe('periodToRange', () => {
  it('all time is an empty range, not a very wide one', () => {
    // Empty means the API applies no filter at all. A "wide" range would still
    // exclude anything older than whatever bound we invented.
    expect(periodToRange({ kind: 'all' })).toEqual({})
  })

  it('a month runs from its first day to its LAST', () => {
    expect(periodToRange({ kind: 'month', year: 2026, month: 3 })).toEqual({
      from: '2026-03-01',
      to: '2026-03-31',
    })
  })

  it('handles the short months', () => {
    expect(periodToRange({ kind: 'month', year: 2026, month: 4 }).to).toBe('2026-04-30')
  })

  it('handles February in a leap year', () => {
    // 2024 is a leap year; hardcoding 28 would drop the 29th every four years.
    expect(periodToRange({ kind: 'month', year: 2024, month: 2 }).to).toBe('2024-02-29')
    expect(periodToRange({ kind: 'month', year: 2026, month: 2 }).to).toBe('2026-02-28')
  })

  it('a whole year runs 1 January to 31 December', () => {
    expect(periodToRange({ kind: 'year', year: 2026 })).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    })
  })

  it('pads single-digit months and days', () => {
    // `2026-1-1` is not a date the API accepts, and the failure would be a 422
    // the operator cannot explain.
    const range = periodToRange({ kind: 'month', year: 2026, month: 1 })

    expect(range.from).toBe('2026-01-01')
    expect(range.to).toBe('2026-01-31')
  })
})

describe('yearsBack', () => {
  it('lists the current year first, descending', () => {
    // Most recent first: an operator asking about a period almost always means
    // a recent one, and making them scroll past 2019 to reach it is friction
    // for the common case.
    expect(yearsBack(2026, 3)).toEqual([2026, 2025, 2024])
  })
})
