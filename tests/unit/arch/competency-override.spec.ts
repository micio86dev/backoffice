/**
 * competency-override.spec.ts (bars-coverage-visibility, admin-backoffice
 * spec — "No override control exists")
 *
 * "No override, bypass, or 'force select' control MAY exist for an
 * uncovered competency, in the picker or anywhere else in the backoffice."
 * Previously true by INSPECTION only, with no automated check — this
 * mirrors `destructive-action.spec.ts`'s pattern: a mechanical, repo-wide
 * scan rather than a per-component unit assertion, with the SAME stated
 * ceiling that pattern already carries: a text-based regex over identifiers
 * cannot prove a bypass does not exist anywhere in any FORM, only that no
 * identifier matching a known override-ish shape appears. Extend the regex
 * or the allowlist reasoning if a real one slips past it — do not trust
 * green as proof of exhaustiveness.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const BACKOFFICE_APP_ROOT = join(__dirname, '../../../app')

interface SourceFile {
  absolutePath: string
  relativePath: string
  source: string
}

/** Recursively collects every `.vue`/`.ts` file under `dir`. */
function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []

  for (const entry of entries) {
    const full = join(dir, entry)
    const stats = statSync(full)

    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(full))
    } else if (entry.endsWith('.vue') || entry.endsWith('.ts')) {
      files.push(full)
    }
  }

  return files
}

function backofficeFiles(): SourceFile[] {
  return collectSourceFiles(BACKOFFICE_APP_ROOT).map((absolutePath) => ({
    absolutePath,
    relativePath: `backoffice/${relative(BACKOFFICE_APP_ROOT, absolutePath)}`,
    source: readFileSync(absolutePath, 'utf-8'),
  }))
}

/** Strips block and line comments so a comment merely NAMING the shape cannot self-report as clean. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

// force-anything-competency/select/coverage/bars, override-anything-same,
// bypass-anything-same, skip-anything-same. Case-insensitive: `ForceSelect`,
// `forceSelectCompetency`, `overrideBarsCheck`, `bypassCoverage`,
// `skipCompetencyGuard` all match; `forceRefresh`, `overridePassword` do not
// (no coverage/selection-shaped word in range).
const OVERRIDE_CONTROL_REGEX =
  /\b(?:force|override|bypass|skip)[A-Z]*(?:Select|Coverage|Bars|Competenc\w*)\b/i

function overrideControlViolations(files: SourceFile[]): string[] {
  return files
    .filter((file) => OVERRIDE_CONTROL_REGEX.test(stripComments(file.source)))
    .map((file) => file.relativePath)
}

describe('no competency-coverage override control exists (admin-backoffice spec)', () => {
  it('no backoffice source file names a force/override/bypass/skip control over coverage or selection', () => {
    const violations = overrideControlViolations(backofficeFiles())

    expect(
      violations,
      `These files name what looks like a bypass control for BARS coverage or competency selection: ${violations.join(', ')}`
    ).toEqual([])
  })
})

describe('the guard actually detects a violation', () => {
  // Proves DETECTION, not just the verdict — same discipline as
  // destructive-action.spec.ts's fixture test.
  it('flags the deliberately non-compliant fixture (forceSelectCompetency)', () => {
    const fixturePath = join(__dirname, 'fixtures/CompetencyOverrideControl.vue')
    const source = readFileSync(fixturePath, 'utf-8')
    const file: SourceFile = { absolutePath: fixturePath, relativePath: fixturePath, source }

    expect(overrideControlViolations([file])).toEqual([fixturePath])
  })

  it('does not flag an unrelated force/override identifier with no coverage/selection meaning', () => {
    const source = `
      function forceRefresh() { /* unrelated to BARS coverage */ }
      function overridePassword(value: string) { return value }
    `
    const file: SourceFile = { absolutePath: 'inline', relativePath: 'inline', source }

    expect(overrideControlViolations([file])).toEqual([])
  })

  it('does not flag a comment that merely NAMES the forbidden shape', () => {
    const source = `
      // No forceSelectCompetency() control exists in this file, by design.
      function toggle(): void {}
    `
    const file: SourceFile = { absolutePath: 'inline', relativePath: 'inline', source }

    expect(overrideControlViolations([file])).toEqual([])
  })
})
