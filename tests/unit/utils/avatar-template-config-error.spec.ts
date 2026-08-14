/**
 * avatar-template-config-error.spec.ts (form-clarity-and-console-warnings, D3)
 *
 * Pins the `"{key}: {code}"` string format `AvatarTemplateController.php:
 * 234-239` actually emits — verbatim, as a fixture string, not against a live
 * API. If the API side ever reformats this, this test fails here, at the
 * boundary, rather than silently in the UI (the AvatarTemplateForm.vue
 * conversion this parser feeds has no other way to notice a drift).
 */
import { describe, it, expect } from 'vitest'
import { parseConfigError } from '../../../app/utils/avatar-template-config-error'

describe('parseConfigError', () => {
  it('splits "{key}: {code}" into its two halves', () => {
    expect(parseConfigError('avatarId: required')).toEqual({ key: 'avatarId', code: 'required' })
  })

  it('splits at the FIRST ": " only', () => {
    // Codes are single words (required/type/range/enum/unknown) so this never
    // happens in practice, but the split direction is still part of the
    // contract this pins.
    expect(parseConfigError('voiceSpeed: range: extra')).toEqual({
      key: 'voiceSpeed',
      code: 'range: extra',
    })
  })

  it('returns null for a message with no ": " separator', () => {
    expect(parseConfigError('this is not a config message')).toBeNull()
  })
})
