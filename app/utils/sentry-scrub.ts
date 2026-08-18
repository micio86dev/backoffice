import { redactAnalyticsPath } from '~/utils/analytics-path'

/**
 * Strips participant/candidate data from Sentry events and breadcrumbs
 * before they leave the browser (C13, task 5.1 — Nuxt half, backoffice).
 *
 * Mirrors `api/app/Support/Observability/SentryScrubber.php`'s discipline and
 * `frontend/app/utils/sentry-scrub.ts`'s exact denylist for every leak class
 * the two apps share — the api half already decided the shape of this, and
 * the point of the two Nuxt halves is to agree with it and with each other,
 * not invent a third convention.
 *
 * `sendDefaultPii: false` (set in `sentry.client.config.ts` and
 * `sentry.server.config.ts`) stops Sentry attaching cookies, IP and header
 * context automatically. It does nothing about what THIS app hands Sentry
 * itself, and the backoffice's leak surface is different from the
 * candidate app's but no smaller:
 *
 * - `/participants/:id` renders a named candidate's transcript and scored
 *   evaluation (`app/pages/participants/[id].vue`); the list page renders
 *   `display_name` and `candidate_ref` for every row.
 * - The participants list is filtered through its OWN query string
 *   (`candidate_ref`, status — see `app/utils/analytics-path.ts`), so a
 *   fetch/XHR breadcrumb's URL can carry a searched-for candidate's name.
 * - `POST /entry-links` returns `entry_url` — a bearer credential: anyone
 *   holding it can start THAT candidate's interview
 *   (`app/composables/useEntryLinks.ts`). It is displayed in
 *   `EntryLinkPanel.vue` and copied to the clipboard, i.e. it lives in
 *   component state exactly like a token would.
 *
 * So this scrubs by KEY at any depth (candidate content, tokens, secrets,
 * the entry-link URL) AND by URL SHAPE (query strings, wholesale) — two
 * different leak classes, both closed by this one module.
 */

/**
 * Structural shapes rather than the SDK's own `Event`/`Breadcrumb` types —
 * see `frontend/app/utils/sentry-scrub.ts` for why: this module scrubs a
 * handful of well-known fields on plain objects, and pinning to a minimal
 * local shape means a Sentry version bump cannot change what this file
 * compiles against. `sentry.client.config.ts` / `sentry.server.config.ts`
 * are the only places that talk to the real SDK types.
 */
export interface ScrubbableRequest {
  url?: string
  query_string?: unknown
  cookies?: unknown
  headers?: unknown
  [key: string]: unknown
}

export interface ScrubbableBreadcrumb {
  message?: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

export interface ScrubbableEvent {
  request?: ScrubbableRequest
  extra?: Record<string, unknown>
  contexts?: Record<string, unknown>
  breadcrumbs?: ScrubbableBreadcrumb[]
  user?: unknown
  [key: string]: unknown
}

const DENIED_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'key_hash',
  'password',
  'secret',
  'webhook_secret',
  'authorization',
  'cookie',
  // Candidate-identifying and candidate-authored content — same set the api
  // scrubber denies, so an object that crosses the wire between BEAI's three
  // apps is treated identically everywhere.
  'candidate_ref',
  'display_name',
  'transcript',
  'prompt',
  'answer',
  'excerpt',
  'excerpts',
  'utterance',
  'content',
  'payload',
  // Backoffice-specific: the entry link IS a bearer credential — holding it
  // is sufficient to start a specific candidate's interview. Treated the
  // same as an access token because it functions as one.
  'entry_url',
])

const REDACTED = '[redacted]'

/**
 * `camelCase` -> `snake_case`, so a JS-native key (`candidateRef`,
 * `entryUrl`) is checked against the same denylist as its API-shaped
 * counterpart (`candidate_ref`, `entry_url`) without maintaining two lists
 * that can drift apart.
 */
function toSnakeKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

function isDeniedKey(key: string): boolean {
  const normalized = toSnakeKey(key)

  if (DENIED_KEYS.has(normalized)) {
    return true
  }

  // Conventions, so a newly-named field (`sessionToken`, `signing_secret`,
  // `providerApiKey`) is covered without an edit here — enumerating every
  // future field name is impossible; a naming convention is not.
  return (
    normalized.endsWith('_token') || normalized.endsWith('_secret') || normalized.endsWith('_key')
  )
}

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubValue)
  }

  if (value !== null && typeof value === 'object') {
    return scrubRecord(value as Record<string, unknown>)
  }

  return value
}

/**
 * A denylist, deliberately, not an allowlist: an allowlist would silently
 * drop the diagnostic context that makes an error report useful, and an
 * unusable error reporter gets switched off — which is a worse outcome than
 * a scrubbed one.
 */
function scrubRecord(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    out[key] = isDeniedKey(key) ? REDACTED : scrubValue(value)
  }

  return out
}

/**
 * Strips a URL down to what Sentry may keep — reusing `redactAnalyticsPath`
 * rather than re-deriving its rules a second time in this codebase.
 *
 * The query string is dropped WHOLESALE, not filtered: the participants list
 * filters on `candidate_ref` and status THROUGH the query string, and an
 * allowlist of "safe" parameter names is a promise no one could keep. Path
 * segments that name a specific participant (`/participants/42`) collapse to
 * `/participants/:id` for the same reason `redactAnalyticsPath` already
 * gives Clarity/GA4 — no session-recorder-adjacent sink should be able to
 * correlate error reports back to a specific candidate by ID.
 */
export function redactUrl(url: string | undefined): string | undefined {
  if (url === undefined || url === '') {
    return url
  }

  try {
    const parsed = new URL(url)

    return `${parsed.protocol}//${parsed.host}${redactAnalyticsPath(parsed.pathname)}`
  } catch {
    // Not an absolute URL (Vue Router breadcrumbs pass bare paths) — treat
    // the whole string as a path.
    return redactAnalyticsPath(url)
  }
}

export function scrubBreadcrumb(breadcrumb: ScrubbableBreadcrumb): ScrubbableBreadcrumb {
  const next: ScrubbableBreadcrumb = { ...breadcrumb }

  if (next.data) {
    const data = scrubRecord(next.data)

    for (const urlKey of ['url', 'to', 'from'] as const) {
      if (typeof data[urlKey] === 'string') {
        data[urlKey] = redactUrl(data[urlKey])
      }
    }

    next.data = data
  }

  if (typeof next.message === 'string') {
    next.message = redactUrl(next.message)
  }

  return next
}

export function scrubSentryEvent(event: ScrubbableEvent): ScrubbableEvent {
  const next: ScrubbableEvent = { ...event }

  if (next.request) {
    const { url, ...rest } = next.request

    next.request = {
      ...rest,
      url: redactUrl(url),
      // Query string, cookies and headers are dropped WHOLESALE rather than
      // filtered — the same reasoning as the URL query string above. None of
      // these should be populated with `sendDefaultPii: false`, but this
      // scrubber does not trust that a future SDK version keeps it that way.
      query_string: undefined,
      cookies: undefined,
      headers: undefined,
    }
  }

  if (next.extra) {
    next.extra = scrubRecord(next.extra)
  }

  if (next.contexts) {
    next.contexts = scrubRecord(next.contexts)
  }

  if (next.breadcrumbs) {
    next.breadcrumbs = next.breadcrumbs.map(scrubBreadcrumb)
  }

  // User context is dropped entirely rather than scrubbed field by field —
  // same call the api scrubber makes, for the same reason. An operator's
  // identity adds nothing to a stack trace that org scope does not already
  // give, and there is no case where keeping it is worth the risk of a
  // future Sentry version adding a field this module has never heard of.
  next.user = undefined

  return next
}
