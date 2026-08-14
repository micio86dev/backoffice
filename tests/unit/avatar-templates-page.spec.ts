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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmDialog } from './support/confirm'

/**
 * The rendered text of the currently-open ConfirmDialog ONLY — never
 * `document.body.textContent` unscoped, which also picks up the template
 * list's own rows (every template name is already printed there) and would
 * let a naming assertion pass vacuously regardless of what the dialog
 * itself renders.
 */
function openDialogText(): string {
  return document.body.querySelector('[role="alertdialog"]')?.textContent ?? ''
}

// Echoes interpolation params so assertions can observe rendered content
// (e.g. `activateDescription`'s `{name, current}`) instead of the bare key —
// a plain `(key) => key` stub, used here previously, silently discards the
// second argument and hides exactly the bug this file's activation-naming
// tests exist to catch.
const tMock = vi.fn((key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key
)

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
  const wrapper = mount(Page, { global: { mocks: { $t: tMock } }, attachTo: document.body })
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

  // ConfirmDialog renders through reka-ui's AlertDialog, which teleports to
  // document.body — wrapper.find() never matches it (task 4.5).
  afterEach(() => {
    document.body.innerHTML = ''
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

  it('reloads the list after activating, only once confirmed', async () => {
    const { wrapper, api } = await mountPage()

    await wrapper.find('[data-testid="template-activate-1"]').trigger('click')
    await flushPromises()

    // The point of the change: nothing happens on the first click.
    expect(api.activateTemplate).not.toHaveBeenCalled()

    await confirmDialog('confirm')

    // Twice: once on mount, once after the swap. The server deactivates the
    // previous template in the same transaction, and a client-side guess about
    // which row that was is a guess about what candidates see next.
    expect(api.activateTemplate).toHaveBeenCalledWith(1)
    expect(api.listTemplates).toHaveBeenCalledTimes(2)
  })

  // The requirement the whole change was justified by (design.md D5,
  // avatar-templates spec "Confirmation Before Activation..."): activation
  // carries no destructive-sounding word, yet swaps the org's single active
  // template atomically — the highest blast radius of any action this
  // change covers. A single-template fixture can never observe a
  // replacement (there is nothing to replace), so this needs at least two.
  it('names BOTH the incoming and the outgoing template in the activation confirmation', async () => {
    const { wrapper } = await mountPage({
      listTemplates: vi.fn().mockResolvedValue({
        data: [
          template({ id: 1, name: 'Interviewer EN', is_active: false }),
          template({ id: 2, name: 'Interviewer IT', is_active: true }),
        ],
      }),
    })

    await wrapper.find('[data-testid="template-activate-1"]').trigger('click')
    await flushPromises()

    const dialogText = openDialogText()
    expect(dialogText).toContain('Interviewer EN')
    expect(dialogText).toContain('Interviewer IT')
  })

  // The edge case activateDescription's other branch exists for: a fresh
  // organization with no template active yet. Nothing to replace, so the
  // description must not silently interpolate an empty "current" name.
  it('names only the incoming template when no template is currently active yet', async () => {
    const { wrapper } = await mountPage({
      listTemplates: vi.fn().mockResolvedValue({
        data: [template({ id: 1, name: 'First Template', is_active: false })],
      }),
    })

    await wrapper.find('[data-testid="template-activate-1"]').trigger('click')
    await flushPromises()

    const dialogText = openDialogText()
    expect(dialogText).toContain('First Template')
    expect(dialogText).toContain('activateDescriptionNoPrevious')
  })

  it('cancelling the activate confirmation performs no request', async () => {
    const { wrapper, api } = await mountPage()

    await wrapper.find('[data-testid="template-activate-1"]').trigger('click')
    await flushPromises()

    await confirmDialog('cancel')

    expect(api.activateTemplate).not.toHaveBeenCalled()
    expect(api.listTemplates).toHaveBeenCalledTimes(1)
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
    await confirmDialog('confirm')

    // The activation WORKED. Without this the operator believes an advanced
    // setting is live when it never reached the provider.
    expect(wrapper.find('[data-testid="template-warning"]').exists()).toBe(true)
  })

  it('reloads after deleting, only once confirmed', async () => {
    const { wrapper, api } = await mountPage()

    await wrapper.find('[data-testid="template-delete-1"]').trigger('click')
    await flushPromises()

    // The point of the change: nothing happens on the first click.
    expect(api.deleteTemplate).not.toHaveBeenCalled()

    await confirmDialog('confirm')

    expect(api.deleteTemplate).toHaveBeenCalledWith(1)
    expect(api.listTemplates).toHaveBeenCalledTimes(2)
  })

  // Content assertion: the delete dialog must render deleteTitle/
  // deleteDescription (irreversibility, per the avatar-templates spec) — not
  // just fire on the right id, which every prior test here already proved.
  it('renders the delete confirmation title and irreversibility description', async () => {
    const { wrapper } = await mountPage()

    await wrapper.find('[data-testid="template-delete-1"]').trigger('click')
    await flushPromises()

    const dialogText = openDialogText()
    expect(dialogText).toContain('avatar_templates.confirm.deleteTitle')
    expect(dialogText).toContain('avatar_templates.confirm.deleteDescription')
  })

  // Targeting correctness with more than one candidate present — a
  // single-item fixture cannot distinguish "deletes the clicked row" from
  // "always deletes the first row".
  it('deletes the SPECIFIC template clicked, not just the first in the list', async () => {
    const { wrapper, api } = await mountPage({
      listTemplates: vi.fn().mockResolvedValue({
        data: [
          template({ id: 1, name: 'Keep me', is_active: false }),
          template({ id: 2, name: 'Delete me', is_active: false }),
        ],
      }),
    })

    await wrapper.find('[data-testid="template-delete-2"]').trigger('click')
    await flushPromises()
    await confirmDialog('confirm')

    expect(api.deleteTemplate).toHaveBeenCalledWith(2)
    expect(api.deleteTemplate).not.toHaveBeenCalledWith(1)
  })

  it('cancelling the delete confirmation performs no request', async () => {
    const { wrapper, api } = await mountPage()

    await wrapper.find('[data-testid="template-delete-1"]').trigger('click')
    await flushPromises()

    await confirmDialog('cancel')

    expect(api.deleteTemplate).not.toHaveBeenCalled()
    expect(api.listTemplates).toHaveBeenCalledTimes(1)
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

  // form-clarity-and-console-warnings, D3/D4: the page used to flatten every
  // config error into one li-counted list (`extractConfigErrors`). It now
  // passes the caught rejection down VERBATIM as `submitError`, and the form
  // routes each message to its own field when the field exists, leaving only
  // the genuinely unplaceable remainder in the summary. This is a DELIBERATE
  // spec change from the previous li-counting assertion, not incidental
  // breakage — `voiceSpeed` names no field this page's spec renders, so it is
  // the one that proves the summary still catches what it must.
  it('routes each config error to its own field, or to the summary when no field claims it', async () => {
    const failure = Object.assign(new Error('422'), {
      status: 422,
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
    // `avatarId` IS a field this page's spec renders — claimed onto its own
    // control rather than flattened into the summary.
    expect(wrapper.find('[data-testid="template-config-avatarId-error"]').exists()).toBe(true)
    // `voiceSpeed` names no field this page's spec renders — an unplaceable
    // message still has to reach the operator, so it stays in the summary.
    expect(wrapper.findAll('[data-testid="template-form-errors"] li')).toHaveLength(1)
    expect(wrapper.get('[data-testid="template-form-errors"]').text()).toContain(
      'voiceSpeed: range'
    )
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
