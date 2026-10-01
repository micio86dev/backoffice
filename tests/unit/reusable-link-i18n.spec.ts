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
 * Two namespaces: `entryLink.reusable` (the create flow, B6a) and
 * `reusableLinks` (the links panel, B6b). The panel's vocabulary is "Disable" /
 * "Disattiva" and nothing else: a reusable link has a real, immediate disable,
 * and "revoke" / "regenerate" would name things it does not do.
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

// ---------------------------------------------------------------------------
// reusableLinks.* — the links panel (B6b)
// ---------------------------------------------------------------------------

const PANEL_KEYS = [
  'reusableLinks.title',
  'reusableLinks.description',
  'reusableLinks.loading',
  'reusableLinks.empty',
  'reusableLinks.unnamed',
  'reusableLinks.createdBy',
  'reusableLinks.createdOn',
  'reusableLinks.used',
  'reusableLinks.neverUsed',
  'reusableLinks.status.active',
  'reusableLinks.status.disabled',
  'reusableLinks.disable.action',
  'reusableLinks.disable.actionFor',
  'reusableLinks.disable.confirmTitle',
  'reusableLinks.disable.confirmDescription',
  'reusableLinks.disable.confirm',
  'reusableLinks.disable.error',
  'reusableLinks.loadError',
  'reusableLinks.retry',
] as const

/** The strings DESIGN.md 16.18 and the admin-backoffice spec quote word for word. */
const NORMATIVE_PANEL_ENGLISH: Partial<Record<(typeof PANEL_KEYS)[number], string>> = {
  'reusableLinks.empty':
    'No reusable links yet. Create one from the project list: Invite candidate, then tick the reusable link option.',
  'reusableLinks.unnamed': 'Untitled link',
  'reusableLinks.neverUsed': 'Never used',
  'reusableLinks.status.active': 'Active',
  'reusableLinks.status.disabled': 'Disabled',
  'reusableLinks.disable.action': 'Disable link',
  'reusableLinks.disable.confirmTitle': 'Disable this link?',
  'reusableLinks.disable.confirmDescription':
    'Nobody will be able to start a new interview with it. Interviews already in progress are not interrupted. This cannot be undone.',
  'reusableLinks.disable.confirm': 'Disable',
}

describe('reusable links panel copy', () => {
  describe.each(Object.entries(TABLES))('%s', (_locale, table) => {
    it.each(PANEL_KEYS)('has non-empty copy for %s', (key) => {
      const value = lookup(table, key)

      expect(typeof value).toBe('string')
      expect((value as string).trim()).not.toBe('')
    })

    it('holds exactly the keys the panel asks for, under ONE namespace', () => {
      expect(
        leaves(lookup(table, 'reusableLinks'))
          .map(([path]) => path)
          .sort()
      ).toEqual(PANEL_KEYS.map((key) => key.replace('reusableLinks.', '')).sort())
    })

    it('uses neither revoke nor regenerate wording in any panel string', () => {
      const banned = /revoke|regenerat|revoca|rigener/i

      const strings = leaves(lookup(table, 'reusableLinks'))

      // Not a ghost loop: with no strings the loop below would pass vacuously.
      expect(strings.length).toBeGreaterThan(0)
      for (const [path, text] of strings) {
        expect({ path, text, banned: banned.test(text) }).toEqual({ path, text, banned: false })
      }
    })

    it('keeps the placeholders the panel fills in', () => {
      expect(lookup(table, 'reusableLinks.createdBy')).toMatch(
        /\{date\}.*\{name\}|\{name\}.*\{date\}/
      )
      expect(lookup(table, 'reusableLinks.createdOn')).toMatch(/\{date\}/)
      expect(lookup(table, 'reusableLinks.disable.actionFor')).toMatch(/\{name\}/)
    })

    it('has a singular and a plural form for the usage line, each with count and date', () => {
      const forms = (lookup(table, 'reusableLinks.used') as string).split('|')

      expect(forms).toHaveLength(2)
      for (const form of forms) {
        expect(form).toMatch(/\{count\}/)
        expect(form).toMatch(/\{date\}/)
      }
    })
  })

  it.each(Object.entries(NORMATIVE_PANEL_ENGLISH))(
    '%s carries the normative English text',
    (key, text) => {
      expect(lookup(en, key)).toBe(text)
    }
  )

  it.each(PANEL_KEYS)('%s is translated, not copied, into Italian', (key) => {
    expect(lookup(it_, key)).not.toBe(lookup(en, key))
  })

  it('says Disable in English and Disattiva in Italian, on the action and its confirmation', () => {
    expect(lookup(en, 'reusableLinks.disable.action')).toMatch(/\bdisable\b/i)
    expect(lookup(en, 'reusableLinks.disable.confirm')).toMatch(/\bdisable\b/i)
    expect(lookup(it_, 'reusableLinks.disable.action')).toMatch(/disattiv/i)
    expect(lookup(it_, 'reusableLinks.disable.confirm')).toMatch(/disattiv/i)
  })

  it('conveys the same consequence in Italian: no new interviews, in-progress ones kept, final', () => {
    const description = lookup(it_, 'reusableLinks.disable.confirmDescription') as string

    expect(description).toMatch(/nuovo colloquio/i)
    expect(description).toMatch(/già in corso/i)
    expect(description).toMatch(/non può essere annullata/i)
  })

  it('tells the operator how to create a link, in both languages', () => {
    expect(lookup(en, 'reusableLinks.empty')).toMatch(/Invite candidate/)
    expect(lookup(it_, 'reusableLinks.empty')).toMatch(/Invita candidato/)
  })
})

// ---------------------------------------------------------------------------
// participants.detail.reusableLink* — the participant detail origin line (B6c)
// ---------------------------------------------------------------------------

const MARKER_KEYS = [
  'participants.detail.reusableLink',
  'participants.detail.reusableLinkUnlabelled',
] as const

/** The strings the admin-backoffice spec and DESIGN.md 16.18 quote word for word. */
const NORMATIVE_MARKER_ENGLISH: Record<(typeof MARKER_KEYS)[number], string> = {
  'participants.detail.reusableLink': 'Started from reusable link: {label}',
  'participants.detail.reusableLinkUnlabelled': 'Started from reusable link',
}

describe('participant detail origin line copy', () => {
  describe.each(Object.entries(TABLES))('%s', (_locale, table) => {
    it.each(MARKER_KEYS)('has non-empty copy for %s', (key) => {
      const value = lookup(table, key)

      expect(typeof value).toBe('string')
      expect((value as string).trim()).not.toBe('')
    })

    it('keeps the {label} placeholder on the labelled line, and only there', () => {
      expect(lookup(table, 'participants.detail.reusableLink')).toMatch(/\{label\}/)
      expect(lookup(table, 'participants.detail.reusableLinkUnlabelled')).not.toMatch(/[{}:]/)
    })

    it('uses neither revoke nor regenerate wording', () => {
      const banned = /revoke|regenerat|revoca|rigener/i

      for (const key of MARKER_KEYS) {
        const text = lookup(table, key) as string

        expect({ key, text, banned: banned.test(text) }).toEqual({ key, text, banned: false })
      }
    })
  })

  it.each(MARKER_KEYS)('%s carries the normative English text', (key) => {
    expect(lookup(en, key)).toBe(NORMATIVE_MARKER_ENGLISH[key])
  })

  it.each(MARKER_KEYS)('%s is translated, not copied, into Italian', (key) => {
    expect(lookup(it_, key)).not.toBe(lookup(en, key))
  })

  it('says the same thing in Italian: started from a reusable link, with and without a name', () => {
    expect(lookup(it_, 'participants.detail.reusableLink')).toMatch(/link riutilizzabile/i)
    expect(lookup(it_, 'participants.detail.reusableLinkUnlabelled')).toMatch(
      /link riutilizzabile/i
    )
  })
})
