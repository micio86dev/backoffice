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
