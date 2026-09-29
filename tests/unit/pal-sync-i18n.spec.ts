/**
 * Every persona-sync code the API can return must have copy in BOTH locales.
 * The indicator and the page alert render `avatar_templates.warning.<code>`;
 * a code without copy would show its i18n key to the operator.
 */
import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en.json'
import it_ from '../../i18n/locales/it.json'
import { PAL_SYNC_CODES } from '../../app/types/avatar-template'

function lookup(bundle: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, segment) => {
    if (typeof node !== 'object' || node === null) return undefined

    return (node as Record<string, unknown>)[segment]
  }, bundle)
}

const KEYS = [
  ...PAL_SYNC_CODES.map((code) => `avatar_templates.warning.${code}`),
  'avatar_templates.palSync.bannerTitle',
  'avatar_templates.palSync.lastSynced',
  ...['never', 'synced', 'skipped', 'warning'].map((s) => `avatar_templates.palSync.status.${s}`),
  'avatar_templates.form.catalogue.editable.yes',
  'avatar_templates.form.catalogue.editable.no',
  'avatar_templates.form.catalogue.editable.noTitle',
  'avatar_templates.form.catalogue.editable.hintNo',
  'avatar_templates.form.catalogue.editable.hintUnknown',
  'avatar_templates.field.ttsModelName',
  'avatar_templates.hint.ttsModelName',
  'avatar_templates.form.dependentUnavailable',
  'avatar_templates.error.config.tts_model_engine_mismatch',
]

describe('persona sync i18n', () => {
  it('lists the eight contract codes', () => {
    expect([...PAL_SYNC_CODES].sort()).toEqual(
      [
        'pal_id_missing',
        'pal_not_editable',
        'pal_not_found',
        'pal_sync_failed',
        'pal_sync_rejected',
        'pal_sync_unauthorized',
        'pal_sync_unreachable',
        'tavus_key_missing',
      ].sort()
    )
  })

  it.each(KEYS)('%s exists in en and it', (key) => {
    for (const bundle of [en, it_]) {
      const value = lookup(bundle, key)
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
    }
  })
})
