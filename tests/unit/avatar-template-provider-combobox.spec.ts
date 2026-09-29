/**
 * AvatarTemplateProviderCombobox — the provider-catalogue picker.
 *
 * Root causes this file pins (template-provider-fixes T6):
 *  - the old picker reopened itself on every focus event, so a selection that
 *    returned focus to the input reopened the list it had just closed;
 *  - every picker owned an independent `isOpen`, so two lists could be open at
 *    once;
 *  - a selection wrote the raw id into the search box, which then filtered the
 *    list by LABEL and produced an empty list;
 *  - the list was teleported, so an outside click was never observed.
 *
 * The picker is now inline (no teleport) and single-open by construction, so
 * assertions query the mounted wrapper directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AvatarTemplateProviderCombobox from '../../app/components/organisms/AvatarTemplateProviderCombobox.vue'
import type {
  CatalogueEntry,
  CatalogueProvider,
  CatalogueResource,
} from '../../app/types/avatar-template'

const fetchCatalogue = vi.fn()

vi.mock('@/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ fetchCatalogue }),
}))

function entry(over: Partial<CatalogueEntry> = {}): CatalogueEntry {
  return {
    id: 'v1',
    provider: 'heygen',
    label: 'Alessandra',
    name: 'Alessandra',
    language: 'it',
    locale: 'it-IT',
    accent: 'northern',
    italian: 'native',
    preview_image_url: null,
    preview_audio_url: null,
    preview_video_url: null,
    ...over,
  }
}

const VOICES = [
  entry({ id: 'v-it', label: 'Alessandra', name: 'Alessandra', italian: 'native' }),
  entry({
    id: 'v-en',
    label: 'John',
    name: 'John',
    language: 'en',
    locale: 'en-US',
    accent: 'american',
    italian: null,
  }),
  entry({
    id: 'v-multi',
    label: 'Multi',
    name: 'Multi',
    language: 'en',
    locale: null,
    accent: null,
    italian: 'multilingual',
  }),
]

function mountPicker(
  props: Partial<{
    fieldKey: string
    resource: CatalogueResource
    provider: CatalogueProvider
    modelValue: string
  }> = {}
) {
  const fieldKey = props.fieldKey ?? 'voiceId'

  return mount(AvatarTemplateProviderCombobox, {
    props: {
      field: {
        key: fieldKey,
        type: 'text' as const,
        label_key: `avatar_templates.field.${fieldKey}`,
        catalogue_resource: props.resource ?? 'voice',
      },
      provider: props.provider ?? 'heygen',
      modelValue: props.modelValue ?? '',
    },
    attrs: {
      id: `template-config-${fieldKey}`,
      'data-testid': `template-config-${fieldKey}`,
    },
    attachTo: document.body,
  })
}

type Picker = ReturnType<typeof mountPicker>

const P = 'template-config-voiceId'
const sel = (id: string) => `[data-testid="${id}"]`

async function open(wrapper: Picker, prefix = P): Promise<void> {
  await wrapper.get(sel(prefix)).trigger('click')
  await flushPromises()
}

beforeEach(() => {
  fetchCatalogue.mockReset()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('loading the catalogue', () => {
  it('shows the loading state on the trigger while the panel is closed', async () => {
    let resolve: (value: unknown) => void = () => undefined
    fetchCatalogue.mockReturnValue(new Promise((r) => (resolve = r)))
    const wrapper = mountPicker()
    await flushPromises()

    const trigger = wrapper.get(sel(P))
    expect(wrapper.find(sel(`${P}-panel`)).exists()).toBe(false)
    expect(trigger.attributes('aria-busy')).toBe('true')
    expect(wrapper.get(sel(`${P}-trigger-loading`)).text()).toBe(
      'avatar_templates.form.catalogue.loading'
    )
    // It replaces the idle prompt rather than sitting beside it.
    expect(trigger.text()).not.toContain('avatar_templates.form.catalogue.choose')

    resolve({ status: 'ok', items: VOICES })
    await flushPromises()

    expect(wrapper.find(sel(`${P}-trigger-loading`)).exists()).toBe(false)
    expect(trigger.attributes('aria-busy')).toBeUndefined()
    expect(trigger.text()).toContain('avatar_templates.form.catalogue.choose')
  })

  it('keeps the current id visible on the trigger while loading', async () => {
    fetchCatalogue.mockReturnValue(new Promise(() => undefined))
    const wrapper = mountPicker({ modelValue: 'v-known' })
    await flushPromises()

    expect(wrapper.get(sel(P)).text()).toContain('v-known')
    expect(wrapper.find(sel(`${P}-trigger-loading`)).exists()).toBe(true)
  })

  it('announces loading once: only one status region while the panel is open', async () => {
    fetchCatalogue.mockReturnValue(new Promise(() => undefined))
    const wrapper = mountPicker()
    await open(wrapper)

    expect(wrapper.findAll('[role="status"]')).toHaveLength(1)
    expect(wrapper.find(sel(`${P}-loading`)).exists()).toBe(true)
  })

  it('has a single status region on the closed trigger', async () => {
    fetchCatalogue.mockReturnValue(new Promise(() => undefined))
    const wrapper = mountPicker()
    await flushPromises()

    expect(wrapper.findAll('[role="status"]')).toHaveLength(1)
  })

  it('does not show the trigger loading state after an error', async () => {
    fetchCatalogue.mockResolvedValue({
      status: 'provider_error',
      items: [],
      code: 'provider_unreachable',
    })
    const wrapper = mountPicker()
    await flushPromises()

    expect(wrapper.find(sel(`${P}-trigger-loading`)).exists()).toBe(false)
    expect(wrapper.get(sel(P)).attributes('aria-busy')).toBeUndefined()
  })

  it('asks the API for the field provider and resource', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    mountPicker({ provider: 'cartesia', resource: 'voice' })
    await flushPromises()

    expect(fetchCatalogue).toHaveBeenCalledWith('cartesia', 'voice')
  })

  it('shows a loading state until the list arrives', async () => {
    let resolve: (value: unknown) => void = () => undefined
    fetchCatalogue.mockReturnValue(new Promise((r) => (resolve = r)))
    const wrapper = mountPicker()
    await open(wrapper)

    expect(wrapper.find(sel(`${P}-loading`)).exists()).toBe(true)

    resolve({ status: 'ok', items: VOICES })
    await flushPromises()

    expect(wrapper.find(sel(`${P}-loading`)).exists()).toBe(false)
    expect(wrapper.find(sel(`${P}-item-v-it`)).exists()).toBe(true)
  })

  it('reloads the right list when the provider changes', async () => {
    fetchCatalogue.mockResolvedValueOnce({ status: 'ok', items: VOICES })
    const wrapper = mountPicker({ provider: 'heygen' })
    await flushPromises()

    fetchCatalogue.mockResolvedValueOnce({
      status: 'ok',
      items: [entry({ id: 'el-1', provider: 'elevenlabs', label: 'Rachel' })],
    })
    await wrapper.setProps({ provider: 'elevenlabs' })
    await flushPromises()
    await open(wrapper)

    expect(fetchCatalogue).toHaveBeenLastCalledWith('elevenlabs', 'voice')
    expect(wrapper.find(sel(`${P}-item-el-1`)).exists()).toBe(true)
    expect(wrapper.find(sel(`${P}-item-v-it`)).exists()).toBe(false)
  })

  it('ignores a slow answer for a provider it has since left', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined
    fetchCatalogue.mockReturnValueOnce(new Promise((r) => (resolveFirst = r)))
    const wrapper = mountPicker({ provider: 'heygen' })

    fetchCatalogue.mockResolvedValueOnce({
      status: 'ok',
      items: [entry({ id: 'el-1', label: 'Rachel' })],
    })
    await wrapper.setProps({ provider: 'elevenlabs' })
    await flushPromises()

    resolveFirst({ status: 'ok', items: VOICES })
    await flushPromises()
    await open(wrapper)

    expect(wrapper.find(sel(`${P}-item-el-1`)).exists()).toBe(true)
    expect(wrapper.find(sel(`${P}-item-v-it`)).exists()).toBe(false)
  })
})

describe('what an option shows', () => {
  it('shows provider, name, language/locale, provider voice id and accent', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    const text = wrapper.get(sel(`${P}-item-v-it`)).text()

    expect(text).toContain('Alessandra')
    expect(text).toContain('avatar_templates.provider.heygen')
    expect(text).toContain('it-IT')
    expect(text).toContain('v-it')
    expect(text).toContain('northern')
  })

  it('falls back to the bare language when the entry has no locale', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    expect(wrapper.get(sel(`${P}-item-v-multi`)).text()).toContain('en')
  })

  it('badges native Italian and multilingual voices, and nothing else', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    expect(wrapper.find(sel(`${P}-italian-badge-v-it`)).text()).toBe(
      'avatar_templates.form.catalogue.italianNative'
    )
    expect(wrapper.find(sel(`${P}-italian-badge-v-multi`)).text()).toBe(
      'avatar_templates.form.catalogue.italianMultilingual'
    )
    expect(wrapper.find(sel(`${P}-italian-badge-v-en`)).exists()).toBe(false)
  })

  it('keeps the API order, which is native Italian first', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    const ids = wrapper.findAll('[role="option"]').map((o) => o.attributes('data-testid'))

    expect(ids[0]).toBe(`${P}-item-v-it`)
  })
})

describe('the Italian-only toggle', () => {
  it('is offered for voices and hides every non-native voice', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    await wrapper.get(sel(`${P}-italian-only`)).trigger('click')

    expect(wrapper.find(sel(`${P}-item-v-it`)).exists()).toBe(true)
    expect(wrapper.find(sel(`${P}-item-v-en`)).exists()).toBe(false)
    expect(wrapper.find(sel(`${P}-item-v-multi`)).exists()).toBe(false)
  })

  it('is not offered for avatars', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: [entry({ id: 'a1' })] })
    const wrapper = mountPicker({ fieldKey: 'avatarId', resource: 'avatar' })
    await flushPromises()
    await open(wrapper, 'template-config-avatarId')

    expect(wrapper.find(sel('template-config-avatarId-italian-only')).exists()).toBe(false)
  })
})

describe('search', () => {
  it('matches label, language, accent and provider id', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    await wrapper.get(sel(`${P}-search`)).setValue('american')

    expect(wrapper.find(sel(`${P}-item-v-en`)).exists()).toBe(true)
    expect(wrapper.find(sel(`${P}-item-v-it`)).exists()).toBe(false)

    await wrapper.get(sel(`${P}-search`)).setValue('v-multi')

    expect(wrapper.find(sel(`${P}-item-v-multi`)).exists()).toBe(true)
  })

  it('does not throw when the provider omits optional fields entirely', async () => {
    const sparse = [
      { id: 'v-sparse', provider: 'heygen', label: 'Sparse', name: 'Sparse', italian: null },
    ] as unknown as CatalogueEntry[]
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: sparse })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    await wrapper.get(sel(`${P}-search`)).setValue('sparse')

    expect(wrapper.find(sel(`${P}-item-v-sparse`)).exists()).toBe(true)

    await wrapper.get(sel(`${P}-search`)).setValue('zzz')

    expect(wrapper.find(sel(`${P}-no-match`)).exists()).toBe(true)
  })

  it('says so when nothing matches, without calling it an error', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    await wrapper.get(sel(`${P}-search`)).setValue('zzz')

    expect(wrapper.find(sel(`${P}-no-match`)).exists()).toBe(true)
    expect(wrapper.find(sel(`${P}-error`)).exists()).toBe(false)
  })
})

describe('selection and open state (the dropdown bugs)', () => {
  it('marks the selected option with a non-colour indicator', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker({ modelValue: 'v-en' })
    await flushPromises()
    await open(wrapper)

    expect(wrapper.find(sel(`${P}-selected-mark-v-en`)).exists()).toBe(true)
    expect(wrapper.find(sel(`${P}-selected-mark-v-it`)).exists()).toBe(false)
  })

  it('emits the provider id and closes the list after a selection', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    await wrapper.get(sel(`${P}-item-v-en`)).trigger('click')
    await flushPromises()

    expect(wrapper.emitted('change')).toEqual([['v-en']])
    expect(wrapper.find(sel(`${P}-panel`)).exists()).toBe(false)
  })

  it('does not reopen when focus returns to the trigger after a selection', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    await wrapper.get(sel(`${P}-item-v-en`)).trigger('click')
    await wrapper.get(sel(P)).trigger('focus')
    await flushPromises()

    expect(wrapper.find(sel(`${P}-panel`)).exists()).toBe(false)
  })

  it('shows the chosen entry in the trigger, by name and not by raw id', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker({ modelValue: 'v-en' })
    await flushPromises()

    expect(wrapper.get(sel(P)).text()).toContain('John')
  })

  it('keeps the full list available after a selection is made', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker({ modelValue: 'v-en' })
    await flushPromises()
    await open(wrapper)

    expect(wrapper.findAll('[role="option"]')).toHaveLength(3)
  })

  it('marks the current entry as selected', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker({ modelValue: 'v-en' })
    await flushPromises()
    await open(wrapper)

    expect(wrapper.get(sel(`${P}-item-v-en`)).attributes('aria-selected')).toBe('true')
    expect(wrapper.get(sel(`${P}-item-v-it`)).attributes('aria-selected')).toBe('false')
  })

  it('closes on an outside click', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()

    expect(wrapper.find(sel(`${P}-panel`)).exists()).toBe(false)
  })

  it('stays open on a click inside its own panel', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    wrapper
      .get(sel(`${P}-search`))
      .element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()

    expect(wrapper.find(sel(`${P}-panel`)).exists()).toBe(true)
  })

  it('closes on Escape', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    await wrapper.get(sel(`${P}-panel`)).trigger('keydown', { key: 'Escape' })

    expect(wrapper.find(sel(`${P}-panel`)).exists()).toBe(false)
  })

  it('never has two pickers open at once', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const first = mountPicker({ fieldKey: 'voiceId' })
    const second = mountPicker({ fieldKey: 'avatarId', resource: 'avatar' })
    await flushPromises()

    await open(first, 'template-config-voiceId')
    expect(first.find(sel('template-config-voiceId-panel')).exists()).toBe(true)

    await open(second, 'template-config-avatarId')

    expect(second.find(sel('template-config-avatarId-panel')).exists()).toBe(true)
    expect(first.find(sel('template-config-voiceId-panel')).exists()).toBe(false)
  })

  it('toggles closed when the trigger is pressed again', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)
    await open(wrapper)

    expect(wrapper.find(sel(`${P}-panel`)).exists()).toBe(false)
  })
})

describe('reporting what the catalogue holds', () => {
  it('reports the loaded ids so the form can refuse an unknown one', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker()
    await flushPromises()

    expect(wrapper.emitted('loaded')?.at(-1)).toEqual([['v-it', 'v-en', 'v-multi']])
  })

  it('reports null when the ids cannot be trusted (provider error)', async () => {
    fetchCatalogue.mockResolvedValue({
      status: 'provider_error',
      items: [],
      code: 'provider_unavailable',
    })
    const wrapper = mountPicker()
    await flushPromises()

    expect(wrapper.emitted('loaded')?.at(-1)).toEqual([null])
  })

  it('reports an empty list as known-empty, not unknown', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'empty', items: [] })
    const wrapper = mountPicker()
    await flushPromises()

    expect(wrapper.emitted('loaded')?.at(-1)).toEqual([[]])
  })
})

describe('empty and error states', () => {
  it('shows an empty state for status empty', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'empty', items: [] })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    expect(wrapper.find(sel(`${P}-empty`)).exists()).toBe(true)
    expect(wrapper.find(sel(`${P}-error`)).exists()).toBe(false)
  })

  it.each([
    'provider_key_missing',
    'provider_unauthorized',
    'provider_rate_limited',
    'provider_unavailable',
    'provider_unreachable',
    'provider_rejected',
    'provider_bad_response',
    'unsupported_catalogue',
  ])('maps %s to its own localized message', async (code) => {
    fetchCatalogue.mockResolvedValue({ status: 'provider_error', items: [], code })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    expect(wrapper.get(sel(`${P}-error`)).text()).toContain(
      `avatar_templates.form.catalogue.error.${code}`
    )
  })

  it('treats a transport failure as a provider_unreachable error', async () => {
    fetchCatalogue.mockRejectedValue(new Error('network'))
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    expect(wrapper.get(sel(`${P}-error`)).text()).toContain(
      'avatar_templates.form.catalogue.error.provider_unreachable'
    )
  })

  it('offers a retry that refetches and recovers', async () => {
    fetchCatalogue.mockResolvedValueOnce({
      status: 'provider_error',
      items: [],
      code: 'provider_rate_limited',
    })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    fetchCatalogue.mockResolvedValueOnce({ status: 'ok', items: VOICES })
    await wrapper.get(sel(`${P}-retry`)).trigger('click')
    await flushPromises()

    expect(fetchCatalogue).toHaveBeenCalledTimes(2)
    expect(wrapper.find(sel(`${P}-error`)).exists()).toBe(false)
    expect(wrapper.find(sel(`${P}-item-v-it`)).exists()).toBe(true)
  })

  it('lets the operator type an id by hand while the provider is down', async () => {
    fetchCatalogue.mockResolvedValue({
      status: 'provider_error',
      items: [],
      code: 'provider_unavailable',
    })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    await wrapper.get(sel(`${P}-manual`)).setValue('typed-id')

    expect(wrapper.emitted('change')?.at(-1)).toEqual(['typed-id'])
  })

  it('does not offer manual entry when the catalogue answered', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    expect(wrapper.find(sel(`${P}-manual`)).exists()).toBe(false)
  })

  it('names a stored id the catalogue does not know instead of hiding it', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker({ modelValue: 'ghost-id' })
    await flushPromises()

    expect(wrapper.get(sel(P)).text()).toContain('ghost-id')
    expect(wrapper.find(sel(`${P}-unknown`)).exists()).toBe(true)
  })
})

describe('avatar preview', () => {
  const AV = 'template-config-avatarId'
  const avatars = [
    entry({
      id: 'a1',
      label: 'Anna',
      name: 'Anna',
      preview_image_url: 'https://cdn.test/anna.png',
    }),
    entry({ id: 'a2', label: 'Bea', name: 'Bea', preview_image_url: 'https://cdn.test/bea.png' }),
    entry({ id: 'a3', label: 'Cleo', name: 'Cleo', preview_image_url: null }),
  ]

  it('shows the selected avatar image, at least 160x160', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: avatars })
    const wrapper = mountPicker({ fieldKey: 'avatarId', resource: 'avatar', modelValue: 'a1' })
    await flushPromises()

    const img = wrapper.get(sel(`${AV}-preview-image`))

    expect(img.attributes('src')).toBe('https://cdn.test/anna.png')
    expect(Number(img.attributes('width'))).toBeGreaterThanOrEqual(160)
    expect(Number(img.attributes('height'))).toBeGreaterThanOrEqual(160)
    expect(img.attributes('style')).toContain('min-width: 160px')
    expect(img.attributes('style')).toContain('min-height: 160px')
  })

  it('updates immediately when the selection changes', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: avatars })
    const wrapper = mountPicker({ fieldKey: 'avatarId', resource: 'avatar', modelValue: 'a1' })
    await flushPromises()

    await wrapper.setProps({ modelValue: 'a2' })

    expect(wrapper.get(sel(`${AV}-preview-image`)).attributes('src')).toBe(
      'https://cdn.test/bea.png'
    )
  })

  it('shows a placeholder, at least 160x160, when the avatar has no image', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: avatars })
    const wrapper = mountPicker({ fieldKey: 'avatarId', resource: 'avatar', modelValue: 'a3' })
    await flushPromises()

    const fallback = wrapper.get(sel(`${AV}-preview-fallback`))

    expect(wrapper.find(sel(`${AV}-preview-image`)).exists()).toBe(false)
    expect(fallback.attributes('style')).toContain('min-width: 160px')
    expect(fallback.attributes('style')).toContain('min-height: 160px')
  })

  it('falls back to the placeholder when the image fails to load', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: avatars })
    const wrapper = mountPicker({ fieldKey: 'avatarId', resource: 'avatar', modelValue: 'a1' })
    await flushPromises()

    await wrapper.get(sel(`${AV}-preview-image`)).trigger('error')

    expect(wrapper.find(sel(`${AV}-preview-image`)).exists()).toBe(false)
    expect(wrapper.find(sel(`${AV}-preview-fallback`)).exists()).toBe(true)
  })

  it('shows no preview at all while nothing is selected', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: avatars })
    const wrapper = mountPicker({ fieldKey: 'avatarId', resource: 'avatar' })
    await flushPromises()

    expect(wrapper.find(sel(`${AV}-preview-image`)).exists()).toBe(false)
    expect(wrapper.find(sel(`${AV}-preview-fallback`)).exists()).toBe(false)
  })

  it('shows no image preview for a voice', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: VOICES })
    const wrapper = mountPicker({ modelValue: 'v-it' })
    await flushPromises()

    expect(wrapper.find(sel(`${P}-preview-image`)).exists()).toBe(false)
  })
})

describe('voice audio preview', () => {
  it('offers a play button only for entries that have a sample', async () => {
    fetchCatalogue.mockResolvedValue({
      status: 'ok',
      items: [
        entry({ id: 'v1', preview_audio_url: 'https://cdn.test/v1.mp3' }),
        entry({ id: 'v2', preview_audio_url: null }),
      ],
    })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    expect(wrapper.find(sel(`${P}-play-v1`)).exists()).toBe(true)
    expect(wrapper.find(sel(`${P}-play-v2`)).exists()).toBe(false)
  })

  it('playing a sample does not select the voice', async () => {
    fetchCatalogue.mockResolvedValue({
      status: 'ok',
      items: [entry({ id: 'v1', preview_audio_url: 'https://cdn.test/v1.mp3' })],
    })
    const wrapper = mountPicker()
    await flushPromises()
    await open(wrapper)

    await wrapper.get(sel(`${P}-play-v1`)).trigger('click')

    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.find(sel(`${P}-panel`)).exists()).toBe(true)
  })
})
