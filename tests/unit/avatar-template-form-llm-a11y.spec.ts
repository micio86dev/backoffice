/**
 * A refused LLM binding is announced on focus: both selects point at their
 * error with `aria-describedby` and carry `aria-invalid`, and the error
 * elements own the ids those attributes reference.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AvatarTemplateForm from '../../app/components/organisms/AvatarTemplateForm.vue'

vi.mock('@/composables/useLlmModels', () => ({
  useLlmModels: () => ({
    listModels: () =>
      Promise.resolve({
        data: [{ id: 1, key: 'm1', display_name: 'M1', mode: 'managed', is_available: true }],
      }),
  }),
}))
vi.mock('@/composables/useLlmCredentials', () => ({
  useLlmCredentials: () => ({ listCredentials: () => Promise.resolve({ data: [] }) }),
}))

async function mountWith(submitError: unknown) {
  const wrapper = mount(AvatarTemplateForm, {
    props: {
      template: { name: 'T', provider: 'heygen', config: {} },
      fieldSpecs: { heygen: [], tavus: [] },
      saving: false,
      submitError,
    },
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  })
  await flushPromises()

  return wrapper
}

describe('LLM binding error wiring', () => {
  it('links the model select to its error', async () => {
    const wrapper = await mountWith({
      status: 422,
      data: { errors: { llm_model_id: ['model_unavailable'] } },
    })

    const select = wrapper.get('#template-llm-model')
    expect(select.attributes('aria-invalid')).toBe('true')
    expect(select.attributes('aria-describedby')).toBe('template-llm-model-error')
    expect(wrapper.get('#template-llm-model-error').text()).toContain('model_unavailable')
  })

  it('links the credential select to its error', async () => {
    const wrapper = await mountWith({
      status: 422,
      data: { errors: { llm_credential_id: ['credential_not_found'] } },
    })

    const select = wrapper.get('#template-llm-credential')
    expect(select.attributes('aria-describedby')).toBe('template-llm-credential-error')
    expect(wrapper.get('#template-llm-credential-error').text()).toContain('credential_not_found')
  })

  it('adds neither attribute while there is no error', async () => {
    const wrapper = await mountWith(null)

    expect(wrapper.get('#template-llm-model').attributes('aria-describedby')).toBeUndefined()
    expect(wrapper.get('#template-llm-model').attributes('aria-invalid')).toBeUndefined()
    expect(wrapper.get('#template-llm-credential').attributes('aria-describedby')).toBeUndefined()
  })
})
