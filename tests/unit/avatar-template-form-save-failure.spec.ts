/**
 * hr-avatar-adapter B1 follow-up: a failed template save that no field and no
 * machine code can carry (a codeless 403 / 404 / 409, or a network fault with
 * no HTTP response) must still say something. Before this, the drawer stayed
 * open and showed nothing at all.
 *
 * The 503-with-prose case stays silent exactly as the existing
 * `AvatarTemplateForm.spec.ts` pins it; it is repeated here so a regression of
 * the new fallback into a catch-all fails in this file too.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AvatarTemplateForm from '../../app/components/organisms/AvatarTemplateForm.vue'
import en from '../../i18n/locales/en.json'
import it_ from '../../i18n/locales/it.json'
import type { FieldSpecMap } from '../../app/types/avatar-template'

vi.mock('@/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ fetchCatalogue: vi.fn() }),
}))
vi.mock('@/composables/useLlmModels', () => ({
  useLlmModels: () => ({ listModels: () => Promise.resolve({ data: [] }) }),
}))
vi.mock('@/composables/useLlmCredentials', () => ({
  useLlmCredentials: () => ({ listCredentials: () => Promise.resolve({ data: [] }) }),
}))

const FIELD_SPECS: FieldSpecMap = { heygen: [], tavus: [] }
const ERRORS = '[data-testid="template-form-errors"]'

async function mountWith(submitError: unknown) {
  const wrapper = mount(AvatarTemplateForm, {
    props: {
      template: { name: 'Test template', provider: 'heygen', config: {} },
      fieldSpecs: FIELD_SPECS,
      saving: false,
      submitError,
    },
    global: { mocks: { $t: (key: string) => key } },
  })
  await flushPromises()

  return wrapper
}

describe('template form: a save failure with no field and no code', () => {
  it.each([
    [403, 'avatar_templates.error.save.forbidden'],
    [404, 'avatar_templates.error.save.not_found'],
    [409, 'avatar_templates.error.save.conflict'],
  ])('shows distinct copy for a codeless %i', async (status, key) => {
    const wrapper = await mountWith({ status, data: {} })

    expect(wrapper.get(ERRORS).text()).toContain(key)
  })

  // The network copy is for a request that never got an answer, not for any
  // rejection that happens to lack a status.
  it.each([
    ['a fetch TypeError', new TypeError('Failed to fetch')],
    [
      'an ofetch network FetchError',
      Object.assign(new Error('[POST] "/api/avatar-templates": <no response> Failed to fetch'), {
        name: 'FetchError',
        cause: new TypeError('Failed to fetch'),
      }),
    ],
  ])('shows network copy for %s', async (_label, error) => {
    const wrapper = await mountWith(error)

    expect(wrapper.get(ERRORS).text()).toContain('avatar_templates.error.save.network')
    expect(wrapper.get(ERRORS).text()).not.toContain('avatar_templates.error.save.failed')
  })

  it.each([
    ['a plain Error', new Error('boom')],
    ['an object with no status', { data: {} }],
    ['a string', 'boom'],
  ])('shows generic save-failed copy, not the network copy, for %s', async (_label, error) => {
    const wrapper = await mountWith(error)

    expect(wrapper.get(ERRORS).text()).toContain('avatar_templates.error.save.failed')
    expect(wrapper.get(ERRORS).text()).not.toContain('avatar_templates.error.save.network')
  })

  it('keeps a 503 framework prose message silent, as it is pinned today', async () => {
    const wrapper = await mountWith({ status: 503, data: { message: 'Service Unavailable.' } })

    expect(wrapper.find(ERRORS).exists()).toBe(false)
  })

  it('does not add the fallback when a machine code already explains the refusal', async () => {
    const wrapper = await mountWith({ status: 409, data: { message: 'tts_bind_busy' } })

    expect(wrapper.get(ERRORS).text()).not.toContain('avatar_templates.error.save')
  })

  it('does not add the fallback when a 422 places the error on a field', async () => {
    const wrapper = await mountWith({
      status: 422,
      data: { errors: { name: ['The name field is required.'] } },
    })

    expect(wrapper.find(ERRORS).exists()).toBe(false)
  })

  it('clears the fallback when the next submit error is null', async () => {
    const wrapper = await mountWith({ status: 403, data: {} })
    expect(wrapper.find(ERRORS).exists()).toBe(true)

    await wrapper.setProps({ submitError: null })
    await flushPromises()

    expect(wrapper.find(ERRORS).exists()).toBe(false)
  })

  it.each([
    ['en', en],
    ['it', it_],
  ])('ships every fallback key in %s', (_locale, messages) => {
    const save = (messages as unknown as { avatar_templates: { error: { save: object } } })
      .avatar_templates.error.save as Record<string, string>

    for (const key of ['forbidden', 'not_found', 'conflict', 'network', 'failed']) {
      expect(typeof save[key]).toBe('string')
      expect(save[key]!.length).toBeGreaterThan(0)
    }
  })
})

describe('a coded refusal that has no copy under the config namespace', () => {
  beforeEach(() => {
    vi.stubGlobal('useI18n', () => ({
      t: (key: string) => key,
      te: (key: string) => !key.endsWith('.brand_new_nocopy'),
    }))
  })

  it('falls back to the status copy when the status says more than "invalid"', async () => {
    const wrapper = await mountWith({ status: 409, data: { message: 'brand_new_nocopy' } })

    expect(wrapper.get(ERRORS).text()).toContain('avatar_templates.error.save.conflict')
  })

  it('falls back to the generic copy for any other status', async () => {
    const wrapper = await mountWith({ status: 503, data: { message: 'brand_new_nocopy' } })

    expect(wrapper.get(ERRORS).text()).toContain('avatar_templates.error.invalid_value')
  })
})

describe('a translator that only stubs `t`', () => {
  beforeEach(() => {
    vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
  })

  it('does not throw and shows the generic copy for an unknown code', async () => {
    const wrapper = await mountWith({
      status: 422,
      data: { errors: { 'config.someKnob': ['brand_new_code'], llm_model_id: ['brand_new_code'] } },
    })

    // Without `te` nothing can be proved to have copy, so no key is echoed back.
    expect(wrapper.get(ERRORS).text()).toContain('avatar_templates.error.invalid_value')
    expect(wrapper.get(ERRORS).text()).not.toContain('brand_new_code')
    expect(wrapper.get('[data-testid="template-llm-model-error"]').text()).toBe(
      'avatar_templates.error.invalid_value'
    )
  })
})
