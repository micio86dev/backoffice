/**
 * pages/avatar-templates/index.vue — the operator screen (C14 PR6).
 *
 * The page owns the decisions that touch what candidates see next: which
 * template is active, and what happens to the list after a swap. Those are the
 * ones asserted here — rendering is the form component's concern and is covered
 * in avatar-template-form.spec.ts.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tMock = vi.fn((key: string) => key)

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Recruiter voice',
    description: null,
    provider: 'heygen',
    config: { avatarId: 'av_1', voiceId: 'vo_1' },
    is_active: false,
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

const SPECS = {
  heygen: [{ key: 'avatarId', type: 'text', label_key: 'avatar_templates.field.avatarId' }],
  tavus: [{ key: 'faceId', type: 'text', label_key: 'avatar_templates.field.faceId' }],
}

type Handlers = Partial<{
  listTemplates: ReturnType<typeof vi.fn>
  fetchFieldSpecs: ReturnType<typeof vi.fn>
  createTemplate: ReturnType<typeof vi.fn>
  updateTemplate: ReturnType<typeof vi.fn>
  activateTemplate: ReturnType<typeof vi.fn>
  deleteTemplate: ReturnType<typeof vi.fn>
}>

async function mountPage(handlers: Handlers = {}) {
  const api = {
    listTemplates: vi.fn().mockResolvedValue({ data: [template()] }),
    fetchFieldSpecs: vi.fn().mockResolvedValue({ data: SPECS }),
    createTemplate: vi.fn().mockResolvedValue({ data: template() }),
    updateTemplate: vi.fn().mockResolvedValue({ data: template() }),
    activateTemplate: vi.fn().mockResolvedValue({ data: template({ is_active: true }) }),
    deleteTemplate: vi.fn().mockResolvedValue(undefined),
    ...handlers,
  }

  vi.doMock('../../app/composables/useAvatarTemplates', () => ({
    useAvatarTemplates: () => api,
  }))

  const Page = (await import('../../app/pages/avatar-templates/index.vue')).default
  const wrapper = mount(Page, { global: { mocks: { $t: tMock } } })
  await flushPromises()

  return { wrapper, api }
}

describe('AvatarTemplatesPage', () => {
  beforeEach(() => {
    vi.resetModules()
    tMock.mockClear()
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useHead', vi.fn())
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: tMock, locale: ref('it') }))
    )
  })

  it('loads the templates and the field specs together', async () => {
    const { api } = await mountPage()

    // Both, on mount. The form cannot render a single control without the
    // specs, so fetching them lazily would show an empty form for one round
    // trip and look like a template with no settings.
    expect(api.listTemplates).toHaveBeenCalled()
    expect(api.fetchFieldSpecs).toHaveBeenCalled()
  })

  it('marks the active template', async () => {
    const { wrapper } = await mountPage({
      listTemplates: vi.fn().mockResolvedValue({ data: [template({ is_active: true })] }),
    })

    expect(wrapper.find('[data-testid="template-active-badge"]').exists()).toBe(true)
  })

  it('says so when there are no templates', async () => {
    const { wrapper } = await mountPage({
      listTemplates: vi.fn().mockResolvedValue({ data: [] }),
    })

    // A fresh organization is in this state, and an empty list with no words is
    // indistinguishable from a broken page.
    expect(wrapper.find('[data-testid="templates-empty"]').exists()).toBe(true)
  })

  it('offers no delete on the active template', async () => {
    const { wrapper } = await mountPage({
      listTemplates: vi.fn().mockResolvedValue({ data: [template({ is_active: true })] }),
    })

    // The API answers 409. Offering a destructive-looking control whose only
    // outcome is an error is worse than not offering it.
    expect(wrapper.find('[data-testid="template-delete-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="template-activate-1"]').exists()).toBe(false)
  })

  it('reloads the list after activating', async () => {
    const { wrapper, api } = await mountPage()

    await wrapper.find('[data-testid="template-activate-1"]').trigger('click')
    await flushPromises()

    // Twice: once on mount, once after the swap. The server deactivates the
    // previous template in the same transaction, and a client-side guess about
    // which row that was is a guess about what candidates see next.
    expect(api.activateTemplate).toHaveBeenCalledWith(1)
    expect(api.listTemplates).toHaveBeenCalledTimes(2)
  })

  it('surfaces a persona-sync warning after a SUCCESSFUL activation', async () => {
    const { wrapper } = await mountPage({
      activateTemplate: vi.fn().mockResolvedValue({
        data: template({ is_active: true }),
        warning: 'pal_sync_failed',
      }),
    })

    await wrapper.find('[data-testid="template-activate-1"]').trigger('click')
    await flushPromises()

    // The activation WORKED. Without this the operator believes an advanced
    // setting is live when it never reached the provider.
    expect(wrapper.find('[data-testid="template-warning"]').exists()).toBe(true)
  })

  it('reloads after deleting', async () => {
    const { wrapper, api } = await mountPage()

    await wrapper.find('[data-testid="template-delete-1"]').trigger('click')
    await flushPromises()

    expect(api.deleteTemplate).toHaveBeenCalledWith(1)
    expect(api.listTemplates).toHaveBeenCalledTimes(2)
  })

  it('reports a load failure instead of rendering an empty list', async () => {
    const { wrapper } = await mountPage({
      listTemplates: vi.fn().mockRejectedValue(new Error('boom')),
    })

    // An empty list after a failed fetch reads as "you have no templates",
    // which would send an operator to create a duplicate of one that exists.
    expect(wrapper.find('[data-testid="templates-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="templates-empty"]').exists()).toBe(false)
  })

  it('opens an empty form for a new template', async () => {
    const { wrapper } = await mountPage()

    await wrapper.find('[data-testid="template-new"]').trigger('click')

    expect(wrapper.find('[data-testid="template-form"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="template-field-name"]').attributes('value') ?? '').toBe('')
  })

  it('opens the form populated when editing', async () => {
    const { wrapper } = await mountPage()

    await wrapper.find('[data-testid="template-edit-1"]').trigger('click')

    const input = wrapper.find('[data-testid="template-field-name"]').element as HTMLInputElement

    expect(input.value).toBe('Recruiter voice')
  })

  it('creates on submit when the template has no id', async () => {
    const { wrapper, api } = await mountPage()

    await wrapper.find('[data-testid="template-new"]').trigger('click')
    await wrapper.find('[data-testid="template-field-name"]').setValue('Fresh')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.createTemplate).toHaveBeenCalled()
    expect(api.updateTemplate).not.toHaveBeenCalled()
  })

  it('updates on submit when the template has an id', async () => {
    const { wrapper, api } = await mountPage()

    await wrapper.find('[data-testid="template-edit-1"]').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.updateTemplate).toHaveBeenCalled()
    expect(api.createTemplate).not.toHaveBeenCalled()
  })

  it('shows every config error the API returned, and keeps the form open', async () => {
    const failure = Object.assign(new Error('422'), {
      data: { errors: { config: ['avatarId: required', 'voiceSpeed: range'] } },
    })

    const { wrapper } = await mountPage({
      createTemplate: vi.fn().mockRejectedValue(failure),
    })

    await wrapper.find('[data-testid="template-new"]').trigger('click')
    await wrapper.find('[data-testid="template-field-name"]').setValue('Broken')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // Closing the form on a validation failure would discard everything the
    // operator typed to tell them one of the fields was wrong.
    expect(wrapper.find('[data-testid="template-form"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="template-form-errors"] li')).toHaveLength(2)
  })

  it('closes the form and reloads after a successful save', async () => {
    const { wrapper, api } = await mountPage()

    await wrapper.find('[data-testid="template-edit-1"]').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="template-form"]').exists()).toBe(false)
    expect(api.listTemplates).toHaveBeenCalledTimes(2)
  })
})
