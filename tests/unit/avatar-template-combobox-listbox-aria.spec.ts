/**
 * ARIA ownership of the combobox listbox. A `listbox` may own only `option`
 * (or `group`) elements. The voice rows used to put their sample controls in a
 * wrapper with `role="none"`, which is transparent, so the play buttons became
 * direct children of the listbox. Each row is now a labelled `group` holding
 * exactly one `option`, with its sample controls beside it inside the group.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AvatarTemplateProviderCombobox from '../../app/components/organisms/AvatarTemplateProviderCombobox.vue'
import type { FieldSpec } from '../../app/types/avatar-template'

const entry = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  provider: 'elevenlabs',
  label: `Voice ${id}`,
  name: `Voice ${id}`,
  language: 'it',
  locale: null,
  accent: null,
  italian: 'native',
  preview_image_url: null,
  preview_audio_url: `https://example.test/${id}.mp3`,
  preview_video_url: null,
  ...over,
})

const fetchCatalogue = vi.fn()
vi.mock('@/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ fetchCatalogue }),
}))

const voiceField: FieldSpec = {
  key: 'ttsExternalVoiceId',
  type: 'text',
  label_key: 'x',
  catalogue_resource: 'voice',
}

async function openList(resource: 'voice' | 'avatar') {
  fetchCatalogue.mockResolvedValue({
    status: 'ok',
    items: [entry('v1'), entry('v2', { preview_audio_url: null })],
  })
  const wrapper = mount(AvatarTemplateProviderCombobox, {
    props: {
      field: { ...voiceField, catalogue_resource: resource },
      provider: 'elevenlabs',
      modelValue: '',
    },
    attachTo: document.body,
  })
  await flushPromises()
  await wrapper.get('[role="combobox"]').trigger('click')
  await flushPromises()

  return wrapper
}

describe('combobox listbox ARIA ownership', () => {
  it.each(['voice', 'avatar'] as const)(
    'owns only option or group elements for a %s list',
    async (resource) => {
      const wrapper = await openList(resource)
      const listbox = wrapper.get('[role="listbox"]').element

      expect(listbox.children.length).toBeGreaterThan(0)
      for (const child of Array.from(listbox.children)) {
        expect(['option', 'group']).toContain(child.getAttribute('role'))
      }
    }
  )

  it('makes each row a named group with exactly one option, controls beside it', async () => {
    const wrapper = await openList('voice')
    const rows = wrapper.findAll('[role="listbox"] > [role="group"]')

    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.attributes('aria-label')).toMatch(/^Voice v/)
      expect(row.findAll('[role="option"]')).toHaveLength(1)
    }
    // The sample control lives in the same group, never as a listbox child.
    expect(rows[0]!.find('[data-testid$="-play-v1"]').exists()).toBe(true)
  })

  it('keeps selecting by clicking the option', async () => {
    const wrapper = await openList('voice')

    await wrapper.get('[role="option"]').trigger('click')

    expect(wrapper.emitted('change')?.[0]).toEqual(['v1'])
  })

  it('points aria-controls at the panel only while the panel exists', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: [entry('v1')] })
    const wrapper = mount(AvatarTemplateProviderCombobox, {
      props: { field: voiceField, provider: 'elevenlabs', modelValue: '' },
      attachTo: document.body,
    })
    await flushPromises()
    const trigger = wrapper.get('[role="combobox"]')

    expect(trigger.attributes('aria-controls')).toBeUndefined()

    await trigger.trigger('click')
    await flushPromises()

    expect(trigger.attributes('aria-controls')).toBeDefined()
    expect(wrapper.find(`#${trigger.attributes('aria-controls')}`).exists()).toBe(true)
  })

  it('gives the listbox an accessible name and uses elements that allow the roles', async () => {
    const wrapper = await openList('voice')
    const listbox = wrapper.get('[role="listbox"]')

    expect(listbox.attributes('aria-label')).toBe('x')
    // `ul`/`li` do not allow the listbox/group roles; a neutral `div` does.
    expect(listbox.element.tagName).toBe('DIV')
    for (const row of Array.from(listbox.element.children)) {
      expect(row.tagName).toBe('DIV')
    }
  })
})
