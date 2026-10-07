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

/** What the field-spec routes serve a SUPERADMIN for HeyGen (either template page). */
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
      superadmin_only: true,
    },
    {
      key: 'ttsModelName',
      type: 'select',
      label_key: 'l.ttsModelName',
      options: ['sonic-3.5', 'sonic-3', 'eleven_flash_v2_5', 'eleven_multilingual_v2'],
      options_depend_on: 'ttsEngine',
      options_by_value: {
        cartesia: ['sonic-3.5', 'sonic-3'],
        elevenlabs: ['eleven_flash_v2_5', 'eleven_multilingual_v2'],
      },
      superadmin_only: true,
    },
    {
      key: 'ttsExternalVoiceId',
      type: 'text',
      label_key: 'l.ttsExternalVoiceId',
      superadmin_only: true,
    },
    { key: 'voiceSpeed', type: 'number', label_key: 'l.voiceSpeed', min: 0.8, max: 1.2 },
    // The knobs a Cartesia settings object lacks: the server declares Cartesia as the engine that replaces them.
    ...['voiceStability', 'voiceSimilarityBoost', 'voiceStyle'].map((key): FieldSpec => ({
      key,
      type: 'number',
      label_key: `l.${key}`,
      min: 0,
      max: 1,
      superseded_by_key: 'ttsEngine',
      superseded_by_values: ['cartesia'],
    })),
    {
      key: 'voiceUseSpeakerBoost',
      type: 'checkbox',
      label_key: 'l.voiceUseSpeakerBoost',
      superseded_by_key: 'ttsEngine',
      superseded_by_values: ['cartesia'],
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
  ],
}

/** What the spec routes serve everyone who is NOT a superadmin: no superadmin-only field. */
const ORG_SPECS: Record<ProviderName, FieldSpec[]> = {
  heygen: PLATFORM_SPECS.heygen.filter((field) => field.superadmin_only !== true),
  tavus: PLATFORM_SPECS.tavus,
}

const mounted: Array<{ unmount: () => void }> = []

function mountForm(
  config: Record<string, unknown> = {},
  specs: Record<ProviderName, FieldSpec[]> = PLATFORM_SPECS,
  template: { id?: number; provider?: ProviderName } = {}
) {
  const wrapper = mount(AvatarTemplateForm, {
    props: {
      template: { name: 'T', provider: 'heygen', config, id: 7, ...template },
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

  it('shows engine, voice model and voice id fields on a HeyGen template right away, like Tavus, with no save first', async () => {
    const wrapper = mountForm({}, PLATFORM_SPECS, { id: undefined })
    await flushPromises()

    for (const key of ['ttsEngine', 'ttsModelName', 'ttsExternalVoiceId', 'voiceId']) {
      expect(wrapper.find(field(key)).exists(), key).toBe(true)
    }
  })

  it('offers only the models of the chosen engine, and none until an engine is chosen', async () => {
    const wrapper = mountForm({}, PLATFORM_SPECS, { id: undefined })
    await flushPromises()

    const models = () =>
      wrapper
        .get(field('ttsModelName'))
        .findAll('option')
        .map((option) => option.element.value)

    expect(models()).toEqual([''])
    expect(wrapper.get(field('ttsModelName')).attributes('disabled')).toBeDefined()

    await chooseEngine(wrapper, 'cartesia')
    expect(models()).toEqual(['', 'sonic-3.5', 'sonic-3'])

    await chooseEngine(wrapper, 'elevenlabs')
    expect(models()).toEqual(['', 'eleven_flash_v2_5', 'eleven_multilingual_v2'])
  })

  it('changing the engine drops a model that engine does not offer', async () => {
    const wrapper = mountForm({
      avatarId: 'av-1',
      ttsEngine: 'cartesia',
      ttsModelName: 'sonic-3',
      ttsExternalVoiceId: 'ca-it',
    })
    await flushPromises()
    await chooseEngine(wrapper, 'elevenlabs')
    await pickVoice(wrapper, 'el-1')
    await submit(wrapper)

    const emitted = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, unknown> }
    expect(emitted.config).toEqual({
      avatarId: 'av-1',
      ttsEngine: 'elevenlabs',
      ttsExternalVoiceId: 'el-1',
    })
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
    // the voice that belonged to the cleared engine is gone
    expect((wrapper.get(field('ttsExternalVoiceId')).element as HTMLInputElement).value).toBe('')

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

describe('switching the provider on a new template', () => {
  async function chooseProvider(wrapper: Form, provider: string): Promise<void> {
    const select = wrapper.get(sel('template-field-provider'))
    ;(select.element as HTMLSelectElement).value = provider
    await select.trigger('change')
    await flushPromises()
  }

  it('re-renders the right fields each way, Tavus <-> HeyGen, with the voice fields on HeyGen', async () => {
    const wrapper = mountForm({}, PLATFORM_SPECS, { id: undefined, provider: 'tavus' })
    await flushPromises()

    expect(wrapper.find(field('faceId')).exists()).toBe(true)
    expect(wrapper.find(field('avatarId')).exists()).toBe(false)
    expect(wrapper.find(field('ttsModelName')).exists()).toBe(false)

    await chooseProvider(wrapper, 'heygen')
    expect(wrapper.find(field('avatarId')).exists()).toBe(true)
    expect(wrapper.find(field('faceId')).exists()).toBe(false)
    for (const key of ['ttsEngine', 'ttsModelName', 'ttsExternalVoiceId']) {
      expect(wrapper.find(field(key)).exists(), key).toBe(true)
    }

    await chooseProvider(wrapper, 'tavus')
    expect(wrapper.find(field('faceId')).exists()).toBe(true)
    expect(wrapper.find(field('ttsModelName')).exists()).toBe(false)
    expect(wrapper.find(field('ttsEngine')).exists()).toBe(true)
  })

  it("does not carry the other provider's engine across the switch", async () => {
    const wrapper = mountForm({}, PLATFORM_SPECS, { id: undefined, provider: 'heygen' })
    await flushPromises()
    await chooseEngine(wrapper, 'cartesia')

    await chooseProvider(wrapper, 'tavus')
    await chooseProvider(wrapper, 'heygen')

    expect((wrapper.get(field('ttsEngine')).element as HTMLSelectElement).value).toBe('')
    expect(wrapper.find(field('voiceId')).exists()).toBe(true)
  })
})

describe('a config that already breaks the superseded invariant when the form opens', () => {
  it('does not resubmit the native voice id an external engine replaces', async () => {
    const wrapper = mountForm({
      avatarId: 'av-1',
      voiceId: 'hv-en',
      ttsEngine: 'cartesia',
      ttsExternalVoiceId: 'ca-it',
    })
    await flushPromises()
    await submit(wrapper)

    const emitted = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, unknown> }
    expect(emitted.config).toEqual({
      avatarId: 'av-1',
      ttsEngine: 'cartesia',
      ttsExternalVoiceId: 'ca-it',
    })
  })

  it('leaves a consistent config untouched', async () => {
    const wrapper = mountForm({ avatarId: 'av-1', voiceId: 'hv-en', ttsEngine: 'none' })
    await flushPromises()
    await submit(wrapper)

    const emitted = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, unknown> }
    expect(emitted.config).toEqual({ avatarId: 'av-1', voiceId: 'hv-en', ttsEngine: 'none' })
  })
})

const CARTESIA_UNSUPPORTED = [
  'voiceStability',
  'voiceSimilarityBoost',
  'voiceStyle',
  'voiceUseSpeakerBoost',
] as const

describe('the voice knobs the Cartesia engine does not have', () => {
  it('shows them with no engine and with ElevenLabs, and never with Cartesia', async () => {
    const wrapper = mountForm({ avatarId: 'av-1', voiceId: 'hv-en' })
    await flushPromises()
    for (const key of CARTESIA_UNSUPPORTED) expect(wrapper.find(field(key)).exists()).toBe(true)

    await chooseEngine(wrapper, 'cartesia')
    for (const key of CARTESIA_UNSUPPORTED) expect(wrapper.find(field(key)).exists()).toBe(false)
    // speed IS a Cartesia setting and stays
    expect(wrapper.find(field('voiceSpeed')).exists()).toBe(true)

    await chooseEngine(wrapper, 'elevenlabs')
    for (const key of CARTESIA_UNSUPPORTED) expect(wrapper.find(field(key)).exists()).toBe(true)
  })

  it('drops a value held for them when the engine becomes Cartesia, so it is never submitted', async () => {
    const wrapper = mountForm({
      avatarId: 'av-1',
      ttsEngine: 'elevenlabs',
      ttsExternalVoiceId: 'el-it',
      voiceStability: 0.5,
      voiceUseSpeakerBoost: true,
      voiceSpeed: 1.1,
    })
    await flushPromises()
    await chooseEngine(wrapper, 'cartesia')
    await pickVoice(wrapper, 'ca-it')
    await submit(wrapper)

    const emitted = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, unknown> }
    expect(emitted.config).toEqual({
      avatarId: 'av-1',
      ttsEngine: 'cartesia',
      ttsExternalVoiceId: 'ca-it',
      voiceSpeed: 1.1,
    })
  })

  it('does not resubmit them from a stored Cartesia config', async () => {
    const wrapper = mountForm({
      avatarId: 'av-1',
      ttsEngine: 'cartesia',
      ttsExternalVoiceId: 'ca-it',
      voiceStyle: 0.2,
    })
    await flushPromises()
    await submit(wrapper)

    const emitted = wrapper.emitted('submit')?.[0]?.[0] as { config: Record<string, unknown> }
    expect(emitted.config).toEqual({
      avatarId: 'av-1',
      ttsEngine: 'cartesia',
      ttsExternalVoiceId: 'ca-it',
    })
  })
})

describe('listening while no catalogued engine is chosen', () => {
  it.each([
    ['no engine', {}],
    ['engine none', { ttsEngine: 'none' }],
  ])(
    'offers no sample of a vendor voice id with %s, rather than asking HeyGen for it',
    async (_label, extra) => {
      const wrapper = mountForm({ avatarId: 'av-1', ttsExternalVoiceId: 'ca-it', ...extra })
      await flushPromises()

      expect(wrapper.find(preview('ttsExternalVoiceId')).exists()).toBe(false)
      expect(previewBodies()).toEqual([])
    }
  )
})

const CONFIG_ERROR_CODES = [
  'superadmin_only',
  'superseded_by_tts_engine',
  'tts_setting_unsupported',
  'tts_voice_unverifiable',
  'tts_voice_bind_failed',
  'tts_vendor_key_missing',
  'tts_provider_unconfigured',
  'tts_secret_failed',
  'tts_bind_busy',
  'tts_engine_unsupported',
] as const

describe('every refusal the API answers on the external voice reaches the operator', () => {
  it.each(CONFIG_ERROR_CODES)('renders %s on the voice field', async (code) => {
    const wrapper = mountForm({
      avatarId: 'av-1',
      ttsEngine: 'cartesia',
      ttsExternalVoiceId: 'ca-it',
    })
    await flushPromises()
    await wrapper.setProps({
      submitError: { status: 422, data: { errors: { 'config.ttsExternalVoiceId': [code] } } },
    })
    await flushPromises()

    expect(wrapper.get(sel('template-config-ttsExternalVoiceId-error')).text()).toBe(
      `avatar_templates.error.config.${code}`
    )
    expect(wrapper.find(sel('template-form-errors')).exists()).toBe(false)
  })
})

describe('a server error for a field the engine hides (R3-001)', () => {
  it('falls through to the summary, not onto a control that is not rendered', async () => {
    const wrapper = mountForm({
      avatarId: 'av-1',
      ttsEngine: 'cartesia',
      ttsExternalVoiceId: 'ca-it',
    })
    await flushPromises()
    expect(wrapper.find(field('voiceId')).exists()).toBe(false)

    await wrapper.setProps({
      submitError: { status: 422, data: { errors: { 'config.voiceId': ['tts_bind_busy'] } } },
    })
    await flushPromises()

    expect(wrapper.get(sel('template-form-errors')).text()).toContain(
      'avatar_templates.error.config.tts_bind_busy'
    )
    expect(wrapper.find(sel('template-config-voiceId-error')).exists()).toBe(false)
  })

  it('still claims an error for a field that is visible', async () => {
    const wrapper = mountForm({ avatarId: 'av-1', voiceId: 'hv-en', ttsEngine: 'none' })
    await flushPromises()

    await wrapper.setProps({
      submitError: { status: 422, data: { errors: { 'config.voiceId': ['tts_bind_busy'] } } },
    })
    await flushPromises()

    expect(wrapper.get(sel('template-config-voiceId-error')).text()).toBe(
      'avatar_templates.error.config.tts_bind_busy'
    )
    expect(wrapper.find(sel('template-form-errors')).exists()).toBe(false)
  })
})

describe('the column layout does not depend on the engine (R3-002)', () => {
  // Exactly TWO_COLUMN_MIN_FIELDS (5) fields, one of which the engine hides:
  // the layout counts the provider's fields, so switching engine never reflows the form.
  const FIVE: Record<ProviderName, FieldSpec[]> = {
    heygen: [
      { key: 'avatarId', type: 'text', label_key: 'l.avatarId' },
      { key: 'voiceSpeed', type: 'number', label_key: 'l.voiceSpeed' },
      { key: 'ttsEngine', type: 'select', label_key: 'l.ttsEngine', options: ['none', 'cartesia'] },
      { key: 'ttsExternalVoiceId', type: 'text', label_key: 'l.ttsExternalVoiceId' },
      {
        key: 'voiceId',
        type: 'text',
        label_key: 'l.voiceId',
        superseded_by_key: 'ttsEngine',
        superseded_by_values: ['cartesia'],
      },
    ],
    tavus: [],
  }

  it('keeps two columns when the engine hides a superseded field', async () => {
    const wrapper = mountForm({ ttsEngine: 'none' }, FIVE)
    await flushPromises()
    const container = () => wrapper.get(sel('template-config-fields'))
    expect(container().classes()).toContain('grid')

    await chooseEngine(wrapper, 'cartesia')
    expect(wrapper.find(field('voiceId')).exists()).toBe(false)
    expect(container().classes()).toContain('grid')
  })
})
