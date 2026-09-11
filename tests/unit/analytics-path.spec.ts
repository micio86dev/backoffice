import { describe, expect, it } from 'vitest'
import {
  isAnalyticsSafeRoute,
  redactAnalyticsPath,
  redactEmbeddedPaths,
} from '~/utils/analytics-path'

/**
 * Nothing identifying reaches GA4, and no tracking-consent dialog floats over
 * a sensitive page (C13, task 5.4).
 *
 * `/participants/42` is a candidate identifier, and the PAGE it names shows
 * that candidate's transcript and their scored evaluation — `redactAnalyticsPath`
 * is what stops the id itself reaching GA4. `isAnalyticsSafeRoute` is a
 * separate, narrower control: it only decides where the consent banner may
 * appear, not what may load — see `app/utils/analytics-path.ts` for why the
 * two are not the same function.
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

  it('redacts the id even under a nested route, not only at the end of the path', () => {
    // A single-trailing-segment pattern only ever sees paths of the exact
    // shape its own test corpus builds. Add one more segment and the id used
    // to survive verbatim: /participants/42/transcript reached GA4 and
    // Sentry unredacted, because the anchor required the id to be the LAST
    // segment. There is no such route today, but a breadcrumb or a mistyped
    // deep link does not need one to exist to reach this function.
    expect(redactAnalyticsPath('/participants/42/transcript')).toBe('/participants/:id/transcript')
    expect(redactAnalyticsPath('/en/participants/42/edit')).toBe('/en/participants/:id/edit')
  })

  it('redacts the id under the /api mount too, not only router paths', () => {
    // nuxt.config.ts's runtimeConfig.public.apiBase MUST include the /api
    // suffix (Dockerfile:26) — Laravel's CORS middleware only covers
    // api/*, so every composable call is apiFetch('/participants/${id}')
    // against a base that already ends in /api. The actual fetch/XHR URL
    // Sentry captures as a breadcrumb is therefore /api/participants/42,
    // not /participants/42 — a shape this pattern never matched, so the
    // id reached Sentry verbatim through every real participant request
    // (useParticipants, useTranscript, useEvaluationReport,
    // useParticipantRecovery), exactly the leak class
    // sentry-scrub.ts's own docblock names as closed.
    expect(redactAnalyticsPath('/api/participants/42')).toBe('/api/participants/:id')
    expect(redactAnalyticsPath('/api/participants/42/transcript')).toBe(
      '/api/participants/:id/transcript'
    )
  })
})

describe('isAnalyticsSafeRoute', () => {
  it('marks participant pages as UNSAFE', () => {
    // The page renders somebody's transcript and their BARS scores; a
    // tracking-consent dialog has no business floating over it.
    expect(isAnalyticsSafeRoute('/participants/42')).toBe(false)
    expect(isAnalyticsSafeRoute('/participants')).toBe(false)
    expect(isAnalyticsSafeRoute('/en/participants/42')).toBe(false)
  })

  it('marks the login page as UNSAFE', () => {
    // A cookie-consent dialog floating over a credential form is the wrong
    // thing in the wrong place, whatever tool it is asking permission for.
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

describe('redactEmbeddedPaths — a path quoted inside free text, not the whole string', () => {
  it('redacts a candidate id ofetch quotes inside its own error message', () => {
    // ofetch builds its error message as `[${method}] ${JSON.stringify(url)}:
    // ...` — the URL is embedded mid-sentence, not the whole string, so
    // redactAnalyticsPath (which only recognises a path that IS the whole
    // input) never sees it. This is what reaches Sentry through an
    // unhandled FetchError's `exception.values[].value`.
    expect(redactEmbeddedPaths('[GET] "/api/participants/42": 500 Internal Server Error')).toBe(
      '[GET] "/api/participants/:id": 500 Internal Server Error'
    )
  })

  it('redacts a bare relative path embedded in a console message', () => {
    expect(redactEmbeddedPaths('Failed to load /participants/42')).toBe(
      'Failed to load /participants/:id'
    )
  })

  it('redacts the reset token the same way, prefix and all', () => {
    expect(redactEmbeddedPaths('request to /api/reset-password/a-live-token failed')).toBe(
      'request to /api/reset-password/:token failed'
    )
  })

  it('leaves text with no participants/reset-password path untouched', () => {
    expect(redactEmbeddedPaths('Vue warn: #app not found')).toBe('Vue warn: #app not found')
  })

  it('still redacts when the path IS the whole string, same as redactAnalyticsPath', () => {
    expect(redactEmbeddedPaths('/participants/42')).toBe('/participants/:id')
  })
})
