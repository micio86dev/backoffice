import { ref, computed } from 'vue'

/**
 * useAuth — Bearer JWT session composable (D11).
 *
 * Storage: sessionStorage + an in-memory mirror. The API issues no cookie
 * (`AuthController.php:181-186` returns JSON only), so an httpOnly refresh
 * cookie is out of scope; sessionStorage survives a page reload without
 * persisting across tab close/browser restart. The real XSS mitigation is the
 * existing CSP/security headers (`nuxt.config.ts` route rules) and never using
 * `v-html`, not the storage mechanism itself — an accepted risk (D11).
 *
 * Single-flight refresh: `AuthController.php:86-98` uses jwt-auth token
 * ROTATION with the denylist enabled (`config/jwt.php:227`). Two concurrent
 * refresh calls would mean the second presents a jti the first already
 * denylisted, causing a spurious logout. `refreshInFlight` is a MODULE-scoped
 * (not per-call) in-flight promise, so every `useAuth()` call site anywhere in
 * the app shares the same refresh — a poor-man's store, since this stack has no
 * Pinia.
 */

const ACCESS_TOKEN_KEY = 'beai_access_token'

// Module-scoped state — intentionally NOT inside the useAuth() function body,
// so every call site shares the same reactive session and the same in-flight
// refresh promise.
const accessToken = ref<string | null>(null)
let hydrated = false
let refreshInFlight: Promise<string> | null = null

function readStoredToken(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  return sessionStorage.getItem(ACCESS_TOKEN_KEY)
}

function persistToken(token: string | null): void {
  accessToken.value = token
  if (typeof sessionStorage === 'undefined') return
  if (token) {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
  } else {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY)
  }
}

function ensureHydrated(): void {
  if (hydrated) return
  hydrated = true
  const stored = readStoredToken()
  if (stored) accessToken.value = stored
}

interface TokenResponse {
  access_token: string
  token_type: string
}

export function useAuth() {
  ensureHydrated()

  const isAuthenticated = computed(() => accessToken.value !== null)

  function setSession(token: string): void {
    persistToken(token)
  }

  function clearSession(): void {
    persistToken(null)
  }

  /**
   * Refresh the access token. Single-flight: concurrent callers await the
   * SAME promise and exactly one request reaches /api/auth/refresh.
   *
   * On failure the session is cleared and the rejection propagates — callers
   * (useApi) are responsible for redirecting to /login.
   */
  function refresh(): Promise<string> {
    if (refreshInFlight) return refreshInFlight

    const apiBase = useRuntimeConfig().public.apiBase
    const currentToken = accessToken.value

    refreshInFlight = (async () => {
      try {
        const response = await $fetch<TokenResponse>(`${apiBase}/auth/refresh`, {
          method: 'POST',
          headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : undefined,
        })
        persistToken(response.access_token)
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
   * POST /api/auth/logout — denylists the jti server-side, then clears local
   * storage and navigates to /login regardless of the response (D11: never
   * leave a stale local session, or the user stranded on a protected page,
   * because the network call failed).
   */
  async function logout(): Promise<void> {
    const apiBase = useRuntimeConfig().public.apiBase
    const currentToken = accessToken.value
    try {
      await $fetch(`${apiBase}/auth/logout`, {
        method: 'POST',
        headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : undefined,
      })
    } catch {
      // Intentionally swallowed — logout must succeed locally even if the
      // network call fails (D11).
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
