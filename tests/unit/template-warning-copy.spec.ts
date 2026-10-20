/**
 * Every code the api documents for the save `warning` (persona-sync AND
 * conversation-model codes) must have copy in both locales. The list is read
 * from the contract snapshot, so a code the api adds fails here instead of
 * falling through to the generic message unnoticed.
 */
import { describe, expect, it } from 'vitest'
import openapi from '../../openapi.json'
import en from '../../i18n/locales/en.json'
import it_ from '../../i18n/locales/it.json'

type Schema = { properties?: { warning?: { enum?: string[] } } }
type Doc = {
  paths: Record<string, { post?: { responses: Record<string, Record<string, unknown>> } }>
}

const stored = (openapi as unknown as Doc).paths['/avatar-templates']?.post?.responses['201'] as
  { content: { 'application/json': { schema: Schema } } } | undefined
const CODES = stored?.content['application/json'].schema.properties?.warning?.enum ?? []

function lookup(bundle: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, segment) => {
    if (typeof node !== 'object' || node === null) return undefined

    return (node as Record<string, unknown>)[segment]
  }, bundle)
}

describe('template save warning copy', () => {
  it('reads the documented codes from the snapshot, HeyGen ones included', () => {
    expect(CODES).toHaveLength(12)
    expect(CODES).toEqual(
      expect.arrayContaining([
        'llm_provider_unreachable',
        'llm_credential_missing',
        'llm_secret_failed',
        'llm_config_failed',
      ])
    )
  })

  it.each(CODES)('%s has copy in en and it', (code) => {
    for (const bundle of [en, it_]) {
      const value = lookup(bundle, `avatar_templates.warning.${code}`)
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
    }
  })
})
