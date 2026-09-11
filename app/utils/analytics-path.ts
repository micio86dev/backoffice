/**
 * Makes a route safe to hand to an analytics sink, and decides where the
 * consent banner itself may appear (C13, task 5.4).
 *
 * The backoffice leaks differently from the candidate app, and arguably worse.
 * `/participants/42` is a candidate identifier, and the page it names shows
 * that candidate's transcript and their scored evaluation.
 *
 * GA4 does run on these pages — see `app/utils/analytics.ts`'s `analyticsPlan`
 * — but only with the path redacted below, never the id. Nobody at BEAI can
 * purge what a third party has already stored, so the id never leaves in the
 * first place.
 *
 * SUPERSEDED (self-service-password-reset): this file used to open with "there
 * is no token in a URL here", which was true until the reset link landed. The
 * emailed link is `{origin}/reset-password/{token}?email={address}`
 * (`api/app/Jobs/SendPasswordResetLinkJob.php:135`) — a live, single-use
 * credential in a PATH SEGMENT, which the query-string strip below does not
 * touch. Left unhandled it would have reached GA4 as a verbatim `page_path`
 * and Sentry as a verbatim `request.url`, since `sentry-scrub.ts`'s
 * `redactUrl` delegates here rather than re-deriving these rules.
 *
 * AMENDED: this file used to gate Microsoft Clarity as well as the consent
 * banner. Clarity was removed from the backoffice entirely (see
 * `app/plugins/analytics.client.ts` and openspec/specs/observability/spec.md's
 * Microsoft Clarity — User Behavior Analytics requirement) — a stronger
 * guarantee than excluding routes, since there is no session recorder left to
 * exclude one from. `isAnalyticsSafeRoute` stays, because the consent banner
 * still needs to know where NOT to float a tracking-consent dialog: over a
 * candidate's scored evaluation, or over a credential form.
 */

/**
 * Pages the consent banner must never appear over.
 *
 * The participants BRANCH entire, list included: the list shows display names
 * and candidate references, so "only the detail page is sensitive" is wrong on
 * its face. `/login`, `/forgot-password` and `/reset-password` are here for the
 * same reason — a cookie dialog floating over a credential form, or over the
 * address a password-recovery flow refuses to confirm the existence of, is the
 * wrong thing in the wrong place regardless of what tool the dialog is about.
 */
const UNSAFE_PREFIX =
  /^\/(?:[a-z]{2}\/)?(?:participants|interview-sessions|login|forgot-password|reset-password)(?:\/|$)/i

/**
 * Route segments that name a secret or a person, collapsed to a placeholder.
 *
 * A list rather than one regex so each entry can say what it is protecting.
 * Each pattern matches the id/token segment plus WHATEVER follows it, and
 * keeps that remainder verbatim in the output — half-cleaned, not unredacted.
 * The alternative — matching only a single trailing segment, so a deeper path
 * falls through untouched — was tried and was wrong: no route today puts
 * anything after `/participants/:id`, but a breadcrumb or a mistyped deep
 * link does not need a route to exist to reach this function, and the
 * failure mode of falling through is the candidate's actual id reaching a
 * third party verbatim, not a merely-incomplete redaction.
 *
 * The leading `(?:\/api)?` matters as much as the id/token group itself.
 * `runtimeConfig.public.apiBase` MUST include the `/api` suffix
 * (`Dockerfile:26` — Laravel's CORS middleware only covers `api/*`), so
 * every real `apiFetch('/participants/${id}')` call hits a URL shaped
 * `/api/participants/42`, not `/participants/42`. This function was written
 * and tested against router paths only; the fetch/XHR breadcrumb Sentry
 * actually captures carries the `/api` mount, which this pattern did not
 * match, so the candidate id reached Sentry verbatim on every real
 * `useParticipants`/`useTranscript`/`useEvaluationReport`/
 * `useParticipantRecovery` call. Router paths (no `/api` prefix) still match,
 * since the optional group is exactly that — optional.
 */
const REDACTED_TRAILING_SEGMENTS: ReadonlyArray<{ pattern: RegExp; placeholder: string }> = [
  // A candidate identifier — the page it names shows their transcript and scores.
  { pattern: /^((?:\/api)?(?:\/[a-z]{2})?\/participants)\/[^/]+(\/.*)?$/i, placeholder: ':id' },
  // A live single-use password reset token. Not an identifier: a credential.
  {
    pattern: /^((?:\/api)?(?:\/[a-z]{2})?\/reset-password)\/[^/]+(\/.*)?$/i,
    placeholder: ':token',
  },
  // A backoffice session-review id. `app/pages/interview-sessions/[id].vue`
  // renders SessionReviewPanel — one candidate's proctoring timeline and
  // integrity score — and `useSessionReview` fetches
  // `/interview-sessions/${id}/review`, so this is the `/api`-mounted breadcrumb
  // shape, not a hypothetical. It sits BEFORE the `/interview` entry because the
  // longer route must win: today `/interview-sessions/x` misses `/interview/`
  // only because that pattern demands the literal slash, which is incidental
  // rather than designed.
  {
    pattern: /^((?:\/api)?(?:\/[a-z]{2})?\/interview-sessions)\/[^/]+(\/.*)?$/i,
    placeholder: ':id',
  },
  // The candidate entry link. `POST /entry-links` returns `entry_url` shaped
  // `{origin}/interview/{token}`, and whoever holds it can START that
  // candidate's interview — a bearer credential in a path segment, exactly like
  // the reset token above. `redactFreeText` already reduced it to its origin
  // when it appeared in PROSE; this entry is what closes the same leak when it
  // arrives as `request.url` or `breadcrumb.data.url` instead. Two functions,
  // one threat model — they must not answer differently.
  {
    pattern: /^((?:\/api)?(?:\/[a-z]{2})?\/interview)\/[^/]+(\/.*)?$/i,
    placeholder: ':token',
  },
]

/**
 * Strips a route down to something that identifies the PAGE and nothing else.
 *
 * Query string and fragment go wholesale rather than being filtered. The
 * participants list filters through its own query string — `page`, `per_page`,
 * `project_id`, `status` and `q` — and `q` is FREE TEXT an operator types, which
 * in practice is a candidate's name. So an allowlist of safe parameter names
 * would be a promise about every filter anyone adds in future — and the reset
 * link's `?email=` is a second reason the wholesale rule was right.
 */
export function redactAnalyticsPath(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] ?? ''
  const normalized = withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, '') : withoutQuery

  for (const { pattern, placeholder } of REDACTED_TRAILING_SEGMENTS) {
    const match = normalized.match(pattern)
    if (match) {
      return `${match[1]}/${placeholder}${match[2] ?? ''}`
    }
  }

  return normalized === '' ? '/' : normalized
}

/**
 * Same prefixes as `REDACTED_TRAILING_SEGMENTS`, but findable ANYWHERE inside
 * a larger string, not only when the whole string IS the path.
 *
 * `redactAnalyticsPath` assumes its argument is nothing but a path — true for
 * a route or a URL's `pathname`, false for prose. `ofetch` builds its error
 * message as `` `[${method}] ${JSON.stringify(url)}: …` `` — the path rides
 * inside a sentence, quoted, with a status code and text after it — and a
 * console breadcrumb can read `Failed to load /participants/42` the same
 * way. Neither string starts with `/`, so `redactAnalyticsPath` never saw
 * them, and the id reached Sentry through `exception.values[].value` on any
 * unhandled `FetchError` and through `breadcrumb.message` on the matching
 * console line.
 *
 * The id/token character class is deliberately TIGHTER than
 * `REDACTED_TRAILING_SEGMENTS`' `[^/]+`: that class is safe only because a
 * router path has nothing else in the string to over-match into. Here the
 * text surrounding the path can itself contain slash-free runs (a colon, a
 * quote, "Internal Server Error"), and `[^/]+` would swallow the rest of the
 * sentence as if it were part of the id. An optional trailing query string is
 * still consumed and dropped wholesale, for the same reason
 * `redactAnalyticsPath` drops one — but no trailing PATH segment is
 * preserved the way `redactAnalyticsPath` preserves `/transcript` in
 * `/participants/:id/transcript`: in prose, unlike a router path, there is no
 * way to tell "more of the same path" apart from "the next word in the
 * sentence happened to start with a slash".
 */
// Consumes an id up to a PROSE boundary — whitespace, a quote, a bracket, or
// sentence punctuation. Not the whole path segment: `:` `,` `;` are excluded
// deliberately, because in prose they end the id rather than belong to it
// (`[GET] "/api/participants/42": 500`), and swallowing them would eat the
// status code this redaction exists to preserve.
//
// The cost is stated plainly rather than glossed: an id CONTAINING one of those
// characters leaves its tail beside the placeholder
// (`/participants/ac:672` -> `/participants/:id:672` in prose). That is latent,
// not live — path ids are numeric today and `candidate_ref` travels in the
// query string, which is dropped wholesale — and `redactAnalyticsPath`, which
// owns the whole-string case, uses `[^/]+` and has no such gap. If ids ever stop
// being numeric this class must be revisited before that ships.
//
// It was `[\w.-]+`, which stopped at the first character outside
// `[A-Za-z0-9_.-]`: `/participants/c@acme.it` came back as
// `/participants/:id@acme.it`, leaving a whole email address in the output. `[\w.-]+` stopped at the first character outside
// `[A-Za-z0-9_.-]` and the REMAINDER was emitted verbatim beside the
// placeholder: `/participants/acme%2F672` came back as
// `/participants/:id%2F672`, and `/participants/c@acme.it` as
// `/participants/:id@acme.it`. `redactAnalyticsPath` uses `[^/]+` and eats
// the whole segment — two functions, one threat model, and they must not
// answer differently. Latent today (ids are numeric) but the mitigation is
// an anchor, not an audit.
//
// Sentence punctuation stays excluded so the class cannot swallow the rest
// of the prose around a path, which is the reason it was tightened in the
// first place.
// The QUERY run is deliberately looser than the id run: it consumes past
// whitespace up to a quote or bracket, because `q` is free text an operator
// types and a space inside it is ordinary. Stopping at whitespace shipped half a
// surname beside a placeholder that read as if redaction had succeeded:
// `"/api/participants?q=Ada Lovelace"` came back as `"/api/participants Lovelace"`.
// Latent today — `buildParticipantListQuery` uses URLSearchParams, which encodes
// a space as `+` — but reachable from developer-authored prose, and the docblock
// promised the query was "dropped wholesale".
// The query run stops at WHITESPACE, deliberately, and the limit is documented
// rather than papered over.
//
// A quoted-run alternative was tried — consume past spaces up to a closing quote,
// so `[GET] "/api/participants?q=Ada Lovelace": 500` loses the whole surname. It
// was REVERTED: a lookahead proves only that a quote exists somewhere later in
// the message, never that it delimits this URL, so
// `/participants?q=Ada failed with "timeout"` came back as
// `/participants"timeout"` — the diagnostic destroyed and the word boundary with
// it. Anchoring to a leading quote instead is a real fix and belongs with the
// pattern, not the query class.
//
// KNOWN GAP, latent: an id or query value containing a raw space leaves its tail
// beside the placeholder. Not reachable from the app — `buildParticipantListQuery`
// builds with URLSearchParams, which encodes a space as `+` — only from
// developer-authored prose such as `console.error('search failed for ' + url)`.
// Stated here because the previous version of this comment claimed the query was
// "dropped wholesale", and a comment that overpromises a redaction is worse than
// one that admits a boundary.
//
// The classes are disjoint and exclude `?`: overlapping quantifiers gave
// regexp/no-super-linear-backtracking a polynomial-backtracking exploit reachable
// from `/\?+/`, and this runs on error messages — the strings an attacker can
// influence. Widening any of them needs the linter re-run, not just the tests.
const QUERY_RUN_IN_TEXT = /(?:\?[^\s"'<>()[\]?]*)?/.source
const ID_OR_TOKEN_IN_TEXT = /[^\s/"'<>()[\],;:?]+/.source + QUERY_RUN_IN_TEXT

const EMBEDDED_PATH_SEGMENTS: ReadonlyArray<{
  pattern: RegExp
  segment: string
  placeholder: string
}> = [
  {
    // The id segment is OPTIONAL, and that is the whole point. Requiring it
    // meant the LIST route never matched — and the list is where the candidate's
    // name actually travels, in its own query string
    // (`?candidate_ref=…`), with no id anywhere. The exact `ofetch` shape this
    // helper's docblock cites as its motivation,
    // `[GET] "/api/participants?candidate_ref=…": 500`, sailed straight through.
    // A trailing query is consumed either way, wholesale, for the same reason
    // `redactAnalyticsPath` drops one wholesale rather than by an allowlist of
    // parameter names.
    pattern: new RegExp(
      `(/api)?(/[a-z]{2})?/participants(?:/(${ID_OR_TOKEN_IN_TEXT}))?${QUERY_RUN_IN_TEXT}`,
      'gi'
    ),
    segment: 'participants',
    placeholder: ':id',
  },
  {
    pattern: new RegExp(`(/api)?(/[a-z]{2})?/reset-password/(${ID_OR_TOKEN_IN_TEXT})`, 'gi'),
    segment: 'reset-password',
    placeholder: ':token',
  },
  {
    pattern: new RegExp(`(/api)?(/[a-z]{2})?/interview-sessions/(${ID_OR_TOKEN_IN_TEXT})`, 'gi'),
    segment: 'interview-sessions',
    placeholder: ':id',
  },
  {
    pattern: new RegExp(`(/api)?(/[a-z]{2})?/interview/(${ID_OR_TOKEN_IN_TEXT})`, 'gi'),
    segment: 'interview',
    placeholder: ':token',
  },
]

export function redactEmbeddedPaths(text: string): string {
  let result = text

  for (const { pattern, segment, placeholder } of EMBEDDED_PATH_SEGMENTS) {
    result = result.replace(
      pattern,
      (
        _match,
        apiPrefix: string | undefined,
        localePrefix: string | undefined,
        id: string | undefined
      ) => {
        const prefix = `${apiPrefix ?? ''}${localePrefix ?? ''}/${segment}`

        // No id in the match means this was the LIST route (with or without a
        // query, which the pattern has already consumed). Emitting the
        // placeholder anyway would rewrite a legitimate list mention into a
        // detail route that was never there.
        return id === undefined ? prefix : `${prefix}/${placeholder}`
      }
    )
  }

  return result
}

/**
 * Whether analytics-consent UI may appear on this route at all.
 *
 * Redacting the URL does nothing about what is rendered ON the page, which is
 * why this is a separate control from redactAnalyticsPath rather than a flag on
 * it. One hides the address; this one decides whether a tracking-consent
 * dialog is allowed to sit on top of the page at all — see ConsentBanner.vue.
 */
export function isAnalyticsSafeRoute(path: string): boolean {
  const withoutQuery = path.split(/[?#]/)[0] ?? ''

  return !UNSAFE_PREFIX.test(withoutQuery)
}
