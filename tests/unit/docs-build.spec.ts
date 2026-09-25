/**
 * scripts/build-docs.mjs — self-hosted developer docs (public-api SPEC §6, Q5).
 * The generated site must work fully offline: only local assets, spec included.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error — plain ESM build script, no type declarations
import { renderDocsHtml, buildDocs } from '../../scripts/build-docs.mjs'

describe('renderDocsHtml', () => {
  const html: string = renderDocsHtml()

  it('loads Scalar and the spec from relative local paths only', () => {
    const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1] as string)

    expect(urls).toContain('./scalar.js')
    for (const url of urls) {
      expect(url).toMatch(/^\.\//)
    }
    expect(html).toContain('./openapi.v1.json')
  })

  it('references no external host', () => {
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('disables Scalar features that phone home or need a proxy', () => {
    expect(html).toContain('"withDefaultFonts":false')
    expect(html).toContain('"hideTestRequestButton":true')
    expect(html).toContain('"hideClientButton":true')
    expect(html).toContain('"telemetry":false')
  })
})

describe('buildDocs', () => {
  let work: string
  let out: string

  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), 'docs-build-'))
    out = join(work, 'out')
    const spec = join(work, 'openapi.v1.json')
    const bundle = join(work, 'standalone.js')
    writeFileSync(spec, JSON.stringify({ openapi: '3.1.0', info: { title: 'T', version: '1' } }))
    mkdirSync(join(work, 'x'), { recursive: true })
    writeFileSync(bundle, 'window.Scalar={}')
    buildDocs({ specFile: spec, bundleFile: bundle, outDir: out })
  })

  afterAll(() => rmSync(work, { recursive: true, force: true }))

  it('writes index.html, the vendored bundle and the spec side by side', () => {
    expect(existsSync(join(out, 'index.html'))).toBe(true)
    expect(readFileSync(join(out, 'scalar.js'), 'utf-8')).toBe('window.Scalar={}')
    expect(JSON.parse(readFileSync(join(out, 'openapi.v1.json'), 'utf-8')).info.title).toBe('T')
  })

  it('fails loudly when the spec is missing', () => {
    expect(() =>
      buildDocs({
        specFile: join(work, 'nope.json'),
        bundleFile: join(work, 'standalone.js'),
        outDir: out,
      })
    ).toThrow(/spec/i)
  })
})
