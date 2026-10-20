/**
 * The closed-trigger loading announcement lives OUTSIDE the combobox button:
 * the children of a button are presentational, so a status region nested in
 * it may never reach assistive tech. The button keeps the visible text and
 * `aria-busy`; a sibling live region carries the announcement.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import AvatarTemplateProviderCombobox from '../../app/components/organisms/AvatarTemplateProviderCombobox.vue'

const fetchCatalogue = vi.fn()
vi.mock('@/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ fetchCatalogue }),
}))

describe('closed-trigger loading announcement', () => {
  it('puts the status region beside the trigger, not inside it', async () => {
    fetchCatalogue.mockReturnValue(new Promise(() => undefined))
    const wrapper = mount(AvatarTemplateProviderCombobox, {
      props: {
        field: {
          key: 'voiceId',
          type: 'text' as const,
          label_key: 'x',
          catalogue_resource: 'voice' as const,
        },
        provider: 'heygen',
        modelValue: '',
      },
      attachTo: document.body,
    })
    await flushPromises()

    const trigger = wrapper.get('[role="combobox"]')
    const regions = wrapper.findAll('[role="status"]')

    expect(regions).toHaveLength(1)
    expect(trigger.find('[role="status"]').exists()).toBe(false)
    expect(regions[0]!.text()).toBe('avatar_templates.form.catalogue.loading')
    expect(trigger.attributes('aria-busy')).toBe('true')
  })

  // A live region announces CHANGES to its content: one inserted into the DOM
  // with its text already inside is frequently not announced at all. So it is
  // mounted empty, filled after mount, and emptied when loading ends.
  it('mounts the region empty, fills it after mount and empties it when loaded', async () => {
    let resolve!: (value: unknown) => void
    fetchCatalogue.mockReturnValue(new Promise((r) => (resolve = r)))
    const wrapper = mount(AvatarTemplateProviderCombobox, {
      props: {
        field: {
          key: 'voiceId',
          type: 'text' as const,
          label_key: 'x',
          catalogue_resource: 'voice' as const,
        },
        provider: 'heygen',
        modelValue: '',
      },
      attachTo: document.body,
    })

    const region = wrapper.get('[role="status"]')
    expect(region.text()).toBe('')

    await nextTick()
    expect(wrapper.get('[role="status"]').element).toBe(region.element)
    expect(region.text()).toBe('avatar_templates.form.catalogue.loading')

    resolve({ status: 'ok', items: [] })
    await flushPromises()
    expect(wrapper.get('[role="status"]').element).toBe(region.element)
    expect(region.text()).toBe('')
  })
})
