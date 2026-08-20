/**
 * Extracts an HTTP status code from an ofetch/$fetch rejection.
 *
 * Mirrors the same `.status ?? .statusCode` duck-typing already used by
 * `useApi.ts`'s `isUnauthorized()` — extracted as a shared, generically
 * testable helper so callers that need MORE than a boolean 401 check (e.g.
 * distinguishing 409/403/404, D4) don't duplicate the lookup.
 */
export function getErrorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const status =
    (error as { status?: unknown; statusCode?: unknown }).status ??
    (error as { statusCode?: unknown }).statusCode
  return typeof status === 'number' ? status : null
}

/**
 * Extracts a machine-facing `{data:{reason: string}}` refusal code from an
 * ofetch/$fetch rejection (participant-error-recovery D9 and D3's split
 * refusal reasons on the entry-link mints). Callers map this string onto an
 * i18n key — it is NEVER rendered raw, since it is a stable machine value,
 * not user-facing copy.
 */
export function getErrorReason(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const data = (error as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return null
  const reason = (data as { reason?: unknown }).reason
  return typeof reason === 'string' ? reason : null
}

/**
 * Extracts a Laravel `ValidationException` body's per-field message arrays
 * (`{errors: {field: [message, ...]}}`) from an ofetch/$fetch rejection.
 *
 * Every backoffice form maps server 422s onto the matching field rather than
 * only a generic form-level banner (admin-backoffice spec, "Form Field
 * Validation And Banner Contract") — extracted here once so no form
 * re-implements the `.data.errors` duck-typing. `applyServerFieldErrors`
 * below is the normal way to consume this; call `getErrorFields` directly
 * only when a caller needs the raw per-field map instead of an assign
 * callback.
 */
export function getErrorFields(error: unknown): Record<string, string[]> | null {
  if (typeof error !== 'object' || error === null) return null
  const data = (error as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return null
  const errors = (data as { errors?: unknown }).errors
  if (typeof errors !== 'object' || errors === null) return null
  return errors as Record<string, string[]>
}

/**
 * Maps a server 422's per-field messages onto a caller's own error keys via
 * an `assign` callback, and returns whatever it could NOT place.
 *
 * The one shared mapper the "Form Field Validation And Banner Contract"
 * requires (admin-backoffice spec) — every submitting form adopts this
 * instead of hand-rolling the same `.data.errors` walk. Enforced,
 * mechanically, by `tests/unit/arch/form-contract.spec.ts` (R3): a bare
 * `catch {}` that never reaches this function is a guard violation, not a
 * style nit.
 *
 * Generic over `K`, the caller's OWN error-key union, rather than
 * `Record<string, string>`: `map`'s value type IS `K`, so `assign`'s `key`
 * parameter is exactly the union the caller's local `errors` object is typed
 * against, and `errors.value[key] = message` is checked at the CALL SITE.
 * This function never needs to know `keyof typeof errors.value` — narrowing
 * to `Record<string, string>` at the boundary would erase that check and
 * make the caller's `satisfies Record<string, keyof typeof errors.value>`
 * decorative.
 *
 * Splits each server field at the first `.`, so a Laravel indexed key
 * (`competency_ids.3`) lands on its parent (`competency_ids`) — verbatim
 * behaviour carried over from `ProjectForm.vue`'s original, pre-extraction
 * mapper.
 *
 * Returns `null` when the rejection carries no `{data:{errors}}` body at all
 * (caller falls back to its generic "could not save" banner); otherwise the
 * de-duplicated list of messages whose server field had no entry in `map` —
 * a field this form renders no control for still has to reach the operator,
 * so it belongs in the form-level banner rather than being discarded.
 */
export function applyServerFieldErrors<K extends string>(
  error: unknown,
  map: Readonly<Record<string, K>>,
  assign: (key: K, message: string) => void
): string[] | null {
  const fields = getErrorFields(error)
  if (fields === null) return null

  const unmapped: string[] = []

  for (const [serverField, messages] of Object.entries(fields)) {
    const message = messages?.[0]
    if (message === undefined) continue

    const root = serverField.split('.')[0] ?? serverField
    const localKey = map[root]

    if (localKey !== undefined) assign(localKey, message)
    else if (!unmapped.includes(message)) unmapped.push(message)
  }

  return unmapped
}
