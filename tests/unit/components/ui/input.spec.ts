/**
 * input.spec.ts (D12, task 2.2 — RED, backoffice-missing-pages)
 *
 * The user asked for noticeably larger controls, encoded as `--spacing-control`
 * (44px, WCAG 2.2 SC 2.5.5 AAA) and `--spacing-control-sm` (36px, dense
 * contexts). This mounts the REAL `Input` component (not a literal class
 * string) and runs its actual rendered class list through the real Tailwind v4
 * compiler + a happy-dom stylesheet, so it discriminates a regression in the
 * component's own class wiring, not just the tokens' existence in the
 * stylesheet. Same technique as `tests/unit/theme.spec.ts`.
 */
import { describe, it, expect } from 'vitest'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Window } from 'happy-dom'
import { mount } from '@vue/test-utils'
import Input from '@/components/ui/input/Input.vue'

const MAIN_CSS_PATH = resolve(__dirname, '../../../../app/assets/css/main.css')
const MAIN_CSS_DIR = resolve(__dirname, '../../../../app/assets/css')

/** See `tests/unit/theme.spec.ts` for the `@layer`-stripping rationale. */
function stripCascadeLayers(css: string): string {
  let out = ''
  let i = 0
  while (i < css.length) {
    const layerStart = css.indexOf('@layer', i)
    if (layerStart === -1) {
      out += css.slice(i)
      break
    }
    out += css.slice(i, layerStart)
    const braceIdx = css.indexOf('{', layerStart)
    const semiIdx = css.indexOf(';', layerStart)
    if (semiIdx !== -1 && (braceIdx === -1 || semiIdx < braceIdx)) {
      // Bare `@layer theme, base, components, utilities;` — drop entirely.
      i = semiIdx + 1
      continue
    }
    let depth = 1
    let j = braceIdx + 1
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    out += css.slice(braceIdx + 1, j - 1)
    i = j
  }
  return out
}

async function compileForCandidates(candidates: string[]): Promise<string> {
  const css = readFileSync(MAIN_CSS_PATH, 'utf-8')
  const compiler = await compile(css, {
    base: MAIN_CSS_DIR,
    onDependency: () => {},
  })
  return stripCascadeLayers(compiler.build(candidates))
}

/**
 * `data-[size=default]:h-(--spacing-control)` / `data-[size=sm]:...` are
 * attribute-selector variants, so the synthetic element under test must carry
 * the SAME `data-size` attribute the real component renders — not just the
 * same class list — or the variant selector never matches.
 */
function computedHeight(compiledCss: string, className: string, dataSize: string): string {
  const window = new Window()
  const document = window.document
  const style = document.createElement('style')
  style.textContent = compiledCss
  document.head.appendChild(style)
  const el = document.createElement('div')
  el.className = className
  el.setAttribute('data-size', dataSize)
  document.body.appendChild(el)
  return window.getComputedStyle(el).height
}

describe('Input control sizing (D12)', () => {
  it('resolves the default rendered height to --spacing-control (44px)', async () => {
    const wrapper = mount(Input)
    const classAttr = wrapper.attributes('class') ?? ''
    const dataSize = wrapper.attributes('data-size') ?? ''
    expect(classAttr).not.toBe('')
    expect(dataSize).toBe('default')
    const compiled = await compileForCandidates(classAttr.split(/\s+/).filter(Boolean))
    expect(computedHeight(compiled, classAttr, dataSize)).toBe('44px')
  })

  it('resolves the size="sm" rendered height to --spacing-control-sm (36px)', async () => {
    const wrapper = mount(Input, { props: { size: 'sm' } })
    const classAttr = wrapper.attributes('class') ?? ''
    const dataSize = wrapper.attributes('data-size') ?? ''
    expect(classAttr).not.toBe('')
    expect(dataSize).toBe('sm')
    const compiled = await compileForCandidates(classAttr.split(/\s+/).filter(Boolean))
    expect(computedHeight(compiled, classAttr, dataSize)).toBe('36px')
  })
})
