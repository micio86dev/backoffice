/**
 * server-message.ts — the shared `organization_context_required` copy.
 *
 * The API answers a tenant-scoped write from a superadmin with no acting
 * client with HTTP 409 `{message: 'organization_context_required'}`. Every form
 * renders server codes through `translateServerCode`, so the code must resolve
 * to real copy in BOTH locales from ANY namespace — not only from the one
 * namespace a developer remembered to extend.
 */
import { describe, it, expect } from 'vitest'
import en from '../../../i18n/locales/en.json'
import it_ from '../../../i18n/locales/it.json'
import {
  translateServerCode,
  translateServerCodeOrFallback,
} from '../../../app/utils/server-message'

function lookup(bundle: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, segment) => {
    if (typeof node !== 'object' || node === null) return undefined

    return (node as Record<string, unknown>)[segment]
  }, bundle)
}

function translatorFor(bundle: unknown) {
  return {
    t: (key: string) => String(lookup(bundle, key) ?? key),
    te: (key: string) => lookup(bundle, key) !== undefined,
  }
}

const CODE = 'organization_context_required'

describe('organization_context_required', () => {
  it.each([
    ['avatar_templates.serverError'],
    ['projectQuestions.serverError'],
    ['users.serverError'],
  ])('translates in English from the %s namespace', (namespace) => {
    const text = translateServerCode(translatorFor(en), namespace, CODE)

    expect(text).not.toBe(CODE)
    expect(text).toBe('Select a client first: this action needs an active client.')
  })

  it('translates in Italian', () => {
    expect(translateServerCode(translatorFor(it_), 'avatar_templates.serverError', CODE)).toBe(
      'Seleziona prima un cliente: questa azione richiede un cliente attivo.'
    )
  })

  it('is also resolved by the prose-refusing variant', () => {
    expect(
      translateServerCodeOrFallback(
        translatorFor(en),
        'projectQuestions.serverError',
        CODE,
        'projectQuestions.saveError'
      )
    ).toBe('Select a client first: this action needs an active client.')
  })

  it('still prefers a namespace-specific translation over the shared one', () => {
    const translator = {
      t: (key: string) => (key === 'ns.x' ? 'specific' : 'shared'),
      te: () => true,
    }

    expect(translateServerCode(translator, 'ns', 'x')).toBe('specific')
  })

  it('still falls back to the raw code when nothing translates it', () => {
    expect(translateServerCode(translatorFor(en), 'users.serverError', 'nope_code')).toBe(
      'nope_code'
    )
  })
})
