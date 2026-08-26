/**
 * AvatarTemplateForm.vue — LLM binding wiring (pluggable-conversation-llm PR
 * P8, tasks P8.5–P8.8 — RED).
 *
 * `LlmModelPicker`/`LlmModeExplainer`/`useLlmModels` already exist and are
 * green (P8.1–P8.4/P8.9); this file exercises the FORM wiring the PR P8
 * apply-progress marked BLOCKED — now unblocked by the api/ read surface
 * (`LlmModelResource.id`, `AvatarTemplateResource.llm_model_id` /
 * `llm_credential_id`).
 *
 * Non-negotiables carried from the batch brief:
 *   - the picker is keyed on the model's `key` (design D1's natural key), so
 *     this form must resolve `template.llm_model_id` (an integer FK) to the
 *     matching model's `key` for display, and resolve back to an `id` on
 *     submit — the exact mapping the read-surface gap made impossible before.
 *   - I1 (both-or-neither): clearing one binding field must clear the other.
 *   - I5's grandfathering trap: a template already bound to a model since
 *     marked `is_available: false` must still submit that model's id
 *     unchanged on an unrelated edit — the picker already renders it
 *     selectable-and-labelled; this form must not defeat that by dropping or
 *     nulling the selection on submit.
 *   - 422 codes `mode_unsupported` / `model_unavailable` (both keyed on
 *     `llm_model_id` server-side) and `credential_not_found` (keyed on
 *     `llm_credential_id`) map to real per-field messages, never the raw code
 *     left in the generic banner.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { LlmModel } from '../../../../app/types/llm'

const listModelsMock = vi.fn()
const listCredentialsMock = vi.fn()

vi.mock('../../../../app/composables/useLlmModels', () => ({
  useLlmModels: () => ({ listModels: listModelsMock }),
}))

vi.mock('../../../../app/composables/useLlmCredentials', () => ({
  useLlmCredentials: () => ({ listCredentials: listCredentialsMock }),
}))

const AvatarTemplateForm = (
  await import('../../../../app/components/organisms/AvatarTemplateForm.vue')
).default
const LlmModelPicker = (await import('../../../../app/components/molecules/LlmModelPicker.vue'))
  .default

function makeModel(overrides: Partial<LlmModel> & { id: number }): LlmModel & { id: number } {
  return {
    id: overrides.id,
    key: `model-${overrides.id}`,
    vendor: 'google',
    display_name: `Model ${overrides.id}`,
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
  } as LlmModel & { id: number }
}

const fieldSpecs = { heygen: [], tavus: [] }

function baseProps(template: Record<string, unknown> = {}) {
  return {
    template: {
      id: 1,
      name: 'A template',
      description: '',
      provider: 'tavus' as const,
      config: {},
      llm_model_id: null,
      llm_credential_id: null,
      ...template,
    },
    fieldSpecs,
    saving: false,
    submitError: null,
  }
}

beforeEach(() => {
  listModelsMock.mockReset().mockResolvedValue({ data: [] })
  listCredentialsMock.mockReset().mockResolvedValue({ data: [] })
})

async function submitForm(wrapper: ReturnType<typeof mount>): Promise<void> {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('AvatarTemplateForm — unbound badge (P8.5)', () => {
  it('shows the unbound badge when the template carries no llm_model_id', async () => {
    const wrapper = mount(AvatarTemplateForm, {
      props: baseProps(),
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="template-llm-unbound-badge"]').exists()).toBe(true)
  })

  it('hides the badge once the template resolves to a bound model', async () => {
    listModelsMock.mockResolvedValue({ data: [makeModel({ id: 5 })] })

    const wrapper = mount(AvatarTemplateForm, {
      props: baseProps({ llm_model_id: 5, llm_credential_id: 9 }),
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="template-llm-unbound-badge"]').exists()).toBe(false)
  })
})

describe('AvatarTemplateForm — id↔key resolution and round-trip (P8.6/P8.7)', () => {
  it('resolves llm_model_id to the matching model key for the picker, and back to the same id on submit', async () => {
    listModelsMock.mockResolvedValue({
      data: [makeModel({ id: 5 }), makeModel({ id: 6 })],
    })
    listCredentialsMock.mockResolvedValue({
      data: [{ id: 9, name: 'Prod Gemini key', vendor: 'google', key_last_four: '1234' }],
    })

    const wrapper = mount(AvatarTemplateForm, {
      props: baseProps({ llm_model_id: 5, llm_credential_id: 9 }),
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()

    const picker = wrapper.findComponent(LlmModelPicker)
    expect(picker.props('modelValue')).toBe('model-5')

    await submitForm(wrapper)

    const emitted = wrapper.emitted('submit')
    expect(emitted).toBeDefined()
    const payload = emitted![emitted!.length - 1]![0] as Record<string, unknown>
    expect(payload.llm_model_id).toBe(5)
    expect(payload.llm_credential_id).toBe(9)
  })

  it('keeps a grandfathered (withdrawn) binding on an unrelated edit — never drops or nulls it on submit', async () => {
    // I5: the model is now is_available: false, but the registry never
    // deletes it — it stays in the list, still resolvable by id.
    listModelsMock.mockResolvedValue({
      data: [makeModel({ id: 7, is_available: false })],
    })
    listCredentialsMock.mockResolvedValue({
      data: [{ id: 3, name: 'Legacy key', vendor: 'google', key_last_four: '5555' }],
    })

    const wrapper = mount(AvatarTemplateForm, {
      props: baseProps({ llm_model_id: 7, llm_credential_id: 3 }),
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()

    const picker = wrapper.findComponent(LlmModelPicker)
    expect(picker.props('modelValue')).toBe('model-7')

    // An UNRELATED edit — renaming the template — must not disturb the
    // grandfathered binding.
    await wrapper.get('[data-testid="template-field-name"]').setValue('Renamed template')
    await submitForm(wrapper)

    const emitted = wrapper.emitted('submit')
    const payload = emitted![emitted!.length - 1]![0] as Record<string, unknown>
    expect(payload.name).toBe('Renamed template')
    expect(payload.llm_model_id).toBe(7)
    expect(payload.llm_credential_id).toBe(3)
  })
})

describe('AvatarTemplateForm — both-or-neither (I1, non-negotiable #2)', () => {
  it('clearing the model also clears the credential', async () => {
    listModelsMock.mockResolvedValue({ data: [makeModel({ id: 5 })] })
    listCredentialsMock.mockResolvedValue({
      data: [{ id: 9, name: 'Prod Gemini key', vendor: 'google', key_last_four: '1234' }],
    })

    const wrapper = mount(AvatarTemplateForm, {
      props: baseProps({ llm_model_id: 5, llm_credential_id: 9 }),
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()

    await wrapper.findComponent(LlmModelPicker).vm.$emit('update:modelValue', null)
    await flushPromises()

    await submitForm(wrapper)

    const emitted = wrapper.emitted('submit')
    const payload = emitted![emitted!.length - 1]![0] as Record<string, unknown>
    expect(payload.llm_model_id).toBeNull()
    expect(payload.llm_credential_id).toBeNull()
  })

  it('clearing the credential also clears the model', async () => {
    listModelsMock.mockResolvedValue({ data: [makeModel({ id: 5 })] })
    listCredentialsMock.mockResolvedValue({
      data: [{ id: 9, name: 'Prod Gemini key', vendor: 'google', key_last_four: '1234' }],
    })

    const wrapper = mount(AvatarTemplateForm, {
      props: baseProps({ llm_model_id: 5, llm_credential_id: 9 }),
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="template-llm-credential"]').setValue('')
    await submitForm(wrapper)

    const emitted = wrapper.emitted('submit')
    const payload = emitted![emitted!.length - 1]![0] as Record<string, unknown>
    expect(payload.llm_model_id).toBeNull()
    expect(payload.llm_credential_id).toBeNull()
  })
})

describe('AvatarTemplateForm — 422 mapping (non-negotiable #4)', () => {
  it('maps model_unavailable onto the model field, not the generic banner', async () => {
    const wrapper = mount(AvatarTemplateForm, {
      props: {
        ...baseProps(),
        submitError: { status: 422, data: { errors: { llm_model_id: ['model_unavailable'] } } },
      },
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="template-llm-model-error"]').text()).toContain(
      'avatar_templates.error.llm.model_unavailable'
    )
    expect(wrapper.find('[data-testid="template-form-errors"]').exists()).toBe(false)
  })

  it('maps mode_unsupported onto the model field', async () => {
    const wrapper = mount(AvatarTemplateForm, {
      props: {
        ...baseProps(),
        submitError: { status: 422, data: { errors: { llm_model_id: ['mode_unsupported'] } } },
      },
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="template-llm-model-error"]').text()).toContain(
      'avatar_templates.error.llm.mode_unsupported'
    )
  })

  it('maps credential_not_found onto the credential field, without distinguishing its two server causes', async () => {
    const wrapper = mount(AvatarTemplateForm, {
      props: {
        ...baseProps(),
        submitError: {
          status: 422,
          data: { errors: { llm_credential_id: ['credential_not_found'] } },
        },
      },
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="template-llm-credential-error"]').text()).toContain(
      'avatar_templates.error.llm.credential_not_found'
    )
    expect(wrapper.find('[data-testid="template-form-errors"]').exists()).toBe(false)
  })
})
