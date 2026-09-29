/**
 * Dependent select options (`options_depend_on` / `options_by_value`).
 *
 * The API narrows one select's choices by another field's value (Tavus
 * `ttsModelName` by `ttsEngine`). Reusable: nothing here knows about Tavus.
 */
import { describe, expect, it } from 'vitest'
import {
  dependentOptionsAvailable,
  fieldsToResetOnChange,
  optionsFor,
} from '../../../app/utils/dependent-options'
import type { FieldSpec } from '../../../app/types/avatar-template'

const MODEL: FieldSpec = {
  key: 'ttsModelName',
  type: 'select',
  label_key: 'avatar_templates.field.ttsModelName',
  options: ['sonic-3', 'eleven_multilingual_v2'],
  options_depend_on: 'ttsEngine',
  options_by_value: {
    cartesia: ['sonic-3'],
    elevenlabs: ['eleven_multilingual_v2'],
  },
}

const PLAIN: FieldSpec = {
  key: 'videoQuality',
  type: 'select',
  label_key: 'x',
  options: ['high', 'low'],
}

describe('optionsFor', () => {
  it('returns the flat options when the field is not dependent', () => {
    expect(optionsFor(PLAIN, {})).toEqual(['high', 'low'])
  })

  it('narrows by the current value of the field it depends on', () => {
    expect(optionsFor(MODEL, { ttsEngine: 'cartesia' })).toEqual(['sonic-3'])
    expect(optionsFor(MODEL, { ttsEngine: 'elevenlabs' })).toEqual(['eleven_multilingual_v2'])
  })

  it('returns nothing for a value with no entry (azure, tavus-auto, unset)', () => {
    expect(optionsFor(MODEL, { ttsEngine: 'azure' })).toEqual([])
    expect(optionsFor(MODEL, { ttsEngine: 'tavus-auto' })).toEqual([])
    expect(optionsFor(MODEL, {})).toEqual([])
  })
})

describe('dependentOptionsAvailable', () => {
  it('is true for a plain field and for a dependent one with choices', () => {
    expect(dependentOptionsAvailable(PLAIN, {})).toBe(true)
    expect(dependentOptionsAvailable(MODEL, { ttsEngine: 'cartesia' })).toBe(true)
  })

  it('is false when the current parent value offers no choice', () => {
    expect(dependentOptionsAvailable(MODEL, { ttsEngine: 'azure' })).toBe(false)
    expect(dependentOptionsAvailable(MODEL, {})).toBe(false)
  })
})

describe('fieldsToResetOnChange', () => {
  const specs = [PLAIN, MODEL]

  it('names a dependent field whose chosen value the new parent value no longer offers', () => {
    expect(
      fieldsToResetOnChange(
        specs,
        'ttsEngine',
        { ttsEngine: 'cartesia', ttsModelName: 'sonic-3' },
        'elevenlabs'
      )
    ).toEqual(['ttsModelName'])
  })

  it('keeps a value that is still offered', () => {
    expect(
      fieldsToResetOnChange(
        specs,
        'ttsEngine',
        { ttsEngine: 'cartesia', ttsModelName: 'sonic-3' },
        'cartesia'
      )
    ).toEqual([])
  })

  it('ignores dependents that hold nothing', () => {
    expect(fieldsToResetOnChange(specs, 'ttsEngine', { ttsEngine: 'cartesia' }, 'azure')).toEqual(
      []
    )
  })

  it('ignores changes to fields nothing depends on', () => {
    expect(
      fieldsToResetOnChange(specs, 'videoQuality', { ttsModelName: 'sonic-3' }, 'low')
    ).toEqual([])
  })
})
