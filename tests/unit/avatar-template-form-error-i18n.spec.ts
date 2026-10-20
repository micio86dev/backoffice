/**
 * A 422 never puts the api's English sentence, or a raw code with no copy,
 * in front of an operator: every message is the form's own localized copy.
 * (The existing mapping specs keep covering the codes that DO have copy.)
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AvatarTemplateForm from '../../app/components/organisms/AvatarTemplateForm.vue'
import type { FieldSpecMap } from '../../app/types/avatar-template'

vi.mock('@/composables/useLlmModels', () => ({
  useLlmModels: () => ({ listModels: () => Promise.resolve({ data: [] }) }),
}))
vi.mock('@/composables/useLlmCredentials', () => ({
  useLlmCredentials: () => ({ listCredentials: () => Promise.resolve({ data: [] }) }),
}))

const SPECS: FieldSpecMap = {
  heygen: [{ key: 'avatarId', type: 'text', label_key: 'x' }],
  tavus: [],
}

/** `te` that has copy for everything except codes ending in `_nocopy`. */
beforeEach(() => {
  vi.stubGlobal('useI18n', () => ({
    t: (key: string) => key,
    te: (key: string) => !key.endsWith('_nocopy'),
  }))
})

async function mountWith(errors: Record<string, string[]>) {
  const wrapper = mount(AvatarTemplateForm, {
    props: {
      template: { name: 'T', provider: 'heygen', config: {} },
      fieldSpecs: SPECS,
      saving: false,
      submitError: { status: 422, data: { errors } },
    },
    global: { mocks: { $t: (key: string) => key } },
  })
  await flushPromises()

  return wrapper
}

const text = (wrapper: Awaited<ReturnType<typeof mountWith>>, id: string) =>
  wrapper.get(`[data-testid="${id}"]`).text()

describe('422 messages are localized, never raw', () => {
  it('shows localized copy for a description sentence', async () => {
    const wrapper = await mountWith({ description: ['The description is too long.'] })

    expect(text(wrapper, 'template-description-error')).toContain(
      'avatar_templates.error.invalid_description'
    )
    expect(wrapper.text()).not.toContain('The description is too long.')
  })

  it('shows localized copy for an unmapped sentence in the summary', async () => {
    const wrapper = await mountWith({ something_else: ['Sentence from the api.'] })

    expect(text(wrapper, 'template-form-errors')).toContain('avatar_templates.error.invalid_value')
    expect(wrapper.text()).not.toContain('Sentence from the api.')
  })

  it('does not echo a model code that has no copy', async () => {
    const wrapper = await mountWith({ llm_model_id: ['brand_new_nocopy'] })

    expect(text(wrapper, 'template-llm-model-error')).toContain(
      'avatar_templates.error.invalid_value'
    )
    expect(wrapper.text()).not.toContain('brand_new_nocopy')
  })

  it('does not echo a config code that has no copy', async () => {
    const wrapper = await mountWith({ 'config.avatarId': ['brand_new_nocopy'] })

    expect(text(wrapper, 'template-config-avatarId-error')).toContain(
      'avatar_templates.error.invalid_value'
    )
    expect(wrapper.text()).not.toContain('brand_new_nocopy')
  })

  it('does not echo a summary config code that has no copy', async () => {
    const wrapper = await mountWith({ 'config.removedKnob': ['brand_new_nocopy'] })

    expect(text(wrapper, 'template-form-errors')).toContain('avatar_templates.error.invalid_value')
    expect(wrapper.text()).not.toContain('brand_new_nocopy')
  })

  it('still translates a code that has copy', async () => {
    const wrapper = await mountWith({ llm_model_id: ['model_unavailable'] })

    expect(text(wrapper, 'template-llm-model-error')).toContain(
      'avatar_templates.error.llm.model_unavailable'
    )
  })
})

describe('locale parity of the new copy', () => {
  it.each(['en', 'it'])('%s ships the fallback keys', async (locale) => {
    const messages = (await import(`../../i18n/locales/${locale}.json`)).default as {
      avatar_templates: { error: Record<string, unknown> }
    }

    for (const key of ['invalid_name', 'invalid_description', 'invalid_value']) {
      expect(typeof messages.avatar_templates.error[key]).toBe('string')
    }
  })
})
