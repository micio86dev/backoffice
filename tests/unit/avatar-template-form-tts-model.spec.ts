/**
 * AvatarTemplateForm — Tavus `ttsModelName` and the persona sync banner.
 *
 * The model select is generic: it narrows its options by the CURRENT value of
 * the field named in `options_depend_on`, using `options_by_value`. An engine
 * with no model list (azure, tavus-auto, unset) disables it with the reason.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AvatarTemplateForm from '../../app/components/organisms/AvatarTemplateForm.vue'
import type { FieldSpec, ProviderName } from '../../app/types/avatar-template'

const fetchCatalogue = vi.fn()

vi.mock('@/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ fetchCatalogue }),
}))

const SPECS: Record<ProviderName, FieldSpec[]> = {
  heygen: [],
  tavus: [
    {
      key: 'ttsEngine',
      type: 'select',
      label_key: 'avatar_templates.field.ttsEngine',
      options: ['tavus-auto', 'cartesia', 'elevenlabs', 'azure'],
    },
    {
      key: 'ttsModelName',
      type: 'select',
      label_key: 'avatar_templates.field.ttsModelName',
      hint_key: 'avatar_templates.hint.ttsModelName',
      options: ['sonic-3', 'sonic-3.5', 'eleven_multilingual_v2'],
      options_depend_on: 'ttsEngine',
      options_by_value: {
        cartesia: ['sonic-3', 'sonic-3.5'],
        elevenlabs: ['eleven_multilingual_v2'],
      },
    },
  ],
}

function mountForm(template: Record<string, unknown> = {}, submitError: unknown = null) {
  return mount(AvatarTemplateForm, {
    props: {
      template: { name: 'T', provider: 'tavus', config: {}, id: 9, ...template },
      fieldSpecs: SPECS,
      saving: false,
      submitError,
    },
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  })
}

const sel = (id: string) => `[data-testid="${id}"]`
const MODEL = sel('template-config-ttsModelName')
const ENGINE = sel('template-config-ttsEngine')

function modelOptions(wrapper: ReturnType<typeof mountForm>): string[] {
  return wrapper
    .get(MODEL)
    .findAll('option')
    .map((o) => o.attributes('value') ?? '')
    .filter((v) => v !== '')
}

async function submit(wrapper: ReturnType<typeof mountForm>) {
  await wrapper.get('form').trigger('submit')
  await flushPromises()

  return wrapper.emitted('submit')?.at(-1)?.[0] as Record<string, unknown> | undefined
}

beforeEach(() => {
  document.body.innerHTML = ''
  fetchCatalogue.mockReset()
  fetchCatalogue.mockResolvedValue({ status: 'empty', items: [] })
})

describe('ttsModelName narrowed by ttsEngine', () => {
  it('offers only the models of the chosen engine', async () => {
    const wrapper = mountForm({ config: { ttsEngine: 'cartesia' } })
    await flushPromises()

    expect(modelOptions(wrapper)).toEqual(['sonic-3', 'sonic-3.5'])

    await wrapper.get(ENGINE).setValue('elevenlabs')
    expect(modelOptions(wrapper)).toEqual(['eleven_multilingual_v2'])
  })

  it('resets a chosen model the new engine does not offer', async () => {
    const wrapper = mountForm({ config: { ttsEngine: 'cartesia', ttsModelName: 'sonic-3.5' } })
    await flushPromises()

    await wrapper.get(ENGINE).setValue('elevenlabs')

    expect((await submit(wrapper))?.config).toEqual({ ttsEngine: 'elevenlabs' })
  })

  it('keeps the chosen model when the engine still offers it', async () => {
    const wrapper = mountForm({ config: { ttsEngine: 'cartesia', ttsModelName: 'sonic-3.5' } })
    await flushPromises()

    await wrapper.get(MODEL).setValue('sonic-3')

    expect((await submit(wrapper))?.config).toEqual({
      ttsEngine: 'cartesia',
      ttsModelName: 'sonic-3',
    })
  })

  it.each([['azure'], ['tavus-auto'], ['']])(
    'disables the select with a reason for engine "%s"',
    async (engine) => {
      const wrapper = mountForm({ config: engine === '' ? {} : { ttsEngine: engine } })
      await flushPromises()

      expect(wrapper.get(MODEL).attributes('disabled')).toBeDefined()
      const reason = wrapper.get(sel('template-config-ttsModelName-unavailable'))
      expect(reason.text()).toContain('avatar_templates.form.dependentUnavailable')
      expect(wrapper.get(MODEL).attributes('aria-describedby')).toContain(
        'template-config-ttsModelName-unavailable'
      )
    }
  )

  it('enables it again once an engine with models is chosen', async () => {
    const wrapper = mountForm({ config: { ttsEngine: 'azure' } })
    await flushPromises()

    await wrapper.get(ENGINE).setValue('cartesia')

    expect(wrapper.get(MODEL).attributes('disabled')).toBeUndefined()
    expect(wrapper.find(sel('template-config-ttsModelName-unavailable')).exists()).toBe(false)
  })

  it('places a tts_model_engine_mismatch 422 on the field', async () => {
    const wrapper = mountForm(
      { config: { ttsEngine: 'cartesia', ttsModelName: 'sonic-3' } },
      { data: { errors: { 'config.ttsModelName': ['tts_model_engine_mismatch'] } } }
    )
    await flushPromises()

    expect(wrapper.get(sel('template-config-ttsModelName-error')).text()).toContain(
      'avatar_templates.error.config.tts_model_engine_mismatch'
    )
  })
})

describe('one control per field', () => {
  it('renders a select field as a select only, never with a stray text input', async () => {
    const wrapper = mountForm({ config: { ttsEngine: 'cartesia' } })
    await flushPromises()

    for (const key of ['ttsEngine', 'ttsModelName']) {
      const controls = wrapper.findAll(`#template-config-${key}`)
      expect(controls).toHaveLength(1)
      expect(controls[0]!.element.tagName).toBe('SELECT')
    }
  })
})

describe('persona sync banner in the form', () => {
  const warning = { status: 'warning', code: 'pal_not_editable', synced_at: null }

  it('shows the banner when editing a Tavus template', async () => {
    const wrapper = mountForm({ pal_sync: warning })
    await flushPromises()

    const banner = wrapper.get(sel('pal-sync'))
    expect(banner.attributes('data-layout')).toBe('banner')
    expect(banner.text()).toContain('avatar_templates.warning.pal_not_editable')
  })

  it('shows nothing when creating a template', async () => {
    const wrapper = mountForm({ id: undefined, pal_sync: warning })
    await flushPromises()

    expect(wrapper.find(sel('pal-sync')).exists()).toBe(false)
  })

  it('shows nothing for a HeyGen template', async () => {
    const wrapper = mountForm({ provider: 'heygen', pal_sync: warning })
    await flushPromises()

    expect(wrapper.find(sel('pal-sync')).exists()).toBe(false)
  })
})
