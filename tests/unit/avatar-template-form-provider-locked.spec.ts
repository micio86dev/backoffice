/**
 * Once a template exists its provider cannot change. The select is disabled,
 * and the reason is wired to it with `aria-describedby`, so a screen reader
 * says why rather than only "unavailable".
 */
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AvatarTemplateForm from '../../app/components/organisms/AvatarTemplateForm.vue'

vi.mock('@/composables/useLlmModels', () => ({
  useLlmModels: () => ({ listModels: () => Promise.resolve({ data: [] }) }),
}))
vi.mock('@/composables/useLlmCredentials', () => ({
  useLlmCredentials: () => ({ listCredentials: () => Promise.resolve({ data: [] }) }),
}))

async function mountForm(template: Record<string, unknown>) {
  const wrapper = mount(AvatarTemplateForm, {
    props: {
      template: { name: 'T', provider: 'heygen', config: {}, ...template },
      fieldSpecs: { heygen: [], tavus: [] },
      saving: false,
      submitError: null,
    },
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  })
  await flushPromises()

  return wrapper
}

describe('provider select, locked after creation', () => {
  it('points the disabled select at its reason', async () => {
    const wrapper = await mountForm({ id: 7 })
    const select = wrapper.get('#template-provider')

    expect(select.attributes('disabled')).toBeDefined()
    expect(select.attributes('aria-describedby')).toBe('template-provider-locked')
    expect(wrapper.get('#template-provider-locked').text()).toBe(
      'avatar_templates.form.provider_locked'
    )
  })

  it('has no description while the provider can still be chosen', async () => {
    const wrapper = await mountForm({})

    expect(wrapper.get('#template-provider').attributes('aria-describedby')).toBeUndefined()
    expect(wrapper.find('#template-provider-locked').exists()).toBe(false)
  })
})
