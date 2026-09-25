#!/usr/bin/env node
// Builds the self-hosted developer docs (public-api SPEC §6, Q5): a static
// Scalar page next to a vendored copy of the public /v1 spec. Fully offline at
// runtime — the page loads only relative assets, so nginx can serve it as-is.
//
// The spec is `docs-src/openapi.v1.json`, a copy of api/openapi.v1.json kept
// inside this repo because the Docker build context is `backoffice/` alone.
// Refresh it with: cp ../api/openapi.v1.json docs-src/openapi.v1.json

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const DEFAULTS = {
  specFile: join(root, 'docs-src', 'openapi.v1.json'),
  bundleFile: join(
    root,
    'node_modules',
    '@scalar',
    'api-reference',
    'dist',
    'browser',
    'standalone.js'
  ),
  outDir: join(root, 'docs-site'),
}

// Each option below stops Scalar reaching a third party: default fonts come
// from a CDN, "Try it" routes through a hosted proxy, and telemetry is opt-out.
const SCALAR_CONFIG = {
  url: './openapi.v1.json',
  withDefaultFonts: false,
  hideTestRequestButton: true,
  hideClientButton: true,
  telemetry: false,
}

export function renderDocsHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BEAI API reference</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="./scalar.js"></script>
    <script>
      Scalar.createApiReference('#app', ${JSON.stringify(SCALAR_CONFIG)})
    </script>
  </body>
</html>
`
}

export function buildDocs({
  specFile = DEFAULTS.specFile,
  bundleFile = DEFAULTS.bundleFile,
  outDir = DEFAULTS.outDir,
} = {}) {
  if (!existsSync(specFile)) {
    throw new Error(`OpenAPI spec not found: ${specFile}`)
  }
  if (!existsSync(bundleFile)) {
    throw new Error(`Scalar bundle not found: ${bundleFile} (run bun install)`)
  }

  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'index.html'), renderDocsHtml())
  copyFileSync(bundleFile, join(outDir, 'scalar.js'))
  copyFileSync(specFile, join(outDir, 'openapi.v1.json'))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildDocs()
  console.log(`docs built -> ${DEFAULTS.outDir}`)
}
