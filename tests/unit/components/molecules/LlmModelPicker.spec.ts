/**
 * LlmModelPicker.vue (pluggable-conversation-llm PR P8, task P8.1 — RED).
 *
 * `<optgroup>` splits "Text (managed)" (enabled, selectable) from
 * "Live — coming soon" (rendered, disabled) — admin-backoffice spec delta,
 * "grouped conversation-model picker with a disabled Live group". Selecting
 * one of the disabled options must never change the bound value: the server
 * rejects `native_duplex` with 422 `mode_unsupported` (I2), so the UI must
 * never let it be submitted in the first place.
 *
 * A model already selected but since marked `is_available: false` (I5's
 * grandfathering case — a template bound to it must keep saving on unrelated
 * edits) renders WITHDRAWN rather than dropped: still the selected option,
 * labelled as no longer available, but not choosable as a NEW selection.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LlmModelPicker from '../../../../app/components/molecules/LlmModelPicker.vue'
import type { LlmModel } from '../../../../app/types/llm'

const tMock = (key: string) => key

function makeModel(overrides: Partial<LlmModel> = {}): LlmModel {
  return {
    key: 'gemini-3-flash-preview',
    vendor: 'google',
    display_name: 'Gemini 3 Flash (Preview)',
    capability: 'text',
    mode: 'managed',
    is_available: true,
    sort_order: 1,
    rate_card_source_url: null,
    rate_card_verified_at: null,
    text_input_usd_per_million: null,
    text_output_usd_per_million: null,
    text_input_usd_per_million_high: null,
    text_output_usd_per_million_high: null,
    context_tier_threshold_tokens: null,
    audio_input_usd_per_million: null,
    audio_output_usd_per_million: null,
    audio_input_usd_per_minute: null,
    audio_output_usd_per_minute: null,
    audio_tokens_per_second: null,
    ...overrides,
  }
}

const managedModel = makeModel()
const liveModel = makeModel({
  key: 'gemini-3.1-flash-live-preview',
  display_name: 'Gemini 3.1 Flash Live (Preview)',
  capability: 'native_duplex',
  mode: 'native_duplex',
})

describe('LlmModelPicker', () => {
  it('renders "Text (managed)" enabled and "Live — coming soon" present but disabled', () => {
    const wrapper = mount(LlmModelPicker, {
      props: {
        id: 'llm-model',
        label: 'Language model',
        models: [managedModel, liveModel],
        modelValue: null,
      },
      global: { mocks: { $t: tMock } },
    })

    const groups = wrapper.findAll('optgroup')
    const managedGroup = groups.find(
      (group) => group.attributes('label') === 'avatar_templates.llm.picker.groupManaged'
    )
    const liveGroup = groups.find(
      (group) => group.attributes('label') === 'avatar_templates.llm.picker.groupLive'
    )

    expect(managedGroup).toBeDefined()
    expect(liveGroup).toBeDefined()
    expect(liveGroup?.attributes('disabled')).toBeDefined()

    for (const option of liveGroup!.findAll('option')) {
      expect((option.element as HTMLOptionElement).disabled).toBe(true)
    }
    for (const option of managedGroup!.findAll('option')) {
      expect((option.element as HTMLOptionElement).disabled).toBe(false)
    }
  })

  it('does not change the selection when a disabled Live option is targeted', async () => {
    const wrapper = mount(LlmModelPicker, {
      props: {
        id: 'llm-model',
        label: 'Language model',
        models: [managedModel, liveModel],
        modelValue: null,
      },
      global: { mocks: { $t: tMock } },
    })

    const select = wrapper.get('[data-testid="llm-model-picker"]')
    await select.setValue(liveModel.key)

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect((select.element as HTMLSelectElement).value).toBe('')
  })

  it('emits the selected key when a managed model is chosen', async () => {
    const wrapper = mount(LlmModelPicker, {
      props: {
        id: 'llm-model',
        label: 'Language model',
        models: [managedModel, liveModel],
        modelValue: null,
      },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="llm-model-picker"]').setValue(managedModel.key)

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([managedModel.key])
  })

  it('emits null when the operator returns to the provider-default option', async () => {
    const wrapper = mount(LlmModelPicker, {
      props: {
        id: 'llm-model',
        label: 'Language model',
        models: [managedModel],
        modelValue: managedModel.key,
      },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="llm-model-picker"]').setValue('')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null])
  })

  it('keeps a withdrawn (no longer available) current selection visible, labelled, and not reselectable as new', async () => {
    const withdrawn = makeModel({
      key: 'gemini-legacy',
      display_name: 'Gemini Legacy',
      is_available: false,
    })
    const wrapper = mount(LlmModelPicker, {
      props: {
        id: 'llm-model',
        label: 'Language model',
        models: [managedModel, withdrawn],
        modelValue: withdrawn.key,
      },
      global: { mocks: { $t: tMock } },
    })

    const select = wrapper.get('[data-testid="llm-model-picker"]')
    expect((select.element as HTMLSelectElement).value).toBe(withdrawn.key)

    const option = wrapper.get(`option[value="${withdrawn.key}"]`)
    expect(option.text()).toContain('avatar_templates.llm.picker.withdrawn')

    // Deselecting it (unbinding) still works — I5 only blocks a NEW bind onto
    // an unavailable model, never clearing the field entirely.
    await select.setValue('')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null])
  })

  it('refuses to newly select a different template’s withdrawn model', async () => {
    const withdrawn = makeModel({
      key: 'gemini-legacy',
      display_name: 'Gemini Legacy',
      is_available: false,
    })
    // modelValue is null here — this template was never bound to `withdrawn`,
    // so I5 must block it from becoming a NEW selection.
    const wrapper = mount(LlmModelPicker, {
      props: {
        id: 'llm-model',
        label: 'Language model',
        models: [managedModel, withdrawn],
        modelValue: null,
      },
      global: { mocks: { $t: tMock } },
    })

    const select = wrapper.get('[data-testid="llm-model-picker"]')
    await select.setValue(withdrawn.key)

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect((select.element as HTMLSelectElement).value).toBe('')
  })
})
