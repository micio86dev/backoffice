/**
 * User-facing typography goes through i18n or markup, never a literal in a
 * template: the required marker is drawn by CSS (and named by its title), and
 * the "withdrawn" suffix of a model option is one localized string.
 * Also: one list of external speech engines, in the types file.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import AvatarTemplateForm from '../../app/components/organisms/AvatarTemplateForm.vue'
import LlmModelPicker from '../../app/components/molecules/LlmModelPicker.vue'
import { CATALOGUED_TTS_ENGINES, EXTERNAL_TTS_ENGINES } from '../../app/types/avatar-template'
import en from '../../i18n/locales/en.json'
import it_ from '../../i18n/locales/it.json'

vi.mock('@/composables/useLlmModels', () => ({
  useLlmModels: () => ({ listModels: () => Promise.resolve({ data: [] }) }),
}))
vi.mock('@/composables/useLlmCredentials', () => ({
  useLlmCredentials: () => ({ listCredentials: () => Promise.resolve({ data: [] }) }),
}))

describe('required marker', () => {
  it('is drawn by CSS, with no literal asterisk in the markup', async () => {
    const wrapper = mount(AvatarTemplateForm, {
      props: {
        template: { name: 'T', provider: 'heygen', config: {} },
        fieldSpecs: {
          heygen: [
            { key: 'maxSessionDurationSec', type: 'number', label_key: 'x', required: true },
          ],
          tavus: [],
        },
        saving: false,
        submitError: null,
      },
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()

    const marker = wrapper.get('abbr')
    expect(marker.text()).toBe('')
    expect(marker.attributes('title')).toBe('avatar_templates.form.required')
    expect(marker.classes().join(' ')).toContain("after:content-['*']")
  })
})

describe('withdrawn model option', () => {
  it('takes its parentheses from the locale string', () => {
    const wrapper = mount(LlmModelPicker, {
      props: {
        models: [
          {
            id: 1,
            key: 'm1',
            display_name: 'Old model',
            mode: 'managed',
            is_available: false,
          } as never,
        ],
        modelValue: 'm1',
      },
      global: { mocks: { $t: (key: string) => key } },
    })

    const text = wrapper.get('option[value="m1"]').text()
    expect(text).toContain('avatar_templates.llm.picker.withdrawnOption')
    expect(text).not.toContain('(')
  })

  it.each([
    ['en', en],
    ['it', it_],
  ])('%s ships the suffix with its own brackets', (_l, messages) => {
    const copy = (
      messages as unknown as { avatar_templates: { llm: { picker: Record<string, string> } } }
    ).avatar_templates.llm.picker.withdrawnOption

    expect(copy).toMatch(/^\(.+\)$/)
  })
})

describe('external speech engines', () => {
  it('are the catalogued engines plus azure, from one list', () => {
    expect([...EXTERNAL_TTS_ENGINES]).toEqual([...CATALOGUED_TTS_ENGINES, 'azure'])
  })

  it('are not redefined inside the form', () => {
    const source = readFileSync(
      join(__dirname, '../../app/components/organisms/AvatarTemplateForm.vue'),
      'utf-8'
    )

    expect(source).not.toMatch(/const EXTERNAL_TTS_ENGINES/)
  })
})
