/**
 * hr-avatar-adapter B1: the template form offers `hr_avatar` and a config
 * picker ONLY when the api reports the capability (an `hr_avatar` key in the
 * served field specs). Without that key the form is exactly what it was.
 *
 * Everything the default path depends on (option order, heygen/tavus payload
 * shape, the LLM block) is asserted here against the same mount with and
 * without the key, and the existing form specs stay unedited beside this one.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AvatarTemplateForm from '../../app/components/organisms/AvatarTemplateForm.vue'
import AvatarTemplateProviderCombobox from '../../app/components/organisms/AvatarTemplateProviderCombobox.vue'
import ProjectTable from '../../app/components/organisms/ProjectTable.vue'
import PalSyncStatus from '../../app/components/molecules/PalSyncStatus.vue'
import en from '../../i18n/locales/en.json'
import it_ from '../../i18n/locales/it.json'
import type {
  CatalogueEntry,
  CatalogueResponse,
  FieldSpec,
  FieldSpecMap,
} from '../../app/types/avatar-template'

const KEY = 'hr_avatar_config_id'

function item(over: Partial<CatalogueEntry> & { id: string }): CatalogueEntry {
  return {
    provider: 'hr_avatar',
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
  } as CatalogueEntry
}

let hrAvatarList: CatalogueResponse

const fetchCatalogue = vi.fn()

vi.mock('@/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ fetchCatalogue }),
}))
vi.mock('@/composables/useLlmModels', () => ({
  useLlmModels: () => ({
    listModels: () =>
      Promise.resolve({
        data: [{ id: 1, key: 'm1', display_name: 'M1', mode: 'managed', is_available: true }],
      }),
  }),
}))
vi.mock('@/composables/useLlmCredentials', () => ({
  useLlmCredentials: () => ({
    listCredentials: () => Promise.resolve({ data: [{ id: 3, name: 'Key' }] }),
  }),
}))

const HEYGEN: FieldSpec[] = [
  {
    key: 'avatarId',
    type: 'text',
    label_key: 'avatar_templates.field.avatarId',
    catalogue_resource: 'avatar',
  },
]
const TAVUS: FieldSpec[] = [
  { key: 'ttsEngine', type: 'select', label_key: 'x', options: ['tavus-auto', 'cartesia'] },
]

const WITHOUT: FieldSpecMap = { heygen: HEYGEN, tavus: TAVUS }
const WITH: FieldSpecMap = { heygen: HEYGEN, tavus: TAVUS, hr_avatar: [] }

function mountForm(
  fieldSpecs: FieldSpecMap,
  template: Record<string, unknown> = {},
  submitError: unknown = null
) {
  return mount(AvatarTemplateForm, {
    props: {
      template: { name: 'Test template', provider: 'heygen', config: {}, ...template },
      fieldSpecs,
      saving: false,
      submitError,
    },
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  })
}

type Form = ReturnType<typeof mountForm>

const sel = (id: string) => `[data-testid="${id}"]`
const cfg = `template-config-${KEY}`

async function chooseHrAvatar(wrapper: Form): Promise<void> {
  await wrapper.get(sel('template-field-provider')).setValue('hr_avatar')
  await flushPromises()
}

async function submit(wrapper: Form): Promise<Record<string, unknown> | undefined> {
  await wrapper.get('form').trigger('submit')
  await flushPromises()

  return wrapper.emitted('submit')?.at(-1)?.[0] as Record<string, unknown> | undefined
}

function optionValues(wrapper: Form): string[] {
  return wrapper
    .get(sel('template-field-provider'))
    .findAll('option')
    .map((option) => (option.element as HTMLOptionElement).value)
}

beforeEach(() => {
  document.body.innerHTML = ''
  hrAvatarList = {
    status: 'ok',
    items: [item({ id: 'avc_1', label: 'Interviewer' }), item({ id: 'avc_2', label: 'Recruiter' })],
  }
  fetchCatalogue.mockReset()
  fetchCatalogue.mockImplementation((provider: string, resource: string) => {
    if (provider === 'hr_avatar' && resource === 'avatar_config')
      return Promise.resolve(hrAvatarList)
    if (provider === 'heygen' && resource === 'avatar') {
      return Promise.resolve({
        status: 'ok',
        items: [item({ id: 'av-1', provider: 'heygen', label: 'Anna' })],
      })
    }

    return Promise.resolve({ status: 'empty', items: [] })
  })
})

describe('capability gating', () => {
  it('offers exactly heygen and tavus, in that order, without the hr_avatar key', async () => {
    const wrapper = mountForm(WITHOUT)
    await flushPromises()

    expect(optionValues(wrapper)).toEqual(['heygen', 'tavus'])
    expect(wrapper.find(sel(cfg)).exists()).toBe(false)
    expect(fetchCatalogue).not.toHaveBeenCalledWith('hr_avatar', expect.anything())
  })

  it('adds the hr_avatar option last when the key is present, including an empty list', async () => {
    const wrapper = mountForm(WITH)
    await flushPromises()

    expect(optionValues(wrapper)).toEqual(['heygen', 'tavus', 'hr_avatar'])
    expect(wrapper.find(sel(cfg)).exists()).toBe(false)
  })

  it('keeps heygen and tavus payloads identical with and without the key', async () => {
    const config = { avatarId: 'av-1' }
    const payloads: Record<string, unknown>[] = []

    for (const specs of [WITHOUT, WITH]) {
      const wrapper = mountForm(specs, { config })
      await flushPromises()
      payloads.push((await submit(wrapper)) as Record<string, unknown>)
    }

    expect(payloads[0]).toEqual(payloads[1])
    expect(Object.keys(payloads[0]!)).toEqual([
      'name',
      'description',
      'provider',
      'config',
      'llm_model_id',
      'llm_credential_id',
      'answer_min_seconds',
      'answer_max_seconds',
    ])
    expect(payloads[0]).toMatchObject({ provider: 'heygen', config })
  })

  it('still shows the LLM block for heygen and tavus when the key is present', async () => {
    const wrapper = mountForm(WITH)
    await flushPromises()

    expect(wrapper.find(sel('template-llm-section')).exists()).toBe(true)
  })
})

describe('the hr_avatar picker', () => {
  it('lists the catalogue items and selecting one sets the id', async () => {
    const wrapper = mountForm(WITH)
    await chooseHrAvatar(wrapper)

    expect(fetchCatalogue).toHaveBeenCalledWith('hr_avatar', 'avatar_config')

    await wrapper.get(sel(cfg)).trigger('click')
    expect(wrapper.find(sel(`${cfg}-item-avc_1`)).exists()).toBe(true)
    expect(wrapper.find(sel(`${cfg}-item-avc_2`)).exists()).toBe(true)

    await wrapper.get(sel(`${cfg}-item-avc_2`)).trigger('click')
    await flushPromises()

    expect((await submit(wrapper))?.[KEY]).toBe('avc_2')
  })

  it('stores only the association: provider, name, id and an empty config', async () => {
    const wrapper = mountForm(WITH)
    await chooseHrAvatar(wrapper)
    await wrapper.get(sel(cfg)).trigger('click')
    await wrapper.get(sel(`${cfg}-item-avc_1`)).trigger('click')
    await flushPromises()

    const payload = await submit(wrapper)

    expect(payload).toMatchObject({
      provider: 'hr_avatar',
      name: 'Test template',
      [KEY]: 'avc_1',
      config: {},
    })
    expect(payload).not.toHaveProperty('llm_model_id')
    expect(payload).not.toHaveProperty('llm_credential_id')
    expect(JSON.stringify(payload)).not.toContain('Interviewer')
  })

  it('renders no knob controls and no LLM block for hr_avatar', async () => {
    const wrapper = mountForm(WITH)
    await chooseHrAvatar(wrapper)

    const fields = wrapper.get(sel('template-config-fields'))
    expect(fields.findAll('input, select')).toHaveLength(0)
    expect(fields.findAll('[role="combobox"]')).toHaveLength(1)
    expect(wrapper.find(sel('template-llm-section')).exists()).toBe(false)
  })

  it('drops a previously chosen id when the provider is switched away and back', async () => {
    const wrapper = mountForm(WITH)
    await chooseHrAvatar(wrapper)
    await wrapper.get(sel(cfg)).trigger('click')
    await wrapper.get(sel(`${cfg}-item-avc_1`)).trigger('click')
    await wrapper.get(sel('template-field-provider')).setValue('tavus')
    await chooseHrAvatar(wrapper)

    expect((await submit(wrapper))?.[KEY]).toBeUndefined()
    expect(wrapper.find(sel(`${cfg}-error`)).exists()).toBe(true)
  })

  it('is not blocked by a half-set LLM binding left over from another provider', async () => {
    const wrapper = mountForm(WITH)
    await flushPromises()
    // A credential without a model is invalid on heygen; hr_avatar never sends it.
    await wrapper.get(sel('template-llm-credential')).setValue('3')
    await chooseHrAvatar(wrapper)
    await wrapper.get(sel(cfg)).trigger('click')
    await wrapper.get(sel(`${cfg}-item-avc_1`)).trigger('click')
    await flushPromises()

    const payload = await submit(wrapper)

    expect(payload).toMatchObject({ provider: 'hr_avatar', [KEY]: 'avc_1' })
    expect(payload).not.toHaveProperty('llm_credential_id')
  })

  it('still refuses that half-set binding on heygen', async () => {
    const wrapper = mountForm(WITH)
    await flushPromises()
    await wrapper.get(sel('template-llm-credential')).setValue('3')

    expect(await submit(wrapper)).toBeUndefined()
    expect(wrapper.find(sel('template-llm-model-error')).exists()).toBe(true)
  })

  it('requires an id before submitting', async () => {
    const wrapper = mountForm(WITH)
    await chooseHrAvatar(wrapper)

    expect(await submit(wrapper)).toBeUndefined()
    expect(wrapper.get(sel(`${cfg}-error`)).text()).toBe(
      'avatar_templates.form.errors.fieldRequired'
    )
  })
})

describe('manual entry when the proxy cannot list', () => {
  async function openPanel(wrapper: Form): Promise<void> {
    await wrapper.get(sel(cfg)).trigger('click')
    await flushPromises()
  }

  it.each([
    ['provider_error', { status: 'provider_error', items: [], code: 'provider_unavailable' }],
    ['empty', { status: 'empty', items: [] }],
  ] as const)('accepts a typed id on %s and submits it', async (_name, list) => {
    hrAvatarList = list as CatalogueResponse
    const wrapper = mountForm(WITH)
    await chooseHrAvatar(wrapper)
    await openPanel(wrapper)

    await wrapper.get(sel(`${cfg}-manual`)).setValue('avc_ABC123')

    expect((await submit(wrapper))?.[KEY]).toBe('avc_ABC123')
  })

  it.each(['cfg_1', 'avc_', 'avc_a-b', 'AVC_1'])('refuses the malformed id %s', async (bad) => {
    hrAvatarList = { status: 'empty', items: [] }
    const wrapper = mountForm(WITH)
    await chooseHrAvatar(wrapper)
    await openPanel(wrapper)
    await wrapper.get(sel(`${cfg}-manual`)).setValue(bad)

    expect(await submit(wrapper)).toBeUndefined()
    expect(wrapper.get(sel(`${cfg}-error`)).text()).toBe(
      'avatar_templates.form.errors.hrAvatarConfigIdInvalid'
    )
  })

  it('does not refuse an id the listed catalogue lacks (the api is authoritative)', async () => {
    const wrapper = mountForm(WITH, { provider: 'hr_avatar', [KEY]: 'avc_unlisted' })
    await flushPromises()

    expect((await submit(wrapper))?.[KEY]).toBe('avc_unlisted')
  })
})

describe('server validation', () => {
  it('places a 422 keyed on hr_avatar_config_id under the picker', async () => {
    const wrapper = mountForm(
      WITH,
      { provider: 'hr_avatar', [KEY]: 'avc_1' },
      { data: { errors: { [KEY]: ['avatar_not_found'] } } }
    )
    await flushPromises()

    expect(wrapper.get(sel(`${cfg}-error`)).text()).toBe(
      'avatar_templates.error.config.avatar_not_found'
    )
    expect(wrapper.find(sel('template-form-errors')).exists()).toBe(false)
  })
})

describe('accessible wiring of the controls this form shares with every provider', () => {
  it('links a missing-model error to the model picker', async () => {
    const wrapper = mountForm(WITH)
    await flushPromises()
    await wrapper.get(sel('template-llm-credential')).setValue('3')
    await submit(wrapper)

    const picker = wrapper.get(sel('llm-model-picker'))
    expect(picker.attributes('aria-invalid')).toBe('true')
    expect(picker.attributes('aria-describedby')).toBe('template-llm-model-error')
    expect(wrapper.get('#template-llm-model-error').text()).not.toBe('')
  })

  it('links a missing-credential error to the credential select', async () => {
    const wrapper = mountForm(WITH)
    await flushPromises()
    await wrapper.get(sel('llm-model-picker')).setValue('m1')
    await submit(wrapper)

    const select = wrapper.get(sel('template-llm-credential'))
    expect(select.attributes('aria-invalid')).toBe('true')
    expect(select.attributes('aria-describedby')).toBe('template-llm-credential-error')
    expect(wrapper.get('#template-llm-credential-error').text()).not.toBe('')
  })

  it('leaves both controls unlinked while there is no error', async () => {
    const wrapper = mountForm(WITH)
    await flushPromises()

    expect(wrapper.get(sel('llm-model-picker')).attributes('aria-describedby')).toBeUndefined()
    expect(wrapper.get(sel('llm-model-picker')).attributes('aria-invalid')).toBeUndefined()
    expect(wrapper.get(sel('template-llm-credential')).attributes('aria-describedby')).toBe(
      undefined
    )
  })

  it('describes the provider select by its hint, and by the lock note once it exists', async () => {
    const created = mountForm(WITH)
    await flushPromises()
    expect(created.get(sel('template-field-provider')).attributes('aria-describedby')).toBe(
      'template-provider-hint'
    )
    expect(created.find('#template-provider-hint').exists()).toBe(true)

    const edited = mountForm(WITH, { id: 7 })
    await flushPromises()
    expect(edited.get(sel('template-field-provider')).attributes('aria-describedby')).toBe(
      'template-provider-locked template-provider-hint'
    )
    expect(edited.find('#template-provider-locked').exists()).toBe(true)
  })
})

describe('edit mode', () => {
  const existing = { id: 7, name: 'Existing', provider: 'hr_avatar', [KEY]: 'avc_1', config: {} }

  it('shows the provider locked, hides the LLM block and keeps the id on rename', async () => {
    const wrapper = mountForm(WITH, existing)
    await flushPromises()

    const select = wrapper.get(sel('template-field-provider'))
    expect((select.element as HTMLSelectElement).disabled).toBe(true)
    expect((select.element as HTMLSelectElement).value).toBe('hr_avatar')
    expect(wrapper.find(sel('template-llm-section')).exists()).toBe(false)
    expect(wrapper.get(sel(cfg)).text()).toContain('Interviewer')

    await wrapper.get(sel('template-field-name')).setValue('Renamed')

    expect(await submit(wrapper)).toMatchObject({
      id: 7,
      name: 'Renamed',
      provider: 'hr_avatar',
      [KEY]: 'avc_1',
      config: {},
    })
  })

  it('still names the provider of an existing hr_avatar template when the api no longer reports it', async () => {
    const wrapper = mountForm(WITHOUT, existing)
    await flushPromises()

    expect(optionValues(wrapper)).toEqual(['heygen', 'tavus', 'hr_avatar'])
    expect((wrapper.get(sel('template-field-provider')).element as HTMLSelectElement).value).toBe(
      'hr_avatar'
    )
  })
})

describe('the combobox for an hr_avatar config', () => {
  const field: FieldSpec = {
    key: KEY,
    type: 'text',
    label_key: 'x',
    catalogue_resource: 'avatar_config',
  }

  function mountCombobox(extra: Record<string, unknown> = {}) {
    return mount(AvatarTemplateProviderCombobox, {
      props: { field, provider: 'hr_avatar', modelValue: 'avc_1', ...extra },
      attachTo: document.body,
    })
  }

  it('renders no listen, sample or image preview control', async () => {
    const wrapper = mountCombobox()
    await flushPromises()
    await wrapper.get('[role="combobox"]').trigger('click')

    expect(wrapper.find(sel(`${cfg}-item-avc_1`)).exists()).toBe(true)
    const ids = wrapper.findAll('[data-testid]').map((node) => node.attributes('data-testid'))
    expect(
      ids.filter((id) =>
        /-(?:play|italian-preview|voice-preview|preview|catalogue-sample)/.test(id!)
      )
    ).toEqual([])
    expect(wrapper.find(sel(`${cfg}-preview-fallback`)).exists()).toBe(false)
    expect(wrapper.find(sel(`${cfg}-preview-image`)).exists()).toBe(false)
  })

  it('points aria-controls at the listbox only while a listbox is rendered', async () => {
    const wrapper = mountCombobox()
    await flushPromises()
    const trigger = wrapper.get('[role="combobox"]')

    expect(trigger.attributes('aria-controls')).toBeUndefined()

    await trigger.trigger('click')

    expect(trigger.attributes('aria-controls')).toBe(`${cfg}-listbox`)
    expect(wrapper.get(`#${cfg}-listbox`).attributes('role')).toBe('listbox')
  })

  it('shows no manual input on an empty catalogue unless manualOnEmpty is set', async () => {
    hrAvatarList = { status: 'empty', items: [] }

    const plain = mountCombobox()
    await flushPromises()
    await plain.get('[role="combobox"]').trigger('click')
    expect(plain.find(sel(`${cfg}-empty`)).exists()).toBe(true)
    expect(plain.find(sel(`${cfg}-manual`)).exists()).toBe(false)

    const manual = mountCombobox({ manualOnEmpty: true })
    await flushPromises()
    await manual.get('[role="combobox"]').trigger('click')
    expect(manual.find(sel(`${cfg}-empty`)).exists()).toBe(true)
    expect(manual.find(sel(`${cfg}-manual`)).exists()).toBe(true)
  })
})

describe('the persona sync indicator', () => {
  it('renders nothing for an hr_avatar template', () => {
    const wrapper = mount(PalSyncStatus, {
      props: { sync: null, provider: 'hr_avatar' },
      global: { mocks: { $t: (key: string) => key } },
    })

    expect(wrapper.find('[data-testid="pal-sync"]').exists()).toBe(false)
  })
})

describe('copy', () => {
  const keys = [
    'avatar_templates.provider.hr_avatar',
    'avatar_templates.field.hr_avatar_config_id',
    'avatar_templates.hint.hr_avatar_config_id',
    'avatar_templates.form.errors.hrAvatarConfigIdInvalid',
    'projects.avatarProvider.hr_avatar',
  ]

  function lookup(bundle: unknown, key: string): unknown {
    return key.split('.').reduce<unknown>((node, segment) => {
      if (typeof node !== 'object' || node === null) return undefined

      return (node as Record<string, unknown>)[segment]
    }, bundle)
  }

  it.each(keys)('has non-empty it and en copy for %s', (key) => {
    for (const bundle of [en, it_]) {
      const value = lookup(bundle, key)
      expect(typeof value).toBe('string')
      expect((value as string).trim()).not.toBe('')
    }
  })

  it.each([
    ['en', en],
    ['it', it_],
  ] as const)(
    'renders a project on an hr_avatar template with translated copy in %s',
    (_l, bundle) => {
      const $t = (key: string) => (lookup(bundle, key) as string | undefined) ?? key
      const wrapper = mount(ProjectTable, {
        props: {
          projects: [
            {
              id: 1,
              organization_id: 1,
              framework_version_id: 1,
              slug: 'p',
              name: 'P',
              assessment_type: 'standard',
              role_code: 'FLL',
              language: 'en',
              status: 'draft',
              pause_every_n_competencies: 3,
              nudge_min_chars: 40,
              exit_redirect_url: null,
              webhook_url: null,
              webhook_events: [],
              has_webhook_secret: false,
              deadline_at: null,
              goes_live_at: null,
              created_at: '2026-03-01T10:00:00Z',
              updated_at: '2026-03-01T10:00:00Z',
              pin_context: null,
              competencies: [{ id: 1, code: 'COL', name: { en: 'Collaboration' } }],
              avatar_template: { id: 9, name: 'HR', provider: 'hr_avatar' },
            },
          ] as never,
        },
        global: { mocks: { $t } },
      })

      const cell = wrapper.get(sel('project-row-provider-1')).text()
      expect(cell).toBe(lookup(bundle, 'projects.avatarProvider.hr_avatar'))
      expect(cell).not.toContain('projects.avatarProvider')
    }
  )
})
