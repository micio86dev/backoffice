/**
 * Platform templates copy — checked against the `en` and the `it` table
 * SEPARATELY (B1 advisory R3-003): a helper that requires a key in both at
 * once reports "missing" without saying which language is short, and one that
 * consults a single table lets the other ship a gap.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en.json'
import it_ from '../../i18n/locales/it.json'
import { translateServerCode } from '../../app/utils/server-message'

const TABLES = { en, it: it_ } as const

function lookup(bundle: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, segment) => {
    if (typeof node !== 'object' || node === null) return undefined

    return (node as Record<string, unknown>)[segment]
  }, bundle)
}

function leafKeys(node: unknown, prefix: string): string[] {
  if (typeof node !== 'object' || node === null) return [prefix]

  return Object.entries(node).flatMap(([key, value]) => leafKeys(value, `${prefix}.${key}`))
}

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')

/**
 * Every `platformTemplates.*` key the page and dialog ASK for, read from their
 * source so a key added there without copy fails here. The dialog composes
 * `platformTemplates.impact.${action}.…`, expanded over its three actions.
 */
function usedKeys(): string[] {
  const sources = [
    'app/pages/platform-templates/index.vue',
    'app/components/molecules/GlobalTemplateImpactDialog.vue',
  ].map(read)
  const literal = sources.flatMap((source) =>
    [...source.matchAll(/['"`(](platformTemplates\.[\w.]+)['"`,)]/g)].map((match) => match[1]!)
  )
  const composed = ['edit', 'retire', 'delete'].flatMap((action) => [
    `platformTemplates.impact.${action}.title`,
    `platformTemplates.impact.${action}.effect`,
    `platformTemplates.impact.${action}.confirm`,
  ])

  // `platformTemplates.serverError` is a NAMESPACE handed to translateServerCode;
  // its codes are covered by their own test below.
  return [
    ...new Set([
      ...literal,
      ...composed,
      'nav.platformTemplates',
      'avatar_templates.copy.platformIndependent',
    ]),
  ].filter((key) => key !== 'platformTemplates.serverError')
}

describe.each(Object.entries(TABLES))('platform templates copy in %s', (_locale, table) => {
  it('has copy for every key the page and the dialog use', () => {
    const keys = usedKeys()

    // Vacuous-scan guard: the regex must actually have found the page's keys.
    expect(keys.length).toBeGreaterThan(20)
    expect(keys.filter((key) => typeof lookup(table, key) !== 'string')).toEqual([])
  })

  it('translates both delete refusals through translateServerCode, not the raw code', () => {
    const translator = {
      t: (key: string) => String(lookup(table, key)),
      te: (key: string) => typeof lookup(table, key) === 'string',
    }

    for (const code of ['template_active', 'template_in_use']) {
      const text = translateServerCode(translator, 'platformTemplates.serverError', code)

      expect(text).not.toBe(code)
      expect(text.length).toBeGreaterThan(20)
    }
  })
})

describe('platform templates copy parity', () => {
  it('has exactly the same keys in en and it', () => {
    const keys = (table: unknown) =>
      leafKeys(lookup(table, 'platformTemplates'), 'platformTemplates').sort()

    expect(keys(it_)).toEqual(keys(en))
    expect(keys(en).length).toBeGreaterThan(20)
  })

  it('keeps the interpolation placeholders identical between the languages', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

    for (const key of leafKeys(lookup(en, 'platformTemplates'), 'platformTemplates')) {
      expect(placeholders(String(lookup(it_, key))), key).toEqual(
        placeholders(String(lookup(en, key)))
      )
    }
  })
})
