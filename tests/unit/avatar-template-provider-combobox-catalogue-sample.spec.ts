/**
 * AvatarTemplateProviderCombobox — the vendor CATALOGUE sample (cartesia-catalogue-sample-proxy).
 *
 * Root cause pinned here: the picker set `audio.src` to the vendor's own file url, but Cartesia's
 * file host answers 401 without the platform key, which the browser must never hold. The api now
 * serves the clip's BYTES (`GET /avatar-templates/catalogue-sample`) and flags such an entry with
 * `preview_audio_via_api`; the picker must fetch those bytes through the typed client and play a
 * blob URL, exactly like the synthesised sample. A public CDN url (ElevenLabs) is still played
 * directly. The real `useVoicePreview` runs; only the network and the media element are doubles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { CatalogueEntry, CatalogueProvider } from '../../app/types/avatar-template'

const fetchCatalogue = vi.fn()
const apiFetch = vi.fn()

vi.mock('@/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ fetchCatalogue }),
}))
vi.mock('@/composables/useApi', () => ({ useApi: () => ({ apiFetch }) }))

class FakeAudio {
  static instances: FakeAudio[] = []
  src = ''
  play = vi.fn(async () => undefined)
  pause = vi.fn()
  removeAttribute = vi.fn(() => {
    this.src = ''
  })
  constructor() {
    FakeAudio.instances.push(this)
  }
  addEventListener(): void {}
}

function entry(over: Partial<CatalogueEntry> = {}): CatalogueEntry {
  return {
    id: 'c1',
    provider: 'cartesia',
    label: 'Giulia',
    name: 'Giulia',
    language: 'it',
    locale: 'it',
    accent: null,
    italian: 'native',
    preview_image_url: null,
    preview_audio_url: null,
    preview_audio_via_api: false,
    preview_video_url: null,
    ...over,
  }
}

const CARTESIA = entry({ id: 'c1', preview_audio_via_api: true })
const NO_SAMPLE = entry({ id: 'c2', label: 'Zed', name: 'Zed' })
const ELEVEN = entry({
  id: 'e1',
  provider: 'elevenlabs',
  label: 'Chiara',
  name: 'Chiara',
  preview_audio_url: 'https://cdn.test/chiara.mp3',
})

const P = 'template-config-voiceId'
const sel = (id: string) => `[data-testid="${id}"]`

// `useVoicePreview` keeps its player and cache at module scope, so each test gets a fresh module graph.
async function mountPicker(provider: CatalogueProvider, modelValue = '') {
  vi.resetModules()
  const { default: AvatarTemplateProviderCombobox } =
    await import('../../app/components/organisms/AvatarTemplateProviderCombobox.vue')

  return mount(AvatarTemplateProviderCombobox, {
    props: {
      field: {
        key: 'voiceId',
        type: 'text' as const,
        label_key: 'avatar_templates.field.voiceId',
        catalogue_resource: 'voice' as const,
      },
      provider,
      modelValue,
    },
    attrs: { id: 'template-config-voiceId', 'data-testid': P },
    attachTo: document.body,
  })
}

async function open(wrapper: Awaited<ReturnType<typeof mountPicker>>): Promise<void> {
  await wrapper.get(sel(P)).trigger('click')
  await flushPromises()
}

const OriginalAudio = globalThis.Audio
let objectUrls = 0
const revoke = vi.fn()

beforeEach(() => {
  fetchCatalogue.mockReset()
  apiFetch.mockReset()
  apiFetch.mockResolvedValue(new Blob(['RIFF'], { type: 'audio/wav' }))
  FakeAudio.instances = []
  objectUrls = 0
  revoke.mockReset()
  vi.stubGlobal('Audio', FakeAudio)
  URL.createObjectURL = vi.fn(() => `blob:catalogue-${(objectUrls += 1)}`)
  URL.revokeObjectURL = revoke
})

afterEach(() => {
  // Not `unstubAllGlobals`: that would also drop the setup file's `useI18n` stub.
  vi.stubGlobal('Audio', OriginalAudio)
  document.body.innerHTML = ''
})

describe('a Cartesia entry whose clip is served by the api', () => {
  it('offers a play control, and none for an entry without a clip', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: [CARTESIA, NO_SAMPLE] })
    const wrapper = await mountPicker('cartesia')
    await flushPromises()
    await open(wrapper)

    expect(wrapper.find(sel(`${P}-play-c1`)).exists()).toBe(true)
    expect(wrapper.find(sel(`${P}-play-c2`)).exists()).toBe(false)
    wrapper.unmount()
  })

  it('fetches the bytes through the typed client and plays a blob url, never a vendor url', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: [CARTESIA] })
    const wrapper = await mountPicker('cartesia')
    await flushPromises()
    await open(wrapper)

    await wrapper.get(sel(`${P}-play-c1`)).trigger('click')
    await flushPromises()

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch).toHaveBeenCalledWith('/avatar-templates/catalogue-sample', {
      method: 'GET',
      query: { provider: 'cartesia', voice_id: 'c1' },
      responseType: 'blob',
    })
    const sources = FakeAudio.instances.map((audio) => audio.src)
    expect(sources).toEqual(['blob:catalogue-1'])
    expect(wrapper.get('audio').attributes('src')).toBeUndefined()
    expect(wrapper.html()).not.toContain('cartesia.ai')
    wrapper.unmount()
  })

  it('shows loading while the bytes arrive, then the pause control', async () => {
    let resolve!: (b: Blob) => void
    apiFetch.mockReturnValueOnce(new Promise<Blob>((r) => (resolve = r)))
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: [CARTESIA] })
    const wrapper = await mountPicker('cartesia')
    await flushPromises()
    await open(wrapper)

    await wrapper.get(sel(`${P}-play-c1`)).trigger('click')
    expect(wrapper.get(sel(`${P}-play-c1`)).attributes('aria-busy')).toBe('true')
    expect(wrapper.get(sel(`${P}-play-c1`)).attributes('aria-label')).toBe(
      'avatar_templates.form.catalogue.preview.loading'
    )

    resolve(new Blob(['RIFF']))
    await flushPromises()

    expect(wrapper.get(sel(`${P}-play-c1`)).attributes('aria-busy')).toBeUndefined()
    expect(wrapper.get(sel(`${P}-play-c1`)).attributes('aria-label')).toBe(
      'avatar_templates.form.catalogue.preview.pause'
    )
    wrapper.unmount()
  })

  it('a second click stops it and the next one replays from memory without another request', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: [CARTESIA] })
    const wrapper = await mountPicker('cartesia')
    await flushPromises()
    await open(wrapper)
    const play = () =>
      wrapper
        .get(sel(`${P}-play-c1`))
        .trigger('click')
        .then(flushPromises)

    await play()
    await play() // stop
    await play() // replay

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(FakeAudio.instances[0]!.pause).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows a translated alert when the api cannot serve the clip, and tries again on the next click', async () => {
    apiFetch.mockRejectedValueOnce({
      status: 422,
      data: new Blob([JSON.stringify({ message: 'voice_preview_unavailable' })]),
    })
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: [CARTESIA] })
    const wrapper = await mountPicker('cartesia')
    await flushPromises()
    await open(wrapper)

    await wrapper.get(sel(`${P}-play-c1`)).trigger('click')
    await flushPromises()

    const alert = wrapper.get(sel(`${P}-play-error-c1`))
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toBe('avatar_templates.form.voicePreview.error.unavailable')

    await wrapper.get(sel(`${P}-play-c1`)).trigger('click')
    await flushPromises()

    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(wrapper.find(sel(`${P}-play-error-c1`)).exists()).toBe(false)
    wrapper.unmount()
  })

  it('playing it does not select the voice', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: [CARTESIA] })
    const wrapper = await mountPicker('cartesia')
    await flushPromises()
    await open(wrapper)

    await wrapper.get(sel(`${P}-play-c1`)).trigger('click')
    await flushPromises()

    expect(wrapper.emitted('change')).toBeUndefined()
    wrapper.unmount()
  })

  it('the selected-voice catalogue button works the same way', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: [CARTESIA] })
    const wrapper = await mountPicker('cartesia', 'c1')
    await flushPromises()

    await wrapper.get(sel(`${P}-catalogue-sample`)).trigger('click')
    await flushPromises()

    expect(apiFetch).toHaveBeenCalledWith('/avatar-templates/catalogue-sample', {
      method: 'GET',
      query: { provider: 'cartesia', voice_id: 'c1' },
      responseType: 'blob',
    })
    expect(FakeAudio.instances[0]!.src).toBe('blob:catalogue-1')
    expect(wrapper.get(sel(`${P}-catalogue-sample`)).attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
  })

  it('shows an alert next to the selected-voice button when the clip fails', async () => {
    apiFetch.mockRejectedValueOnce({
      status: 502,
      data: new Blob([JSON.stringify({ message: 'voice_preview_provider_error' })]),
    })
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: [CARTESIA] })
    const wrapper = await mountPicker('cartesia', 'c1')
    await flushPromises()

    await wrapper.get(sel(`${P}-catalogue-sample`)).trigger('click')
    await flushPromises()

    expect(wrapper.get(sel(`${P}-catalogue-sample-error`)).text()).toBe(
      'avatar_templates.form.voicePreview.error.provider_error'
    )
    wrapper.unmount()
  })
})

describe('a public CDN clip (ElevenLabs)', () => {
  it('is still played directly from its url, without asking the api', async () => {
    fetchCatalogue.mockResolvedValue({ status: 'ok', items: [ELEVEN] })
    const wrapper = await mountPicker('elevenlabs')
    await flushPromises()
    await open(wrapper)

    await wrapper.get(sel(`${P}-play-e1`)).trigger('click')

    expect(wrapper.get('audio').element.getAttribute('src')).toBe('https://cdn.test/chiara.mp3')
    expect(apiFetch).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
