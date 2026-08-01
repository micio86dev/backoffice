/**
 * Makes a route safe to hand to a third-party analytics sink (C13, task 5.4).
 *
 * The backoffice leaks differently from the candidate app, and arguably worse.
 * There is no token in a URL here — but `/participants/42` is a candidate
 * identifier, and the page it names shows that candidate's transcript and their
 * scored evaluation.
 *
 * A session replay of an operator's afternoon is therefore a recording of
 * several named people's assessments, held by a third party for as long as that
 * third party keeps it. Nobody consented to it, and nobody at BEAI can purge it.
 */

/**
 * Pages a session recorder must never run on.
 *
 * The participants BRANCH entire, list included: the list shows display names
 * and candidate references, so "only the detail page is sensitive" is wrong on
 * its face. `/login` is here because Clarity masks input values BY DEFAULT, and
 * a default is exactly what a dashboard setting can change without anyone
 * touching this repository.
 */
const UNSAFE_PREFIX = /^\/(?:[a-z]{2}\/)?(?:participants|login)(?:\/|$)/

/**
 * Strips a route down to something that identifies the PAGE and nothing else.
 *
 * Query string and fragment go wholesale rather than being filtered. The
 * participants list filters on `candidate_ref` and status through the query
 * string, so an allowlist of safe parameter names would be a promise about
 * every filter anyone adds in future.
 */
export function redactAnalyticsPath(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] ?? ''
  const normalized = withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, '') : withoutQuery

  const match = normalized.match(/^(\/(?:[a-z]{2}\/)?participants)\/[^/]+$/)

  if (match) {
    return `${match[1]}/:id`
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
