/**
 * Superseded fields: a field REPLACED by another field's value (the HeyGen
 * native `voiceId` when an external speech engine supplies the voice).
 *
 * Mirrors the server rule in `ConfigValidator` (`superseded_by_*`), so the form
 * never offers a control the API would refuse.
 */
import { describe, expect, it } from 'vitest'
import { fieldsToDropWhenChanged, isSuperseded } from '../../app/utils/superseded-fields'
import type { FieldSpec } from '../../app/types/avatar-template'

const voiceId: FieldSpec = {
  key: 'voiceId',
  type: 'text',
  label_key: 'l.voiceId',
  required: true,
  superseded_by_key: 'ttsEngine',
  superseded_by_values: ['cartesia', 'elevenlabs'],
}
const speed: FieldSpec = { key: 'voiceSpeed', type: 'number', label_key: 'l.speed' }

describe('isSuperseded', () => {
  it('is true only while the governing field holds one of the listed values', () => {
    expect(isSuperseded(voiceId, { ttsEngine: 'cartesia' })).toBe(true)
    expect(isSuperseded(voiceId, { ttsEngine: 'elevenlabs' })).toBe(true)
    expect(isSuperseded(voiceId, { ttsEngine: 'none' })).toBe(false)
    expect(isSuperseded(voiceId, {})).toBe(false)
    expect(isSuperseded(voiceId, { ttsEngine: null })).toBe(false)
  })

  it('is never true for a field that declares no governing field', () => {
    expect(isSuperseded(speed, { ttsEngine: 'cartesia' })).toBe(false)
  })
})

describe('fieldsToDropWhenChanged', () => {
  const specs = [voiceId, speed]

  it('drops a held value the change supersedes', () => {
    expect(fieldsToDropWhenChanged(specs, 'ttsEngine', { voiceId: 'native' }, 'cartesia')).toEqual([
      'voiceId',
    ])
  })

  it('drops nothing when the field holds no value, or the change does not supersede it', () => {
    expect(fieldsToDropWhenChanged(specs, 'ttsEngine', {}, 'cartesia')).toEqual([])
    expect(fieldsToDropWhenChanged(specs, 'ttsEngine', { voiceId: 'native' }, 'none')).toEqual([])
    expect(fieldsToDropWhenChanged(specs, 'voiceSpeed', { voiceId: 'native' }, '1.1')).toEqual([])
  })
})
