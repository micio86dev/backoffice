/**
 * pages/avatar-templates/index.vue — what the page sends for an `hr_avatar`
 * template (hr-avatar-adapter B1).
 *
 * The form's own behaviour is covered in avatar-template-form-hr-avatar.spec.ts;
 * this file pins the page boundary: an `hr_avatar` write carries its config id
 * and NO LLM binding, while every other write keeps the binding fields it always
 * had (asserted by the unedited avatar-templates-page.spec.ts).
 */
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { realI18n } from './support/i18n'
import { withTooltipProvider } from './support/tooltip-host'
import { waitFor, waitForTestId } from './support/wait-for'
import { currenciesDouble, organizationDouble, resetMoney } from './support/money'

beforeEach(() => resetMoney())

const hrAvatarTemplate = {
  id: 5,
  name: 'HR interviewer',
  description: null,
  provider: 'hr_avatar',
  hr_avatar_config_id: 'avc_9',
  config: {},
  is_active: false,
  created_at: null,
  updated_at: null,
  llm_model_id: null,
  llm_credential_id: null,
  llm_sync_status: null,
  llm_synced_at: null,
  llm: null,
}

const SPECS = { heygen: [], tavus: [], hr_avatar: [] }

async function mountPage() {
  vi.doMock('../../app/composables/useOrganization', organizationDouble)
  vi.doMock('../../app/composables/useCurrencies', currenciesDouble)
  vi.doMock('../../app/composables/useCurrentUser', () => ({
    useCurrentUser: () => ({
      can: () => true,
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
    }),
  }))

  const api = {
    listTemplates: vi.fn().mockResolvedValue({ data: [hrAvatarTemplate] }),
    fetchFieldSpecs: vi.fn().mockResolvedValue({ data: SPECS }),
    fetchCatalogue: vi.fn().mockResolvedValue({
      status: 'ok',
      items: [
        {
          id: 'avc_7',
          provider: 'hr_avatar',
          label: 'Recruiter',
          name: 'Recruiter',
          language: null,
          locale: null,
          accent: null,
          italian: null,
          preview_image_url: null,
          preview_audio_url: null,
          preview_video_url: null,
        },
      ],
    }),
    createTemplate: vi.fn().mockResolvedValue({ data: hrAvatarTemplate }),
    updateTemplate: vi.fn().mockResolvedValue({ data: hrAvatarTemplate }),
    activateTemplate: vi.fn(),
    deactivateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    duplicateTemplate: vi.fn().mockResolvedValue({ data: [] }),
  }
  vi.doMock('../../app/composables/useAvatarTemplates', () => ({
    useAvatarTemplates: () => api,
  }))

  const Page = (await import('../../app/pages/avatar-templates/index.vue')).default
  const wrapper = mount(withTooltipProvider(Page), {
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  })
  await flushPromises()

  return { wrapper, api }
}

async function submitTemplateForm(): Promise<void> {
  const form = await waitForTestId<HTMLFormElement>('template-form')
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
}

describe('AvatarTemplatesPage with an hr_avatar template', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useHead', vi.fn())
    vi.stubGlobal('useI18n', () => ({
      t: (key: string) => key,
      te: realI18n().te,
      locale: ref('it'),
    }))
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('updates with the config id and without an LLM binding', async () => {
    const { wrapper, api } = await mountPage()

    await wrapper.find('[data-testid="template-edit-5"]').trigger('click')
    await submitTemplateForm()

    expect(api.updateTemplate).toHaveBeenCalledTimes(1)
    const [id, body] = api.updateTemplate.mock.calls[0]!
    expect(id).toBe(5)
    expect(body).toMatchObject({ hr_avatar_config_id: 'avc_9', config: {} })
    expect(body).not.toHaveProperty('llm_model_id')
    expect(body).not.toHaveProperty('llm_credential_id')
  })

  it('creates with provider, config id, an empty config and no LLM binding', async () => {
    const { wrapper, api } = await mountPage()

    await wrapper.find('[data-testid="template-new"]').trigger('click')
    const form = await waitForTestId('template-form')

    const name = form.querySelector<HTMLInputElement>('[data-testid="template-field-name"]')!
    name.value = 'Fresh'
    name.dispatchEvent(new Event('input'))

    const provider = form.querySelector<HTMLSelectElement>(
      '[data-testid="template-field-provider"]'
    )!
    provider.value = 'hr_avatar'
    provider.dispatchEvent(new Event('change'))
    await flushPromises()

    const picker = await waitFor(
      () => form.querySelector<HTMLElement>('[data-testid="template-config-hr_avatar_config_id"]'),
      'the hr_avatar picker'
    )
    picker.click()
    const option = await waitFor(
      () =>
        form.querySelector<HTMLElement>(
          '[data-testid="template-config-hr_avatar_config_id-item-avc_7"]'
        ),
      'the catalogue option'
    )
    option.click()
    await submitTemplateForm()

    expect(api.createTemplate).toHaveBeenCalledTimes(1)
    const body = api.createTemplate.mock.calls[0]![0]
    expect(body).toMatchObject({
      name: 'Fresh',
      provider: 'hr_avatar',
      hr_avatar_config_id: 'avc_7',
      config: {},
    })
    expect(body).not.toHaveProperty('llm_model_id')
    expect(body).not.toHaveProperty('llm_credential_id')
  })
})
