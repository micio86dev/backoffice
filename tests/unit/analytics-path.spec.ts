import { describe, expect, it } from 'vitest'
import { isAnalyticsSafeRoute, redactAnalyticsPath } from '~/utils/analytics-path'

/**
 * Nothing identifying reaches a third-party analytics sink (C13, task 5.4).
 *
 * The backoffice leaks differently from the candidate app, and arguably worse.
 * There is no token in the URL here — but `/participants/42` is a candidate
 * identifier, and the PAGE it names shows that candidate's transcript and their
 * scored evaluation.
 *
 * So a session replay of an operator's afternoon is a recording of several
 * named people's assessments, held by a third party, for as long as that third
 * party keeps it. Nobody consented to that, and nobody at BEAI can purge it.
 */

describe('redactAnalyticsPath', () => {
  it('replaces a participant id with a placeholder', () => {
    expect(redactAnalyticsPath('/participants/42')).toBe('/participants/:id')
    expect(redactAnalyticsPath('/participants/9f8e7d6c-1234')).toBe('/participants/:id')
  })

  it('replaces it under a locale prefix too', () => {
    // i18n runs prefix_except_default, so the same page also exists at /en/….
    // A rule that only knew the unprefixed form would leak every id an
    // English-speaking operator opened, while the Italian ones looked correct.
    expect(redactAnalyticsPath('/en/participants/42')).toBe('/en/participants/:id')
  })

  it('leaves the participants index alone', () => {
    // The list page carries no id, and collapsing it into the detail page would
    // destroy the only navigation signal analytics is here to provide.
    expect(redactAnalyticsPath('/participants')).toBe('/participants')
    expect(redactAnalyticsPath('/en/participants')).toBe('/en/participants')
  })

  it('strips the query string and fragment entirely', () => {
    // Removed wholesale rather than filtered: the participants list filters on
    // candidate_ref and status through the query string, so a parameter
    // allowlist would be a promise about every filter anyone ever adds.
    expect(redactAnalyticsPath('/participants?candidate_ref=acme-672&status=completato')).toBe(
      '/participants'
    )
    expect(redactAnalyticsPath('/?token=LEAK#LEAK')).toBe('/')
  })

  it('passes ordinary pages through unchanged', () => {
    expect(redactAnalyticsPath('/')).toBe('/')
    expect(redactAnalyticsPath('/login')).toBe('/login')
    expect(redactAnalyticsPath('/unsupported')).toBe('/unsupported')
  })

  it('never returns a bare numeric or uuid-looking segment after /participants/', () => {
    // The property, not the examples. A new id format — or a nested route added
    // later — fails here rather than in production.
    for (const path of [
      '/participants/1',
      '/participants/00000000-0000-0000-0000-000000000001',
      '/en/participants/999/',
    ]) {
      expect(redactAnalyticsPath(path)).toMatch(/\/participants\/:id$/)
    }
  })
})

describe('isAnalyticsSafeRoute', () => {
  it('marks participant pages as UNSAFE', () => {
    // Session replay records the DOM, and on these pages the DOM is somebody's
    // transcript and their BARS scores.
    expect(isAnalyticsSafeRoute('/participants/42')).toBe(false)
    expect(isAnalyticsSafeRoute('/participants')).toBe(false)
    expect(isAnalyticsSafeRoute('/en/participants/42')).toBe(false)
  })

  it('marks the login page as UNSAFE', () => {
    // Clarity masks input values by default, and defaults are exactly what a
    // future dashboard setting can change without anyone touching this repo.
    // A credential form is not worth the residual risk of a remote toggle.
    expect(isAnalyticsSafeRoute('/login')).toBe(false)
    expect(isAnalyticsSafeRoute('/en/login')).toBe(false)
  })

  it('marks the remaining pages as safe', () => {
    expect(isAnalyticsSafeRoute('/')).toBe(true)
    expect(isAnalyticsSafeRoute('/unsupported')).toBe(true)
  })
})
