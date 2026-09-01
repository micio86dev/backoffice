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
  const hasTranslation = typeof translator.te === 'function' ? translator.te(key) : true

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
