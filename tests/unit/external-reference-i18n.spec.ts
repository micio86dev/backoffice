/**
 * External reference copy (candidate-external-reference) — checked against the
 * `en` and the `it` table SEPARATELY, like `platform-templates-i18n.spec.ts`:
 * a helper that requires a key in both at once reports "missing" without
 * saying which language is short, and one that consults a single table lets
 * the other ship a gap.
 *
 * Only LABELS and messages are translated. The values (`source`, `external_id`)
 * and the `·` and `#` glyphs are data and never appear in a locale file.
 */
import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en.json'
import it_ from '../../i18n/locales/it.json'

const TABLES = { en, it: it_ } as const

function lookup(bundle: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, segment) => {
    if (typeof node !== 'object' || node === null) return undefined

    return (node as Record<string, unknown>)[segment]
  }, bundle)
}

/** The whole `externalReference` namespace, asked for by the UI. */
const EXTERNAL_REFERENCE_KEYS = [
  'externalReference.label',
  'externalReference.help',
  'externalReference.externalId',
  'externalReference.source',
  'externalReference.externalIdInvalid',
] as const

describe('external reference copy', () => {
  describe.each(Object.entries(TABLES))('%s', (locale, table) => {
    it.each(EXTERNAL_REFERENCE_KEYS)('has non-empty copy for %s', (key) => {
      const value = lookup(table, key)

      expect(typeof value).toBe('string')
      expect((value as string).trim()).not.toBe('')
    })

    it('holds exactly the keys the UI asks for, under ONE namespace', () => {
      const namespace = lookup(table, 'externalReference') as Record<string, unknown>

      expect(Object.keys(namespace).sort()).toEqual(
        EXTERNAL_REFERENCE_KEYS.map((key) => key.split('.')[1]!).sort()
      )
    })

    it('keeps the {max} placeholder in the External ID message: the limit is interpolated, not typed', () => {
      expect(lookup(table, 'externalReference.externalIdInvalid')).toContain('{max}')
    })

    it('tells the operator the list search also matches source and external ID', () => {
      const placeholder = lookup(table, 'participants.filters.searchPlaceholder') as string

      // The search box sends its term as `q`, and the API matches `source` and
      // `external_id` as well as the name and reference: a placeholder that only
      // says "name or reference" hides half of what the box can do.
      expect(placeholder).toMatch(locale === 'en' ? /source/i : /origine/i)
      expect(placeholder).toMatch(locale === 'en' ? /external id/i : /id esterno/i)
      // The list search also matches the email address a reusable-link visitor
      // types (api participants `q`): naming it keeps the box honest.
      expect(placeholder).toMatch(/email/i)
    })
  })

  it.each(EXTERNAL_REFERENCE_KEYS)('%s is translated, not copied, into Italian', (key) => {
    expect(lookup(it_, key)).not.toBe(lookup(en, key))
  })
})
