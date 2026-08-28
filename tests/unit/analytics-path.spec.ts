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

  // Same reasoning as /login, one step stronger: /reset-password is where a
  // NEW credential is typed, and its URL carries a live single-use token in a
  // path segment. /forgot-password takes the address the whole flow refuses to
  // confirm the existence of.
  it('marks the password-recovery pages as UNSAFE', () => {
    expect(isAnalyticsSafeRoute('/forgot-password')).toBe(false)
    expect(isAnalyticsSafeRoute('/en/forgot-password')).toBe(false)
    expect(isAnalyticsSafeRoute('/reset-password')).toBe(false)
    expect(isAnalyticsSafeRoute('/reset-password/a-live-token')).toBe(false)
    expect(isAnalyticsSafeRoute('/en/reset-password/a-live-token')).toBe(false)
  })
})

/**
 * self-service-password-reset — the reset link is
 * `{origin}/reset-password/{token}?email={address}` (`SendPasswordResetLinkJob.php:135`),
 * so for the first time in this app a live credential rides in a backoffice
 * URL PATH. `redactAnalyticsPath` previously only collapsed
 * `/participants/:id`, which means the token would have reached GA4 as a
 * verbatim `page_path` and Sentry as a verbatim `request.url` — `redactUrl`
 * delegates here.
 */
describe('redactAnalyticsPath — the password reset token', () => {
  it('collapses the token segment to a placeholder', () => {
    expect(redactAnalyticsPath('/reset-password/a-live-single-use-token')).toBe(
      '/reset-password/:token'
    )
  })

  it('collapses it under a locale prefix too', () => {
    expect(redactAnalyticsPath('/en/reset-password/a-live-single-use-token')).toBe(
      '/en/reset-password/:token'
    )
  })

  it('leaves the token-less form of the route alone', () => {
    expect(redactAnalyticsPath('/reset-password')).toBe('/reset-password')
    expect(redactAnalyticsPath('/en/reset-password')).toBe('/en/reset-password')
    expect(redactAnalyticsPath('/forgot-password')).toBe('/forgot-password')
  })

  it('never returns anything but the placeholder after /reset-password/', () => {
    // The property, not the examples: Laravel's broker token is an opaque
    // 64-char hex string today, and this must hold whatever it becomes.
    for (const path of [
      '/reset-password/0123456789abcdef',
      '/reset-password/' + 'f'.repeat(64),
      '/en/reset-password/tok?email=ada%40example.com',
      '/reset-password/tok/',
    ]) {
      expect(redactAnalyticsPath(path)).toMatch(/\/reset-password\/:token$/)
    }
  })
})
