/**
 * The manual id input (shown when the provider is down, and, opted in per
 * field, when the catalogue is empty) must carry the same validation wiring as
 * the trigger: the form hands `aria-invalid` / `aria-describedby` to the
 * combobox, and without them a screen reader meets an unlabelled-by-error text
 * field while the error sits unlinked in the DOM.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import AvatarTemplateProviderCombobox from '../../app/components/organisms/AvatarTemplateProviderCombobox.vue'

const fetchCatalogue = vi.fn()
vi.mock('@/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ fetchCatalogue }),
}))

const MANUAL = '[data-testid="template-config-hr_avatar_config_id-manual"]'

async function openManual(response: unknown, attrs: Record<string, unknown>) {
  fetchCatalogue.mockResolvedValue(response)
  const wrapper = mount(AvatarTemplateProviderCombobox, {
    props: {
      field: {
        key: 'hr_avatar_config_id',
        type: 'text' as const,
        label_key: 'x',
        catalogue_resource: 'avatar_config' as const,
      },
      provider: 'hr_avatar',
      modelValue: 'avc_bad',
      manualOnEmpty: true,
    },
    attrs,
    attachTo: document.body,
  })
  await flushPromises()
  await wrapper.get('[role="combobox"]').trigger('click')
  await flushPromises()

  return wrapper
}

const INVALID = {
  'aria-invalid': true,
  'aria-describedby': 'template-config-hr_avatar_config_id-error',
}

describe.each([
  ['an empty catalogue', { status: 'empty', items: [] }],
  ['a provider error', { status: 'provider_error', items: [], code: 'provider_unreachable' }],
])('manual entry after %s', (_label, response) => {
  it('links the input to the validation error and marks it invalid', async () => {
    const input = (await openManual(response, INVALID)).get(MANUAL)

    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe(INVALID['aria-describedby'])
  })

  it('adds neither attribute when the form passed none', async () => {
    const input = (await openManual(response, {})).get(MANUAL)

    expect(input.attributes('aria-invalid')).toBeUndefined()
    expect(input.attributes('aria-describedby')).toBeUndefined()
  })
})

describe('manual entry follows the form as the error comes and goes', () => {
  it('updates the wiring when the form later reports an error', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'empty', items: [] })
    const invalid = ref(false)
    const Host = defineComponent({
      render: () =>
        h(AvatarTemplateProviderCombobox, {
          field: {
            key: 'hr_avatar_config_id',
            type: 'text',
            label_key: 'x',
            catalogue_resource: 'avatar_config',
          },
          provider: 'hr_avatar',
          modelValue: '',
          manualOnEmpty: true,
          'aria-invalid': invalid.value,
          'aria-describedby': invalid.value ? INVALID['aria-describedby'] : undefined,
        }),
    })
    const wrapper = mount(Host, { attachTo: document.body })
    await flushPromises()
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()
    expect(wrapper.get(MANUAL).attributes('aria-describedby')).toBeUndefined()

    invalid.value = true
    await flushPromises()

    expect(wrapper.get(MANUAL).attributes('aria-invalid')).toBe('true')
    expect(wrapper.get(MANUAL).attributes('aria-describedby')).toBe(INVALID['aria-describedby'])
  })
})
