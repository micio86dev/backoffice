// Prints the CSP `script-src` hash sources for every executable inline <script>
// in the built HTML, one `'sha256-…'` per line.
//
// Why: the SPA shell inlines `window.__NUXT__={…config…}`, and the docs page
// inlines its bootstrap. nginx serves a static `script-src 'self'` header, which
// blocks both — a blank page. The script body embeds build-time config (API base,
// GA id, Sentry DSN), so its hash differs per deploy and cannot be hardcoded;
// the Dockerfile computes it from the artefact it is about to serve.
// `type="application/json"` blocks are data, never executed, and need no entry.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const INLINE_SCRIPT =
  /<script(?![^>]*\bsrc\s*=)(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* htmlFiles(path)
    else if (name.endsWith('.html')) yield path
  }
}

const hashes = new Set()
for (const root of process.argv.slice(2)) {
  for (const file of htmlFiles(root)) {
    for (const match of readFileSync(file, 'utf8').matchAll(INLINE_SCRIPT)) {
      hashes.add(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`)
    }
  }
}

if (hashes.size === 0) {
  console.error(
    'csp-script-hashes: no inline script found — the SPA shell always has one; refusing to emit an empty list'
  )
  process.exit(1)
}
console.log([...hashes].join('\n'))
