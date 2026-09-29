/**
 * The voice preview BLOCK in the picker panel (DESIGN.md §16.14).
 *
 * A voice has no image, so the face-picker's "no preview available" square is
 * useless under it. The panel shows a labelled listen control instead — for the
 * selected voice, and also for an id the catalogue does not list.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AvatarTemplateProviderCombobox from '../../app/components/organisms/AvatarTemplateProviderCombobox.vue'
import type { CatalogueEntry, CatalogueResource } from '../../app/types/avatar-template'

const fetchCatalogue = vi.fn()
const apiFetch = vi.fn()

vi.mock('@/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ fetchCatalogue }),
}))
vi.mock('@/composables/useApi', () => ({ useApi: () => ({ apiFetch }) }))

function entry(over: Partial<CatalogueEntry> & { id: string }): CatalogueEntry {
  return {
    provider: 'cartesia',
    label: over.id,
    name: over.id,
    language: null,
    locale: null,
    accent: null,
    italian: null,
    preview_image_url: null,
    preview_audio_url: null,
    preview_video_url: null,
    ...over,
  }
}

const ITEMS = [
  entry({ id: 'ca-it', label: 'Elena', preview_audio_url: 'https://cdn.test/elena.mp3' }),
  entry({ id: 'ca-en', label: 'Sam' }),
]

const mounted: Array<{ unmount: () => void }> = []

function mountPicker(
  props: {
    resource?: CatalogueResource
    provider?: string
    modelValue?: string
    preview?: { provider: string; ttsEngine?: string | null }
  } = {}
) {
  const wrapper = mount(AvatarTemplateProviderCombobox, {
    props: {
      field: {
        key: 'ttsExternalVoiceId',
        type: 'text' as const,
        label_key: 'l',
        catalogue_resource: props.resource ?? 'voice',
      },
      provider: (props.provider ?? 'cartesia') as never,
      modelValue: props.modelValue ?? '',
      ...(props.preview === undefined ? {} : { preview: props.preview }),
    },
    attrs: { id: 'f', 'data-testid': 'template-config-ttsExternalVoiceId' },
    attachTo: document.body,
  })
  mounted.push(wrapper)

  return wrapper
}

const sel = (id: string) => `[data-testid="${id}"]`
const P = 'template-config-ttsExternalVoiceId'

function bodies() {
  return apiFetch.mock.calls.map(([, o]) => (o as { body: unknown }).body)
}

beforeEach(() => {
  fetchCatalogue.mockReset()
  fetchCatalogue.mockResolvedValue({ status: 'ok', items: ITEMS })
  apiFetch.mockReset()
  apiFetch.mockResolvedValue(new Blob(['a']))
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  vi.stubGlobal(
    'Audio',
    class {
      addEventListener = vi.fn()
      play = vi.fn(async () => {})
      pause = vi.fn()
      removeAttribute = vi.fn()
    }
  )
  window.HTMLMediaElement.prototype.play = vi.fn(async () => {})
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.body.innerHTML = ''
})

describe('voice pickers show a voice preview block instead of the image fallback', () => {
  it('names the selected voice and offers a labelled, non-compact listen control', async () => {
    const wrapper = mountPicker({ modelValue: 'ca-it' })
    await flushPromises()

    const block = wrapper.get(sel(`${P}-voice-preview`))
    expect(block.text()).toContain('Elena')
    const button = wrapper.get(sel(`${P}-preview`))
    expect(button.text()).toBe('avatar_templates.form.voicePreview.action')
    expect(button.attributes('aria-label')).toBeUndefined()
    expect(block.text()).toContain('avatar_templates.form.voicePreview.disclaimer')
    // never the face picker's empty square
    expect(wrapper.find(sel(`${P}-preview-fallback`)).exists()).toBe(false)
  })

  it('sends the params the form passes: tavus + the current ttsEngine', async () => {
    const wrapper = mountPicker({
      modelValue: 'ca-it',
      preview: { provider: 'tavus', ttsEngine: 'cartesia' },
    })
    await flushPromises()

    await wrapper.get(sel(`${P}-preview`)).trigger('click')
    await flushPromises()

    expect(bodies()).toEqual([
      { provider: 'tavus', voice_id: 'ca-it', tts_engine: 'cartesia', language: 'it' },
    ])
  })

  it('falls back to its own provider when the form passes none (HeyGen, ElevenLabs)', async () => {
    for (const provider of ['heygen', 'elevenlabs']) {
      apiFetch.mockClear()
      const wrapper = mountPicker({ provider, modelValue: 'v-9' })
      await flushPromises()
      await wrapper.get(sel(`${P}-preview`)).trigger('click')
      await flushPromises()

      expect(bodies().at(-1)).toEqual({ provider, voice_id: 'v-9', language: 'it' })
      wrapper.unmount()
      mounted.pop()
    }
  })

  it('still renders for a voice id that is not in the loaded catalogue', async () => {
    const wrapper = mountPicker({ modelValue: 'typed-by-hand' })
    await flushPromises()

    const block = wrapper.get(sel(`${P}-voice-preview`))
    expect(block.text()).toContain('typed-by-hand')
    await wrapper.get(sel(`${P}-preview`)).trigger('click')
    await flushPromises()
    expect(bodies().at(-1)).toMatchObject({ provider: 'cartesia', voice_id: 'typed-by-hand' })
  })

  it('still renders when the catalogue is unavailable', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'provider_error', items: [], code: 'x' })
    const wrapper = mountPicker({ modelValue: 'ca-it' })
    await flushPromises()

    expect(wrapper.find(sel(`${P}-preview`)).exists()).toBe(true)
  })

  it('shows the block, disabled with its reason, while nothing is chosen', async () => {
    const wrapper = mountPicker()
    await flushPromises()

    expect(wrapper.get(sel(`${P}-preview`)).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('avatar_templates.form.voicePreview.noVoice')
  })

  it('a Tavus stock engine is disabled with the stock-voice explanation', async () => {
    const wrapper = mountPicker({
      modelValue: 'x',
      preview: { provider: 'tavus', ttsEngine: 'tavus-auto' },
    })
    await flushPromises()

    expect(wrapper.get(sel(`${P}-preview`)).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('avatar_templates.form.voicePreview.stockUnavailable')
  })

  it('offers the catalogue sample control only when the entry has a clip', async () => {
    const withClip = mountPicker({ modelValue: 'ca-it' })
    await flushPromises()
    const clip = withClip.get(sel(`${P}-catalogue-sample`))
    expect(clip.text()).toBe('avatar_templates.form.voicePreview.caption.catalogue')
    expect(clip.attributes('aria-pressed')).toBe('false')

    const without = mountPicker({ modelValue: 'ca-en' })
    await flushPromises()
    expect(without.find(sel(`${P}-catalogue-sample`)).exists()).toBe(false)
  })

  it('keeps one audio at a time between the catalogue sample and the Italian sample', async () => {
    const wrapper = mountPicker({ modelValue: 'ca-it' })
    await flushPromises()

    const clip = wrapper.get(sel(`${P}-catalogue-sample`))
    await clip.trigger('click')
    expect(clip.attributes('aria-pressed')).toBe('true')

    await wrapper.get(sel(`${P}-preview`)).trigger('click')
    await flushPromises()
    expect(clip.attributes('aria-pressed')).toBe('false')
  })
})

describe('non-voice pickers are untouched', () => {
  it.each<CatalogueResource>(['avatar', 'replica'])(
    '%s keeps the image panel and its fallback, with no voice block',
    async (resource) => {
      fetchCatalogue.mockResolvedValue({
        status: 'ok',
        items: [entry({ id: 'f-1', label: 'Face' })],
      })
      const wrapper = mountPicker({ resource, provider: 'heygen', modelValue: 'f-1' })
      await flushPromises()

      expect(wrapper.find(sel(`${P}-preview-fallback`)).exists()).toBe(true)
      expect(wrapper.find(sel(`${P}-voice-preview`)).exists()).toBe(false)
      expect(wrapper.find(sel(`${P}-preview`)).exists()).toBe(false)
    }
  )
})

describe('persona (pal) picker shows the persona voice block', () => {
  const PALS = [entry({ id: 'pal-1', provider: 'tavus', label: 'Giulia persona' })]

  function mountPal(modelValue: string) {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: PALS })
    const wrapper = mountPicker({ resource: 'pal', provider: 'tavus', modelValue })
    return wrapper
  }

  const PAL = 'template-config-ttsExternalVoiceId'

  it('replaces the empty square with a labelled, enabled listen control and the persona name', async () => {
    const wrapper = mountPal('pal-1')
    await flushPromises()

    expect(wrapper.find(sel(`${PAL}-preview-fallback`)).exists()).toBe(false)
    const block = wrapper.get(sel(`${PAL}-voice-preview`))
    expect(block.classes()).toEqual(expect.arrayContaining(['w-full', 'min-w-0']))
    expect(block.text()).toContain('Giulia persona')
    const button = wrapper.get(sel(`${PAL}-preview`))
    expect(button.text()).toBe('avatar_templates.form.voicePreview.palAction')
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('does NOT call the server on render: only after the click', async () => {
    const wrapper = mountPal('pal-1')
    await flushPromises()
    expect(apiFetch).not.toHaveBeenCalled()

    await wrapper.get(sel(`${PAL}-preview`)).trigger('click')
    await flushPromises()

    expect(bodies()).toEqual([{ provider: 'tavus', pal_id: 'pal-1', language: 'it' }])
  })

  it('says the save replaces the persona voice', async () => {
    const wrapper = mountPal('pal-1')
    await flushPromises()

    expect(wrapper.get(sel(`${PAL}-pal-note`)).text()).toBe(
      'avatar_templates.form.voicePreview.palSaveNote'
    )
  })

  it.each([
    [
      'pal_uses_tavus_voice',
      422,
      { message: 'voice_preview_unavailable', reason: 'pal_uses_tavus_voice' },
    ],
    ['pal_azure_engine', 422, { message: 'voice_preview_unavailable', reason: 'pal_azure_engine' }],
    [
      'pal_no_voice_configured',
      422,
      { message: 'voice_preview_unavailable', reason: 'pal_no_voice_configured' },
    ],
    [
      'tavus_stock_voice',
      422,
      { message: 'voice_preview_unavailable', reason: 'tavus_stock_voice' },
    ],
    ['voice_not_found', 404, { message: 'voice_preview_voice_not_found' }],
    ['provider_error', 502, { message: 'voice_preview_provider_error' }],
    ['provider_not_configured', 503, { message: 'voice_preview_provider_not_configured' }],
    ['rate_limited', 429, { message: 'Too Many Attempts.' }],
  ])('shows the translated %s message after the click', async (code, status, body) => {
    apiFetch.mockRejectedValueOnce({ status, data: body })
    const wrapper = mountPal('pal-1')
    await flushPromises()

    await wrapper.get(sel(`${PAL}-preview`)).trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain(
      `avatar_templates.form.voicePreview.error.${code}`
    )
  })

  it('works for a persona id that is not in the loaded list', async () => {
    const wrapper = mountPal('typed-pal')
    await flushPromises()

    expect(wrapper.get(sel(`${PAL}-voice-preview`)).text()).toContain('typed-pal')
    await wrapper.get(sel(`${PAL}-preview`)).trigger('click')
    await flushPromises()
    expect(bodies().at(-1)).toEqual({ provider: 'tavus', pal_id: 'typed-pal', language: 'it' })
  })

  it('is disabled with a reason while no persona is chosen', async () => {
    const wrapper = mountPal('')
    await flushPromises()

    expect(wrapper.get(sel(`${PAL}-preview`)).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('avatar_templates.form.voicePreview.noPersona')
  })

  it('renders exactly one player control for the persona (no duplicate)', async () => {
    const wrapper = mountPal('pal-1')
    await flushPromises()

    expect(wrapper.findAll('[data-slot="voice-preview"]')).toHaveLength(1)
  })

  it.each<CatalogueResource>(['avatar', 'replica'])(
    '%s pickers still keep the image fallback and no persona block',
    async (resource) => {
      fetchCatalogue.mockResolvedValue({ status: 'ok', items: [entry({ id: 'f-1' })] })
      const wrapper = mountPicker({ resource, provider: 'tavus', modelValue: 'f-1' })
      await flushPromises()

      expect(wrapper.find(sel(`${PAL}-preview-fallback`)).exists()).toBe(true)
      expect(wrapper.find(sel(`${PAL}-voice-preview`)).exists()).toBe(false)
    }
  )
})
