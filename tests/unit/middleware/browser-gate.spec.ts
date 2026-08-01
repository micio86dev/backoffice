/**
 * 01.browser-gate.global.ts (SA-11, task 14.5 — RED)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

function stubNavigator(userAgent: string, innerWidth: number): void {
  vi.stubGlobal('navigator', { userAgent })
  vi.stubGlobal('window', { innerWidth })
}

const CHROME_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const FIREFOX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'

describe('01.browser-gate.global.ts', () => {
  beforeEach(() => {
    vi.stubGlobal('defineNuxtRouteMiddleware', (handler: unknown) => handler)
  })

  it('navigates to /unsupported for an unsupported browser at desktop width', async () => {
    stubNavigator(FIREFOX_UA, 1440)
    const navigateToMock = vi.fn(() => 'navigated')
    vi.stubGlobal('navigateTo', navigateToMock)

    const middleware = (await import('../../../app/middleware/01.browser-gate.global')).default
    const result = middleware({ path: '/participants' } as never, {} as never)

    expect(navigateToMock).toHaveBeenCalledWith('/unsupported')
    expect(result).toBe('navigated')
  })

  it('navigates to /unsupported for a narrow (mobile) viewport, even on Chrome', async () => {
    stubNavigator(CHROME_DESKTOP_UA, 375)
    const navigateToMock = vi.fn(() => 'navigated')
    vi.stubGlobal('navigateTo', navigateToMock)

    const middleware = (await import('../../../app/middleware/01.browser-gate.global')).default
    middleware({ path: '/participants' } as never, {} as never)

    expect(navigateToMock).toHaveBeenCalledWith('/unsupported')
  })

  it('does nothing for a supported browser at desktop width', async () => {
    stubNavigator(CHROME_DESKTOP_UA, 1440)
    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    const middleware = (await import('../../../app/middleware/01.browser-gate.global')).default
    const result = middleware({ path: '/participants' } as never, {} as never)

    expect(navigateToMock).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it('never redirects when already on /unsupported (no redirect loop)', async () => {
    stubNavigator(FIREFOX_UA, 375)
    const navigateToMock = vi.fn()
    vi.stubGlobal('navigateTo', navigateToMock)

    const middleware = (await import('../../../app/middleware/01.browser-gate.global')).default
    middleware({ path: '/unsupported' } as never, {} as never)

    expect(navigateToMock).not.toHaveBeenCalled()
  })
})
