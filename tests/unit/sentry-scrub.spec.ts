import { describe, expect, it } from 'vitest'
import {
  redactUrl,
  scrubBreadcrumb,
  scrubSentryEvent,
  type ScrubbableEvent,
} from '~/utils/sentry-scrub'
import { sentryPosture } from '~/utils/sentry-init'

/**
 * Nothing confidential leaves for Sentry from the backoffice
 * (C13, task 5.1 — Nuxt half).
 *
 * Same shape as `api/tests/Feature/C13/SentryScrubberTest.php` and
 * `frontend/tests/unit/sentry-scrub.spec.ts`: nine tests, each naming ONE
 * class of leak this scrubber must close, proven by constructing a payload
 * that would leak the marker string if the scrubber were deleted (or
 * replaced with a no-op) and asserting it does not appear in the output.
 *
 * `sendDefaultPii: false` stops Sentry ATTACHING context automatically. It
 * does nothing about what this app hands Sentry itself — and this app's
 * business is entirely OTHER people's confidential data: transcripts,
 * scored evaluations, and the bearer credential that starts an interview.
 */

function eventWith(extra: Record<string, unknown>): ScrubbableEvent {
  return { extra }
}

describe('scrubSentryEvent — key-based denylist', () => {
  it('1. a participant transcript/excerpt never reaches the sink', () => {
    const answer = 'I once falsified a report under deadline pressure'

    const scrubbed = scrubSentryEvent(
      eventWith({
        transcript: answer,
        prompt: `Score this: ${answer}`,
        excerpts: [answer],
      })
    )

    // The whole point of the product is that a candidate's answers stay
    // between them and the organization that assessed them — the fact an
    // operator is looking at the screen does not change that.
    expect(JSON.stringify(scrubbed.extra)).not.toContain('falsified')
  })

  it('2. tokens and secrets never reach the sink', () => {
    const scrubbed = scrubSentryEvent(
      eventWith({
        authorization: 'Bearer eyJhbGciOi.LEAKED',
        api_key: 'beai_live_LEAKED',
        webhook_secret: 'whsec_LEAKED',
        refresh_token: 'rt_LEAKED',
      })
    )

    expect(JSON.stringify(scrubbed.extra)).not.toContain('LEAKED')
  })

  it('3. candidate identifiers never reach the sink, camelCase or snake_case', () => {
    const scrubbed = scrubSentryEvent(
      eventWith({
        candidate_ref: 'acme-672',
        candidateRef: 'acme-672',
        display_name: 'Mario Rossi',
        displayName: 'Mario Rossi',
      })
    )

    const encoded = JSON.stringify(scrubbed.extra)

    // candidate_ref is opaque to BEAI but NOT to the org that named it — it
    // is their key back to a person, identifying the moment it sits
    // alongside anything else.
    expect(encoded).not.toContain('acme-672')
    expect(encoded).not.toContain('Mario Rossi')
  })

  it('4. secrets nested at any depth are scrubbed', () => {
    const scrubbed = scrubSentryEvent(
      eventWith({
        context: { delivery: { payload: { answer: 'NESTED-LEAK' } } },
      })
    )

    // A top-level-only pass would look like it worked while letting the
    // real payload through — exceptions nest their context by nature.
    expect(JSON.stringify(scrubbed.extra)).not.toContain('NESTED-LEAK')
  })

  it('5. fields ending in Token/Secret/Key are scrubbed by convention, camelCase included', () => {
    const scrubbed = scrubSentryEvent(
      eventWith({
        providerApiKey: 'PK-LEAK',
        sessionToken: 'ST-LEAK',
        signingSecret: 'SS-LEAK',
      })
    )

    // Enumerating every future field name is impossible; the convention
    // covers what the denylist has not been told about yet.
    expect(JSON.stringify(scrubbed.extra)).not.toContain('LEAK')
  })
})

describe('scrubSentryEvent — backoffice-specific leak classes', () => {
  it('6. the generated entry-link URL never reaches the sink', () => {
    // POST /entry-links returns { entry_url }, rendered and copied in
    // EntryLinkPanel.vue. Whoever holds this URL can start THAT candidate's
    // interview — it IS a bearer credential, not merely a link.
    const scrubbed = scrubSentryEvent(
      eventWith({
        entry_url: 'https://app.beai.io/interview/LEAKED-BEARER-TOKEN',
        entryUrl: 'https://app.beai.io/interview/LEAKED-BEARER-TOKEN',
      })
    )

    expect(JSON.stringify(scrubbed.extra)).not.toContain('LEAKED-BEARER-TOKEN')
  })

  it('7. PII carried in a list-filter query string is stripped from breadcrumb URLs', () => {
    // The participants list filters through its own query string
    // (app/utils/analytics-path.ts) — an operator searching for a candidate
    // by name puts that name directly in the XHR/fetch breadcrumb URL.
    const scrubbed = scrubBreadcrumb({
      category: 'fetch',
      data: { url: 'https://api.beai.io/api/participants?candidate_ref=LEAKED-SEARCH-TERM' },
    })

    expect(scrubbed.data?.['url']).not.toContain('LEAKED-SEARCH-TERM')
  })
})

describe('scrubSentryEvent — user context and non-sensitive diagnostics', () => {
  it('8. user context is dropped entirely', () => {
    const scrubbed = scrubSentryEvent({
      user: { id: 'operator-7', email: 'ops@example.com' },
    })

    // Dropped rather than scrubbed field by field: an operator's identity
    // adds nothing to a stack trace that org scope does not already give,
    // and there is no case where keeping it is worth the risk of a future
    // SDK version adding a field this module has never heard of.
    expect(scrubbed.user).toBeUndefined()
  })

  it('9. diagnostic context that is NOT sensitive survives, and Sentry is inert without a DSN', () => {
    const scrubbed = scrubSentryEvent(
      eventWith({
        route_name: 'participants-index',
        http_status: 500,
        latency_ms: 1234,
      })
    )

    // A denylist rather than an allowlist, deliberately: an allowlist would
    // strip the context that makes an error report useful, and an unusable
    // error reporter gets switched off — a worse outcome than a scrubbed one.
    expect(scrubbed.extra).toEqual({
      route_name: 'participants-index',
      http_status: 500,
      latency_ms: 1234,
    })

    // No DSN is committed anywhere in this repo, and none should be — it is
    // a per-deployment credential. `sentryPosture` must therefore report the
    // SDK as disabled by construction, not merely "given an empty string".
    const posture = sentryPosture('', 'local')
    expect(posture.enabled).toBe(false)
    expect(posture.sendDefaultPii).toBe(false)

    // And PII stays pinned off even for a real deployment DSN — not a
    // preference any environment gets to flip.
    expect(sentryPosture('https://key@o0.ingest.sentry.io/1', 'production').sendDefaultPii).toBe(
      false
    )
  })
})

describe('redactUrl', () => {
  it('collapses a participant detail URL to its template form', () => {
    expect(redactUrl('https://ops.beai.io/participants/42?tab=transcript')).toBe(
      'https://ops.beai.io/participants/:id'
    )
  })

  it('passes through undefined and empty strings unchanged', () => {
    expect(redactUrl(undefined)).toBeUndefined()
    expect(redactUrl('')).toBe('')
  })
})
