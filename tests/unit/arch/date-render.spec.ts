/**
 * date-render.spec.ts (dates-and-destructive-actions, design D1)
 *
 * Architecture guard for the admin-backoffice spec's "i18n and Locale-Aware
 * Formatting" requirement — mirroring `form-contract.spec.ts`'s pattern of a
 * mechanical, repo-wide scan rather than a per-component unit assertion, so
 * a NEW template is compliant by default rather than by discipline.
 *
 * Scans every `app/**\/*.vue` file and asserts:
 *
 *   R1 — every `{{ … }}` interpolation whose expression matches `/\b\w+_at\b/`
 *        is a violation unless the SAME interpolation also contains
 *        `formatDate(`. Attribute bindings pass — `<FormattedDate :value="c.created_at" />`
 *        is the intended shape. Scope excludes `app/components/ui/**`
 *        (vendored shadcn-vue, already excluded from coverage in
 *        `vitest.config.ts:37`) and `FormattedDate.vue` itself (the one file
 *        that legitimately touches `formatDate` directly).
 *
 * What R1 does NOT catch, stated plainly (design.md D1): a date laundered
 * through a computed/local; a date field not named `*_at`; a date rendered
 * through an attribute that produces visible text (`:title`, `:aria-label`,
 * `:placeholder`); anything in `frontend/`; a raw date built in a `.ts`
 * composable and returned pre-stringified. Naming these is the point — a
 * guard sold as total is worse than a guard with a known edge.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const APP_ROOT = join(__dirname, '../../../app')

interface AllowlistEntry {
  path: string
  reason: string
}

// Empty by design (design.md D1/D5): a new violation must be fixed, not
// allowlisted away. A future entry needs a written reason, same shape as
// form-contract.spec.ts's R1_R2_ALLOWLIST.
const ALLOWLIST: AllowlistEntry[] = []

function isAllowlisted(relativePath: string): boolean {
  return ALLOWLIST.some((entry) => entry.path === relativePath)
}

/** Recursively collects every `.vue` file under `dir`. */
function collectVueFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []

  for (const entry of entries) {
    const full = join(dir, entry)
    const stats = statSync(full)

    if (stats.isDirectory()) {
      files.push(...collectVueFiles(full))
    } else if (entry.endsWith('.vue')) {
      files.push(full)
    }
  }

  return files
}

interface VueFile {
  absolutePath: string
  relativePath: string
  source: string
}

function vueFiles(): VueFile[] {
  return collectVueFiles(APP_ROOT)
    .map((absolutePath) => ({
      absolutePath,
      relativePath: relative(APP_ROOT, absolutePath),
      source: readFileSync(absolutePath, 'utf-8'),
    }))
    .filter((file) => !file.relativePath.startsWith('components/ui/'))
    .filter((file) => file.relativePath !== 'components/atoms/FormattedDate.vue')
}

/** Extracts every `{{ ... }}` mustache interpolation body from a template source. */
function mustacheInterpolations(source: string): string[] {
  const matches = source.matchAll(/\{\{([\s\S]*?)\}\}/g)

  return [...matches].map((match) => match[1] ?? '')
}

const RAW_DATE_EXPR = /\b\w+_at\b/

function hasRawDateInterpolation(source: string): boolean {
  return mustacheInterpolations(source).some(
    (expr) => RAW_DATE_EXPR.test(expr) && !expr.includes('formatDate(')
  )
}

function r1Violations(files: VueFile[]): string[] {
  return files
    .filter((file) => !isAllowlisted(file.relativePath))
    .filter((file) => hasRawDateInterpolation(file.source))
    .map((file) => file.relativePath)
}

describe('raw date interpolation guard (admin-backoffice spec)', () => {
  it('R1 — no non-allowlisted template interpolates a raw `*_at` field directly', () => {
    const violations = r1Violations(vueFiles())

    expect(
      violations,
      `These templates interpolate a raw *_at field without formatDate(): ${violations.join(', ')}`
    ).toEqual([])
  })
})

describe('the guard actually detects a violation', () => {
  // Proves DETECTION, not just the verdict — without this, the test above
  // would pass whether or not the scanner works, and would have passed
  // vacuously before any template in the repo complied.
  it('flags the deliberately non-compliant fixture', () => {
    const fixturePath = join(__dirname, 'fixtures/RawDateTemplate.vue')
    const source = readFileSync(fixturePath, 'utf-8')
    const file: VueFile = { absolutePath: fixturePath, relativePath: fixturePath, source }

    expect(r1Violations([file])).toEqual([fixturePath])
  })

  it('does not flag an interpolation that already routes through formatDate(', () => {
    const source = '<template><span>{{ formatDate(record.created_at, locale) }}</span></template>'
    const file: VueFile = { absolutePath: 'inline', relativePath: 'inline', source }

    expect(r1Violations([file])).toEqual([])
  })

  it('does not flag an attribute binding (the intended FormattedDate shape)', () => {
    const source = '<template><FormattedDate :value="c.created_at" /></template>'
    const file: VueFile = { absolutePath: 'inline', relativePath: 'inline', source }

    expect(r1Violations([file])).toEqual([])
  })
})
