/**
 * Makes a route safe to hand to a third-party analytics sink (C13, task 5.4).
 *
 * The backoffice leaks differently from the candidate app, and arguably worse.
 * `/participants/42` is a candidate identifier, and the page it names shows
 * that candidate's transcript and their scored evaluation.
 *
 * A session replay of an operator's afternoon is therefore a recording of
 * several named people's assessments, held by a third party for as long as that
 * third party keeps it. Nobody consented to it, and nobody at BEAI can purge it.
 *
 * SUPERSEDED (self-service-password-reset): this file used to open with "there
 * is no token in a URL here", which was true until the reset link landed. The
 * emailed link is `{origin}/reset-password/{token}?email={address}`
 * (`api/app/Jobs/SendPasswordResetLinkJob.php:135`) — a live, single-use
 * credential in a PATH SEGMENT, which the query-string strip below does not
 * touch. Left unhandled it would have reached GA4 as a verbatim `page_path`
 * and Sentry as a verbatim `request.url`, since `sentry-scrub.ts`'s
 * `redactUrl` delegates here rather than re-deriving these rules.
 */

/**
 * Pages a session recorder must never run on.
 *
 * The participants BRANCH entire, list included: the list shows display names
 * and candidate references, so "only the detail page is sensitive" is wrong on
 * its face. `/login` is here because Clarity masks input values BY DEFAULT, and
 * a default is exactly what a dashboard setting can change without anyone
 * touching this repository.
 *
 * `/reset-password` is here for a stronger version of the same reason — it is
 * where a NEW credential is typed — and `/forgot-password` because the address
 * typed into it is precisely the one the whole flow refuses to confirm the
 * existence of. Handing that pair (address, "this person is recovering an
 * account") to a session recorder would rebuild, off-site, the enumeration
 * oracle the API is built to deny.
 */
const UNSAFE_PREFIX =
  /^\/(?:[a-z]{2}\/)?(?:participants|login|forgot-password|reset-password)(?:\/|$)/

/**
 * Route segments that name a secret or a person, collapsed to a placeholder.
 *
 * A list rather than one regex so each entry can say what it is protecting.
 * Both match the SINGLE trailing segment only: a deeper path (none exists
 * today) falls through unredacted rather than being silently half-cleaned,
 * which would be the more dangerous failure.
 */
const REDACTED_TRAILING_SEGMENTS: ReadonlyArray<{ pattern: RegExp; placeholder: string }> = [
  // A candidate identifier — the page it names shows their transcript and scores.
  { pattern: /^(\/(?:[a-z]{2}\/)?participants)\/[^/]+$/, placeholder: ':id' },
  // A live single-use password reset token. Not an identifier: a credential.
  { pattern: /^(\/(?:[a-z]{2}\/)?reset-password)\/[^/]+$/, placeholder: ':token' },
]

/**
 * Strips a route down to something that identifies the PAGE and nothing else.
 *
 * Query string and fragment go wholesale rather than being filtered. The
 * participants list filters on `candidate_ref` and status through the query
 * string, so an allowlist of safe parameter names would be a promise about
 * every filter anyone adds in future — and the reset link's `?email=` is a
 * second reason the wholesale rule was right.
 */
export function redactAnalyticsPath(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] ?? ''
  const normalized = withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, '') : withoutQuery

  for (const { pattern, placeholder } of REDACTED_TRAILING_SEGMENTS) {
    const match = normalized.match(pattern)
    if (match) {
      return `${match[1]}/${placeholder}`
    }
  }

  return normalized === '' ? '/' : normalized
}

/**
 * Whether a session-replay recorder may run on this route at all.
 *
 * Redacting the URL does nothing about what is rendered ON the page, which is
 * why this is a separate control from redactAnalyticsPath rather than a flag on
 * it. One hides the address; this one decides whether the room is filmed.
 */
export function isAnalyticsSafeRoute(path: string): boolean {
  const withoutQuery = path.split(/[?#]/)[0] ?? ''

  return !UNSAFE_PREFIX.test(withoutQuery)
}
