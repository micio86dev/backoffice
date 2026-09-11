import { describe, expect, it } from 'vitest'
import {
  redactFreeText,
  redactUrl,
  scrubBreadcrumb,
  scrubSentryEvent,
  type ScrubbableEvent,
} from '~/utils/sentry-scrub'
import { sentryPosture } from '~/utils/sentry-init'
import { isAnalyticsSafeRoute, redactAnalyticsPath } from '~/utils/analytics-path'

/**
 * Nothing confidential leaves for Sentry from the backoffice
 * (C13, task 5.1 — Nuxt half).
 *
 * Same shape as `api/tests/Feature/C13/SentryScrubberTest.php` and
 * `frontend/tests/unit/sentry-scrub.spec.ts`: numbered tests, each naming ONE
 * class of leak this scrubber must close, proven by constructing a payload
 * that would leak the marker string if the scrubber were deleted (or
 * replaced with a no-op) and asserting it does not appear in the output.
 * Tests 10-11 exist only in this file for now — see `redactFreeText`'s
 * docblock for why `message`/`exception.values[].value` needed a second pass
 * beyond `redactUrl`, not yet mirrored into the other two scrubbers.
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
        email: 'mario.rossi@example.test',
      })
    )

    const encoded = JSON.stringify(scrubbed.extra)

    // candidate_ref is opaque to BEAI but NOT to the org that named it — it
    // is their key back to a person, identifying the moment it sits
    // alongside anything else.
    expect(encoded).not.toContain('acme-672')
    expect(encoded).not.toContain('Mario Rossi')

    // The email is the candidate's GLOBAL identity key (CLAUDE.md ruling 8,
    // reversed 2026-09-01) and is named in the GDPR retention sign-off
    // (ruling 2). `redactAnalyticsPath` already strips `?email=` from URLs —
    // the codebase agreed it was sensitive before the denylist did.
    expect(encoded).not.toContain('mario.rossi@example.test')
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

  it('7b. a candidate id in a participant DETAIL breadcrumb is redacted under the /api mount', () => {
    // Test 7 uses the LIST endpoint, where the query string is stripped
    // wholesale regardless of any path bug — it passes for the wrong reason
    // and never exercises this path. Every real request is
    // apiFetch('/participants/${id}') against runtimeConfig.public.apiBase,
    // which MUST include the /api suffix (Dockerfile:26), so the URL Sentry
    // actually captures is .../api/participants/42 — a shape
    // redactAnalyticsPath never matched, letting the id reach Sentry
    // verbatim through every real participant-detail request.
    const scrubbed = scrubBreadcrumb({
      category: 'fetch',
      data: { url: 'https://api.beai.io/api/participants/LEAKED-CANDIDATE-ID' },
    })

    expect(scrubbed.data?.['url']).not.toContain('LEAKED-CANDIDATE-ID')
    expect(scrubbed.data?.['url']).toBe('https://api.beai.io/api/participants/:id')
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

  // self-service-password-reset. The `token` DENIED_KEYS entry only covers a
  // key on an object; the reset link carries the token as a URL PATH SEGMENT
  // (`SendPasswordResetLinkJob.php:135`), which reaches Sentry through
  // `request.url` and through every navigation breadcrumb.
  it('collapses the reset token out of a URL, which the key denylist cannot reach', () => {
    expect(
      redactUrl('https://ops.beai.io/reset-password/a-live-token?email=ada%40example.com')
    ).toBe('https://ops.beai.io/reset-password/:token')
  })

  it('collapses it out of a bare-path breadcrumb too', () => {
    // Vue Router breadcrumbs pass `to`/`from` as paths, not absolute URLs.
    const scrubbed = scrubBreadcrumb({
      category: 'navigation',
      data: { from: '/login', to: '/reset-password/a-live-token' },
    })

    expect(scrubbed.data?.['to']).toBe('/reset-password/:token')
    expect(JSON.stringify(scrubbed)).not.toContain('a-live-token')
  })
})

describe('redactFreeText — message and exception values are prose, not addresses', () => {
  it('10. leaves ordinary diagnostic text untouched, even when it contains # or ?', () => {
    // redactUrl treats its whole argument as an address, so running a plain
    // console-warning message through it split the text on its first `#` or
    // `?` and silently dropped everything after — no failing build, no
    // visible symptom, an untested branch that had never been seen to do
    // anything, correct or not.
    expect(redactFreeText('Vue warn: #app not found')).toBe('Vue warn: #app not found')
    expect(redactFreeText('XHR failed: /x?y=1')).toBe('XHR failed: /x?y=1')
  })

  it('11. collapses an entry-link URL embedded inside an exception message', () => {
    // POST /entry-links returns a bearer credential (entry_url) that is a
    // URL, not merely an identifier. The key-based denylist (test 6) catches
    // it as a field on `extra`, but a thrown Error's own message is free
    // text, not a keyed field — `entry link ${entryUrl} rejected` sails
    // through a key-based scrubber untouched.
    const message =
      'Failed to copy entry link: https://app.beai.io/interview/LEAKED-BEARER-TOKEN rejected'

    expect(redactFreeText(message)).not.toContain('LEAKED-BEARER-TOKEN')
    expect(redactFreeText(message)).toBe('Failed to copy entry link: https://app.beai.io rejected')
  })

  it('still redacts a message that IS a bare path in full, not merely absolute URLs', () => {
    // Some Vue Router breadcrumb integrations pass the route itself as
    // `message` rather than as `data.to`/`data.from`.
    expect(redactFreeText('/reset-password/a-live-token')).toBe('/reset-password/:token')
  })

  it('keeps the diagnostic when prose merely BEGINS with a slash', () => {
    // The bare-route fast path delegates to `redactAnalyticsPath`, which
    // returns only what precedes the first `?` or `#`. Correct for a route,
    // destructive for a sentence: this line came back as `/participants`,
    // dropping the query (right) AND `returned 500` — the only diagnostic in
    // it. Whitespace is what separates the two cases; a real route has none.
    const message = '/participants?status=failed returned 500'

    expect(redactFreeText(message)).toContain('returned 500')
    expect(redactFreeText(message)).not.toContain('status=failed')
  })

  it('still collapses a candidate id when the prose begins with a slash', () => {
    // The whitespace escape hatch must not become a way to smuggle an id
    // past the redactor: falling through to the general branch has to be at
    // least as safe as the fast path it skipped.
    const message = '/participants/42/transcript failed to load'

    expect(redactFreeText(message)).not.toContain('/42')
    expect(redactFreeText(message)).toContain('failed to load')
  })

  it('12. redacts a candidate id ofetch quotes mid-sentence in its own error message', () => {
    // ofetch builds its error message as `[${method}] ${JSON.stringify(url)}:
    // …` (ofetch/dist/shared/*.mjs) — the path rides inside a sentence,
    // quoted, with a status code after it. That string does not START with
    // `/`, so the fast path above never caught it, and it is exactly what
    // reaches Sentry through `exception.values[].value` on an unhandled
    // FetchError from a real apiFetch('/participants/${id}') call, since
    // apiBase MUST be relative (Dockerfile:123) and MUST include `/api`
    // (Dockerfile:26).
    expect(
      redactFreeText('[GET] "/api/participants/LEAKED-CANDIDATE-ID": 500 Internal Server Error')
    ).toBe('[GET] "/api/participants/:id": 500 Internal Server Error')
  })
})

describe('scrubBreadcrumb and scrubSentryEvent — free-text fields go through redactFreeText', () => {
  it("a breadcrumb's plain-text message is not mangled", () => {
    const scrubbed = scrubBreadcrumb({ category: 'console', message: 'Vue warn: #app not found' })

    expect(scrubbed.message).toBe('Vue warn: #app not found')
  })

  it("an exception's message and its values[].value are scrubbed for embedded URLs", () => {
    const scrubbed = scrubSentryEvent({
      message: 'entry link https://app.beai.io/interview/LEAKED-BEARER-TOKEN rejected',
      exception: {
        values: [
          { type: 'Error', value: 'https://app.beai.io/interview/LEAKED-BEARER-TOKEN rejected' },
        ],
      },
    })

    const encoded = JSON.stringify(scrubbed)
    expect(encoded).not.toContain('LEAKED-BEARER-TOKEN')
  })
})

/**
 * `enabled: false` was trusted to make the SDK inert. It does not.
 *
 * Verified in a real browser on 2026-09-02: with `sentryDsn: ""` the page
 * still ends up with a populated `window.__SENTRY__` carrier — the SDK is
 * constructed, registers globals, and brings its vendored web-vitals along.
 * That is where `Uncaught TypeError: Cannot read properties of undefined
 * (reading 'startTime') at et.reportAllChanges` comes from: nothing in this
 * app's own code observes web vitals, and Sentry is the only dependency that
 * bundles a copy.
 *
 * `sentry-init.ts`'s own docblock says it exists so "does an empty DSN
 * actually turn Sentry off" is a one-line assertion rather than something
 * inferred from reading a plugin and trusting it. This is that assertion —
 * and the answer it was written to protect turned out to be no.
 */
describe('shouldInitSentry', () => {
  it('refuses to initialise without a DSN', async () => {
    const { shouldInitSentry } = await import('~/utils/sentry-init')

    expect(shouldInitSentry('')).toBe(false)
    expect(shouldInitSentry('   ')).toBe(false)
  })

  it('initialises when a DSN is configured', async () => {
    const { shouldInitSentry } = await import('~/utils/sentry-init')

    expect(shouldInitSentry('https://abc@o1.ingest.sentry.io/2')).toBe(true)
  })
})

describe('redaction is total, not merely total for the case it was written against', () => {
  it('redacts a bearer entry_url even when the message happens to begin with a slash', () => {
    // gga finding 1. The leading-slash branch redacted the first token and
    // pasted the remainder back VERBATIM, so it reached neither
    // redactEmbeddedPaths nor the absolute-URL reduction. The module's whole
    // reason for reducing absolute URLs is that `entry link ${entryUrl}
    // rejected` has no key for the denylist to catch — and that guarantee
    // switched off the moment a message started with `/`.
    const message =
      '/participants/42 failed: entry link https://app.beai.io/interview/LEAKED-BEARER-TOKEN rejected'
    const out = redactFreeText(message)

    expect(out).not.toContain('LEAKED-BEARER-TOKEN')
    expect(out).not.toContain('/42')
  })

  it('redacts a SECOND path later in a message that begins with a slash', () => {
    const out = redactFreeText('/dashboard redirect to /api/participants/42/transcript')

    expect(out).not.toContain('/42')
    expect(out).toContain('/dashboard')
  })

  it('redacts the list route query when it rides inside prose', () => {
    // gga finding 3. EMBEDDED_PATH_SEGMENTS required an id segment, so the
    // LIST route — which carries the search term in its own query and has no
    // id — sailed through. That is the exact ofetch shape the helper's own
    // docblock cites as its motivation.
    const out = redactFreeText('[GET] "/api/participants?candidate_ref=LEAKED-TERM": 500')

    expect(out).not.toContain('LEAKED-TERM')
  })

  it('scrubs denied keys anywhere in request, including the body', () => {
    // gga finding 2. Only url/query_string/cookies/headers were handled; the
    // rest of `request` was spread through raw, body included — while the
    // comment three lines below says this scrubber does not trust the SDK to
    // keep the shape it expects.
    const scrubbed = scrubSentryEvent({
      request: {
        url: '/api/participants/42',
        data: { password: 'hunter2', candidate_ref: 'LEAKED', keep: 'ok' },
      },
    })

    expect(JSON.stringify(scrubbed)).not.toContain('hunter2')
    expect(JSON.stringify(scrubbed)).not.toContain('LEAKED')
  })
})

describe('the copy one field over', () => {
  it('redacts a candidate id in a console breadcrumb argument, not only in its message', () => {
    // gga round 3, finding 1. Sentry's console integration builds
    // `{ message: safeJoin(args), data: { arguments: args } }`. `arguments` is
    // not a denied key and scrubValue passed strings straight through, so the
    // redacted message shipped next to an unredacted copy of itself.
    const scrubbed = scrubBreadcrumb({
      category: 'console',
      message: 'Failed to load /api/participants/LEAKED-ID',
      data: { arguments: ['Failed to load /api/participants/LEAKED-ID'], logger: 'console' },
    })

    expect(JSON.stringify(scrubbed)).not.toContain('LEAKED-ID')
  })

  it('redacts an entry-link token arriving as a URL field, not only inside prose', () => {
    // gga round 3, finding 3. redactFreeText reduced an absolute URL to its
    // origin because entry_url is a bearer credential in a path segment;
    // redactUrl — the function applied to request.url and breadcrumb URLs —
    // did not. Two functions, one threat model, opposite answers.
    const scrubbed = scrubBreadcrumb({
      category: 'navigation',
      data: { to: 'https://app.beai.io/interview/LEAKED-BEARER-TOKEN' },
    })

    expect(JSON.stringify(scrubbed)).not.toContain('LEAKED-BEARER-TOKEN')
  })
})

describe('the walk itself must survive what it walks', () => {
  it('does not blow the stack on a circular graph', () => {
    // gga round 4, finding 3. contexts.vue.propsData is a Vue REACTIVE object
    // and reactive graphs carry back-references. Without a cycle guard
    // beforeSend threw RangeError and the event was LOST — monitoring dying
    // silently on exactly the events carrying the richest context.
    const a: Record<string, unknown> = { name: 'a' }
    const b: Record<string, unknown> = { name: 'b', a }
    a['b'] = b

    expect(() => scrubSentryEvent({ extra: { a } })).not.toThrow()
  })

  it('does not flatten an Error or a Date into an empty object', () => {
    // Object.entries(new Error('boom')) is empty — the state lives in internal
    // slots. Recursing into it replaced extra.cause with {}, which is the
    // allowlist damage this module argues against while claiming to be a
    // denylist.
    const scrubbed = scrubSentryEvent({
      extra: { cause: new Error('boom'), when: new Date(0) },
    })

    expect(scrubbed.extra?.['cause']).toBeInstanceOf(Error)
    expect(scrubbed.extra?.['when']).toBeInstanceOf(Date)
  })

  it('consumes the whole id segment, not just its word characters', () => {
    // gga round 4, finding 4. [\w.-]+ stopped at the first character outside
    // [A-Za-z0-9_.-] and emitted the REMAINDER verbatim beside the placeholder.
    expect(redactFreeText('GET /api/participants/c@acme.it failed')).not.toContain('acme.it')
    expect(redactFreeText('GET /api/participants/x%2F672 failed')).not.toContain('672')
  })
})

describe('not flattening is not the same as not scrubbing', () => {
  it('scrubs a denied key and a path INSIDE a non-plain object', () => {
    // gga round 5, finding 1 (HIGH). Returning non-plain objects verbatim was a
    // denylist bypass: the same string was redacted at `msg` and intact at
    // `cause.message`, one field over. @sentry/core's normalize() runs AFTER
    // beforeSend and turns class instances into plain objects, so it ships.
    class ApiError extends Error {
      candidate_ref = 'CR-99'
    }
    const cause = new ApiError('failed on /api/participants/42')

    const scrubbed = scrubSentryEvent({ extra: { cause } })
    const encoded = JSON.stringify(scrubbed.extra)

    expect(encoded).not.toContain('CR-99')
    expect(encoded).not.toContain('/42')
    expect(scrubbed.extra?.['cause']).toBeInstanceOf(Error)
  })

  it('keeps a shared non-cyclic reference instead of calling it circular', () => {
    // gga round 5, finding 4. `seen` was a visited set, so the SECOND appearance
    // of a shared object became '[circular]' — dropping diagnostic context that
    // was never a cycle, which is the allowlist damage scrubRecord's docblock
    // argues against.
    const shared = { project_id: 7, label: 'shared' }

    const scrubbed = scrubSentryEvent({ extra: { a: shared, b: shared } })

    expect(scrubbed.extra?.['b']).toEqual({ project_id: 7, label: 'shared' })
  })
})

describe('round 7 — the remaining latent gaps', () => {
  it('documents the raw-space gap rather than overpromising it', () => {
    // A quoted-run alternative was tried and REVERTED: a lookahead proves only
    // that a quote exists later in the message, not that it delimits this URL,
    // so `/participants?q=Ada failed with "timeout"` came back as
    // `/participants"timeout"` — diagnostic destroyed. This pins the real,
    // documented behaviour: the query token itself is dropped, and a tail after
    // a RAW space survives. Latent — URLSearchParams encodes a space as `+`, so
    // the app never emits one — reachable only from hand-built prose.
    const out = redactFreeText('[GET] "/api/participants?q=Ada Lovelace": 500')

    expect(out).not.toContain('?q=Ada')
    expect(out).toContain('Lovelace')
  })

  it('does not flatten a Map or a Set, and scrubs what is inside them', () => {
    // Advisory from round 7. Object.entries(new Map(...)) is empty, so a Map
    // became {} — the allowlist damage this module argues against, fixed for
    // Date/Error/RegExp and missed for keyed collections. Converting means the
    // denylist actually sees the keys.
    const scrubbed = scrubSentryEvent({
      extra: { m: new Map([['candidate_ref', 'CR-9']]), s: new Set(['/api/participants/42']) },
    })
    const encoded = JSON.stringify(scrubbed.extra)

    expect(encoded).not.toContain('CR-9')
    expect(encoded).not.toContain('/42')
    expect(encoded).not.toBe('{"m":{},"s":{}}')
  })

  it('omits environment entirely when it is unset, rather than shipping an empty string', () => {
    // gga round 7, finding 3. The docblock promises "unset falls through to
    // Sentry's own environment detection"; nothing enforced it, and rewriting
    // the line to `environment` verbatim kept the suite green.
    expect(sentryPosture('https://x@example.test/1', '').environment).toBeUndefined()
    expect(sentryPosture('https://x@example.test/1', 'production').environment).toBe('production')
  })
})

describe('the fast path must not be a hole', () => {
  it('redacts a reset token behind an unanticipated prefix', () => {
    // gga round 9, finding 2. redactAnalyticsPath's patterns are anchored at ^
    // behind a rigid (?:/api)?(?:/[a-z]{2})? prefix, and the fast path RETURNED
    // on a miss — so `/x/reset-password/TOKEN` came back verbatim, a live
    // single-use credential, while the same string with a space in it redacted
    // fine through the unanchored general branch. Falling through on a miss is
    // strictly stronger; no case gets worse.
    expect(redactFreeText('/x/reset-password/LIVE-TOKEN')).not.toContain('LIVE-TOKEN')
    expect(redactFreeText('/dashboard,/api/participants/42')).not.toContain('/42')
  })

  it('still keeps the trailing segment on a hit', () => {
    // The reason the fast path exists at all: the general branch cannot
    // preserve `/transcript`.
    expect(redactFreeText('/api/participants/42/transcript')).toBe(
      '/api/participants/:id/transcript'
    )
  })
})

describe('the branches nothing was guarding', () => {
  // These three were added with a comment explaining the leak they close, and
  // then the describe block holding their test was deleted along with the
  // source-grep tests it shared. Mutating any of them to identity left the suite
  // green at 1541/1541 — the exact "a test that has never been seen to fail"
  // shape, on the one branch whose comment quotes the probe that motivated it.
  it('scrubs a denied key and a participant path in event.tags', () => {
    const scrubbed = scrubSentryEvent({
      tags: { route: '/api/participants/42', candidate_ref: 'CR-99' },
    })
    const encoded = JSON.stringify(scrubbed.tags)

    expect(encoded).not.toContain('CR-99')
    expect(encoded).not.toContain('/42')
  })

  it('redacts a participant path in event.transaction', () => {
    const scrubbed = scrubSentryEvent({ transaction: 'GET /api/participants/42/transcript' })

    expect(scrubbed.transaction).not.toContain('/42')
  })

  it('redacts a participant path inside a fingerprint entry', () => {
    const scrubbed = scrubSentryEvent({ fingerprint: ['fetch', '/api/participants/42'] })

    expect(JSON.stringify(scrubbed.fingerprint)).not.toContain('/42')
  })
})

describe('the route this app actually serves', () => {
  it('redacts an interview-session id everywhere a participant id is redacted', () => {
    // gga round 12. This change added /interview/:token — a CANDIDATE FRONTEND
    // route the backoffice does not serve — and skipped /interview-sessions/:id,
    // which it does: app/pages/interview-sessions/[id].vue renders one
    // candidate's proctoring timeline and integrity score. The whole finding fit
    // in one breadcrumb: `{to:'/interview-sessions/9f3c', from:'/participants/42'}`
    // came back with one id collapsed and the other shipped verbatim.
    const scrubbed = scrubBreadcrumb({
      category: 'navigation',
      data: { to: '/interview-sessions/LEAKED-SESSION', from: '/participants/42' },
    })

    expect(JSON.stringify(scrubbed.data)).not.toContain('LEAKED-SESSION')
    expect(JSON.stringify(scrubbed.data)).not.toContain('/42')
  })

  it('redacts an interview-session id in prose and under the /api mount', () => {
    const out = redactFreeText('[GET] "/api/interview-sessions/LEAKED-SESSION/review": 500')

    expect(out).not.toContain('LEAKED-SESSION')
  })

  it('does not let the shorter /interview route swallow the longer one', () => {
    // The longer route must win. Today /interview-sessions/x misses /interview/
    // only because that pattern demands the literal slash — incidental, not
    // designed, so pin the ordering.
    expect(redactAnalyticsPath('/interview-sessions/9f3c')).toBe('/interview-sessions/:id')
    expect(redactAnalyticsPath('/interview/TOKEN')).toBe('/interview/:token')
  })

  it('keeps the consent banner off a session review', () => {
    // The banner must never float over a candidate's scored evaluation; a
    // session review is the proctoring half of exactly that screen.
    expect(isAnalyticsSafeRoute('/interview-sessions/9f3c')).toBe(false)
  })
})

describe('the open index signature the module argues about but never closes', () => {
  it('scrubs an UNRECOGNISED top-level key, as "by KEY at any depth" promises', () => {
    // `ScrubbableEvent` carries `[key: string]: unknown` and `scrubSentryEvent`
    // opens with `{ ...event }`, so every field it does not handle by name
    // rides out verbatim. This is the identical argument the `request` branch
    // already makes against itself two hundred lines up — `rest` goes through
    // the denylist, it is NOT spread raw — never applied to the event object
    // that branch lives inside.
    const scrubbed = scrubSentryEvent({
      custom: { candidate_ref: 'CR-99' },
    } as ScrubbableEvent)

    expect(JSON.stringify(scrubbed)).not.toContain('CR-99')
  })

  it('scrubs an exception stacktrace, which rides out on the `...value` spread', () => {
    // `exception.values` maps `value.value` and spreads the rest, so
    // `stacktrace` is never walked. The module applies its URL-shape rule to
    // `request.url`, `breadcrumb.data.url` and `transaction`, then stops at
    // this boundary with no reason recorded anywhere.
    const scrubbed = scrubSentryEvent({
      exception: {
        values: [
          {
            value: 'boom',
            stacktrace: {
              frames: [
                { filename: 'https://bo.test/participants/42', vars: { candidate_ref: 'CR-77' } },
              ],
            },
          },
        ],
      },
    } as unknown as ScrubbableEvent)

    const encoded = JSON.stringify(scrubbed)

    expect(encoded).not.toContain('/participants/42')
    expect(encoded).not.toContain('CR-77')

    // The DIAGNOSTIC has to survive, and the two assertions above cannot see
    // that: flattening the filename to the bare origin satisfies them, so does
    // dropping the frame, so does returning `{}`. A scrubber that leaves Sentry
    // unable to symbolicate is the failure this module's own docblock calls
    // worse than a scrubbed one — and it is silent, so nobody gets paged.
    const frame = (
      scrubbed.exception?.values?.[0] as { stacktrace?: { frames?: { filename?: string }[] } }
    )?.stacktrace?.frames?.[0]

    expect(frame?.filename).toBe('https://bo.test/participants/:id')
  })

  it('redacts a path regardless of case, per the file’s own mistyped-deep-link argument', () => {
    // `redactAnalyticsPath` chose `[^/]+` over a tighter class precisely
    // because "a mistyped deep link does not need a route to exist to reach
    // this function". A mistyped deep link can also arrive shouting.
    expect(redactAnalyticsPath('/PARTICIPANTS/42')).not.toContain('42')
  })
})

describe('the suffix convention has to cover the address too', () => {
  it('scrubs any field ending in _email, camelCase included', () => {
    // Same reasoning the _token/_secret/_key suffixes already carry: enumerating
    // every future field name is impossible, a naming convention is not. An
    // address is the one candidate identifier that resolves to a person with no
    // calling system in the loop.
    const scrubbed = scrubSentryEvent(
      eventWith({
        // Addresses the PROSE pattern cannot match — no TLD run after the `@`.
        // With a matchable address, deleting the `_email` rule still passed:
        // `redactFreeText` reduced it to the same marker, so the test proved the
        // free-text redactor and nothing about the key rule it is named after.
        candidate_email: 'mario.rossi@localhost',
        contactEmail: 'anna.bianchi@localhost',
        // The plural and the compound, which a `_email` SUFFIX misses and the
        // api's `str_contains` catches. The two halves must not disagree.
        email_address: 'carla.verdi@localhost',
        emails: ['dario.neri@localhost'],
      })
    )

    const encoded = JSON.stringify(scrubbed.extra)

    expect(encoded).not.toContain('mario.rossi@localhost')
    expect(encoded).not.toContain('anna.bianchi@localhost')
    expect(encoded).not.toContain('carla.verdi@localhost')
    expect(encoded).not.toContain('dario.neri@localhost')
  })

  it('leaves a scoped package path in a stack intact', () => {
    // The address pattern must not eat `@sentry/vue`. `redactFreeText` runs on
    // Error.stack, and a stack here is scoped packages all the way down — a
    // broader local part turned every frame into `[redacted]`, which is the
    // silent failure this module calls worse than a scrubbed one. Nothing
    // pinned it and the suite stayed green while it happened.
    const stack = 'at Module.render (/app/node_modules/@sentry/vue/esm/index.js:12:5)'

    expect(redactFreeText(stack)).toBe(stack)
  })
})

describe('an address in prose has no key for the denylist to catch', () => {
  it('redacts an email embedded in a thrown message', () => {
    // The exact argument ABSOLUTE_URL_PATTERN already makes: a free-text field
    // carries no key, so the key denylist cannot see it. An address in an error
    // message is the same leak class as an entry link in one.
    expect(redactFreeText('invite to mario.rossi@example.test failed')).not.toContain(
      'mario.rossi@example.test'
    )
  })
})

describe('namespaced keys must reach the denylist the api reaches', () => {
  it('scrubs dotted OpenTelemetry keys', () => {
    // The normalizer handled camelCase but never dots, so every OTel-style key
    // missed both the set and the convention suffixes. `authorization`,
    // `content` and `transcript` are all IN the set — the set knew, the
    // normalizer could not reach them.
    const scrubbed = scrubSentryEvent(
      eventWith({
        'auth.token': 'TOKENLEAK',
        'user.content': 'CONTENTLEAK',
        'request.transcript': 'TRANSCRIPTLEAK',
        'http.request.header.authorization': 'AUTHLEAK',
      })
    )

    expect(JSON.stringify(scrubbed.extra)).not.toContain('LEAK')
  })

  it('scrubs the AI conversation, which arrives as a JSON STRING', () => {
    // The api's AiIntegration json_encodes the messages, so they land under one
    // key with nothing inside for a key denylist to walk.
    const scrubbed = scrubSentryEvent(
      eventWith({
        'gen_ai.input.messages': '[{"role":"user","content":"I led the migration"}]',
        messages: '[{"content":"my answer"}]',
      })
    )

    const encoded = JSON.stringify(scrubbed.extra)

    expect(encoded).not.toContain('I led the migration')
    expect(encoded).not.toContain('my answer')
  })
})

describe('the normalizer shapes nothing in the suite had pinned', () => {
  it('scrubs a hyphenated header key', () => {
    // `X-Api-Key` lowercases to `x-api-key`: in no set, and `_key` cannot match
    // across a hyphen. The `.replace(/[-.]/g, '_')` exists for this and nothing
    // would have noticed if it were deleted.
    const scrubbed = scrubSentryEvent(eventWith({ 'X-Api-Key': 'HEADERLEAK' }))

    expect(JSON.stringify(scrubbed.extra)).not.toContain('HEADERLEAK')
  })

  it('scrubs an acronym-leading key', () => {
    // `APIKey` and `SSOToken` have no lowercase character before the uppercase
    // one, so `/([a-z0-9])([A-Z])/` never fires. The second pattern is the only
    // thing that splits them, and it too was untested.
    const scrubbed = scrubSentryEvent(
      eventWith({ APIKey: 'ACRONYMLEAK', SSOToken: 'ACRONYMLEAK2' })
    )

    expect(JSON.stringify(scrubbed.extra)).not.toContain('ACRONYMLEAK')
  })

  it('keeps a multi-label domain address redacted', () => {
    // The domain is a repeated label group now, not one class admitting `.`
    // beside a literal dot. Subdomains must still match.
    expect(redactFreeText('ping mario@mail.corp.example.com now')).not.toContain('mario@')
  })

  it('does not treat an empty domain label as an address', () => {
    // THE distinguishing case. `mario@mail.corp.example.com` matched the old
    // class-with-a-dot just as well, so the test above passes under either
    // pattern and pins nothing. `(?:label\.)+` requires a non-empty label
    // before every dot — which is precisely the ambiguity that made the old
    // split point backtrack quadratically.
    expect(redactFreeText('ping mario@..com now')).toContain('mario@..com')
  })
})

describe('every confidential-content key is pinned, not just the ones with a rule', () => {
  // Each of these normalises to ITSELF — its last segment is the whole key — so
  // no other rule reaches it. Deleting any one line was a live leak with the
  // whole suite still green.
  it.each([
    ['text', 'Nel mio ultimo progetto ho gestito un conflitto'],
    ['explanation', 'The candidate de-escalated a peer dispute'],
    ['transcripts', 'full transcript body'],
    ['prompts', 'Score this answer'],
    ['answers', 'I led the migration'],
    ['utterances', 'ho gestito un conflitto'],
    ['contents', 'spoken content body'],
  ])('scrubs %s', (key, marker) => {
    const scrubbed = scrubSentryEvent(eventWith({ [key]: marker }))

    expect(JSON.stringify(scrubbed.extra)).not.toContain(marker)
  })

  it('pins what denying `text` costs, so the trade reads as chosen', () => {
    // The last-segment rule reaches further than candidate speech:
    // `context_text` is a stack frame's source line and `status_text` is an
    // HTTP status. Neither is a candidate's words. The trade is deliberate —
    // this file's contract is to carry the api's exact denylist — but an
    // unusable error reporter is the outcome this module calls worse than a
    // scrubbed one, so the cost is written down rather than discovered later.
    const scrubbed = scrubSentryEvent(
      eventWith({ context_text: 'const x = 1', status_text: 'Unprocessable Entity' })
    )

    expect((scrubbed.extra as Record<string, unknown>)['context_text']).toBe('[redacted]')
    expect((scrubbed.extra as Record<string, unknown>)['status_text']).toBe('[redacted]')
  })
})
