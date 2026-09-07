/**
 * native-select-styling.spec.ts
 *
 * Architecture guard for DESIGN.md §16.8: *"Every native `<select>` and every
 * raw `<input>` that cannot go through the vendored components uses the single
 * `formControlClass` in `app/components/ui/form-control`"*.
 *
 * That rule was written after four hand-rolled variants had drifted across
 * three files, and it was then re-broken the same way — `ClientSwitcher.vue`
 * and both selects in `DashboardFilters.vue` carried their own
 * `border-border bg-card … px-2 py-1 text-sm`, at a different height, with a
 * different border token and no focus ring. A doc rule with no mechanism is a
 * rule that holds until the next person does not read the doc, which is why
 * this is a test rather than another paragraph.
 *
 * Native selects assert `formSelectClass`, not `formControlClass`: a native
 * select draws a platform arrow inside its own box, and the shared control
 * padding (`px-2.5`) does not reserve room for it. With a `truncate`d value —
 * the topbar client switcher — the text ran UNDER the arrow. The gutter
 * belongs to selects only; a text input padded for an arrow it does not have
 * would just look wrong.
 *
 * Mirrors `form-contract.spec.ts`'s mechanical repo-wide scan, so a NEW select
 * is compliant by default rather than by discipline.
 */
import { describe, it, expect } from 'vitest'
import { formControlClass, formSelectClass } from '../../../app/components/ui/form-control'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const APP_ROOT = join(__dirname, '../../../app')

/** Recursively collects every `.vue` file under `dir`. */
function collectVueFiles(dir: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)

    if (statSync(full).isDirectory()) {
      files.push(...collectVueFiles(full))
    } else if (entry.endsWith('.vue')) {
      files.push(full)
    }
  }

  return files
}

/**
 * Strips `<!-- ... -->` and block comments before scanning.
 *
 * Same reasoning as `form-contract.spec.ts`: a comment that merely NAMES the
 * thing being asserted must not satisfy the check, and `//` is left alone
 * because it appears inside ordinary attribute values (any `https://` URL).
 */
function stripCommentBlocks(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * The SFC's top-level `<template>` block, or `''` when there is none.
 *
 * Scoped to the template rather than the whole file because `<script>` prose
 * legitimately writes the element name — `ReportFilters.vue` has a `//`
 * comment reading "never a raw `<select>`/`<button>` per-filter cascade",
 * which a whole-file scan reported as an unstyled select. `//` cannot simply
 * be stripped the way block comments are (it appears inside every `https://`
 * attribute value), so the honest fix is to look only where markup lives.
 *
 * First `<template` to LAST `</template>`: nested `<template #slot>` tags are
 * common inside the block and closing at the first one would truncate the
 * scan.
 */
function templateBlock(source: string): string {
  const start = source.indexOf('<template')
  const end = source.lastIndexOf('</template>')

  return start === -1 || end <= start ? '' : source.slice(start, end)
}

/** Every `<select ...>` opening tag in the template, comments already removed. */
function selectOpeningTags(source: string): string[] {
  return [...templateBlock(source).matchAll(/<select\b[^>]*>/g)].map((match) => match[0])
}

interface Offender {
  file: string
  tag: string
}

const vueFiles = collectVueFiles(APP_ROOT)

describe('native <select> styling (DESIGN.md §16.8)', () => {
  it('scans a non-trivial number of components', () => {
    // A regex that silently matched nothing would make every assertion below
    // pass for the wrong reason.
    expect(vueFiles.length).toBeGreaterThan(20)
  })

  it('routes every native select through the shared formSelectClass', () => {
    const offenders: Offender[] = []

    for (const absolutePath of vueFiles) {
      const source = stripCommentBlocks(readFileSync(absolutePath, 'utf8'))

      for (const tag of selectOpeningTags(source)) {
        if (!tag.includes('formSelectClass')) {
          offenders.push({ file: relative(APP_ROOT, absolutePath), tag })
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('leaves no hand-rolled control styling on a native select', () => {
    // The specific tokens the drifted copies used. Named explicitly rather
    // than checked as "any class attribute", because a select legitimately
    // carries LAYOUT classes through `cn()` — `max-w-56`, `min-w-40`. What it
    // must never carry again is its own border, background, height or type
    // scale, which is what makes one select look unlike the next.
    const forbidden = ['border-border', 'bg-card', 'rounded-md', 'text-sm', 'py-1', 'px-2 ', 'h-8']

    const offenders: Offender[] = []

    for (const absolutePath of vueFiles) {
      const source = stripCommentBlocks(readFileSync(absolutePath, 'utf8'))

      for (const tag of selectOpeningTags(source)) {
        if (forbidden.some((token) => tag.includes(token))) {
          offenders.push({ file: relative(APP_ROOT, absolutePath), tag })
        }
      }
    }

    expect(offenders).toEqual([])
  })
  /**
   * The class is WRITTEN at every call site — but does it still say the right
   * thing?
   *
   * The two scans above grep source text, so they prove `formSelectClass`
   * appears, never that its value is still correct. The regression this whole
   * rule exists to prevent (a select at `h-8` clipping its own text) would slip
   * straight through if the constant itself drifted.
   *
   * `pl-2.5 pr-9` and NOT `px-2.5 pr-9`: verified against the installed
   * tailwind-merge, `twMerge('px-2.5','pr-9')` returns `"px-2.5 pr-9"` — both
   * survive, and the gutter then applies only because Tailwind emits `pr` after
   * `px` in the stylesheet. Depending on CSS source order for a value this
   * cheap to make unambiguous is how it silently stops working.
   */
  it('keeps the select gutter unambiguous rather than dependent on stylesheet order', () => {
    expect(formSelectClass).toContain('pr-9')
    expect(formSelectClass).toContain('pl-2.5')
    // The conflicting shorthand must never come back.
    expect(formSelectClass).not.toContain('px-')
    // A text input keeps the narrower symmetric padding: it draws no arrow.
    expect(formControlClass).toContain('px-2.5')
    expect(formControlClass).not.toContain('pr-9')
  })

  it('keeps both controls on the 44px height DESIGN.md 16.8 requires', () => {
    // The literal defect the shared class was created to end: a native select
    // at h-8 clips its own option text, and unlike a styled div it will not
    // let the overflow show.
    for (const value of [formControlClass, formSelectClass]) {
      expect(value).toContain('h-(--spacing-control)')
      expect(value).not.toContain('h-8')
      expect(value).not.toContain('--spacing-control-sm')
    }
  })
})
