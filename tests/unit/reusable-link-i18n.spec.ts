/**
 * Reusable link copy (reusable-interview-links, B6a) — checked against the `en`
 * and the `it` table SEPARATELY, like `external-reference-i18n.spec.ts`: a
 * helper that requires a key in both at once says "missing" without saying
 * which language is short, and one that consults a single table lets the other
 * ship a gap.
 *
 * The English strings are NORMATIVE (admin-backoffice spec, DESIGN.md 16.18),
 * so they are asserted verbatim. The Italian ones must carry the same meaning
 * and are asserted to be translated, not copied.
 *
 * This slice owns the create flow's namespace, `entryLink.reusable`. The links
 * panel's `reusableLinks.*` keys arrive with that panel.
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

/** Every leaf string under a node, with its dotted path. */
function leaves(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]]
  if (typeof node !== 'object' || node === null) return []

  return Object.entries(node).flatMap(([key, value]) =>
    leaves(value, path === '' ? key : `${path}.${key}`)
  )
}

const REUSABLE_KEYS = [
  'entryLink.reusable.checkbox.label',
  'entryLink.reusable.checkbox.description',
  'entryLink.reusable.linkName.label',
  'entryLink.reusable.linkName.help',
  'entryLink.reusable.disclosure',
  'entryLink.reusable.neverExpires',
  'entryLink.reusable.stopsWhen',
] as const

const NORMATIVE_ENGLISH: Record<(typeof REUSABLE_KEYS)[number], string> = {
  'entryLink.reusable.checkbox.label': 'Generate a reusable interview link that never expires',
  'entryLink.reusable.checkbox.description':
    'Anyone who opens it starts a new interview for this project. Use it for demos, events and testing.',
  'entryLink.reusable.linkName.label': 'Link name',
  'entryLink.reusable.linkName.help':
    'Names the link and the interviews started from it, e.g. Milan fair stand.',
  'entryLink.reusable.disclosure':
    'This link does not expire and can be used many times. Anyone who has it can start this interview, so share it only where you mean to. This is the only time the full link is shown.',
  'entryLink.reusable.neverExpires': 'Never expires · Reusable',
  'entryLink.reusable.stopsWhen':
    'It stops working if the project closes or the link is disabled. Desktop browsers only.',
}

describe('reusable link copy', () => {
  describe.each(Object.entries(TABLES))('%s', (_locale, table) => {
    it.each(REUSABLE_KEYS)('has non-empty copy for %s', (key) => {
      const value = lookup(table, key)

      expect(typeof value).toBe('string')
      expect((value as string).trim()).not.toBe('')
    })

    it('holds exactly the keys the create flow asks for, under ONE namespace', () => {
      const namespace = lookup(table, 'entryLink.reusable')

      expect(
        leaves(namespace)
          .map(([path]) => path)
          .sort()
      ).toEqual(REUSABLE_KEYS.map((key) => key.replace('entryLink.reusable.', '')).sort())
    })

    it('uses neither revoke nor regenerate wording in any reusable string', () => {
      // English and Italian equivalents, whichever locale the table is: a
      // mistranslation can smuggle the banned verb in from either side.
      const banned = /revoke|regenerat|revoca|rigener/i

      for (const [path, text] of leaves(lookup(table, 'entryLink.reusable'))) {
        expect({ path, text, banned: banned.test(text) }).toEqual({ path, text, banned: false })
      }
    })

    it('leaves the single-use copy untouched', () => {
      // The reusable variant must not repurpose a single-use key: its disclosure
      // is a different statement, and the single-use one is binding as written.
      const single = {
        'entryLink.generate': table === en ? 'Generate new link' : 'Genera nuovo link',
        'entryLink.expiresAt': table === en ? 'Expires:' : 'Scade:',
      }

      for (const [key, expected] of Object.entries(single)) {
        expect(lookup(table, key)).toBe(expected)
      }
      expect(lookup(table, 'entryLink.disclosure')).toMatch(table === en ? /single-use/ : /monouso/)
    })
  })

  it.each(REUSABLE_KEYS)('%s carries the normative English text', (key) => {
    expect(lookup(en, key)).toBe(NORMATIVE_ENGLISH[key])
  })

  it.each(REUSABLE_KEYS)('%s is translated, not copied, into Italian', (key) => {
    expect(lookup(it_, key)).not.toBe(lookup(en, key))
  })

  it('conveys the same meaning in Italian: never expires, many uses, shown once, disabling', () => {
    expect(lookup(it_, 'entryLink.reusable.disclosure')).toMatch(/non scade/i)
    expect(lookup(it_, 'entryLink.reusable.disclosure')).toMatch(/più volte|molte volte/i)
    expect(lookup(it_, 'entryLink.reusable.disclosure')).toMatch(
      /solo questa volta|una sola volta/i
    )
    expect(lookup(it_, 'entryLink.reusable.neverExpires')).toMatch(/non scade/i)
    expect(lookup(it_, 'entryLink.reusable.stopsWhen')).toMatch(/disattivat/i)
  })
})
