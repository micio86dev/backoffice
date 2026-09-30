/**
 * Pins the assumption that avatar-template `config` is a string-keyed MAP on
 * read AND write. The generated write bodies say `string[]` (Scramble infers a
 * list from the PHP `array` rule); the api actually validates a plain map.
 * Type-level half: tests/nuxt/avatar-template-config-contract.ts (typecheck).
 */
import { describe, expect, it, vi } from 'vitest'
import type { AvatarTemplate } from '../../app/types/avatar-template'

const apiFetch = vi.fn().mockResolvedValue({ data: {} })
vi.mock('../../app/composables/useApi', () => ({ useApi: () => ({ apiFetch }) }))
const { useAvatarTemplates } = await import('../../app/composables/useAvatarTemplates')

describe('avatar template config shape', () => {
  it('round-trips a config map through the payload builders unchanged', async () => {
    const read: AvatarTemplate['config'] = { avatarId: 'a', voiceId: 'v' }
    const edited = { ...read, voiceId: 'v2' }

    await useAvatarTemplates().updateTemplate(1, { config: edited })
    await useAvatarTemplates().createTemplate({ name: 'X', provider: 'heygen', config: edited })

    for (const call of apiFetch.mock.calls) {
      const body = (call[1] as { body: { config: unknown } }).body
      expect(Array.isArray(body.config)).toBe(false)
      expect(body.config).toEqual({ avatarId: 'a', voiceId: 'v2' })
    }
  })
})
