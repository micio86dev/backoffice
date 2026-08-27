/**
 * form-contract.spec.ts (form-clarity-and-console-warnings, D1)
 *
 * Architecture guard for the admin-backoffice spec's "Form Field Validation
 * And Banner Contract" — mirroring `api/tests/Arch/**`'s pattern of a
 * mechanical, repo-wide scan rather than a per-form unit assertion, so a NEW
 * form is compliant by default rather than by discipline.
 *
 * Scans every `app/**\/*.vue` file whose source contains `<form` and asserts
 * three rules:
 *
 *   R1 — the `<form` tag carries `novalidate`, so native HTML5 constraint
 *        validation can never be the only thing preventing an invalid submit.
 *   R2 — the file imports `FieldError` from `@/components/ui/field`, so
 *        messages render through the shared primitive, never a bare `<ul>`.
 *   R3 — the file contains no "field-blind" catch: a form file that catches
 *        a submit rejection but never CALLS `applyServerFieldErrors(...)`
 *        anywhere in its live code is exactly the `catch {}`-drops-a-422
 *        defect this change exists to remove.
 *
 * R3's scope, stated plainly: it is a FILE-level check (does this file, which
 * has at least one `catch`, call `applyServerFieldErrors(` anywhere in code
 * that isn't a comment?), not a per-catch-block one — a form file
 * legitimately has catches unrelated to field validation (e.g. a
 * clipboard-copy failure, an unrelated list-load failure) and those must not
 * be forced through the mapper. `login.vue` is the one deliberate exception:
 * an auth failure is a 401 with no field payload to map, so there is nothing
 * for `applyServerFieldErrors` to do there — it is allowlisted for R3 with
 * that reason, not left to rot as an unexplained gap.
 *
 * The check requires an actual CALL, not a bare substring match, and strips
 * comments before looking — independent verification found that a comment
 * merely NAMING `applyServerFieldErrors` (e.g. "// TODO: call
 * applyServerFieldErrors here") satisfied the original whole-file substring
 * check without the file ever calling it. `fixtures/CommentOnlyMentionForm.vue`
 * is the detection fixture for that specific loophole.
 *
 * `AvatarTemplateForm.vue` sat on the R1/R2 allowlist through slice 1 of this
 * change — it predated the contract and was the one form the proposal exists
 * to convert. Slice 2 deleted that entry (the list below is now empty); the
 * guard going green with a SHORTER allowlist was the acceptance signal for
 * that slice, not a separate assertion.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const APP_ROOT = join(__dirname, '../../../app')

interface AllowlistEntry {
  path: string
  reason: string
}

// AvatarTemplateForm.vue was here through slice 1 of
// form-clarity-and-console-warnings (native required/maxlength bubbles, raw
// <label> markup). Slice 2 converted it onto the Field primitives + JS
// validation — this list going empty is the acceptance signal for that
// slice, not a separate assertion.
const R1_R2_ALLOWLIST: AllowlistEntry[] = []

const R3_ALLOWLIST: AllowlistEntry[] = [
  {
    path: 'pages/login.vue',
    reason:
      'Auth failure is a 401 with no {data:{errors}} field payload — there is nothing for ' +
      'applyServerFieldErrors to map, and the adjacent role="alert" banner is the complete, ' +
      'correct contract for this form.',
  },
]

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

/** Extracts the full text of the first `<form ...>` opening tag, if any. */
function firstFormOpeningTag(source: string): string | null {
  const start = source.indexOf('<form')
  if (start === -1) return null
  const end = source.indexOf('>', start)
  if (end === -1) return null
  return source.slice(start, end + 1)
}

interface FormFile {
  absolutePath: string
  relativePath: string
  source: string
}

/**
 * Strips only DELIMITED comment blocks — `<!-- ... -->` and `/* ... *\/`.
 *
 * Deliberately narrower than `stripComments` below, which also removes `//`
 * to end-of-line: in a Vue TEMPLATE a `//` appears inside ordinary attribute
 * values (any `https://` URL), and stripping the rest of that line could take
 * a real `<form` tag with it. Block delimiters carry no such ambiguity.
 */
function stripCommentBlocks(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * True when the file contains a real `<form` TAG, not merely a comment that
 * talks about one.
 *
 * feature/form-drawer made this distinction load-bearing: `FormDrawer.vue` and
 * `FormDrawerActions.vue` are the shared drawer layer — they render no `<form>`
 * of their own, they render the SUBMIT CONTROL for a form that lives elsewhere
 * — but their docblocks necessarily explain the `<form>`/`form=""` association
 * they exist to manage. A raw substring scan classified both as form files and
 * demanded `novalidate` and a `FieldError` import from components that have
 * neither a field nor a validation concern.
 *
 * The fix is the same one R3 already needed for the same reason (a comment
 * merely NAMING `applyServerFieldErrors` used to satisfy it): look at live
 * code, not at prose. Allowlisting the two files would have been strictly
 * worse — it would leave the scanner wrong and paper over it per-file.
 */
function containsFormTag(source: string): boolean {
  return stripCommentBlocks(source).includes('<form')
}

function formFiles(): FormFile[] {
  return collectVueFiles(APP_ROOT)
    .map((absolutePath) => ({
      absolutePath,
      relativePath: relative(APP_ROOT, absolutePath),
      source: readFileSync(absolutePath, 'utf-8'),
    }))
    .filter((file) => containsFormTag(file.source))
}

function r1Violations(files: FormFile[]): string[] {
  return files
    .filter((file) => !isAllowlisted(R1_R2_ALLOWLIST, file.relativePath))
    .filter((file) => {
      const tag = firstFormOpeningTag(file.source)
      return tag === null || !tag.includes('novalidate')
    })
    .map((file) => file.relativePath)
}

function r2Violations(files: FormFile[]): string[] {
  const fieldErrorImport =
    /import\s*\{[^}]*\bFieldError\b[^}]*\}\s*from\s*['"]@\/components\/ui\/field['"]/

  return files
    .filter((file) => !isAllowlisted(R1_R2_ALLOWLIST, file.relativePath))
    .filter((file) => !fieldErrorImport.test(file.source))
    .map((file) => file.relativePath)
}

/**
 * Strips `/* *\/` block comments and `// ...` line comments from a `<script
 * setup>` source, so R3's call-detection below cannot be satisfied by a
 * comment that merely NAMES `applyServerFieldErrors` (a whole-file substring
 * check for the bare identifier was — before this fix — exactly that
 * loophole; see `fixtures/CommentOnlyMentionForm.vue`'s detection test).
 *
 * Deliberately simple, matching this suite's existing precedent
 * (`theme.spec.ts`'s `stripCascadeLayers`): this repo's `<script setup>`
 * blocks do not put `//` inside string literals sharing a line with the
 * mapper call, so a full lexer is not needed to make this check honest.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

/** True only when the CALL — `applyServerFieldErrors(` — appears in live code. */
function callsApplyServerFieldErrors(source: string): boolean {
  return /\bapplyServerFieldErrors\s*\(/.test(stripComments(source))
}

function r3Violations(files: FormFile[]): string[] {
  return files
    .filter((file) => !isAllowlisted(R3_ALLOWLIST, file.relativePath))
    .filter((file) => file.source.includes('catch'))
    .filter((file) => !callsApplyServerFieldErrors(file.source))
    .map((file) => file.relativePath)
}

describe('form field validation and banner contract (admin-backoffice spec)', () => {
  it('R1 — every non-allowlisted form sets novalidate', () => {
    const violations = r1Violations(formFiles())

    expect(violations, `Missing novalidate on: ${violations.join(', ')}`).toEqual([])
  })

  it('R2 — every non-allowlisted form imports FieldError from @/components/ui/field', () => {
    const violations = r2Violations(formFiles())

    expect(violations, `Missing FieldError import on: ${violations.join(', ')}`).toEqual([])
  })

  it('R3 — no form file catches a rejection without ever calling applyServerFieldErrors', () => {
    const violations = r3Violations(formFiles())

    expect(
      violations,
      `These files catch without ever calling applyServerFieldErrors: ${violations.join(', ')}`
    ).toEqual([])
  })
})

describe('the guard actually detects a violation', () => {
  // Proves DETECTION, not just the verdict — without this, all three tests
  // above would pass whether or not the scanner works, and would have passed
  // vacuously before any form in the repo complied.
  it('flags the deliberately non-compliant fixture on all three rules', () => {
    const fixturePath = join(__dirname, 'fixtures/NonCompliantForm.vue')
    const source = readFileSync(fixturePath, 'utf-8')
    const file: FormFile = { absolutePath: fixturePath, relativePath: fixturePath, source }

    expect(r1Violations([file])).toEqual([fixturePath])
    expect(r2Violations([file])).toEqual([fixturePath])
    expect(r3Violations([file])).toEqual([fixturePath])
  })

  // Independent-verification finding: a whole-file substring check for the
  // literal name `applyServerFieldErrors` is satisfied by a COMMENT that
  // merely mentions it — R3 must require an actual CALL, not a citation.
  it('flags a catch whose ONLY mention of applyServerFieldErrors is a comment, never a call', () => {
    const fixturePath = join(__dirname, 'fixtures/CommentOnlyMentionForm.vue')
    const source = readFileSync(fixturePath, 'utf-8')
    const file: FormFile = { absolutePath: fixturePath, relativePath: fixturePath, source }

    // Sanity check on the fixture itself: it DOES contain the bare
    // substring "applyServerFieldErrors" (in the comment) — so a check that
    // only looks for that substring would wrongly call this file compliant.
    expect(source).toContain('applyServerFieldErrors')

    expect(r3Violations([file])).toEqual([fixturePath])
  })

  // The same class of loophole as the R3 one above, in the opposite
  // direction: a file whose ONLY `<form` is inside a comment is not a form
  // file, and demanding `novalidate`/`FieldError` of it is a false positive,
  // not a finding. `FormDrawerActions.vue` — a footer that renders the submit
  // control for a form living in another component — is the real case this
  // exists for.
  it('does not classify a file as a form when its only <form is inside a comment', () => {
    const commentOnly = [
      '<template>',
      '  <!-- Submits the <form> named by formId, from outside it. -->',
      '  <button type="submit" :form="formId">Save</button>',
      '</template>',
      '<script setup lang="ts">',
      '/** The `id` of the `<form>` this footer submits. */',
      'defineProps<{ formId: string }>()',
      '</script>',
    ].join('\n')

    // Sanity check on the sample itself: it DOES contain the bare substring,
    // so a scan that only looks for that would wrongly classify it.
    expect(commentOnly).toContain('<form')
    expect(containsFormTag(commentOnly)).toBe(false)
  })

  it('still classifies a real form tag as a form, even alongside a comment mentioning one', () => {
    const realForm = [
      '<template>',
      '  <!-- This <form> is the real one. -->',
      '  <form novalidate><input /></form>',
      '</template>',
    ].join('\n')

    expect(containsFormTag(realForm)).toBe(true)
  })
})
