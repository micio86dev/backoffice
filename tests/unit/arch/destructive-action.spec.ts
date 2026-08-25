/**
 * destructive-action.spec.ts (dates-and-destructive-actions, design D5)
 *
 * Architecture guard for the admin-backoffice spec's "Consequence-Driven
 * Confirmation On State-Changing Actions" requirement — mirroring
 * `form-contract.spec.ts`'s pattern of a mechanical, repo-wide scan rather
 * than a per-component unit assertion.
 *
 *   R1 — a `.vue` file that calls a destructive-looking method (regex below,
 *        plus a small named list of known composable methods the regex
 *        misses — e.g. `updateProject(` from `ProjectForm.vue`'s archive
 *        transition, which carries no destructive-sounding verb) MUST
 *        import `ConfirmDialog`. File-level, exactly like
 *        `form-contract.spec.ts`'s R3.
 *   R2 — `window.confirm`/`window.alert`/bare `confirm(`/`alert(` appear
 *        nowhere under `app/**` in EITHER app (backoffice AND frontend —
 *        the one guard in this change that is NOT backoffice-scoped).
 *
 * What R1 misses, stated plainly (design.md D5): a file that imports
 * ConfirmDialog for action A and then adds unguarded action B (file-level,
 * so it passes); a destructive verb outside the regex and the list (`swap`,
 * `purge`, `reset`); a destructive call relocated into a composable and
 * invoked under an innocuous name; anything not in a `.vue` file. It does
 * not prove the call is BEHIND the dialog — it makes the omission loud.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const BACKOFFICE_APP_ROOT = join(__dirname, '../../../app')
const FRONTEND_APP_ROOT = join(__dirname, '../../../../frontend/app')

interface AllowlistEntry {
  path: string
  reason: string
}

// Empty by design (design.md D5): a new violation must be fixed, not
// allowlisted away. A future entry needs a written reason, same shape as
// form-contract.spec.ts's allowlists.
const R1_ALLOWLIST: AllowlistEntry[] = []
const R2_ALLOWLIST: AllowlistEntry[] = []

function isAllowlisted(list: AllowlistEntry[], relativePath: string): boolean {
  return list.some((entry) => entry.path === relativePath)
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

function vueFiles(root: string, label: string): VueFile[] {
  return collectVueFiles(root).map((absolutePath) => ({
    absolutePath,
    relativePath: `${label}/${relative(root, absolutePath)}`,
    source: readFileSync(absolutePath, 'utf-8'),
  }))
}

function backofficeFiles(): VueFile[] {
  return vueFiles(BACKOFFICE_APP_ROOT, 'backoffice')
}

/**
 * True only where the frontend repo sits beside this one — the wrapper's
 * submodule layout, i.e. a developer machine.
 *
 * This repo's own CI checks out this repo alone, so the sibling is absent and
 * the cross-app half of this guard CANNOT run there. It did not merely fail to
 * run: it threw ENOENT and took the whole vitest job down, which is why
 * backoffice CI had been red since at least 2026-08-24.
 *
 * Skipping is not the right long-term answer — a guard that quietly does not
 * run is the failure mode this codebase keeps being bitten by. But a
 * single-repo CI genuinely cannot assert another repo's CURRENT state: the two
 * HEADs move independently, and only the wrapper pins them together. THE
 * CROSS-APP HALF BELONGS IN THE WRAPPER. Until it moves there, it is skipped
 * VISIBLY (a reported skip, never a silent pass) rather than crashing the job.
 */
const FRONTEND_AVAILABLE = existsSync(FRONTEND_APP_ROOT)

function bothAppsFiles(): VueFile[] {
  return [
    ...vueFiles(BACKOFFICE_APP_ROOT, 'backoffice'),
    ...vueFiles(FRONTEND_APP_ROOT, 'frontend'),
  ]
}

/**
 * Strips `/* *\/` block comments and `// ...` line comments, mirroring
 * form-contract.spec.ts's `stripComments` — so a comment that merely NAMES
 * a destructive method or `ConfirmDialog` cannot satisfy either rule.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

// ---------------------------------------------------------------------------
// R1 — destructive call without a ConfirmDialog import
// ---------------------------------------------------------------------------

const DESTRUCTIVE_CALL_REGEX =
  /\b(?:delete|remove|revoke|archive|destroy|import|activate|deactivate)[A-Z]\w*\(/

// Composable methods the regex above cannot see, because their NAME carries
// no destructive-sounding verb — e.g. `updateProject(id, { status: 'archived' })`
// from ProjectForm.vue's archive transition (design.md D5/D7).
//
// LOUD CEILING, stated plainly: this is a one-entry allowlist that only
// catches what someone REMEMBERED TO NAME here. It is not, and cannot be
// made, airtight by a file-level text guard — the moment a second
// innocuously-named composable becomes destructive-behind-the-scenes
// (a future `setStatus`, `patchProject`, a generically-named mutation on
// any other resource), this list is silently blind to it, exactly the way
// it was blind to `updateProject` before this entry was added. Extend this
// list — do not trust it as evidence of completeness. (Recorded verbatim in
// tasks.md alongside this task.)
const KNOWN_DESTRUCTIVE_METHODS = ['updateProject']

function callsDestructiveMethod(source: string): boolean {
  const stripped = stripComments(source)
  if (DESTRUCTIVE_CALL_REGEX.test(stripped)) return true

  return KNOWN_DESTRUCTIVE_METHODS.some((name) => new RegExp(`\\b${name}\\(`).test(stripped))
}

function importsConfirmDialog(source: string): boolean {
  return /import\s+ConfirmDialog\s+from\s+['"]@\/components\/molecules\/ConfirmDialog\.vue['"]/.test(
    source
  )
}

function r1Violations(files: VueFile[]): string[] {
  return files
    .filter((file) => !isAllowlisted(R1_ALLOWLIST, file.relativePath))
    .filter((file) => callsDestructiveMethod(file.source))
    .filter((file) => !importsConfirmDialog(file.source))
    .map((file) => file.relativePath)
}

// ---------------------------------------------------------------------------
// R2 — native browser confirm/alert, in EITHER app
// ---------------------------------------------------------------------------

// Matches `window.confirm(`/`window.alert(` and bare `confirm(`/`alert(` —
// the negative lookbehind excludes `onConfirm(`, `confirmDialog(`,
// `ConfirmDialog`, `.confirm(` as a property access on something else, etc.
const NATIVE_DIALOG_REGEX = /\bwindow\.(?:confirm|alert)\s*\(|(?<![\w.])(?:confirm|alert)\s*\(/

function usesNativeDialog(source: string): boolean {
  return NATIVE_DIALOG_REGEX.test(stripComments(source))
}

function r2Violations(files: VueFile[]): string[] {
  return files
    .filter((file) => !isAllowlisted(R2_ALLOWLIST, file.relativePath))
    .filter((file) => usesNativeDialog(file.source))
    .map((file) => file.relativePath)
}

describe('destructive action confirmation guard (admin-backoffice spec)', () => {
  it('R1 — every non-allowlisted destructive call site imports ConfirmDialog', () => {
    const violations = r1Violations(backofficeFiles())

    expect(
      violations,
      `These files call a destructive-looking method without importing ConfirmDialog: ${violations.join(', ')}`
    ).toEqual([])
  })

  it.skipIf(!FRONTEND_AVAILABLE)(
    'R2 — no native window.confirm/alert appears in either app',
    () => {
      const violations = r2Violations(bothAppsFiles())

      expect(
        violations,
        `These files use a native confirm/alert dialog: ${violations.join(', ')}`
      ).toEqual([])
    }
  )
})

describe('the guard actually detects a violation', () => {
  // Proves DETECTION, not just the verdict.
  it('flags the deliberately non-compliant fixture on R1 (no ConfirmDialog import)', () => {
    const fixturePath = join(__dirname, 'fixtures/UnconfirmedDestructive.vue')
    const source = readFileSync(fixturePath, 'utf-8')
    const file: VueFile = { absolutePath: fixturePath, relativePath: fixturePath, source }

    expect(r1Violations([file])).toEqual([fixturePath])
  })

  it('flags the deliberately non-compliant fixture on R2 (window.confirm)', () => {
    const fixturePath = join(__dirname, 'fixtures/UnconfirmedDestructive.vue')
    const source = readFileSync(fixturePath, 'utf-8')
    const file: VueFile = { absolutePath: fixturePath, relativePath: fixturePath, source }

    expect(r2Violations([file])).toEqual([fixturePath])
  })

  it('does not flag a file that calls a destructive method AND imports ConfirmDialog', () => {
    const source = `
      import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
      async function onRevokeConfirmed() { await revokeClient(id) }
    `
    const file: VueFile = { absolutePath: 'inline', relativePath: 'inline', source }

    expect(r1Violations([file])).toEqual([])
  })

  it('does not flag confirmDialog()/onConfirm()/ConfirmDialog usage as a native dialog', () => {
    const source = `
      import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
      function onConfirm() { emit('confirm') }
    `
    const file: VueFile = { absolutePath: 'inline', relativePath: 'inline', source }

    expect(r2Violations([file])).toEqual([])
  })
})
