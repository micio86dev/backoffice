/**
 * Architecture guard for DESIGN.md §16.13: every checkbox goes through
 * `CheckboxField`. A raw `<input type="checkbox">` is only allowed inside the
 * molecule/ui layer. Mirrors `native-select-styling.spec.ts`'s repo-wide scan.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const APP_ROOT = join(__dirname, '../../../app')

function collectVueFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) files.push(...collectVueFiles(full))
    else if (entry.endsWith('.vue')) files.push(full)
  }
  return files
}

function stripComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

const ALLOWED = ['components/ui/', 'components/molecules/CheckboxField.vue']
const RAW_CHECKBOX = /<input\s[^>]*type\s*=\s*["']checkbox["']/
const BARE_CHECKBOX = /<Checkbox\b/

describe('checkbox standard', () => {
  const files = collectVueFiles(APP_ROOT).map((f) => ({
    rel: relative(APP_ROOT, f).replaceAll('\\', '/'),
    source: stripComments(readFileSync(f, 'utf8')),
  }))

  it('scans a non-trivial number of files', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('has no raw <input type="checkbox"> outside the ui/molecule layer', () => {
    const offenders = files
      .filter((f) => !ALLOWED.some((a) => f.rel.startsWith(a) || f.rel === a))
      .filter((f) => RAW_CHECKBOX.test(f.source))
      .map((f) => f.rel)

    expect(offenders).toEqual([])
  })

  it('has no bare <Checkbox> outside the ui/molecule layer', () => {
    const offenders = files
      .filter((f) => !ALLOWED.some((a) => f.rel.startsWith(a) || f.rel === a))
      .filter((f) => BARE_CHECKBOX.test(f.source))
      .map((f) => f.rel)

    expect(offenders).toEqual([])
  })
})
