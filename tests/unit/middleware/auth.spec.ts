/**
 * 02.auth.global.ts (D11, task 14.5 — RED)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('02.auth.global.ts', () => {
  beforeEach(() => {
    sessionStorage.clear()
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

  it('does nothing for an authenticated visitor', async () => {
    const { useAuth } = await import('../../../app/composables/useAuth')
    useAuth().setSession('valid-token')

    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    const middleware = (await import('../../../app/middleware/02.auth.global')).default
    const result = middleware({ path: '/participants' } as never, {} as never)

    expect(navigateToMock).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it('never redirects on /login itself, even when unauthenticated (belt-and-braces, D11)', async () => {
    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    const middleware = (await import('../../../app/middleware/02.auth.global')).default
    middleware({ path: '/login' } as never, {} as never)

    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('never redirects on /unsupported, even when unauthenticated (belt-and-braces, D11)', async () => {
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
})
