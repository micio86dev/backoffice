/**
 * Dockerfile nginx config — the SPA fallback must NOT swallow `/_nuxt/` 404s.
 *
 * The runtime stage serves the generated SPA with `try_files $uri $uri/ /index.html`,
 * which is correct for client-side ROUTES and wrong for build assets. A browser
 * still holding a previous deploy's bundle asks for its own build manifest at
 * `/_nuxt/builds/meta/{buildId}.json`; after a redeploy that file is gone, the
 * fallback answers `200 text/html` with the SPA shell, and Nuxt reports:
 *
 *   [nuxt] Received malformed app manifest. Ensure that `builds/meta/*.json` is
 *   served as JSON by your hosting/proxy and not rewritten to an HTML fallback.
 *
 * Observed in production on 2026-08-24 (backoffice-production-ec05.up.railway.app);
 * a request for a non-existent buildId returned `200 text/html` instead of `404`.
 *
 * The `.json` extension is what made this specific to the manifest: the
 * static-asset regex block covers `js|css|png|…` — which DO 404 correctly, since
 * a regex location without `try_files` serves from root and misses — but not
 * `.json`, so only the manifest fell through to `location /`.
 *
 * A real 404 is what Nuxt needs: it is the signal that drives reload-on-chunk-error.
 * An HTML body with a 200 is indistinguishable from a successful fetch until it
 * fails to parse, which is why this surfaced as "malformed" rather than "missing".
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The nginx server block is written by a `printf` heredoc-ish RUN step, where
 * every source line ends with a literal `\n` followed by a shell line
 * continuation. Undo both to recover the config as nginx will actually see it.
 */
function nginxConfig(): string {
  // `import.meta.url` is not a file: URL under the jsdom test environment, so
  // resolve from the Vitest root (the package dir) instead.
  const dockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile'), 'utf8')

  const start = dockerfile.indexOf("RUN printf 'server {")
  expect(start, 'Dockerfile no longer writes the nginx server block via printf').toBeGreaterThan(-1)

  const end = dockerfile.indexOf('/etc/nginx/conf.d/default.conf', start)
  return dockerfile.slice(start, end).replace(/\\n\\\n/g, '\n')
}

/** Return the body of the `location <prefix> {` block, or null when absent. */
function locationBlock(config: string, prefix: string): string | null {
  const header = config.indexOf(`location ${prefix} {`)
  if (header === -1) return null

  const open = config.indexOf('{', header)
  const close = config.indexOf('}', open)

  return config.slice(open + 1, close)
}

describe('Dockerfile nginx — build assets must 404, not fall back to index.html', () => {
  it('guards /_nuxt/ with an explicit 404 instead of the SPA fallback', () => {
    const config = nginxConfig()
    const block = locationBlock(config, '^~ /_nuxt/')

    expect(
      block,
      'no `location ^~ /_nuxt/` block — a stale asset would serve index.html'
    ).not.toBeNull()
    expect(block).toMatch(/try_files\s+\$uri\s+=404;/)
    expect(block, 'the /_nuxt/ block must never fall back to the SPA shell').not.toContain(
      'index.html'
    )
  })

  it('uses the ^~ modifier so the static-asset regex block cannot outrank it', () => {
    // nginx resolves a regex location BEFORE a plain prefix location. Without
    // `^~`, the `~* \.(js|css|…)$` block below would still win for /_nuxt/*.js
    // and the guard would only ever apply to the manifest it was written for.
    const config = nginxConfig()

    expect(config).toContain('location ^~ /_nuxt/')
  })

  it('still falls back to index.html for client-side ROUTES', () => {
    // The guard above must not regress SPA routing: an unknown path that is not
    // a build asset is a Vue Router route and has to receive the shell.
    const config = nginxConfig()
    const block = locationBlock(config, '/')

    expect(block).toMatch(/try_files\s+\$uri\s+\$uri\/\s+\/index\.html;/)
  })
})
