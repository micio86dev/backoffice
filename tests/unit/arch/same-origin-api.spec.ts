/**
 * The backoffice and its API must be ONE origin
 * (backoffice-same-origin-api AD-1/AD-3/AD-4).
 *
 * `up.railway.app` is on the Public Suffix List, so every Railway service is
 * its own registrable domain — a different SITE, not merely a different host.
 * While the SPA called the api directly, `beai_refresh` was a THIRD-PARTY
 * cookie: WebKit blocks those, `Secure`/`SameSite=None` do not override it, and
 * Safari operators were returned to the login screen on every reload. The
 * access token is memory-only by design, so a reload has nothing else to fall
 * back on.
 *
 * nginx now serves /api/ from the backoffice's own origin, which makes the
 * cookie first-party and the question moot.
 *
 * WHAT THIS FILE REPLACES, and why that is not a failing test being deleted:
 * `tests/e2e/session-cookie.spec.ts` probed whether WebKit would store a
 * CROSS-SITE Secure+SameSite=None cookie. It was a browser-behaviour probe, its
 * docblock demanded that a WebKit failure fail the build rather than be
 * skipped, and it did exactly that — it failed, and it was right. The design
 * decision it gated (D11's cross-site refresh cookie) is now superseded, so the
 * property it verified is no longer one the product depends on. Keeping it
 * would leave a permanently red gate guarding an architecture that no longer
 * exists; skipping it would be the silent skip its own docblock forbade.
 *
 * The build asserts the VALUE — an absolute NUXT_PUBLIC_API_BASE fails it.
 * These assert the GATE: that nobody quietly removes the mechanism which makes
 * that value safe.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DOCKERFILE = readFileSync(resolve(__dirname, '../../../Dockerfile'), 'utf-8')

describe('the same-origin API mechanism cannot be quietly removed', () => {
  it('nginx proxies /api/ from the backoffice origin', () => {
    expect(DOCKERFILE).toContain('location ^~ /api/')
    expect(DOCKERFILE).toContain('proxy_pass')
  })

  it('the /api/ location uses ^~ so the asset regex cannot capture it', () => {
    // Without `^~`, nginx prefers the js|css|png|… REGEX location, and a request
    // for /api/something.css would be served from the filesystem — a 404, or
    // worse the SPA shell under a 200, which an API client parses as JSON.
    expect(DOCKERFILE).toMatch(/location \^~ \/api\//)
  })

  it('proxy_pass carries no URI part, so the request path reaches the api unchanged', () => {
    // A URI part on proxy_pass rewrites the path, which would silently break the
    // cookie's `Path=/api/auth/refresh` scope.
    // The DIRECTIVE, not the comments above it that merely name it — the first
    // naive `includes('proxy_pass')` match is a comment, and a test that
    // asserts against prose proves nothing.
    const proxyLine = DOCKERFILE.split('\n').find((l) => /^\s*proxy_pass\s/.test(l))

    expect(proxyLine, 'no proxy_pass DIRECTIVE found in the Dockerfile').toBeDefined()
    // The origin, then the statement ends. Anything between them is a path
    // component, and a path component here rewrites the request URI.
    expect(proxyLine).toContain(`proxy_pass '"$BEAI_API_ORIGIN"';`)
  })

  it('the build refuses an absolute NUXT_PUBLIC_API_BASE', () => {
    // The one environment variable that can undo all of the above.
    expect(DOCKERFILE).toContain('NUXT_PUBLIC_API_BASE must be RELATIVE')
  })

  it('the proxy target is a required build arg, not an optional one', () => {
    // Absent, the backoffice would have no API at all and every request would
    // fall through to the SPA shell.
    expect(DOCKERFILE).toContain('ARG BEAI_API_ORIGIN')
    expect(DOCKERFILE).toContain('build arg BEAI_API_ORIGIN is required')
  })
})
