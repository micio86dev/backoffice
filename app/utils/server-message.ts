/**
 * Turn a machine-facing server code into copy in the reader's language.
 *
 * The API returns stable snake_case codes, never prose — a response body is
 * machine-facing (CLAUDE.md: machine-readable values "are NOT user-facing and
 * are returned literally in every locale"), and the API has no idea what
 * language the person reading it speaks. This layer does, because it is the
 * only one that knows the operator's locale.
 *
 * Before this existed, `ResetPasswordController` answered with the sentence
 * "This password reset link is invalid or has expired. Request a new one." and
 * the page rendered it verbatim, so an Italian operator on an Italian page read
 * English.
 *
 * FALLS BACK TO THE RAW CODE, deliberately, and never to a generic "something
 * went wrong". A code an operator can read out to support beats a sentence that
 * hides which of several failures actually happened — and it makes the missing
 * translation obvious rather than invisible. The locale-parity tests are what
 * stop a code shipping without copy; this fallback is the safety net under
 * them, not the plan.
 */
export interface ServerMessageTranslator {
  /** vue-i18n's `t`. */
  t: (key: string) => string
  /** vue-i18n's `te`. Optional: a test double that stubs only `t` must not crash. */
  te?: (key: string) => boolean
}

export function translateServerCode(
  translator: ServerMessageTranslator,
  namespace: string,
  code: string
): string {
  const key = `${namespace}.${code}`

  // FALSE on absence, not true. A translator without `te` cannot answer
  // "does this key exist", and answering YES on its behalf makes the gate
  // structurally incapable of failing: a stub with only `t` reports a hit for
  // every key, so a code with no copy renders as the literal key string and
  // the test asserting the translation stays green. That is precisely how
  // `users.serverError.role_invalid` shipped missing. Falling back to the raw
  // code is what the docblock above says this does.
  const hasTranslation = typeof translator.te === 'function' && translator.te(key)

  return hasTranslation ? translator.t(key) : code
}

/**
 * The same, for the list `applyServerFieldErrors` returns for fields the caller
 * did not claim. Joined by the caller, as before — this only translates.
 */
export function translateServerCodes(
  translator: ServerMessageTranslator,
  namespace: string,
  codes: readonly string[]
): string[] {
  return codes.map((code) => translateServerCode(translator, namespace, code))
}

/**
 * The same, but PROSE NEVER GETS THROUGH.
 *
 * `translateServerCode` falls back to the raw value on a miss, which is the
 * right safety net for a namespace that is meant to be complete: an untranslated
 * CODE is readable, and support can act on it. It is the wrong one for an
 * endpoint that still answers in sentences — there the fallback prints an
 * English paragraph under an Italian label, which is the exact defect this
 * module exists to remove.
 *
 * A value that does not look like a machine code is therefore replaced with
 * the caller's own localized message rather than rendered.
 */
// EITHER CASE. Field rules answer in lower_snake and the form-level
// `code` field answers in UPPER_SNAKE (`POTENTIAL_CATALOG_INCOMPLETE`);
// both are tokens, and a lowercase-only pattern silently discarded the
// second — replacing the one message that says what actually went wrong
// with the generic one. What this must reject is PROSE, and prose carries
// spaces and punctuation that neither case allows.
const MACHINE_CODE = /^[A-Z]\w*$/i

const key = (namespace: string, code: string): string => `${namespace}.${code}`

export function translateServerCodeOrFallback(
  translator: ServerMessageTranslator,
  namespace: string,
  value: string,
  fallbackKey: string
): string {
  if (!MACHINE_CODE.test(value)) return translator.t(fallbackKey)

  // Same reasoning as `translateServerCode`: an absent `te` answers no.
  const hasTranslation = typeof translator.te === 'function' && translator.te(key(namespace, value))

  return hasTranslation ? translator.t(key(namespace, value)) : translator.t(fallbackKey)
}
