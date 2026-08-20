import { ref, computed } from 'vue'

/**
 * useAuth — memory-only Bearer JWT session composable
 * (backoffice-session-refresh-hardening design D2/D4/D9).
 *
 * Storage: a MODULE-SCOPED ref, and NOTHING else — never sessionStorage,
 * never localStorage. The API's login response no longer carries a
 * `refresh_token` field (D8): the real refresh credential is an httpOnly
 * cookie (`beai_refresh`, Path=/api/auth/refresh) the client can never read
 * and must never try to persist. The access token itself is memory-only by
 * the same reasoning that killed the old design: a 14-day JS-readable
 * credential in any Web Storage turns any XSS into a long-lived takeover.
 * A reload therefore always starts unauthenticated in memory —
 * `00.auth-bootstrap.client.ts` (D9) is what rehydrates it, awaited, from
 * the cookie before the router's auth guard ever evaluates.
 *
 * Single-flight refresh, preserved UNCHANGED from the pre-hardening design:
 * `refreshInFlight` is a MODULE-scoped (not per-call) in-flight promise, so
 * every `useAuth()` call site anywhere in the app shares the same refresh.
 * This is PER TAB (per JS context) and does not help across tabs — the
 * cross-tab race is handled server-side by the concurrency grace (D6), not
 * here.
 */

const REFRESH_CSRF_HEADER = { 'X-BEAI-Refresh': '1' } as const

// Module-scoped state — intentionally NOT inside the useAuth() function
// body, so every call site shares the same reactive session and the same
// in-flight refresh promise.
const accessToken = ref<string | null>(null)
let refreshInFlight: Promise<string> | null = null

interface TokenResponse {
  access_token: string
  token_type: string
}

export function useAuth() {
  const isAuthenticated = computed(() => accessToken.value !== null)

  function setSession(token: string): void {
    accessToken.value = token
  }

  function clearSession(): void {
    accessToken.value = null
  }

  /**
   * Refresh the access token via the httpOnly refresh cookie.
   *
   * `credentials: 'include'` sends the cookie cross-origin (backoffice and
   * api are different origins even on localhost); `X-BEAI-Refresh` is the
   * CSRF header the API requires on this endpoint (D5). NEVER sends an
   * Authorization header here — the refresh credential is the cookie, not
   * the access token, and D8's whole point is that this must keep working
   * after the access token has already expired.
   *
   * Single-flight: concurrent callers await the SAME promise and exactly
   * one request reaches /api/auth/refresh.
   *
   * On failure the session is cleared and the rejection propagates — callers
   * (useApi) are responsible for redirecting to /login.
   */
  function refresh(): Promise<string> {
    if (refreshInFlight) return refreshInFlight

    const apiBase = useRuntimeConfig().public.apiBase

    refreshInFlight = (async () => {
      try {
        const response = await $fetch<TokenResponse>(`${apiBase}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: REFRESH_CSRF_HEADER,
        })
        setSession(response.access_token)
        return response.access_token
      } catch (error) {
        clearSession()
        throw error
      } finally {
        refreshInFlight = null
      }
    })()

    return refreshInFlight
  }

  /**
   * POST /api/auth/logout — denylists the jti and revokes the refresh
   * family server-side, then clears the in-memory session and navigates to
   * /login regardless of the response (never leave a stale local session,
   * or the user stranded on a protected page, because the network call
   * failed).
   */
  async function logout(): Promise<void> {
    const apiBase = useRuntimeConfig().public.apiBase
    const currentToken = accessToken.value
    try {
      await $fetch(`${apiBase}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : undefined,
      })
    } catch {
      // Intentionally swallowed — logout must succeed locally even if the
      // network call fails.
    } finally {
      clearSession()
      await navigateTo('/login')
    }
  }

  return {
    accessToken,
    isAuthenticated,
    setSession,
    clearSession,
    refresh,
    logout,
  }
}
