import { redactAnalyticsPath, redactEmbeddedPaths } from '~/utils/analytics-path'

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
 * `sendDefaultPii: false` (set in `sentry.client.config.ts` — this app is
 * `ssr: false`, so there is no server config and no server runtime) stops Sentry
 * attaching cookies, IP and header
 * context automatically. It does nothing about what THIS app hands Sentry
 * itself, and the backoffice's leak surface is different from the
 * candidate app's but no smaller:
 *
 * - `/participants/:id` renders a named candidate's transcript and scored
 *   evaluation (`app/pages/participants/[id].vue`); the list page renders
 *   `display_name` and `candidate_ref` for every row.
 * - The participants list is filtered through its OWN query string
 *   (`q` is free text an operator types, i.e. usually a candidate's name — see
 *   `app/utils/analytics-path.ts`), so a
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
 * compiles against. `sentry.client.config.ts` is the only place that talks to
 * the real SDK types.
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

export interface ScrubbableExceptionValue {
  value?: string
  [key: string]: unknown
}

export interface ScrubbableException {
  values?: ScrubbableExceptionValue[]
  [key: string]: unknown
}

export interface ScrubbableEvent {
  message?: string
  tags?: Record<string, unknown>
  transaction?: string
  fingerprint?: unknown[]
  exception?: ScrubbableException
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
  // The candidate email is the GLOBAL identity key (CLAUDE.md ruling 8,
  // reversed 2026-09-01) and is named in the GDPR retention sign-off
  // (ruling 2). Unlike candidate_ref it is directly identifying with no
  // calling system needed to resolve it.
  'email',
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
const REDACTED_CYCLE = '[circular]'

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

/**
 * Objects this walk must NOT flatten into `{}`.
 *
 * `Object.entries(new Date(0))` is empty, and so is an `Error`'s — their state
 * lives in internal slots or on the prototype. Recursing into them replaced
 * `extra.cause` (an Error) with `{}`, which is the allowlist damage this
 * module's own docblock argues against while claiming to be a denylist.
 */
function isPlainWalkable(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value)

  return proto === Object.prototype || proto === null
}

/**
 * Scrubs a non-plain object WITHOUT flattening it.
 *
 * "Do not flatten" and "do not scrub" are different requirements, and treating
 * them as one branch was a denylist bypass: returning the value verbatim shipped
 * `{ cause: new ApiError('failed on /participants/42', 'CR-99') }` with both the
 * path and the candidate_ref intact, one field over from the same string
 * correctly redacted. It is not dropped downstream either — `@sentry/core`'s
 * `normalize()` runs AFTER `beforeSend` and turns class instances into plain
 * objects carrying their own enumerable props, so it ships.
 *
 * The prototype is preserved so `instanceof` still holds and the walk does not
 * do the allowlist damage this module argues against.
 */
function scrubNonPlain(value: object, seen: WeakSet<object>): unknown {
  // No candidate string can hide in these, and cloning them would lose the
  // internal slots that hold their entire value.
  if (value instanceof Date || value instanceof RegExp) {
    return value
  }

  // Keyed collections are converted, not walked: `Object.entries(new Map(...))`
  // is empty, so a Map flattened to `{}` — the same allowlist damage this module
  // argues against, fixed for Date/Error/RegExp and missed for these. Converting
  // means the denylist actually sees the keys inside.
  if (value instanceof Map) {
    return scrubRecord(Object.fromEntries(value as Map<string, unknown>), seen)
  }

  if (value instanceof Set) {
    return [...(value as Set<unknown>)].map((entry) => scrubValue(entry, seen))
  }

  const clone = Object.create(Object.getPrototypeOf(value) as object | null) as Record<
    string,
    unknown
  >

  for (const [key, entry] of Object.entries(value)) {
    clone[key] = isDeniedKey(key) ? REDACTED : scrubValue(entry, seen)
  }

  // `message` and `stack` are own but NOT enumerable on an Error, so
  // Object.entries misses them — and the message is exactly where a path or an
  // id rides.
  if (value instanceof Error) {
    clone['name'] = value.name
    clone['message'] = redactFreeText(value.message)

    if (typeof value.stack === 'string') {
      clone['stack'] = redactFreeText(value.stack)
    }
  }

  return clone
}

function scrubValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || typeof value !== 'object') {
    // Strings go through the free-text redactor, not straight out — see the
    // console-breadcrumb case below.
    return typeof value === 'string' ? redactFreeText(value) : value
  }

  // A cycle guard, and it is not defensive: `contexts.vue.propsData` is a Vue
  // REACTIVE object, and reactive graphs carry back-references. Without this,
  // beforeSend threw `RangeError: Maximum call stack size exceeded` and the
  // event was lost — monitoring dying silently on exactly the events carrying
  // the richest context.
  //
  // Added before recursing and REMOVED after, so `seen` is the ancestor path
  // rather than a visited set. As a visited set it destroyed a shared
  // non-cyclic reference: `{ a: shared, b: shared }` came back with `b` as
  // '[circular]', dropping diagnostic context that was never a cycle.
  if (seen.has(value)) {
    return REDACTED_CYCLE
  }

  seen.add(value)

  try {
    if (Array.isArray(value)) {
      return value.map((entry) => scrubValue(entry, seen))
    }

    if (!isPlainWalkable(value)) {
      return scrubNonPlain(value, seen)
    }

    return scrubRecord(value as Record<string, unknown>, seen)
  } finally {
    seen.delete(value)
  }
}

/**
 * A denylist, deliberately, not an allowlist: an allowlist would silently
 * drop the diagnostic context that makes an error report useful, and an
 * unusable error reporter gets switched off — which is a worse outcome than
 * a scrubbed one.
 */
function scrubRecord(
  data: Record<string, unknown>,
  seen: WeakSet<object> = new WeakSet()
): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    out[key] = isDeniedKey(key) ? REDACTED : scrubValue(value, seen)
  }

  return out
}

/**
 * Strips a URL down to what Sentry may keep — reusing `redactAnalyticsPath`
 * rather than re-deriving its rules a second time in this codebase.
 *
 * The query string is dropped WHOLESALE, not filtered: the participants list
 * filters through its own query string — `q` is free text and carries the
 * candidate's name, and an
 * allowlist of "safe" parameter names is a promise no one could keep. Path
 * segments that name a specific participant (`/participants/42`) collapse to
 * `/participants/:id` for the same reason `redactAnalyticsPath` already
 * gives GA4 — no analytics sink should be able to correlate error reports
 * back to a specific candidate by ID.
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

/**
 * Redacts free text that MAY embed a URL or a path, rather than assuming the
 * whole string IS one.
 *
 * `redactUrl` treats its whole argument as an address — correct for
 * `request.url` and a breadcrumb's `data.to`/`data.from`, which ARE
 * addresses. `message` (on a breadcrumb, on an event, or on an exception
 * value) is developer- or vendor-written prose that SOMETIMES contains a URL
 * and usually does not ("Vue warn: #app not found"). Running the whole
 * string through `redactUrl` split ordinary text on its first `#` or `?` and
 * silently discarded everything after — no failing build, no visible
 * symptom, and a branch `tests/unit/sentry-scrub.spec.ts` had never once
 * exercised.
 *
 * A leading `/` still goes through `redactAnalyticsPath` in full, for the Vue
 * Router breadcrumbs that pass a bare route as the whole message.
 *
 * That fast path alone was not enough: `ofetch` builds its own error message
 * as `` `[${method}] ${JSON.stringify(url)}: …` `` — the path is quoted
 * MID-SENTENCE, not the whole string, so it never took that branch and
 * reached Sentry through `exception.values[].value` on any unhandled
 * `FetchError`, verbatim. `redactEmbeddedPaths` is the general case: it finds
 * the same participant/reset-password shapes `redactAnalyticsPath` and
 * `redactEmbeddedPaths` share, wherever they sit inside the text, not only at
 * the start of it.
 *
 * Separately, any absolute URL found ANYWHERE in the text is reduced to its
 * origin: `entry_url` is exactly this shape (`https://…/interview/<token>`),
 * and it can end up inside an exception message (`entry link ${entryUrl}
 * rejected`) rather than as a field of its own — where the key-based
 * denylist above cannot reach it, and where `redactEmbeddedPaths` cannot
 * either, since it does not know the frontend's `/interview` route shape.
 */
const ABSOLUTE_URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi

export function redactFreeText(text: string): string {
  // The fast path is ONLY for a message that is a bare route and nothing else —
  // the Vue Router breadcrumb shape — because `redactAnalyticsPath` is the one
  // that preserves a trailing segment (`/participants/:id/transcript`). A route
  // contains no whitespace, so that is the test.
  //
  // Everything else, including prose that merely BEGINS with a slash, goes
  // through the general branch WHOLE. Redacting just the leading token and
  // pasting the remainder back was tried twice and leaked twice: the remainder
  // reached neither `redactEmbeddedPaths` nor the absolute-URL reduction, so
  // `/participants/42 failed: entry link https://…/interview/<token> rejected`
  // came back with the bearer token intact — and the absolute-URL reduction
  // exists precisely because that string has no key for the denylist to catch.
  // One path, applied to the whole string, is the only shape that cannot have
  // a hole in it.
  if (text.startsWith('/') && !/\s/.test(text)) {
    const viaRoute = redactAnalyticsPath(text)

    // Only RETURN on a hit. `redactAnalyticsPath`'s patterns are anchored at `^`
    // behind a rigid `(?:/api)?(?:/[a-z]{2})?` prefix, so anything that prefix
    // does not anticipate falls straight through — and returning here made that
    // a leak rather than a miss: `/x/reset-password/TOKEN` came back verbatim,
    // a live single-use credential, while the same string with a space in it
    // redacted correctly via the unanchored general branch below. Same defect
    // class as the `/api`-mount bug this change fixes: a function written
    // against router paths, silently no-opping on a prefix it never saw.
    //
    // Falling through on a miss is strictly stronger — no case gets worse, and
    // the hit path still keeps the trailing segment
    // (`/participants/:id/transcript`) that the general branch cannot preserve.
    if (viaRoute !== text) {
      return viaRoute
    }
  }

  return redactEmbeddedPaths(text).replace(ABSOLUTE_URL_PATTERN, (match) => {
    try {
      const parsed = new URL(match)

      return `${parsed.protocol}//${parsed.host}`
    } catch {
      return REDACTED
    }
  })
}

export function scrubBreadcrumb(breadcrumb: ScrubbableBreadcrumb): ScrubbableBreadcrumb {
  const next: ScrubbableBreadcrumb = { ...breadcrumb }

  if (next.data) {
    const data = scrubRecord(next.data)

    // Re-derived from the ORIGINAL value, not from the scrubbed copy. These
    // three keys ARE addresses and get `redactUrl`, which keeps the route
    // (`/api/participants/:id`) because knowing which endpoint failed is most
    // of a breadcrumb's diagnostic worth. `scrubRecord` now runs every string
    // through `redactFreeText`, which reduces an absolute URL to its bare
    // origin — correct for prose, destructive here. Reading the scrubbed copy
    // handed `redactUrl` a string already flattened to `https://host/`, so the
    // specific handler silently did nothing.
    for (const urlKey of ['url', 'to', 'from'] as const) {
      const original = next.data[urlKey]

      if (typeof original === 'string') {
        data[urlKey] = redactUrl(original)
      }
    }

    next.data = data
  }

  if (typeof next.message === 'string') {
    next.message = redactFreeText(next.message)
  }

  return next
}

/**
 * The event fields `scrubSentryEvent` handles BY NAME below.
 *
 * Anything absent from this set is walked by the key denylist instead of
 * being spread through untouched — see the note at the top of that function.
 */
const HANDLED_EVENT_FIELDS = new Set([
  'message',
  'tags',
  'transaction',
  'fingerprint',
  'exception',
  'request',
  'extra',
  'contexts',
  'breadcrumbs',
  'user',
])

/**
 * Frame fields that carry a URL, and therefore the URL SHAPE rule.
 *
 * `scrubRecord` walks a stacktrace by key, which catches `vars` (a frame's
 * captured locals) but cannot help with these two: they are not denied keys,
 * they are keys whose VALUE is an address.
 */
const FRAME_URL_FIELDS = ['filename', 'abs_path'] as const

function scrubStacktrace(stacktrace: unknown): unknown {
  if (typeof stacktrace !== 'object' || stacktrace === null) {
    return stacktrace
  }

  // The RAW frames, captured before the walk. `scrubRecord` has already put
  // every string value through the free-text pass, so reading `filename` back
  // out of `walked` and handing it to `redactUrl` redacts a redacted value:
  // `https://bo.test/_nuxt/D1abc.js` came back as the bare `https://bo.test/`,
  // which strips the filename off EVERY frame of EVERY event and leaves Sentry
  // unable to symbolicate anything. That is not a leak, it is silent — and this
  // module's own thesis is that an unusable error reporter is the worse outcome.
  const rawFrames = (stacktrace as Record<string, unknown>)['frames']
  const walked = scrubRecord(stacktrace as Record<string, unknown>)
  const frames = walked['frames']

  if (!Array.isArray(frames)) {
    return walked
  }

  walked['frames'] = frames.map((frame, index) => {
    if (typeof frame !== 'object' || frame === null) {
      return frame
    }

    const original = Array.isArray(rawFrames) ? rawFrames[index] : undefined
    const nextFrame = { ...(frame as Record<string, unknown>) }

    for (const field of FRAME_URL_FIELDS) {
      const raw = (original as Record<string, unknown> | undefined)?.[field]

      if (typeof raw === 'string') {
        nextFrame[field] = redactUrl(raw)
      }
    }

    return nextFrame
  })

  return walked
}

/**
 * `stacktrace` rode out on the `...value` spread this replaces.
 *
 * The module applies its URL-shape rule to `request.url`, `breadcrumb.data.url`
 * and `transaction`, then stopped at the exception boundary — a frame's
 * `filename`/`abs_path` are addresses and its `vars` are captured locals, both
 * of which the rest of this file would have refused to ship.
 */
function scrubExceptionValue(value: ScrubbableExceptionValue): ScrubbableExceptionValue {
  const { value: message, stacktrace, ...rest } = value

  // Same argument as `request`'s `rest` and `tags`, one field over:
  // `ScrubbableExceptionValue` carries an open index signature.
  const next: ScrubbableExceptionValue = { ...scrubRecord(rest) }

  if (message !== undefined) {
    next.value = typeof message === 'string' ? redactFreeText(message) : message
  }

  if (stacktrace !== undefined) {
    next.stacktrace = scrubStacktrace(stacktrace)
  }

  return next
}

export function scrubSentryEvent(event: ScrubbableEvent): ScrubbableEvent {
  const next: ScrubbableEvent = { ...event }

  // Everything NOT handled by name below. `ScrubbableEvent` carries an open
  // index signature and this function opens with a spread, so an unrecognised
  // field rode out verbatim — `{"custom":{"candidate_ref":"CR-99"}}` survived
  // intact, `candidate_ref` being a key this module already denies one level
  // over from where it works. It is the argument the `request` branch below
  // already makes against itself, never applied to the event object that
  // branch lives inside, and the reason the docblock's "by KEY at any depth"
  // was aspirational rather than true.
  const unhandled: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(next)) {
    if (!HANDLED_EVENT_FIELDS.has(key)) {
      unhandled[key] = value
    }
  }

  Object.assign(next, scrubRecord(unhandled))

  if (next.request) {
    const { url, ...rest } = next.request

    next.request = {
      // `rest` goes through the key denylist, it is NOT spread raw. Only
      // url/query_string/cookies/headers were ever handled by name, and
      // `ScrubbableRequest` carries an open index signature — so everything
      // else, `data` (the request BODY) included, went straight through:
      // `{"data":{"password":"…","candidate_ref":"…","entry_url":"…"}}`, all
      // three of them names this module already denies. The comment below says
      // this scrubber does not trust a future SDK version to keep the shape it
      // expects; that scepticism has to apply to the body too.
      ...scrubRecord(rest),
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

  // `tags` is scrubbed for exactly the reason `request.data` is, one field over.
  // It was walked by nothing, and a probe shipped
  // `{"tags":{"route":"/participants/42","candidate_ref":"CR-99"}}` untouched —
  // `candidate_ref` being a key this module already denies. `fingerprint` and
  // `transaction` carry the same shapes and were skipped the same way. The
  // module's contract says "by KEY at any depth"; these are what made it false.
  if (next.tags) {
    next.tags = scrubRecord(next.tags as Record<string, unknown>)
  }

  if (typeof next.transaction === 'string') {
    next.transaction = redactFreeText(next.transaction)
  }

  if (Array.isArray(next.fingerprint)) {
    next.fingerprint = next.fingerprint.map((entry) =>
      typeof entry === 'string' ? redactFreeText(entry) : entry
    )
  }

  if (next.breadcrumbs) {
    next.breadcrumbs = next.breadcrumbs.map(scrubBreadcrumb)
  }

  // `extra`/`contexts` catch KEYED fields; a thrown error's own message is
  // free text with no key to deny — `entry link ${entryUrl} rejected` would
  // otherwise reach Sentry through the one transport the key-based denylist
  // cannot see.
  if (typeof next.message === 'string') {
    next.message = redactFreeText(next.message)
  }

  if (next.exception?.values) {
    next.exception = {
      ...next.exception,
      values: next.exception.values.map(scrubExceptionValue),
    }
  }

  // User context is dropped entirely rather than scrubbed field by field —
  // same call the api scrubber makes, for the same reason. An operator's
  // identity adds nothing to a stack trace that org scope does not already
  // give, and there is no case where keeping it is worth the risk of a
  // future Sentry version adding a field this module has never heard of.
  next.user = undefined

  return next
}
