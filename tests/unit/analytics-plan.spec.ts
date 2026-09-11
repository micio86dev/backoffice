import { describe, expect, it } from 'vitest'
import { analyticsPlan, gaConfigPayload } from '~/utils/analytics'
import { redactAnalyticsPath } from '~/utils/analytics-path'

/**
 * What actually loads, and what it is allowed to send (C13, tasks 5.3 / 5.4).
 *
 * The decision is a pure function on purpose. Whether GA4 starts for this
 * visitor, and with what page path, is not something to discover by reading a
 * plugin's control flow in a browser.
 */

const ids = { gaMeasurementId: 'G-TEST123' }

describe('analyticsPlan — Microsoft Clarity is not a backoffice tool', () => {
  it('never returns a loadClarity field, under any input', () => {
    // Clarity was removed from the backoffice (session replay over candidate
    // PII was judged a privacy liability an internal admin tool must not
    // carry — see openspec/specs/observability/spec.md). The absence is
    // structural, not a value pinned to false: there is no field left to
    // accidentally start reading, and no ID left to configure one back in.
    const plan = analyticsPlan({ ...ids, consentGranted: true, path: '/participants/42' })

    expect(plan).not.toHaveProperty('loadClarity')
  })
})

describe('analyticsPlan — the default is OFF', () => {
  it('loads nothing when no ID is configured', () => {
    const plan = analyticsPlan({ gaMeasurementId: '', consentGranted: true, path: '/' })

    expect(plan.loadGa).toBe(false)
  })

  it('loads nothing without consent, even with an ID configured', () => {
    const plan = analyticsPlan({ ...ids, consentGranted: false, path: '/' })

    // Consent defaults to denied and there is no UI yet to grant it — see
    // docs/observability.md. Same posture as the GDPR purge: built, correct,
    // and inert until a human decision exists.
    expect(plan.loadGa).toBe(false)
  })

  it('loads GA once consented and configured', () => {
    const plan = analyticsPlan({ ...ids, consentGranted: true, path: '/' })

    expect(plan.loadGa).toBe(true)
  })
})

describe('analyticsPlan — candidate data still redacted from GA', () => {
  it('still counts participant pages in GA, but only as a redacted path', () => {
    const plan = analyticsPlan({ ...ids, consentGranted: true, path: '/participants/42' })

    // Dropping these pages from analytics entirely would remove the only signal
    // about how operators actually use the backoffice. A page count is not
    // personal data; the id in the URL is.
    expect(plan.loadGa).toBe(true)
    expect(plan.pagePath).toBe('/participants/:id')
    expect(plan.pagePath).not.toContain('42')
  })
})

describe('gaConfigPayload — what GA4 is allowed to see', () => {
  const payload = gaConfigPayload('/participants/:id')

  it('sends the redacted path and NOT the real location', () => {
    expect(payload.page_path).toBe('/participants/:id')

    // GA4 defaults to reading window.location itself. Overriding page_path
    // alone is not enough — page_location would still carry the id — so it is
    // pinned empty.
    expect(payload.page_location).toBe('')
  })

  it('turns off advertising signals and personalization', () => {
    // Operators are staff at a customer organization, not an advertising
    // audience, and a remarketing segment built from this traffic would tell
    // every advertiser who buys it which companies are running assessments.
    expect(payload.allow_google_signals).toBe(false)
    expect(payload.allow_ad_personalization_signals).toBe(false)
  })

  it('anonymizes IP and does not send a user id', () => {
    expect(payload.anonymize_ip).toBe(true)
    expect(payload).not.toHaveProperty('user_id')
    expect(payload).not.toHaveProperty('client_id')
  })

  it('carries no candidate identifier under any key', () => {
    const encoded = JSON.stringify(
      gaConfigPayload(redactAnalyticsPath('/participants/9f8e7d6c-1234?candidate_ref=acme-672'))
    )

    // A whole-object assertion rather than a per-field one: the risk is a field
    // somebody adds later, not one of the four above.
    //
    // The literal ":id" is deliberately NOT forbidden — it is the placeholder
    // that PROVES the redaction ran. Forbidding the word rather than the value
    // is the kind of assertion satisfied by renaming the placeholder, which
    // would leave the leak exactly where it was.
    expect(encoded).not.toContain('9f8e7d6c')
    expect(encoded).not.toContain('acme-672')
    expect(encoded).toContain(':id')
  })
})
