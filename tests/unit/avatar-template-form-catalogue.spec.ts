/**
 * AvatarTemplateForm — avatar/voice/persona selection, in BOTH the create and
 * the edit context (template-provider-fixes T6).
 *
 * The drawer mounts one form for both, keyed only on `template.id`; running
 * every behavioural test through both contexts is what proves Create and Edit
 * really do behave the same.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  'heygen:avatar': {
    status: 'ok',
    items: [
      item({ id: 'av-1', label: 'Anna', preview_image_url: 'https://cdn.test/anna.png' }),
      item({ id: 'av-2', label: 'Bea', preview_image_url: 'https://cdn.test/bea.png' }),
    ],
  },
  'heygen:voice': {
    status: 'ok',
    items: [
      item({ id: 'hv-it', label: 'Giulia', language: 'it', locale: 'it-IT', italian: 'native' }),
      item({ id: 'hv-en', label: 'Tom', language: 'en', locale: 'en-US' }),
    ],
  },
  'tavus:replica': {
    status: 'ok',
    items: [item({ id: 'rep-1', provider: 'tavus', label: 'Replica One' })],
  },
  'tavus:pal': {
    status: 'ok',
    items: [item({ id: 'pal-1', provider: 'tavus', label: 'Persona One' })],
  },
  'cartesia:voice': {
    status: 'ok',
    items: [
      item({ id: 'ca-it', provider: 'cartesia', label: 'Cartesia Elena', italian: 'native' }),
      item({ id: 'ca-en', provider: 'cartesia', label: 'Cartesia Sam' }),
    ],
  },
  'elevenlabs:voice': {
    status: 'ok',
    items: [item({ id: 'el-1', provider: 'elevenlabs', label: 'Rachel', italian: 'multilingual' })],
  },
}

const fetchCatalogue = vi.fn()

vi.mock('@/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ fetchCatalogue }),
}))

const SPECS: Record<ProviderName, FieldSpec[]> = {
  heygen: [
    {
      key: 'avatarId',
      type: 'text',
      label_key: 'avatar_templates.field.avatarId',
      required: true,
      catalogue_resource: 'avatar',
    },
    {
      key: 'voiceId',
      type: 'text',
      label_key: 'avatar_templates.field.voiceId',
      required: true,
      catalogue_resource: 'voice',
    },
  ],
  tavus: [
    {
      key: 'faceId',
      type: 'text',
      label_key: 'avatar_templates.field.faceId',
      required: true,
      catalogue_resource: 'replica',
    },
    {
      key: 'palId',
      type: 'text',
      label_key: 'avatar_templates.field.palId',
      required: true,
      catalogue_resource: 'pal',
    },
    {
      key: 'ttsEngine',
      type: 'select',
      label_key: 'avatar_templates.field.ttsEngine',
      options: ['tavus-auto', 'cartesia', 'elevenlabs', 'azure'],
    },
    {
      key: 'ttsExternalVoiceId',
      type: 'text',
      label_key: 'avatar_templates.field.ttsExternalVoiceId',
    },
  ],
}

type Context = 'create' | 'edit'

function mountForm(
  context: Context,
  template: Record<string, unknown> = {},
  submitError: unknown = null
) {
  return mount(AvatarTemplateForm, {
    props: {
      template: {
        name: 'Test template',
        provider: 'heygen',
        config: {},
        ...(context === 'edit' ? { id: 7 } : {}),
        ...template,
      },
      fieldSpecs: SPECS,
      saving: false,
      submitError,
    },
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  })
}

type Form = ReturnType<typeof mountForm>

const sel = (id: string) => `[data-testid="${id}"]`
const cfg = (key: string) => `template-config-${key}`

async function pick(wrapper: Form, key: string, id: string): Promise<void> {
  await wrapper.get(sel(cfg(key))).trigger('click')
  await wrapper.get(sel(`${cfg(key)}-item-${id}`)).trigger('click')
  await flushPromises()
}

async function submit(wrapper: Form): Promise<Record<string, unknown> | undefined> {
  await wrapper.get('form').trigger('submit')
  await flushPromises()

  return wrapper.emitted('submit')?.at(-1)?.[0] as Record<string, unknown> | undefined
}

beforeEach(() => {
  document.body.innerHTML = ''
  fetchCatalogue.mockReset()
  fetchCatalogue.mockImplementation((provider: string, resource: string) =>
    Promise.resolve(LISTS[`${provider}:${resource}`] ?? { status: 'empty', items: [] })
  )
})

describe.each<Context>(['create', 'edit'])('the template form in %s context', (context) => {
  describe('HeyGen avatars and voices', () => {
    it('loads the HeyGen avatar and voice catalogues', async () => {
      mountForm(context)
      await flushPromises()

      expect(fetchCatalogue).toHaveBeenCalledWith('heygen', 'avatar')
      expect(fetchCatalogue).toHaveBeenCalledWith('heygen', 'voice')
    })

    it('shows the avatar options and selecting one writes it to the config', async () => {
      const wrapper = mountForm(context, { config: { voiceId: 'hv-en' } })
      await flushPromises()

      await wrapper.get(sel(cfg('avatarId'))).trigger('click')
      expect(wrapper.find(sel(`${cfg('avatarId')}-item-av-1`)).exists()).toBe(true)
      expect(wrapper.find(sel(`${cfg('avatarId')}-item-av-2`)).exists()).toBe(true)

      await wrapper.get(sel(`${cfg('avatarId')}-item-av-2`)).trigger('click')
      await flushPromises()

      expect((await submit(wrapper))?.config).toEqual({ avatarId: 'av-2', voiceId: 'hv-en' })
    })

    it('selecting a voice writes it to the config', async () => {
      const wrapper = mountForm(context, { config: { avatarId: 'av-1' } })
      await flushPromises()

      await pick(wrapper, 'voiceId', 'hv-it')

      expect((await submit(wrapper))?.config).toEqual({ avatarId: 'av-1', voiceId: 'hv-it' })
    })

    it('closes the list after a selection and never reopens it', async () => {
      const wrapper = mountForm(context, { config: { voiceId: 'hv-en' } })
      await flushPromises()

      await pick(wrapper, 'avatarId', 'av-1')
      await wrapper.get(sel(cfg('avatarId'))).trigger('focus')
      await flushPromises()

      expect(wrapper.find(sel(`${cfg('avatarId')}-panel`)).exists()).toBe(false)
    })

    it('opens only one dropdown at a time', async () => {
      const wrapper = mountForm(context)
      await flushPromises()

      await wrapper.get(sel(cfg('avatarId'))).trigger('click')
      await wrapper.get(sel(cfg('voiceId'))).trigger('click')
      await flushPromises()

      expect(wrapper.find(sel(`${cfg('avatarId')}-panel`)).exists()).toBe(false)
      expect(wrapper.find(sel(`${cfg('voiceId')}-panel`)).exists()).toBe(true)
    })

    it('previews the selected avatar at 160px or more, updating as the choice changes', async () => {
      const wrapper = mountForm(context, { config: { avatarId: 'av-1' } })
      await flushPromises()

      const img = () => wrapper.get(sel(`${cfg('avatarId')}-preview-image`))
      expect(img().attributes('src')).toBe('https://cdn.test/anna.png')
      expect(img().attributes('style')).toContain('min-width: 160px')

      await pick(wrapper, 'avatarId', 'av-2')

      expect(img().attributes('src')).toBe('https://cdn.test/bea.png')
    })
  })

  describe('Italian voices', () => {
    it('lists native Italian voices with a badge and filters to them on demand', async () => {
      const wrapper = mountForm(context)
      await flushPromises()

      await wrapper.get(sel(cfg('voiceId'))).trigger('click')

      expect(wrapper.find(sel(`${cfg('voiceId')}-italian-badge-hv-it`)).exists()).toBe(true)

      await wrapper.get(sel(`${cfg('voiceId')}-italian-only`)).trigger('click')

      expect(wrapper.find(sel(`${cfg('voiceId')}-item-hv-it`)).exists()).toBe(true)
      expect(wrapper.find(sel(`${cfg('voiceId')}-item-hv-en`)).exists()).toBe(false)
    })

    it('an Italian voice can be selected and saved', async () => {
      const wrapper = mountForm(context, { config: { avatarId: 'av-1' } })
      await flushPromises()

      await wrapper.get(sel(cfg('voiceId'))).trigger('click')
      await wrapper.get(sel(`${cfg('voiceId')}-italian-only`)).trigger('click')
      await wrapper.get(sel(`${cfg('voiceId')}-item-hv-it`)).trigger('click')
      await flushPromises()

      expect((await submit(wrapper))?.config).toMatchObject({ voiceId: 'hv-it' })
    })
  })

  describe('Tavus: replica, persona and third-party voices', () => {
    const tavus = { provider: 'tavus' as const }

    it('lists replicas for the face and PERSONAS (not voices) for the pal', async () => {
      mountForm(context, tavus)
      await flushPromises()

      expect(fetchCatalogue).toHaveBeenCalledWith('tavus', 'replica')
      expect(fetchCatalogue).toHaveBeenCalledWith('tavus', 'pal')
      expect(fetchCatalogue).not.toHaveBeenCalledWith('tavus', 'voice')
    })

    it.each([
      ['cartesia', 'ca-it'],
      ['elevenlabs', 'el-1'],
    ])(
      "with engine %s the external voice picker lists that vendor's voices",
      async (engine, voice) => {
        const wrapper = mountForm(context, {
          ...tavus,
          config: { faceId: 'rep-1', palId: 'pal-1', ttsEngine: engine },
        })
        await flushPromises()

        expect(fetchCatalogue).toHaveBeenCalledWith(engine, 'voice')

        await pick(wrapper, 'ttsExternalVoiceId', voice)

        expect((await submit(wrapper))?.config).toMatchObject({
          ttsEngine: engine,
          ttsExternalVoiceId: voice,
        })
      }
    )

    it('keeps a plain text input for the external voice with an engine that has no catalogue', async () => {
      const wrapper = mountForm(context, { ...tavus, config: { ttsEngine: 'azure' } })
      await flushPromises()

      expect(wrapper.get(sel(cfg('ttsExternalVoiceId'))).element.tagName).toBe('INPUT')
    })

    it('changing the speech engine clears the voice chosen for the old one and reloads the list', async () => {
      const wrapper = mountForm(context, {
        ...tavus,
        config: {
          faceId: 'rep-1',
          palId: 'pal-1',
          ttsEngine: 'cartesia',
          ttsExternalVoiceId: 'ca-it',
        },
      })
      await flushPromises()
      fetchCatalogue.mockClear()

      await wrapper.get(sel(cfg('ttsEngine'))).setValue('elevenlabs')
      await flushPromises()

      expect(fetchCatalogue).toHaveBeenCalledWith('elevenlabs', 'voice')
      expect(wrapper.get(sel(cfg('ttsExternalVoiceId'))).text()).not.toContain('ca-it')

      const result = await submit(wrapper)

      // No voice for the new engine yet: refused instead of stored stale.
      expect(result).toBeUndefined()
      expect(wrapper.get(sel(`${cfg('ttsExternalVoiceId')}-error`)).text()).toContain(
        'avatar_templates.error.config.tts_voice_required'
      )
    })
  })

  describe('provider switching', () => {
    if (context === 'create') {
      it('clears the incompatible avatar, voice and persona selections and loads the new lists', async () => {
        const wrapper = mountForm(context, {
          config: { avatarId: 'av-1', voiceId: 'hv-it' },
        })
        await flushPromises()
        fetchCatalogue.mockClear()

        await wrapper.get(sel('template-field-provider')).setValue('tavus')
        await flushPromises()

        expect(fetchCatalogue).toHaveBeenCalledWith('tavus', 'replica')
        expect(fetchCatalogue).toHaveBeenCalledWith('tavus', 'pal')
        expect(wrapper.find(sel(cfg('avatarId'))).exists()).toBe(false)

        await pick(wrapper, 'faceId', 'rep-1')
        await pick(wrapper, 'palId', 'pal-1')

        // Nothing from HeyGen leaked across the switch.
        expect((await submit(wrapper))?.config).toEqual({ faceId: 'rep-1', palId: 'pal-1' })
      })

      it('drops the speech engine and its voice when switching away from Tavus', async () => {
        const wrapper = mountForm(context, {
          provider: 'tavus',
          config: { ttsEngine: 'cartesia', ttsExternalVoiceId: 'ca-it' },
        })
        await flushPromises()

        await wrapper.get(sel('template-field-provider')).setValue('heygen')
        await flushPromises()
        await pick(wrapper, 'avatarId', 'av-1')
        await pick(wrapper, 'voiceId', 'hv-en')

        expect((await submit(wrapper))?.config).toEqual({ avatarId: 'av-1', voiceId: 'hv-en' })
      })
    } else {
      it('cannot switch provider at all: the service is locked once the template exists', async () => {
        const wrapper = mountForm(context, { config: { avatarId: 'av-1', voiceId: 'hv-it' } })
        await flushPromises()

        expect(wrapper.get(sel('template-field-provider')).attributes('disabled')).toBeDefined()
      })
    }
  })

  describe('a combination the API would refuse is blocked before saving', () => {
    it('refuses an avatar the provider does not have', async () => {
      const wrapper = mountForm(context, { config: { avatarId: 'ghost', voiceId: 'hv-en' } })
      await flushPromises()

      expect(await submit(wrapper)).toBeUndefined()
      expect(wrapper.get(sel(`${cfg('avatarId')}-error`)).text()).toContain(
        'avatar_templates.error.config.avatar_not_found'
      )
    })

    it('refuses a voice the provider does not have', async () => {
      const wrapper = mountForm(context, { config: { avatarId: 'av-1', voiceId: 'ghost' } })
      await flushPromises()

      expect(await submit(wrapper)).toBeUndefined()
      expect(wrapper.get(sel(`${cfg('voiceId')}-error`)).text()).toContain(
        'avatar_templates.error.config.voice_not_found'
      )
    })

    it('refuses a persona that is really a voice id', async () => {
      const wrapper = mountForm(context, {
        provider: 'tavus',
        config: { faceId: 'rep-1', palId: 'hv-it' },
      })
      await flushPromises()

      expect(await submit(wrapper)).toBeUndefined()
      expect(wrapper.get(sel(`${cfg('palId')}-error`)).text()).toContain(
        'avatar_templates.error.config.pal_not_found'
      )
    })

    it('refuses a third-party voice the engine does not have', async () => {
      const wrapper = mountForm(context, {
        provider: 'tavus',
        config: {
          faceId: 'rep-1',
          palId: 'pal-1',
          ttsEngine: 'cartesia',
          ttsExternalVoiceId: 'el-1',
        },
      })
      await flushPromises()

      expect(await submit(wrapper)).toBeUndefined()
      expect(wrapper.get(sel(`${cfg('ttsExternalVoiceId')}-error`)).text()).toContain(
        'avatar_templates.error.config.tts_voice_not_found'
      )
    })

    it('refuses an external voice with no third-party engine', async () => {
      const wrapper = mountForm(context, {
        provider: 'tavus',
        config: { faceId: 'rep-1', palId: 'pal-1', ttsExternalVoiceId: 'ca-it' },
      })
      await flushPromises()

      expect(await submit(wrapper)).toBeUndefined()
      expect(wrapper.get(sel(`${cfg('ttsEngine')}-error`)).text()).toContain(
        'avatar_templates.error.config.tts_engine_required'
      )
    })

    it('does NOT block a save when the provider is down: the server decides', async () => {
      fetchCatalogue.mockResolvedValue({
        status: 'provider_error',
        items: [],
        code: 'provider_unavailable',
      })
      const wrapper = mountForm(context, { config: { avatarId: 'typed-1', voiceId: 'typed-2' } })
      await flushPromises()

      expect((await submit(wrapper))?.config).toEqual({ avatarId: 'typed-1', voiceId: 'typed-2' })
    })

    it('accepts a valid combination', async () => {
      const wrapper = mountForm(context, { config: { avatarId: 'av-1', voiceId: 'hv-en' } })
      await flushPromises()

      expect((await submit(wrapper))?.config).toEqual({ avatarId: 'av-1', voiceId: 'hv-en' })
    })
  })

  describe('picker states inside the form', () => {
    it('shows the provider error, localized, with a retry', async () => {
      fetchCatalogue.mockResolvedValue({
        status: 'provider_error',
        items: [],
        code: 'provider_unauthorized',
      })
      const wrapper = mountForm(context)
      await flushPromises()

      await wrapper.get(sel(cfg('voiceId'))).trigger('click')

      expect(wrapper.get(sel(`${cfg('voiceId')}-error`)).text()).toContain(
        'avatar_templates.form.catalogue.error.provider_unauthorized'
      )
      expect(wrapper.find(sel(`${cfg('voiceId')}-retry`)).exists()).toBe(true)
    })

    it('shows the empty state when the provider has nothing', async () => {
      fetchCatalogue.mockResolvedValue({ status: 'empty', items: [] })
      const wrapper = mountForm(context)
      await flushPromises()

      await wrapper.get(sel(cfg('voiceId'))).trigger('click')

      expect(wrapper.find(sel(`${cfg('voiceId')}-empty`)).exists()).toBe(true)
    })

    it('shows the loading state while the list is in flight', async () => {
      fetchCatalogue.mockReturnValue(new Promise(() => undefined))
      const wrapper = mountForm(context)
      await flushPromises()

      await wrapper.get(sel(cfg('voiceId'))).trigger('click')

      expect(wrapper.find(sel(`${cfg('voiceId')}-loading`)).exists()).toBe(true)
    })

    it.each([
      ['heygen', ['avatarId', 'voiceId']],
      ['tavus', ['faceId', 'palId']],
    ])(
      'shows the loading state on every %s catalogue trigger while the panel is CLOSED',
      async (provider, keys) => {
        fetchCatalogue.mockReturnValue(new Promise(() => undefined))
        const wrapper = mountForm(context, { provider })
        await flushPromises()

        for (const key of keys) {
          const trigger = wrapper.get(sel(cfg(key)))
          expect(trigger.attributes('aria-busy')).toBe('true')
          expect(wrapper.get(sel(`${cfg(key)}-trigger-loading`)).text()).toContain(
            'avatar_templates.form.catalogue.loading'
          )
        }
      }
    )
  })

  describe('server 422 config.* codes land on the right field', () => {
    function errorFor(errors: Record<string, string[]>) {
      return Object.assign(new Error('422'), { status: 422, data: { errors } })
    }

    it.each([
      ['avatarId', 'avatar_not_found'],
      ['voiceId', 'voice_not_found'],
    ])('config.%s / %s is shown under that field, translated', async (key, code) => {
      const wrapper = mountForm(
        context,
        { config: { avatarId: 'av-1', voiceId: 'hv-en' } },
        errorFor({ [`config.${key}`]: [code] })
      )
      await flushPromises()

      expect(wrapper.get(sel(`${cfg(key)}-error`)).text()).toContain(
        `avatar_templates.error.config.${code}`
      )
      expect(wrapper.find(sel('template-form-errors')).exists()).toBe(false)
    })

    it.each([
      ['palId', 'pal_not_found'],
      ['ttsExternalVoiceId', 'tts_voice_not_found'],
      ['ttsEngine', 'tts_engine_required'],
      ['ttsExternalVoiceId', 'tts_voice_required'],
    ])('config.%s / %s is shown under that field, translated', async (key, code) => {
      const wrapper = mountForm(
        context,
        { provider: 'tavus', config: {} },
        errorFor({ [`config.${key}`]: [code] })
      )
      await flushPromises()

      expect(wrapper.get(sel(`${cfg(key)}-error`)).text()).toContain(
        `avatar_templates.error.config.${code}`
      )
    })
  })
})
