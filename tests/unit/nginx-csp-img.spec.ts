/**
 * The nginx CSP `img-src` must not allow any plain-http origin by default:
 * production stays https-only. A local-only extra origin is injected at BUILD
 * time through the optional `BEAI_CSP_IMG_EXTRA` build arg (empty by default)
 * and is validated so a typo cannot smuggle in another directive.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile'), 'utf8')

describe('Dockerfile CSP img-src', () => {
  it('has no http: origin in the default header, only the optional placeholder', () => {
    const header = dockerfile
      .split('\n')
      .find((l) => l.includes('add_header Content-Security-Policy'))
    expect(header).toBeDefined()

    const imgSrc = /img-src ([^;]*);/.exec(header as string)?.[1] ?? ''
    expect(imgSrc).toContain("'\"'\"'self'\"'\"' data: blob: https:__CSP_IMG_EXTRA__")
    expect(imgSrc).not.toMatch(/http:/)
  })

  it('declares the build arg empty by default and validates it as space-separated http(s) origins', () => {
    expect(dockerfile).toMatch(/ARG BEAI_CSP_IMG_EXTRA=""/)
    expect(dockerfile).toContain('__CSP_IMG_EXTRA__')
    expect(dockerfile).toMatch(/BEAI_CSP_IMG_EXTRA.*(grep|test)/s)
  })
})
