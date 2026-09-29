/**
 * AvatarTemplateForm — the voice preview control on EVERY voice field
 * (DESIGN.md §16.14).
 *
 * The client is mocked at `useApi.apiFetch`, the layer the composable really
 * calls, so the assertions are on the request a click actually sends.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AvatarTemplateForm from '../../app/components/organisms/AvatarTemplateForm.vue'
import type {
  CatalogueEntry,
  CatalogueResponse,
  FieldSpec,
  ProviderName,
} from '../../app/types/avatar-template'

function item(over: Partial<CatalogueEntry> & { id: string }): CatalogueEntry {
  return {
    provider: 'heygen',
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

const LISTS: Record<string, CatalogueResponse> = {
  'heygen:avatar': { status: 'ok', items: [item({ id: 'av-1', label: 'Anna' })] },
  'heygen:voice': {
    status: 'ok',
    items: [item({ id: 'hv-it', label: 'Giulia', italian: 'native' })],
  },
  'tavus:replica': { status: 'ok', items: [item({ id: 'rep-1', provider: 'tavus' })] },
  'tavus:pal': { status: 'ok', items: [item({ id: 'pal-1', provider: 'tavus' })] },
  'cartesia:voice': {
    status: 'ok',
    items: [
      item({
        id: 'ca-it',
        provider: 'cartesia',
        label: 'Elena',
        italian: 'native',
        preview_audio_url: 'https://cdn.test/elena.mp3',
      }),
      item({ id: 'ca-en', provider: 'cartesia', label: 'Sam' }),
    ],
  },
  'elevenlabs:voice': {
    status: 'ok',
    items: [item({ id: 'el-1', provider: 'elevenlabs', label: 'Rachel' })],
  },
}

const fetchCatalogue = vi.fn()
const apiFetch = vi.fn()

vi.mock('@/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ fetchCatalogue }),
}))
vi.mock('@/composables/useApi', () => ({ useApi: () => ({ apiFetch }) }))

const SPECS: Record<ProviderName, FieldSpec[]> = {
  heygen: [
    { key: 'avatarId', type: 'text', label_key: 'l.avatarId', catalogue_resource: 'avatar' },
    { key: 'voiceId', type: 'text', label_key: 'l.voiceId', catalogue_resource: 'voice' },
    {
      key: 'voiceSpeed',
      type: 'number',
      label_key: 'l.voiceSpeed',
      min: 0.8,
      max: 1.2,
      step: 0.01,
    },
  ],
  tavus: [
    { key: 'faceId', type: 'text', label_key: 'l.faceId', catalogue_resource: 'replica' },
    { key: 'palId', type: 'text', label_key: 'l.palId', catalogue_resource: 'pal' },
    {
      key: 'ttsEngine',
      type: 'select',
      label_key: 'l.ttsEngine',
      options: ['tavus-auto', 'cartesia', 'elevenlabs', 'azure'],
    },
    { key: 'ttsExternalVoiceId', type: 'text', label_key: 'l.ttsExternalVoiceId' },
    { key: 'voiceIsolation', type: 'select', label_key: 'l.voiceIsolation', options: ['near'] },
  ],
}

// Unmounted after each test: playback state is app-wide by design, so a form
// left mounted would leave its sample "playing" for the next test.
const mounted: Array<{ unmount: () => void }> = []

function mountForm(provider: ProviderName, config: Record<string, unknown> = {}) {
  const wrapper = mount(AvatarTemplateForm, {
    props: {
      template: { name: 'T', provider, config, id: 7 },
      fieldSpecs: SPECS,
      saving: false,
      submitError: null,
    },
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  })
  mounted.push(wrapper)

  return wrapper
}

type Form = ReturnType<typeof mountForm>
const sel = (id: string) => `[data-testid="${id}"]`
/** Only the preview requests: the form also loads LLM models and credentials. */
const previewBodies = () =>
  apiFetch.mock.calls
    .filter(([path]) => path === '/avatar-templates/voice-preview')
    .map(([, options]) => (options as { body: unknown }).body)
const preview = (key: string) => sel(`template-config-${key}-preview`)

async function chooseEngine(wrapper: Form, engine: string): Promise<void> {
  const select = wrapper.get(sel('template-config-ttsEngine'))
  ;(select.element as HTMLSelectElement).value = engine
  await select.trigger('change')
  await flushPromises()
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

beforeEach(async () => {
  document.body.innerHTML = ''
  fetchCatalogue.mockReset()
  fetchCatalogue.mockImplementation((provider: string, resource: string) =>
    Promise.resolve(LISTS[`${provider}:${resource}`] ?? { status: 'empty', items: [] })
  )
  apiFetch.mockReset()
  apiFetch.mockImplementation((path: string) =>
    path === '/avatar-templates/voice-preview'
      ? Promise.resolve(new Blob(['a'], { type: 'audio/mpeg' }))
      : Promise.reject(new Error('unexpected ' + path))
  )
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

describe('HeyGen voiceId', () => {
  it('shows a disabled control with a reason while no voice is chosen', async () => {
    const wrapper = mountForm('heygen')
    await flushPromises()

    expect(wrapper.get(preview('voiceId')).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('avatar_templates.form.voicePreview.noVoice')
  })

  it('previews the selected voice as a generic HeyGen sample', async () => {
    const wrapper = mountForm('heygen', { voiceId: 'hv-it' })
    await flushPromises()

    expect(wrapper.text()).toContain('avatar_templates.form.voicePreview.caption.heygen')
    await wrapper.get(preview('voiceId')).trigger('click')
    await flushPromises()

    expect(apiFetch).toHaveBeenCalledWith('/avatar-templates/voice-preview', {
      method: 'POST',
      body: { provider: 'heygen', voice_id: 'hv-it', language: 'it' },
      responseType: 'blob',
    })
  })

  it('offers an Italian-sample button on each list row of the HeyGen voice picker', async () => {
    const wrapper = mountForm('heygen')
    await flushPromises()
    await wrapper.get(sel('template-config-voiceId')).trigger('click')

    const row = wrapper.get(sel('template-config-voiceId-italian-preview-hv-it'))
    await row.trigger('click')
    await flushPromises()

    expect(previewBodies().at(-1)).toEqual({
      provider: 'heygen',
      voice_id: 'hv-it',
      language: 'it',
    })
  })

  it('does not put a preview control on non-voice fields', async () => {
    const wrapper = mountForm('heygen')
    await flushPromises()

    expect(wrapper.find(preview('avatarId')).exists()).toBe(false)
    expect(wrapper.find(preview('voiceSpeed')).exists()).toBe(false)
  })
})

describe('Tavus ttsExternalVoiceId beside ttsEngine', () => {
  it.each(['', 'tavus-auto', 'azure'])(
    'is disabled with the stock-voice explanation for engine "%s"',
    async (engine) => {
      const wrapper = mountForm('tavus', engine === '' ? {} : { ttsEngine: engine })
      await flushPromises()

      expect(wrapper.get(preview('ttsExternalVoiceId')).attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('avatar_templates.form.voicePreview.stockUnavailable')
    }
  )

  it('sends provider tavus with the engine currently chosen in the form', async () => {
    const wrapper = mountForm('tavus', { ttsEngine: 'cartesia', ttsExternalVoiceId: 'ca-it' })
    await flushPromises()

    await wrapper.get(preview('ttsExternalVoiceId')).trigger('click')
    await flushPromises()

    expect(apiFetch).toHaveBeenCalledWith('/avatar-templates/voice-preview', {
      method: 'POST',
      body: { provider: 'tavus', voice_id: 'ca-it', tts_engine: 'cartesia', language: 'it' },
      responseType: 'blob',
    })
  })

  it('follows the engine: switching to ElevenLabs re-targets the request', async () => {
    const wrapper = mountForm('tavus', { ttsEngine: 'cartesia', ttsExternalVoiceId: 'ca-it' })
    await flushPromises()
    await chooseEngine(wrapper, 'elevenlabs')

    // The old voice id is dropped on an engine change, so the control waits
    // for a new pick and explains itself rather than sampling a stale id.
    expect(wrapper.get(preview('ttsExternalVoiceId')).attributes('disabled')).toBeDefined()

    await wrapper.get(sel('template-config-ttsExternalVoiceId')).trigger('click')
    await wrapper.get(sel('template-config-ttsExternalVoiceId-item-el-1')).trigger('click')
    await flushPromises()
    await wrapper.get(preview('ttsExternalVoiceId')).trigger('click')
    await flushPromises()

    expect(previewBodies().at(-1)).toEqual({
      provider: 'tavus',
      voice_id: 'el-1',
      tts_engine: 'elevenlabs',
      language: 'it',
    })
  })

  it('keeps the control on the plain text input used for an engine without a catalogue', async () => {
    const wrapper = mountForm('tavus', { ttsEngine: 'azure', ttsExternalVoiceId: 'it-IT-Elsa' })
    await flushPromises()

    expect(wrapper.get(sel('template-config-ttsExternalVoiceId')).element.tagName).toBe('INPUT')
    expect(wrapper.find(preview('ttsExternalVoiceId')).exists()).toBe(true)
  })

  it('offers Italian-sample buttons on each row of the Cartesia and ElevenLabs pickers', async () => {
    const cartesia = mountForm('tavus', { ttsEngine: 'cartesia' })
    await flushPromises()
    await cartesia.get(sel('template-config-ttsExternalVoiceId')).trigger('click')

    await cartesia
      .get(sel('template-config-ttsExternalVoiceId-italian-preview-ca-en'))
      .trigger('click')
    await flushPromises()
    expect(previewBodies().at(-1)).toEqual({
      provider: 'cartesia',
      voice_id: 'ca-en',
      language: 'it',
    })

    const eleven = mountForm('tavus', { ttsEngine: 'elevenlabs' })
    await flushPromises()
    expect(fetchCatalogue).toHaveBeenCalledWith('elevenlabs', 'voice')
    await eleven.get(sel('template-config-ttsExternalVoiceId')).trigger('click')
    expect(
      eleven.find(sel('template-config-ttsExternalVoiceId-italian-preview-el-1')).exists()
    ).toBe(true)
  })

  it('keeps the free catalogue sample AND the Italian sample apart on a row', async () => {
    const wrapper = mountForm('tavus', { ttsEngine: 'cartesia' })
    await flushPromises()
    await wrapper.get(sel('template-config-ttsExternalVoiceId')).trigger('click')

    const catalogue = wrapper.get(sel('template-config-ttsExternalVoiceId-play-ca-it'))
    const italian = wrapper.get(sel('template-config-ttsExternalVoiceId-italian-preview-ca-it'))

    expect(catalogue.attributes('title')).toBe(
      'avatar_templates.form.voicePreview.caption.catalogue'
    )
    expect(italian.attributes('title')).toContain(
      'avatar_templates.form.voicePreview.caption.italian'
    )
    // a row with no catalogue clip has only the Italian sample
    expect(wrapper.find(sel('template-config-ttsExternalVoiceId-play-ca-en')).exists()).toBe(false)
  })

  it('stops the catalogue sample when an Italian sample starts', async () => {
    const wrapper = mountForm('tavus', { ttsEngine: 'cartesia' })
    await flushPromises()
    await wrapper.get(sel('template-config-ttsExternalVoiceId')).trigger('click')

    const play = wrapper.get(sel('template-config-ttsExternalVoiceId-play-ca-it'))
    await play.trigger('click')
    expect(play.attributes('aria-label')).toBe('avatar_templates.form.catalogue.preview.pause')

    await wrapper
      .get(sel('template-config-ttsExternalVoiceId-italian-preview-ca-it'))
      .trigger('click')
    await flushPromises()

    expect(play.attributes('aria-label')).toBe('avatar_templates.form.catalogue.preview.play')
  })

  it('does not offer a Tavus stock-voice row sample (there is none to play)', async () => {
    const wrapper = mountForm('tavus')
    await flushPromises()

    expect(wrapper.find('[data-testid$="-italian-preview-rep-1"]').exists()).toBe(false)
  })
})

describe('guard: every voice-typed field has a preview control or an explicit exemption', () => {
  // A voice-typed knob is a text field whose key mentions "voice". A NEW one
  // added server-side must either get the control or be listed here with a
  // reason — otherwise it ships as a voice an operator can only pick blind.
  const EXEMPT: Record<string, string> = {}

  it.each<ProviderName>(['heygen', 'tavus'])('%s form', async (provider) => {
    const wrapper = mountForm(provider, provider === 'tavus' ? { ttsEngine: 'cartesia' } : {})
    await flushPromises()

    const voiceFields = SPECS[provider].filter(
      (f) => f.type === 'text' && /voice/i.test(f.key) && EXEMPT[f.key] === undefined
    )

    expect(voiceFields.length).toBeGreaterThan(0)
    for (const field of voiceFields) {
      expect(wrapper.find(preview(field.key)).exists(), field.key).toBe(true)
    }
  })
})

describe('one control per voice field', () => {
  it('does not render a second, form-level control when the picker panel already has it', async () => {
    const heygen = mountForm('heygen', { voiceId: 'hv-it' })
    await flushPromises()
    expect(heygen.findAll(preview('voiceId'))).toHaveLength(1)
    expect(heygen.find(sel('template-config-voiceId-voice-preview')).exists()).toBe(true)

    const tavus = mountForm('tavus', { ttsEngine: 'cartesia', ttsExternalVoiceId: 'ca-it' })
    await flushPromises()
    expect(tavus.findAll(preview('ttsExternalVoiceId'))).toHaveLength(1)
    expect(tavus.find(sel('template-config-ttsExternalVoiceId-voice-preview')).exists()).toBe(true)
  })

  it('keeps a labelled form-level button where there is no panel (plain text input)', async () => {
    const wrapper = mountForm('tavus', { ttsEngine: 'azure', ttsExternalVoiceId: 'it-IT-Elsa' })
    await flushPromises()

    const button = wrapper.get(preview('ttsExternalVoiceId'))
    expect(wrapper.find(sel('template-config-ttsExternalVoiceId-voice-preview')).exists()).toBe(
      false
    )
    expect(button.text()).toBe('avatar_templates.form.voicePreview.action')
    expect(button.classes()).toContain('min-h-10')
  })

  it('hands the panel the form’s own provider and engine', async () => {
    const wrapper = mountForm('tavus', { ttsEngine: 'cartesia', ttsExternalVoiceId: 'ca-it' })
    await flushPromises()

    await wrapper.get(preview('ttsExternalVoiceId')).trigger('click')
    await flushPromises()

    expect(previewBodies().at(-1)).toEqual({
      provider: 'tavus',
      voice_id: 'ca-it',
      tts_engine: 'cartesia',
      language: 'it',
    })
  })
})
