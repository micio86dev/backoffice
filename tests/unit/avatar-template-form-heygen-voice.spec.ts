/**
 * AvatarTemplateForm — a PLATFORM HeyGen template chooses a Cartesia or
 * ElevenLabs voice (`ttsEngine` + `ttsExternalVoiceId`), like Tavus does.
 *
 * What an operator would get wrong without each test:
 *  - the engine selector and the vendor's voice picker appear for HeyGen;
 *  - the native `voiceId` is replaced by, never shown beside, an external voice;
 *  - clearing or changing the engine clears the voice;
 *  - an engine without a voice, or a voice without an engine, is refused before
 *    the round trip;
 *  - the listen control samples the VENDOR voice (not a generic HeyGen sample).
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
  'heygen:voice': { status: 'ok', items: [item({ id: 'hv-en', label: 'Hank' })] },
  'cartesia:voice': {
    status: 'ok',
    items: [
      item({ id: 'ca-it', provider: 'cartesia', label: 'Elena', italian: 'native' }),
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

/** What the PLATFORM field-spec route serves for HeyGen. */
const PLATFORM_SPECS: Record<ProviderName, FieldSpec[]> = {
  heygen: [
    { key: 'avatarId', type: 'text', label_key: 'l.avatarId', catalogue_resource: 'avatar' },
    {
      key: 'voiceId',
      type: 'text',
      label_key: 'l.voiceId',
      required: true,
      catalogue_resource: 'voice',
      superseded_by_key: 'ttsEngine',
      superseded_by_values: ['cartesia', 'elevenlabs'],
    },
    {
      key: 'ttsEngine',
      type: 'select',
      label_key: 'l.ttsEngine',
      options: ['none', 'cartesia', 'elevenlabs'],
      platform_only: true,
    },
    {
      key: 'ttsExternalVoiceId',
      type: 'text',
      label_key: 'l.ttsExternalVoiceId',
      platform_only: true,
    },
    { key: 'voiceSpeed', type: 'number', label_key: 'l.voiceSpeed', min: 0.8, max: 1.2 },
  ],
  tavus: [],
}

/** What the ORGANIZATION route serves: no platform-only field. */
const ORG_SPECS: Record<ProviderName, FieldSpec[]> = {
  heygen: PLATFORM_SPECS.heygen.filter((field) => field.platform_only !== true),
  tavus: [],
}

const mounted: Array<{ unmount: () => void }> = []

function mountForm(
  config: Record<string, unknown> = {},
  specs: Record<ProviderName, FieldSpec[]> = PLATFORM_SPECS
) {
  const wrapper = mount(AvatarTemplateForm, {
    props: {
      template: { name: 'T', provider: 'heygen', config, id: 7 },
      fieldSpecs: specs,
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
const preview = (key: string) => sel(`template-config-${key}-preview`)
const field = (key: string) => sel(`template-config-${key}`)
const previewBodies = () =>
  apiFetch.mock.calls
    .filter(([path]) => path === '/avatar-templates/voice-preview')
    .map(([, options]) => (options as { body: unknown }).body)

async function chooseEngine(wrapper: Form, engine: string): Promise<void> {
  const select = wrapper.get(field('ttsEngine'))
  ;(select.element as HTMLSelectElement).value = engine
  await select.trigger('change')
  await flushPromises()
}

async function pickVoice(wrapper: Form, id: string): Promise<void> {
  await wrapper.get(field('ttsExternalVoiceId')).trigger('click')
  await wrapper.get(sel(`template-config-ttsExternalVoiceId-item-${id}`)).trigger('click')
  await flushPromises()
}

async function submit(wrapper: Form): Promise<void> {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

beforeEach(() => {
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

describe('the engine selector and the voice picker', () => {
  it('offers the engine select with none, cartesia and elevenlabs on a HeyGen template', async () => {
    const wrapper = mountForm()
    await flushPromises()

    const options = wrapper.get(field('ttsEngine')).findAll('option')
    expect(options.map((option) => option.element.value)).toEqual([
      '',
      'none',
      'cartesia',
      'elevenlabs',
    ])
  })

  it('shows the native voice picker, and no external voice field, while no external engine is chosen', async () => {
    const wrapper = mountForm()
    await flushPromises()

    expect(wrapper.find(field('voiceId')).exists()).toBe(true)
    expect(wrapper.find(field('ttsExternalVoiceId')).exists()).toBe(false)

    await chooseEngine(wrapper, 'none')
    expect(wrapper.find(field('voiceId')).exists()).toBe(true)
    expect(wrapper.find(field('ttsExternalVoiceId')).exists()).toBe(false)
  })

  it.each([
    ['cartesia', 'ca-it'],
    ['elevenlabs', 'el-1'],
  ])('with %s the vendor voice picker replaces the native voice field', async (engine, voice) => {
    const wrapper = mountForm()
    await flushPromises()
    await chooseEngine(wrapper, engine)

    expect(wrapper.find(field('voiceId')).exists()).toBe(false)
    expect(fetchCatalogue).toHaveBeenCalledWith(engine, 'voice')

    await wrapper.get(field('ttsExternalVoiceId')).trigger('click')
    expect(wrapper.find(sel(`template-config-ttsExternalVoiceId-item-${voice}`)).exists()).toBe(
      true
    )
  })

  it('shows none of it in an organization template form, which is not given those specs', async () => {
    const wrapper = mountForm({}, ORG_SPECS)
    await flushPromises()

    expect(wrapper.find(field('ttsEngine')).exists()).toBe(false)
    expect(wrapper.find(field('ttsExternalVoiceId')).exists()).toBe(false)
    expect(wrapper.find(field('voiceId')).exists()).toBe(true)
  })
})

describe('what the engine clears', () => {
  it('choosing an external engine drops the native voice id from what is submitted', async () => {
    const wrapper = mountForm({ avatarId: 'av-1', voiceId: 'hv-en' })
    await flushPromises()
    await chooseEngine(wrapper, 'cartesia')
    await pickVoice(wrapper, 'ca-it')
    await submit(wrapper)

    const emitted = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, unknown> }
    expect(emitted.config).toEqual({
      avatarId: 'av-1',
      ttsEngine: 'cartesia',
      ttsExternalVoiceId: 'ca-it',
    })
  })

  it('changing the engine clears the voice that belonged to the previous one', async () => {
    const wrapper = mountForm({
      avatarId: 'av-1',
      ttsEngine: 'cartesia',
      ttsExternalVoiceId: 'ca-it',
    })
    await flushPromises()
    await chooseEngine(wrapper, 'elevenlabs')
    await submit(wrapper)

    // elevenlabs with no voice: refused, and nothing stale was kept
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('avatar_templates.error.config.tts_voice_required')
  })

  it('clearing the engine clears the voice and brings the native voice field back', async () => {
    const wrapper = mountForm({
      avatarId: 'av-1',
      ttsEngine: 'cartesia',
      ttsExternalVoiceId: 'ca-it',
    })
    await flushPromises()
    await chooseEngine(wrapper, '')

    expect(wrapper.find(field('voiceId')).exists()).toBe(true)
    expect(wrapper.find(field('ttsExternalVoiceId')).exists()).toBe(false)

    await submit(wrapper)
    // back to a native-voice template, whose voice is required again
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.find(sel('template-config-voiceId-error')).exists()).toBe(true)
  })
})

describe('client-side pairing, the same codes as the API', () => {
  it('refuses an external engine with no voice', async () => {
    const wrapper = mountForm({ avatarId: 'av-1', ttsEngine: 'cartesia' })
    await flushPromises()
    await submit(wrapper)

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.get(sel('template-config-ttsExternalVoiceId-error')).text()).toBe(
      'avatar_templates.error.config.tts_voice_required'
    )
  })

  it('does not ask for the native voice when an external one is chosen', async () => {
    const wrapper = mountForm({
      avatarId: 'av-1',
      ttsEngine: 'elevenlabs',
      ttsExternalVoiceId: 'el-1',
    })
    await flushPromises()
    await submit(wrapper)

    expect(wrapper.find(sel('template-config-voiceId-error')).exists()).toBe(false)
    expect(wrapper.emitted('submit')).toHaveLength(1)
  })

  it('refuses a voice the vendor catalogue (which answered) does not list', async () => {
    const wrapper = mountForm({
      avatarId: 'av-1',
      ttsEngine: 'cartesia',
      ttsExternalVoiceId: 'nope',
    })
    await flushPromises()
    await submit(wrapper)

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.get(sel('template-config-ttsExternalVoiceId-error')).text()).toBe(
      'avatar_templates.error.config.tts_voice_not_found'
    )
  })
})

describe('listening to the external voice', () => {
  it('samples the VENDOR voice, not a generic HeyGen sample', async () => {
    const wrapper = mountForm({
      avatarId: 'av-1',
      ttsEngine: 'cartesia',
      ttsExternalVoiceId: 'ca-it',
    })
    await flushPromises()

    await wrapper.get(preview('ttsExternalVoiceId')).trigger('click')
    await flushPromises()

    expect(previewBodies().at(-1)).toEqual({
      provider: 'cartesia',
      voice_id: 'ca-it',
      language: 'it',
    })
  })

  it('offers an Italian sample on each row of the vendor picker', async () => {
    const wrapper = mountForm({ avatarId: 'av-1', ttsEngine: 'elevenlabs' })
    await flushPromises()
    await wrapper.get(field('ttsExternalVoiceId')).trigger('click')
    await wrapper
      .get(sel('template-config-ttsExternalVoiceId-italian-preview-el-1'))
      .trigger('click')
    await flushPromises()

    expect(previewBodies().at(-1)).toEqual({
      provider: 'elevenlabs',
      voice_id: 'el-1',
      language: 'it',
    })
  })
})
