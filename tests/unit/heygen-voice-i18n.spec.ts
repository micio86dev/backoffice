/**
 * Copy for the HeyGen external voice: the two hints the API field specs name
 * and every error code the save can answer for it, in BOTH locales, checked
 * against each table separately (a helper that wants a key in both at once
 * cannot say which language is short).
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

const KEYS = [
  'avatar_templates.hint.heygenTtsEngine',
  'avatar_templates.hint.heygenTtsExternalVoiceId',
  'avatar_templates.hint.heygenTtsModelName',
  // refusals the API answers on `config.ttsEngine` / `config.ttsExternalVoiceId` / `config.voiceId`
  'avatar_templates.error.config.superadmin_only',
  'avatar_templates.error.config.superseded_by_tts_engine',
  'avatar_templates.error.config.tts_setting_unsupported',
  'avatar_templates.error.config.tts_voice_unverifiable',
  'avatar_templates.error.config.tts_voice_bind_failed',
  'avatar_templates.error.config.tts_vendor_key_missing',
  'avatar_templates.error.config.tts_provider_unconfigured',
  'avatar_templates.error.config.tts_secret_failed',
  'avatar_templates.error.config.tts_bind_busy',
  'avatar_templates.error.config.tts_engine_unsupported',
] as const

describe.each(Object.entries(TABLES))('HeyGen external voice copy (%s)', (_locale, table) => {
  it.each(KEYS)('has non-empty copy for %s', (key) => {
    const value = lookup(table, key)

    expect(typeof value).toBe('string')
    expect((value as string).trim()).not.toBe('')
  })
})

describe('the two locales are translations, not copies', () => {
  it.each(KEYS)('%s differs between en and it', (key) => {
    expect(lookup(en, key)).not.toBe(lookup(it_, key))
  })
})

describe('every refusal code the form can be shown has copy in both locales', () => {
  const CODES = [
    'superadmin_only',
    'superseded_by_tts_engine',
    'tts_setting_unsupported',
    'tts_voice_unverifiable',
    'tts_voice_bind_failed',
    'tts_vendor_key_missing',
    'tts_provider_unconfigured',
    'tts_secret_failed',
    'tts_bind_busy',
    'tts_engine_unsupported',
  ]

  it.each(Object.entries(TABLES))('%s carries all ten codes, each non-empty', (_locale, table) => {
    const config = lookup(table, 'avatar_templates.error.config') as Record<string, unknown>

    for (const code of CODES) {
      expect(typeof config[code], code).toBe('string')
      expect((config[code] as string).trim(), code).not.toBe('')
    }
  })
})
