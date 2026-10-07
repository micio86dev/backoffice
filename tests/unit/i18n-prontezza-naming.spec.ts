/**
 * i18n-prontezza-naming.spec.ts
 *
 * The assessment type whose MACHINE value is `standard` is displayed as
 * "Prontezza" (it) / "Readiness" (en). Only the visible copy is renamed: the
 * machine value, the i18n KEYS and the API payloads keep `standard`.
 *
 * This guard fails if a visible string brings the old name back. The one
 * allowed use of the plain word is the unrelated generic adjective in the
 * exit-redirect help ("the standard closing page").
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const IT = JSON.parse(readFileSync(resolve(__dirname, '../../i18n/locales/it.json'), 'utf-8'))
const EN = JSON.parse(readFileSync(resolve(__dirname, '../../i18n/locales/en.json'), 'utf-8'))

/** Leaf paths where "standard" is the ordinary adjective, not the type name. */
const GENERIC_WORDING = new Set(['projects.form.help.exitRedirectUrl'])

function leaves(node: unknown, path = ''): Array<[string, string]> {
  if (typeof node === 'string') return [[path, node]]
  if (node === null || typeof node !== 'object') return []
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
    leaves(v, path ? `${path}.${k}` : k)
  )
}

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj)
}

describe('assessment type display name (Prontezza / Readiness)', () => {
  it.each([
    ['it', IT, 'Prontezza', 'Potenziale'],
    ['en', EN, 'Readiness', 'Potential'],
  ])('%s names the types in the project form and the catalogue', (_l, locale, ready, potential) => {
    expect(get(locale, 'projects.assessmentType.standard')).toBe(ready)
    expect(get(locale, 'projects.assessmentType.potential')).toBe(potential)
    expect(get(locale, 'catalogue.competencies.typeOption.standard')).toBe(ready)
    expect(get(locale, 'catalogue.competencies.typeOption.potential')).toBe(potential)
  })

  it.each([
    ['it', IT],
    ['en', EN],
  ])('%s has no visible "standard" left outside the generic wording', (_l, locale) => {
    const offenders = leaves(locale)
      .filter(([path, text]) => /\bstandard\b/i.test(text) && !GENERIC_WORDING.has(path))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
