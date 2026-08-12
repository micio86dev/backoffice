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
 * Extracts a Laravel `ValidationException` body's per-field message arrays
 * (`{errors: {field: [message, ...]}}`) from an ofetch/$fetch rejection.
 *
 * Every form this change introduces (Project, organization profile, webhook
 * defaults, user) maps server 422s onto the matching field rather than only
 * a generic form-level banner (admin-backoffice spec, "Form Field Validation
 * And Banner Contract") — extracted here once so no form re-implements the
 * `.data.errors` duck-typing.
 */
export function getErrorFields(error: unknown): Record<string, string[]> | null {
  if (typeof error !== 'object' || error === null) return null
  const data = (error as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return null
  const errors = (data as { errors?: unknown }).errors
  if (typeof errors !== 'object' || errors === null) return null
  return errors as Record<string, string[]>
}
