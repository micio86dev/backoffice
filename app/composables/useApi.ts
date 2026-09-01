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

/**
 * D5: a valid JWT can outlive a mid-session deactivation by up to the
 * token's TTL. `TenantContext` folds that into `403 {"error":"account_deactivated"}`
 * on every subsequent request — deliberately NOT 401, so it never enters the
 * single-flight refresh path above (which would just issue the deactivated
 * account a new valid token). A GENERIC 403 (an RBAC denial) must not match:
 * the `error` code is the only reliable signal, not the status code alone.
 */
function isAccountDeactivated(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const status = (error as { status?: unknown }).status
  if (status !== 403) return false
  const data = (error as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return false
  return (data as { error?: unknown }).error === 'account_deactivated'
}

/**
 * The UI's current locale, from anywhere — setup context or not.
 *
 * `$i18n` is installed on the Nuxt app by `@nuxtjs/i18n`, so it is reachable
 * from lifecycle hooks, middleware and plugins alike. Wrapped in a try/catch
 * because `useNuxtApp()` itself throws outside a Nuxt context (a bare unit
 * test), and an API client that cannot be constructed in a test is a worse
 * problem than a header defaulting to English.
 */
function resolveLocale(): string {
  try {
    const i18n = useNuxtApp().$i18n as { locale?: { value?: string } } | undefined
    const value = i18n?.locale?.value

    return typeof value === 'string' && value !== '' ? value : 'en'
  } catch {
    return 'en'
  }
}

export function useApi() {
  async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
    const { accessToken, refresh } = useAuth()
    const apiBase = useRuntimeConfig().public.apiBase
    // Read through the Nuxt app, NOT `useI18n()`.
    //
    // `useI18n()` needs an active setup context, and `apiFetch` is called from
    // lifecycle hooks, route middleware and plugins — none of which have one.
    // It threw there, the request never went out, and the page rendered empty
    // with no error anyone would connect to a header. The unit tests missed it
    // because they stub `useI18n` globally, which is exactly the shape of a
    // test that proves the mock works.
    //
    // Falls back to the default locale rather than throwing: a missing locale
    // must never be the reason a request fails.
    const locale = resolveLocale()

    async function attempt(token: string): Promise<T> {
      return $fetch<T>(`${apiBase}${path}`, {
        ...options,
        headers: {
          // The UI's language, on every request. The API localizes what is
          // ours to localize — validation messages, error copy, framework
          // catalogue text — and it can only do that if it is told what the
          // reader is reading in. The browser's own Accept-Language is the
          // wrong answer: someone can run a Italian browser and switch this
          // app to English, and the API should follow the app.
          //
          // Set BEFORE the caller's own headers are spread, so an explicit
          // per-call override still wins.
          'Accept-Language': locale,
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
      if (isAccountDeactivated(error)) {
        useAuth().clearSession()
        await navigateTo('/login')
        throw error
      }

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
