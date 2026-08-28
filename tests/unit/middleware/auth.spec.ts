/**
 * 02.auth.global.ts (corrected first — backoffice-session-refresh-hardening
 * slice 4, design D9)
 *
 * The middleware itself stays SYNCHRONOUS and nearly unchanged — its
 * precondition changed (an awaited silent refresh, D9's
 * 00.auth-bootstrap.client.ts, now runs before this middleware ever
 * evaluates `isAuthenticated`), not its own logic. These tests assert the
 * synchronous contract still holds; the async rehydration path is covered
 * by the boot-plugin's own spec.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('02.auth.global.ts', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('defineNuxtRouteMiddleware', (handler: unknown) => handler)
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
    )
  })

  it('redirects an unauthenticated visitor to /login', async () => {
    const navigateToMock = vi.fn(() => 'navigated')
    vi.stubGlobal('navigateTo', navigateToMock)

    const middleware = (await import('../../../app/middleware/02.auth.global')).default
    const result = middleware({ path: '/participants' } as never, {} as never)

    expect(navigateToMock).toHaveBeenCalledWith('/login')
    expect(result).toBe('navigated')
  })

  it('does nothing for an authenticated visitor — asserted synchronously, mirroring the real post-boot-rehydration state', async () => {
    const { useAuth } = await import('../../../app/composables/useAuth')
    useAuth().setSession('valid-token')

    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    const middleware = (await import('../../../app/middleware/02.auth.global')).default
    const result = middleware({ path: '/participants' } as never, {} as never)

    expect(navigateToMock).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it('is compatible with async boot rehydration: `isAuthenticated` read synchronously here reflects whatever 00.auth-bootstrap.client.ts already settled BEFORE this middleware runs — it never awaits anything itself', async () => {
    const { useAuth } = await import('../../../app/composables/useAuth')
    // Simulates the boot plugin having ALREADY resolved (awaited) before the
    // router evaluates this middleware — the middleware itself performs NO
    // async work and NO await, by design (D9's rejected alternative: an
    // async middleware would run on every navigation and race /login).
    useAuth().setSession('rehydrated-token')

    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    const middleware = (await import('../../../app/middleware/02.auth.global')).default
    const result = middleware({ path: '/participants' } as never, {} as never)

    expect(result).toBeUndefined()
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('never redirects on /login itself, even when unauthenticated (belt-and-braces)', async () => {
    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    const middleware = (await import('../../../app/middleware/02.auth.global')).default
    middleware({ path: '/login' } as never, {} as never)

    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('never redirects on /unsupported, even when unauthenticated (belt-and-braces)', async () => {
    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    const middleware = (await import('../../../app/middleware/02.auth.global')).default
    middleware({ path: '/unsupported' } as never, {} as never)

    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('never redirects on /health, even when unauthenticated (regression guard — E2E caught this: the global auth middleware initially had no exemption and silently redirected the machine-readable health-check page to /login)', async () => {
    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    const middleware = (await import('../../../app/middleware/02.auth.global')).default
    middleware({ path: '/health' } as never, {} as never)

    expect(navigateToMock).not.toHaveBeenCalled()
  })

  /**
   * self-service-password-reset. Both recovery pages are reached by someone
   * who by definition has no session — a guard that bounces them to /login is
   * a recovery flow that cannot be entered.
   *
   * `/reset-password/{token}` is the case the pre-existing `endsWith` match
   * could not express: the token is a PATH SEGMENT
   * (`SendPasswordResetLinkJob.php:135`), so the path ends with the token, not
   * with the route.
   */
  it.each([
    '/forgot-password',
    '/en/forgot-password',
    '/reset-password',
    '/en/reset-password',
    '/reset-password/a-live-single-use-token',
    '/en/reset-password/a-live-single-use-token',
  ])('never redirects on %s, which is only ever reached without a session', async (path) => {
    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    const middleware = (await import('../../../app/middleware/02.auth.global')).default
    middleware({ path } as never, {} as never)

    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('still guards a route that merely CONTAINS a public path name', async () => {
    // The exemption is segment-scoped, not a substring match — otherwise a
    // future `/projects/reset-password-settings` would be silently public.
    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    const middleware = (await import('../../../app/middleware/02.auth.global')).default
    middleware({ path: '/projects/reset-password-settings' } as never, {} as never)

    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })
})
