import { test, expect } from '@playwright/test'

/**
 * WebKit SameSite=None Verification Gate (backoffice-session-refresh-hardening
 * design D11). Runs under BOTH `chromium` and `webkit` — a genuine
 * cross-site cookie probe, not a footnote.
 *
 * This is a browser-BEHAVIOUR probe, not an app test: it does not need the
 * Nuxt app at all (playwright.config.ts sets no NUXT_PUBLIC_API_BASE, so
 * every OTHER spec in this suite is same-origin). It navigates to
 * `http://127.0.0.1:4173/health` (the webServer's own origin) and then
 * intercepts `http://localhost:4173/**` via page.route() — a DIFFERENT
 * origin from `127.0.0.1` even though it is the SAME server underneath, so
 * fulfilling a request there is genuinely cross-site from the page's point
 * of view.
 *
 * Acceptance criterion (D11): this fails CI, never Safari, in production —
 * i.e. a WebKit failure here MUST fail the build, never be silently
 * skipped. If WebKit rejects `Secure` over `http://localhost` (the most
 * likely failure in the whole change), the pre-decided fallback is local
 * HTTPS via mkcert (docs/dev-setup.md) — the cookie itself is never
 * weakened to make this pass.
 */

const CROSS_SITE_ORIGIN = 'http://localhost:4173'
// The EXACT production Set-Cookie shape (design D4) — HttpOnly, Secure,
// SameSite=None, Path scoped to the one route that consumes it.
const PRODUCTION_SET_COOKIE =
  'beai_refresh=11111111-1111-4111-8111-111111111111.aTestSecretValue123456789-abcdefghijklmno; ' +
  'Max-Age=1209600; Path=/api/auth/refresh; Secure; HttpOnly; SameSite=None'

test.describe('Session cookie — WebKit SameSite=None verification gate (D11)', () => {
  test('a cross-site Set-Cookie with Secure+SameSite=None is stored and re-sent on the next cross-site request', async ({
    page,
    context,
  }) => {
    let refreshCallCount = 0
    let secondRequestSawCookie: string | undefined

    // Both probes hit the SAME path the cookie is scoped to
    // (Path=/api/auth/refresh) — a re-send probe on a DIFFERENT path would
    // correctly never carry it regardless of SameSite/Secure behaviour, and
    // would silently prove nothing.
    await page.route(`${CROSS_SITE_ORIGIN}/api/auth/refresh`, async (route) => {
      refreshCallCount += 1

      if (refreshCallCount === 1) {
        await route.fulfill({
          status: 200,
          headers: { 'set-cookie': PRODUCTION_SET_COOKIE },
          contentType: 'application/json',
          body: JSON.stringify({ access_token: 'irrelevant-for-this-probe', token_type: 'bearer' }),
        })
        return
      }

      secondRequestSawCookie = route.request().headers()['cookie']
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    // Same server, genuinely cross-site: `127.0.0.1` and `localhost` are
    // distinct origins per the Fetch/Cookie spec even though both resolve
    // to this one Playwright webServer instance.
    await page.goto('http://127.0.0.1:4173/health')

    await page.evaluate(async (origin) => {
      await fetch(`${origin}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
    }, CROSS_SITE_ORIGIN)

    // NOT context.cookies(CROSS_SITE_ORIGIN) — that filters by whether the
    // cookie would be sent to that exact URL, and a bare origin has an
    // implicit Path=/, which excludes a cookie scoped to
    // Path=/api/auth/refresh. Filter by name/domain explicitly instead.
    const cookies = await context.cookies()
    const stored = cookies.find((c) => c.name === 'beai_refresh' && c.domain === 'localhost')

    expect(stored, 'beai_refresh cookie was NOT stored after a cross-site Set-Cookie').toBeDefined()
    expect(stored?.secure).toBe(true)
    expect(stored?.httpOnly).toBe(true)
    expect(stored?.sameSite).toBe('None')
    expect(stored?.path).toBe('/api/auth/refresh')

    // Re-sent: a second cross-site request to the SAME path must carry it.
    await page.evaluate(async (origin) => {
      await fetch(`${origin}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
    }, CROSS_SITE_ORIGIN)

    expect(
      secondRequestSawCookie,
      'beai_refresh was stored but NOT re-sent on the next cross-site request — WebKit may be rejecting Secure over http://localhost (D11 fallback: mkcert local HTTPS, see docs/dev-setup.md)'
    ).toContain('beai_refresh=')
  })
})
