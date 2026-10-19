/**
 * Refusing a value that is not in the loaded catalogue uses the form's code
 * copy with its generic fallback: a code that has no translation (here the
 * `unknown` code a field with no reference mapping gets) never shows a raw
 * i18n key to the operator.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AvatarTemplateForm from '../../app/components/organisms/AvatarTemplateForm.vue'
import type { FieldSpecMap } from '../../app/types/avatar-template'

const entry = (id: string) => ({
  id,
  provider: 'heygen',
  label: id,
  name: id,
  language: null,
  locale: null,
  accent: null,
  italian: null,
  preview_image_url: null,
  preview_audio_url: null,
  preview_audio_via_api: false,
  preview_video_url: null,
})

const fetchCatalogue = vi.fn()
vi.mock('@/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ fetchCatalogue }),
}))
vi.mock('@/composables/useLlmModels', () => ({
  useLlmModels: () => ({ listModels: () => Promise.resolve({ data: [] }) }),
}))
vi.mock('@/composables/useLlmCredentials', () => ({
  useLlmCredentials: () => ({ listCredentials: () => Promise.resolve({ data: [] }) }),
}))

const SPECS: FieldSpecMap = {
  heygen: [
    { key: 'avatarId', type: 'text', label_key: 'x', catalogue_resource: 'avatar' },
    { key: 'mysteryId', type: 'text', label_key: 'y', catalogue_resource: 'avatar' },
  ],
  tavus: [],
}

beforeEach(() => {
  fetchCatalogue.mockResolvedValue({ status: 'ok', items: [entry('known')] })
  vi.stubGlobal('useI18n', () => ({
    t: (key: string) => key,
    te: (key: string) => !key.endsWith('.unknown'),
  }))
})

async function submitWith(config: Record<string, unknown>) {
  const wrapper = mount(AvatarTemplateForm, {
    props: {
      template: { name: 'T', provider: 'heygen', config },
      fieldSpecs: SPECS,
      saving: false,
      submitError: null,
    },
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  })
  await flushPromises()
  await wrapper.get('form').trigger('submit')
  await flushPromises()

  return wrapper
}

describe('catalogue reference refusal copy', () => {
  it('never shows a raw i18n key for a code with no copy', async () => {
    const wrapper = await submitWith({ avatarId: 'known', mysteryId: 'not-in-the-list' })
    const text = wrapper.get('[data-testid="template-config-mysteryId-error"]').text()

    expect(text).toContain('avatar_templates.error.invalid_value')
    expect(text).not.toContain('avatar_templates.error.config.unknown')
  })

  it('keeps the specific copy for a code that has it', async () => {
    const wrapper = await submitWith({ avatarId: 'not-in-the-list' })

    expect(wrapper.get('[data-testid="template-config-avatarId-error"]').text()).toContain(
      'avatar_templates.error.config.avatar_not_found'
    )
  })
})
