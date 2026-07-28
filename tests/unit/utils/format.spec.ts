/**
 * format.ts (PR B2 — RED)
 *
 * i18n-aware date/number formatting (admin-backoffice spec, "i18n and
 * Locale-Aware Formatting" requirement) — Intl.DateTimeFormat /
 * Intl.NumberFormat only, never manual string formatting.
 */
import { describe, it, expect } from 'vitest'
import { formatDate, formatPercent } from '../../../app/utils/format'

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
