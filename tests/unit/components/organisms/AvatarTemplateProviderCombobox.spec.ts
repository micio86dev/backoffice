/**
 * AvatarTemplateProviderCombobox — which voice-preview controls a provider gets.
 *
 * Only a provider that has a voice to listen to gets them: heygen and the
 * third-party engines do; tavus (its voice is chosen elsewhere) and hr_avatar
 * (a config id, not a voice) never do. The default heygen path is asserted
 * beside the new case so the narrowing cannot spread.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AvatarTemplateProviderCombobox from '../../../../app/components/organisms/AvatarTemplateProviderCombobox.vue'
import type { CatalogueProvider } from '../../../../app/types/avatar-template'

const fetchCatalogue = vi.fn()
vi.mock('@/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ fetchCatalogue }),
}))

const P = 'template-config-voiceId'

beforeEach(() => {
  fetchCatalogue.mockResolvedValue({
    status: 'ok',
    items: [
      {
        id: 'v1',
        provider: 'heygen',
        label: 'Voice one',
        name: 'Voice one',
        language: 'it',
        locale: null,
        accent: null,
        italian: 'native',
        preview_image_url: null,
        preview_audio_url: null,
        preview_video_url: null,
      },
    ],
  })
})

async function open(provider: CatalogueProvider, modelValue = '') {
  const wrapper = mount(AvatarTemplateProviderCombobox, {
    props: {
      field: {
        key: 'voiceId',
        type: 'text' as const,
        label_key: 'avatar_templates.field.voiceId',
        catalogue_resource: 'voice' as const,
      },
      provider,
      modelValue,
    },
    attachTo: document.body,
  })
  await flushPromises()
  await wrapper.get('[role="combobox"]').trigger('click')
  await flushPromises()

  return wrapper
}

const previews = (wrapper: Awaited<ReturnType<typeof open>>) =>
  wrapper
    .findAll('[data-testid]')
    .map((node) => node.attributes('data-testid')!)
    .filter((id) => id.includes('italian-preview'))

describe('voice preview controls by provider', () => {
  it('offers the Italian sample on a heygen voice row, as before', async () => {
    const wrapper = await open('heygen')

    expect(previews(wrapper)).toContain(`${P}-italian-preview-v1`)
  })

  it.each(['tavus', 'hr_avatar'] as const)('offers none on a %s row', async (provider) => {
    const wrapper = await open(provider)

    expect(previews(wrapper)).toEqual([])
  })

  it('falls back to the no-vendor provider for the selected-voice block', async () => {
    const wrapper = await open('hr_avatar', 'v1')

    expect(wrapper.find(`[data-testid="${P}-voice-preview"]`).exists()).toBe(true)
    expect(previews(wrapper)).toEqual([])
  })
})
