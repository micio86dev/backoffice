/**
 * format.ts (PR B2 — RED)
 *
 * i18n-aware date/number formatting (admin-backoffice spec, "i18n and
 * Locale-Aware Formatting" requirement) — Intl.DateTimeFormat /
 * Intl.NumberFormat only, never manual string formatting.
 */
import { describe, it, expect } from 'vitest'
import {
  formatDate,
  formatPercent,
  formatCompetencyMean,
  formatDuration,
  formatUsdAmount,
} from '../../../app/utils/format'

describe('formatDate', () => {
  it('formats an ISO date string using Intl.DateTimeFormat for the given locale', () => {
    const result = formatDate('2026-03-14T10:30:00Z', 'en')
    expect(result).toBe(
      new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date('2026-03-14T10:30:00Z')
      )
    )
  })

  it('produces a DIFFERENT string for the it locale than for en (proves the locale param is used)', () => {
    const en = formatDate('2026-03-14T10:30:00Z', 'en')
    const it = formatDate('2026-03-14T10:30:00Z', 'it')
    expect(en).not.toBe(it)
  })

  it('returns an em dash for a null date (e.g. completed_at before completion)', () => {
    expect(formatDate(null, 'en')).toBe('–')
  })
})

describe('formatPercent', () => {
  it('formats a 0-1 ratio as a locale-aware percentage', () => {
    expect(formatPercent(0.75, 'en')).toBe(
      new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0 }).format(0.75)
    )
  })

  it('formats zero as 0%, not an empty string', () => {
    expect(formatPercent(0, 'en')).toBe(
      new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0 }).format(0)
    )
  })
})

describe('formatCompetencyMean', () => {
  it('keeps a trailing .0 for a whole-number mean (SLF fixture: 5,3,-1 -> mean 4.0)', () => {
    // DESIGN.md §8.3 / admin-backoffice spec: the mean must display as "4.0",
    // never "4" (would look truncated/integer) and never "4.00" (the other
    // reference example, COL, is "3.67" — two decimals only when needed).
    expect(formatCompetencyMean(4, 'en')).toBe('4.0')
  })

  it('rounds a repeating-decimal mean to 2 decimals (COL fixture: 5,3,3 -> mean 3.67)', () => {
    expect(formatCompetencyMean(11 / 3, 'en')).toBe('3.67')
  })

  it('returns an en dash for a null mean (all indicators unassessable — never 0)', () => {
    expect(formatCompetencyMean(null, 'en')).toBe('–')
  })
})

describe('formatDuration', () => {
  // formerly duplicated in SessionList.vue and SessionReviewPanel.vue
  // (design.md D7 utils/format.ts entry) — extracted here so a third copy
  // is never written.
  const t = (key: string, params?: Record<string, unknown>) => `${key}:${JSON.stringify(params)}`

  it('delegates to the translated review.durationValue key with minutes/seconds split from the total', () => {
    expect(formatDuration(605, t)).toBe('review.durationValue:{"minutes":10,"seconds":5}')
  })

  it('splits a DIFFERENT total into a DIFFERENT minutes/seconds pair (proves real division, not a fixed fixture)', () => {
    expect(formatDuration(42, t)).toBe('review.durationValue:{"minutes":0,"seconds":42}')
  })

  it('returns an em dash for null seconds, never 0 (an unfinished interview is not a zero-length one)', () => {
    expect(formatDuration(null, t)).toBe('–')
  })
})

describe('formatUsdAmount', () => {
  // The `$` sign lives in the `review.costValue` copy key; this returns the
  // NUMBER only, so both cost lines on a review render through one formatter
  // and cannot drift apart.
  it('renders a dollars-and-cents figure with two fraction digits', () => {
    expect(formatUsdAmount(2, 'en')).toBe('2.00')
    expect(formatUsdAmount(2.5, 'en')).toBe('2.50')
  })

  it('is locale-aware, never a hand-built string', () => {
    expect(formatUsdAmount(1234.5, 'it')).toBe(
      new Intl.NumberFormat('it', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(1234.5)
    )
  })

  // One interview's conversation-LLM spend is routinely under a cent. Two
  // fraction digits would round a real charge down to 0.00, which reads as
  // free — a price, and the wrong one.
  it('keeps a sub-cent charge visible instead of rounding it to zero', () => {
    expect(formatUsdAmount(0.0087, 'en')).toBe('0.0087')
    expect(formatUsdAmount(0.0002, 'en')).toBe('0.0002')
  })

  // Significant digits, not a fixed decimal count: a fixed count only moves
  // the boundary at which a real charge starts rendering as zero.
  it('stays non-zero however small the charge is', () => {
    expect(formatUsdAmount(0.000012, 'en')).toBe('0.000012')
  })

  // The widened precision applies ONLY below a cent: a $2.34567 estimate must
  // not start rendering four decimals of noise.
  it('does not widen precision for figures at or above a cent', () => {
    expect(formatUsdAmount(2.34567, 'en')).toBe('2.35')
    expect(formatUsdAmount(0.0187, 'en')).toBe('0.02')
    expect(formatUsdAmount(0.01, 'en')).toBe('0.01')
  })

  // A real zero is a price the API states deliberately; it is NOT the
  // "we did not run this" case, which arrives as null and never reaches here.
  it('renders an explicit zero as zero', () => {
    expect(formatUsdAmount(0, 'en')).toBe('0.00')
  })
})
