/**
 * useApi — session-aware `$fetch` wrapper (D11).
 *
 * Attaches `Authorization: Bearer <token>` to every request against
 * `runtimeConfig.public.apiBase`. On a 401:
 *   - if there IS a session, attempt exactly one silent refresh (via the
 *     single-flight `useAuth().refresh()`) and retry the original request once
 *     with the new token — the user is never redirected for a recoverable
 *     token expiry;
 *   - if there is NO session, or the refresh itself fails, redirect to
 *     `/login` and surface the failure to the caller.
 *
 * Never loops: at most one refresh attempt per call.
 */
import { useAuth } from './useAuth'

// Derived from the globally auto-imported `$fetch` (Nuxt/nitro/ofetch) instead
// of importing a type from `ofetch` directly — `ofetch` is a transitive Nuxt
// dependency, not a pinned project dependency (D37).
type ApiFetchOptions = NonNullable<Parameters<typeof $fetch>[1]>

function isUnauthorized(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const status =
    (error as { status?: unknown; statusCode?: unknown }).status ??
    (error as { statusCode?: unknown }).statusCode
  return status === 401
}

export function useApi() {
  async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
    const { accessToken, refresh } = useAuth()
    const apiBase = useRuntimeConfig().public.apiBase

    async function attempt(token: string): Promise<T> {
      return $fetch<T>(`${apiBase}${path}`, {
        ...options,
        headers: {
          ...(options.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${token}`,
        },
      })
    }

    if (accessToken.value === null) {
      await navigateTo('/login')
      throw new Error('Not authenticated')
    }

    try {
      return await attempt(accessToken.value)
    } catch (error) {
      if (!isUnauthorized(error)) throw error

      try {
        const newToken = await refresh()
        return await attempt(newToken)
      } catch {
        await navigateTo('/login')
        throw error
      }
    }
  }

  return { apiFetch }
}
