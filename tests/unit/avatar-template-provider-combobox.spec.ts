/**
 * AvatarTemplateProviderCombobox — the provider-catalogue picker
 * (avatar-template-catalogue PR4, design D4/D5/D7).
 *
 * Built on PR3's `combobox` primitives (reka-ui `Combobox`, which teleports
 * its list content to `document.body` via `ComboboxPortal` — confirmed by
 * `combobox-composition.spec.ts`), so every assertion below that needs the
 * rendered list queries `document.body`, not the mounted wrapper. Selecting
 * an item closes the uncontrolled popover and unmounts the item node
 * immediately, so selection is asserted on the emitted `change` value, never
 * on lingering DOM state.
 *
 * D7 is the point of this file: selecting a catalogue entry and typing a
 * value manually both emit `change` with the exact plain string the parent's
 * existing `onFieldChange()` already knows how to write (or drop, on empty)
 * — there is no second, parallel write path in this component.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, DOMWrapper } from '@vue/test-utils'
import AvatarTemplateProviderCombobox from '../../app/components/organisms/AvatarTemplateProviderCombobox.vue'
import type { CatalogueEntry, FieldSpec, ProviderName } from '../../app/types/avatar-template'

const fetchCatalogue = vi.fn()

vi.mock('@/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ fetchCatalogue }),
}))

const VOICE_FIELD: FieldSpec = {
  key: 'voiceId',
  type: 'text',
  label_key: 'avatar_templates.field.voiceId',
  catalogue_resource: 'voice',
}

const AVATAR_FIELD: FieldSpec = {
  key: 'avatarId',
  type: 'text',
  label_key: 'avatar_templates.field.avatarId',
  catalogue_resource: 'avatar',
}

function entry(over: Partial<CatalogueEntry> = {}): CatalogueEntry {
  return {
    id: 'v1',
    label: 'Alessandra - IA',
    language: 'en',
    preview_image_url: null,
    preview_audio_url: null,
    ...over,
  }
}

function byTestId(id: string): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
}

function mountCombobox(
  props: Partial<{ field: FieldSpec; provider: ProviderName; modelValue: string }> = {}
) {
  const field = props.field ?? VOICE_FIELD

  return mount(AvatarTemplateProviderCombobox, {
    props: {
      field,
      provider: 'heygen',
      modelValue: '',
      ...props,
    },
    attrs: {
      id: `template-config-${field.key}`,
      'data-testid': `template-config-${field.key}`,
    },
    attachTo: document.body,
  })
}

async function openPopover(wrapper: ReturnType<typeof mountCombobox>): Promise<void> {
  await wrapper.get('input').trigger('focus')
  await flushPromises()
}

afterEach(() => {
  document.body.innerHTML = ''
})

beforeEach(() => {
  fetchCatalogue.mockReset()
})

describe('filtering (D4)', () => {
  it('filters by label as the operator types', async () => {
    fetchCatalogue.mockResolvedValue({
      status: 'ok',
      items: [entry({ id: 'v1', label: 'Alessandra - IA' }), entry({ id: 'v2', label: 'Marco' })],
    })
    const wrapper = mountCombobox()
    await flushPromises()
    await openPopover(wrapper)

    await wrapper.get('input').setValue('Marco')
    await flushPromises()

    expect(byTestId('template-config-voiceId-item-v2')).not.toBeNull()
    expect(byTestId('template-config-voiceId-item-v1')).toBeNull()
  })

  it('a language filter excludes a null-language entry, never matching it as "any"', async () => {
    fetchCatalogue.mockResolvedValue({
      status: 'ok',
      items: [
        entry({ id: 'v1', label: 'Alessandra - IA', language: 'en' }),
        entry({ id: 'v2', label: 'No-language voice', language: null }),
      ],
    })
    const wrapper = mountCombobox()
    await flushPromises()
    await openPopover(wrapper)

    const filter = byTestId('template-config-voiceId-language-filter')
    expect(filter).not.toBeNull()
    await new DOMWrapper(filter as HTMLSelectElement).setValue('en')
    await flushPromises()

    expect(byTestId('template-config-voiceId-item-v1')).not.toBeNull()
    // D4: null is never a match for a specific language filter — the exact
    // protection this feature exists to provide (the "Alessandra" bug).
    expect(byTestId('template-config-voiceId-item-v2')).toBeNull()
  })
})

describe('preview controls (D5)', () => {
  it('renders a play control for a voice entry with a preview_audio_url', async () => {
    fetchCatalogue.mockResolvedValue({
      status: 'ok',
      items: [entry({ id: 'v1', preview_audio_url: 'https://cdn.example/a.mp3' })],
    })
    const wrapper = mountCombobox()
    await flushPromises()
    await openPopover(wrapper)

    expect(byTestId('template-config-voiceId-preview-v1')).not.toBeNull()
  })

  it('renders no play control for a voice entry with no preview_audio_url', async () => {
    fetchCatalogue.mockResolvedValue({
      status: 'ok',
      items: [entry({ id: 'v1', preview_audio_url: null })],
    })
    const wrapper = mountCombobox()
    await flushPromises()
    await openPopover(wrapper)

    expect(byTestId('template-config-voiceId-preview-v1')).toBeNull()
  })

  it('renders a thumbnail for an avatar entry with a preview_image_url, never a play control for it', async () => {
    fetchCatalogue.mockResolvedValue({
      status: 'ok',
      items: [
        entry({ id: 'a1', label: 'Face one', preview_image_url: 'https://cdn.example/a.png' }),
      ],
    })
    const wrapper = mountCombobox({ field: AVATAR_FIELD })
    await flushPromises()
    await openPopover(wrapper)

    expect(byTestId('template-config-avatarId-thumb-a1')).not.toBeNull()
    expect(byTestId('template-config-avatarId-preview-a1')).toBeNull()
  })

  it('renders neither control for an entry with no preview media at all — no broken img/audio tag', async () => {
    fetchCatalogue.mockResolvedValue({
      status: 'ok',
      items: [
        entry({ id: 'a1', label: 'No preview', preview_image_url: null, preview_audio_url: null }),
      ],
    })
    const wrapper = mountCombobox({ field: AVATAR_FIELD })
    await flushPromises()
    await openPopover(wrapper)

    expect(byTestId('template-config-avatarId-thumb-a1')).toBeNull()
    expect(byTestId('template-config-avatarId-preview-a1')).toBeNull()
  })
})

describe('selection and manual entry both route through the same change event (D7)', () => {
  it('emits change with the selected entry id (asserted on the emitted value, not lingering DOM state)', async () => {
    fetchCatalogue.mockResolvedValue({
      status: 'ok',
      items: [entry({ id: 'v1', label: 'Alessandra - IA' })],
    })
    const wrapper = mountCombobox()
    await flushPromises()
    await openPopover(wrapper)

    byTestId('template-config-voiceId-item-v1')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    )
    await flushPromises()

    expect(wrapper.emitted('change')?.at(-1)).toEqual(['v1'])
  })

  it('typing manually emits change with the exact typed text, unchanged from a plain text input', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: [] })
    const wrapper = mountCombobox()
    await flushPromises()

    await wrapper.get('input').setValue('hand-typed-id')

    expect(wrapper.emitted('change')?.at(-1)).toEqual(['hand-typed-id'])
  })

  it("clearing the manually typed value emits change(''), which onFieldChange already reads as drop-the-key", async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: [] })
    const wrapper = mountCombobox({ modelValue: 'existing-id' })
    await flushPromises()

    await wrapper.get('input').setValue('')

    expect(wrapper.emitted('change')?.at(-1)).toEqual([''])
  })
})

describe('preview playback (D5)', () => {
  it("plays the entry's audio on click and toggles to pause on a second click", async () => {
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const pauseSpy = vi
      .spyOn(window.HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined)

    fetchCatalogue.mockResolvedValue({
      status: 'ok',
      items: [entry({ id: 'v1', preview_audio_url: 'https://cdn.example/a.mp3' })],
    })
    const wrapper = mountCombobox()
    await flushPromises()
    await openPopover(wrapper)

    const playButton = byTestId('template-config-voiceId-preview-v1')
    expect(playButton).not.toBeNull()

    playButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(playSpy).toHaveBeenCalledTimes(1)

    playButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(pauseSpy).toHaveBeenCalledTimes(1)

    playSpy.mockRestore()
    pauseSpy.mockRestore()
  })
})

describe('empty/unavailable hint (never a silently blank list)', () => {
  it('degrades to the unavailable hint when the fetch itself rejects (a frontend-side failure, not just the API-reported status)', async () => {
    fetchCatalogue.mockRejectedValue(new Error('network error'))
    const wrapper = mountCombobox()
    await flushPromises()
    await openPopover(wrapper)

    expect(byTestId('template-config-voiceId-empty-hint')).not.toBeNull()
  })

  it('shows an explanatory hint when the catalogue is empty for the current filter', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: [] })
    const wrapper = mountCombobox()
    await flushPromises()
    await openPopover(wrapper)

    expect(byTestId('template-config-voiceId-empty-hint')).not.toBeNull()
  })

  it('shows a hint, not a blank list, when the fetch degrades to status: unavailable', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'unavailable', items: [] })
    const wrapper = mountCombobox()
    await flushPromises()
    await openPopover(wrapper)

    expect(byTestId('template-config-voiceId-empty-hint')).not.toBeNull()
  })

  it('still allows manual entry when the catalogue is unavailable', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'unavailable', items: [] })
    const wrapper = mountCombobox()
    await flushPromises()

    const input = wrapper.get('input')
    await input.setValue('manually-typed')

    expect(wrapper.emitted('change')?.at(-1)).toEqual(['manually-typed'])
    expect((input.element as HTMLInputElement).disabled).toBe(false)
  })
})
