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
