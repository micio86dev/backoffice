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
import { withTooltipProvider } from './support/tooltip-host'
import { waitFor, waitForTestId } from './support/wait-for'

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

/**
 * feature/form-drawer: the form now renders inside FormDrawer's `Sheet`,
 * which teleports to `document.body` via reka-ui's `DialogPortal` —
 * `wrapper.find(...)` only searches the wrapper's own subtree and will never
 * see it, the same teleport-aware pattern `ConfirmDialog`'s spec already
 * proved for the confirmation dialogs on this same page.
 */
function templateForm(): HTMLFormElement | null {
  return document.body.querySelector<HTMLFormElement>('[data-testid="template-form"]')
}

/** A real submit, dispatched on the teleported `<form>` directly. */
async function submitTemplateForm(): Promise<void> {
  const form = await waitForTestId<HTMLFormElement>('template-form')
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
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
    llm_model_id: 3,
    llm_credential_id: 4,
    llm_sync_status: 'synced',
    llm_synced_at: null,
    // 0.30 over a 15-minute reference interview: a per-minute rate would
    // read 0,02, so the forbidden rendering is detectable as a substring.
    llm: { estimated_cost_usd_per_interview: { minutes: 15, turns: 60, usd: 0.3 } },
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
  deactivateTemplate: ReturnType<typeof vi.fn>
  deleteTemplate: ReturnType<typeof vi.fn>
}>

/**
 * What the server says this operator may do, as `/auth/me` publishes it.
 *
 * Defaults to the PLATFORM answer — every ability true — because every test
 * written before CTA gating existed assumes the controls are on screen, and a
 * default of "admin" would have silently emptied them all. The gating tests
 * pass the narrower maps explicitly.
 */
function abilities(overrides: Record<string, boolean> = {}) {
  return {
    viewAny: true,
    create: true,
    update: true,
    activate: true,
    delete: true,
    ...overrides,
  }
}

async function mountPage(
  handlers: Handlers = {},
  avatarTemplates: Record<string, boolean> = abilities()
) {
  vi.doMock('../../app/composables/useCurrentUser', () => ({
    useCurrentUser: () => ({
      can: (key: string) => avatarTemplates[key.split('.')[1] ?? ''] === true,
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
    }),
  }))

  const api = {
    listTemplates: vi.fn().mockResolvedValue({ data: [template()] }),
    fetchFieldSpecs: vi.fn().mockResolvedValue({ data: SPECS }),
    createTemplate: vi.fn().mockResolvedValue({ data: template() }),
    updateTemplate: vi.fn().mockResolvedValue({ data: template() }),
    activateTemplate: vi.fn().mockResolvedValue({ data: template({ is_active: true }) }),
    deactivateTemplate: vi.fn().mockResolvedValue({ data: template({ is_active: false }) }),
    deleteTemplate: vi.fn().mockResolvedValue(undefined),
    ...handlers,
  }

  vi.doMock('../../app/composables/useAvatarTemplates', () => ({
    useAvatarTemplates: () => api,
  }))

  const Page = (await import('../../app/pages/avatar-templates/index.vue')).default
  // HelpTip's TooltipRoot throws without a provider; in the app one is
  // mounted application-wide by SidebarProvider in layouts/default.vue.
  const wrapper = mount(withTooltipProvider(Page), {
    global: { mocks: { $t: tMock } },
    attachTo: document.body,
  })
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

    const form = await waitForTestId('template-form')
    const nameField = form.querySelector<HTMLInputElement>('[data-testid="template-field-name"]')

    expect(form).not.toBeNull()
    expect(nameField?.value ?? '').toBe('')
  })

  it('opens the form populated when editing', async () => {
    const { wrapper } = await mountPage()

    await wrapper.find('[data-testid="template-edit-1"]').trigger('click')

    const form = await waitForTestId('template-form')
    const input = form.querySelector<HTMLInputElement>('[data-testid="template-field-name"]')

    expect(input?.value).toBe('Recruiter voice')
  })

  it('creates on submit when the template has no id', async () => {
    const { wrapper, api } = await mountPage()

    await wrapper.find('[data-testid="template-new"]').trigger('click')
    const form = await waitForTestId('template-form')
    const nameField = form.querySelector<HTMLInputElement>('[data-testid="template-field-name"]')
    nameField!.value = 'Fresh'
    nameField!.dispatchEvent(new Event('input'))

    await submitTemplateForm()

    expect(api.createTemplate).toHaveBeenCalled()
    expect(api.updateTemplate).not.toHaveBeenCalled()
  })

  it('updates on submit when the template has an id', async () => {
    const { wrapper, api } = await mountPage()

    await wrapper.find('[data-testid="template-edit-1"]').trigger('click')
    await submitTemplateForm()

    expect(api.updateTemplate).toHaveBeenCalled()
    expect(api.createTemplate).not.toHaveBeenCalled()
  })

  // generated-client-truth-and-session-safety D6: the server now keys each
  // invalid knob under its own `config.{knob}` field instead of flattening
  // every knob's error into one `config` array. The page passes the caught
  // rejection down VERBATIM as `submitError`, and the form routes each
  // `config.{knob}` entry to its own field when the field exists, leaving
  // only the genuinely unplaceable remainder in the summary — `voiceSpeed`
  // names no field this page's spec renders, so it is the one that proves
  // the summary still catches what it must.
  it('routes each config.{knob} error to its own field, or to the summary when no field claims it', async () => {
    const failure = Object.assign(new Error('422'), {
      status: 422,
      data: { errors: { 'config.avatarId': ['required'], 'config.voiceSpeed': ['range'] } },
    })

    const { wrapper } = await mountPage({
      createTemplate: vi.fn().mockRejectedValue(failure),
    })

    await wrapper.find('[data-testid="template-new"]').trigger('click')
    const form = await waitForTestId('template-form')
    const nameField = form.querySelector<HTMLInputElement>('[data-testid="template-field-name"]')
    nameField!.value = 'Broken'
    nameField!.dispatchEvent(new Event('input'))

    await submitTemplateForm()

    // A failed save (422) leaves the drawer OPEN with errors visible —
    // closing it would discard everything the operator typed to tell them
    // one of the fields was wrong.
    expect(templateForm()).not.toBeNull()
    // `avatarId` IS a field this page's spec renders — claimed onto its own
    // control rather than flattened into the summary.
    expect(
      document.body.querySelector('[data-testid="template-config-avatarId-error"]')
    ).not.toBeNull()
    // `voiceSpeed` names no field this page's spec renders — an unplaceable
    // message still has to reach the operator, so it stays in the summary.
    const summary = document.body.querySelector('[data-testid="template-form-errors"]')
    expect(summary?.querySelectorAll('li')).toHaveLength(1)
    expect(summary?.textContent).toContain('range')
  })

  it('closes the form and reloads after a successful save', async () => {
    const { wrapper, api } = await mountPage()

    await wrapper.find('[data-testid="template-edit-1"]').trigger('click')
    await submitTemplateForm()

    expect(templateForm()).toBeNull()
    expect(api.listTemplates).toHaveBeenCalledTimes(2)
  })

  // Non-negotiable RED spec: cancel closes the drawer and leaves the list
  // untouched — no request fired, no reload.
  it('closes the drawer on cancel without touching the list', async () => {
    const { wrapper, api } = await mountPage()

    await wrapper.find('[data-testid="template-edit-1"]').trigger('click')
    await waitForTestId('template-form')

    const cancelButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="form-drawer-cancel"]'
    )
    cancelButton!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    cancelButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(templateForm()).toBeNull()
    expect(api.updateTemplate).not.toHaveBeenCalled()
    expect(api.listTemplates).toHaveBeenCalledTimes(1)
  })

  // Non-negotiable RED spec: Escape closes the drawer and leaves the list
  // untouched, exactly like cancel — reka-ui's DialogContent handles Escape
  // internally and emits update:open(false), which the page maps onto
  // `editing = null` the same way the cancel button's click does.
  it('closes the drawer on Escape without touching the list', async () => {
    const { wrapper, api } = await mountPage()

    await wrapper.find('[data-testid="template-edit-1"]').trigger('click')
    const form = await waitForTestId('template-form')

    form.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    await flushPromises()
    await waitFor(() => templateForm() === null, 'the drawer to close after Escape')

    expect(templateForm()).toBeNull()
    expect(api.updateTemplate).not.toHaveBeenCalled()
    expect(api.listTemplates).toHaveBeenCalledTimes(1)
  })

  // The footer's Save/Cancel controls must stay reachable without scrolling
  // — the exact defect the project form's old centred Dialog carried,
  // and the reason FormDrawer exists as a shared wrapper rather than each
  // page hand-rolling its own Sheet usage.
  it('keeps the footer actions outside the scrolling region', async () => {
    const { wrapper } = await mountPage()

    await wrapper.find('[data-testid="template-edit-1"]').trigger('click')
    await waitForTestId('template-form')

    const scrollRegion = document.body.querySelector('.overflow-y-auto')
    const saveButton = document.body.querySelector('[data-testid="form-drawer-save"]')

    expect(scrollRegion).not.toBeNull()
    expect(saveButton).not.toBeNull()
    expect(scrollRegion!.contains(saveButton)).toBe(false)
  })
})

/**
 * Per-template conversation-LLM forecast (pluggable-conversation-llm P9).
 *
 * `AvatarTemplateResource.llm.estimated_cost_usd_per_interview` is a TOTAL
 * for one reference interview, computed server-side by the same estimator the
 * real `/end` write uses. The two rules that bind this surface:
 *
 * - It is never expressed per minute. Input tokens grow QUADRATICALLY in turn
 *   count (the whole conversation is re-sent every turn), so a rate misstates
 *   cost at any other interview length and invites an operator to multiply.
 * - `null` means no usable model binding, and must read as "not forecastable",
 *   never as a forecast of zero.
 */
describe('AvatarTemplatesPage — conversation-LLM forecast', () => {
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

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('states the forecast as a total for a named reference interview', async () => {
    const { wrapper } = await mountPage()

    const line = wrapper.get('[data-testid="template-llm-forecast-1"]')
    expect(line.text()).toContain('avatar_templates.llmForecast')
    // The shape travels with the number: a total is only interpretable
    // alongside the interview it is a total FOR.
    expect(line.text()).toContain('0,30')
    expect(line.text()).toContain('15')
    expect(line.text()).toContain('60')
  })

  it('never states a per-minute LLM rate', async () => {
    const { wrapper } = await mountPage()

    // 0.30 over the 15-minute reference interview would be 0,02 per minute.
    expect(wrapper.text()).not.toContain('0,02')
  })

  it('says a template with no model bound cannot be forecast, rather than forecasting zero', async () => {
    const { wrapper } = await mountPage({
      listTemplates: vi.fn().mockResolvedValue({
        data: [template({ llm: { estimated_cost_usd_per_interview: null } })],
      }),
    })

    const line = wrapper.get('[data-testid="template-llm-forecast-1"]')
    expect(line.text()).toContain('avatar_templates.llmForecastUnavailable')
    // Zero is a price. An unbound template has no price at all.
    expect(line.text()).not.toContain('0,00')
  })

  // The figure is not self-explanatory: an operator has to know it is an
  // estimate, that it covers only the language model, and why no rate exists.
  it('offers the definition of the figure without requiring a pointer', async () => {
    const { wrapper } = await mountPage()

    expect(wrapper.text()).toContain('help.glossary.llmCost.definition')
  })
})

describe('AvatarTemplatesPage — deactivation', () => {
  // Same setup as the suite above, and `vi.resetModules()` is the load-bearing
  // line: `mountPage` registers its mock with `vi.doMock`, which only takes
  // effect on a FRESH module graph. Without the reset this describe inherits
  // the cached page module from an earlier one, the mock never applies, and the
  // symptom is a button that simply does not render — with no error to explain
  // why.
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

  /**
   * An admin can withdraw a template without deleting it.
   *
   * Only activation existed, so the only ways to stop offering a template were
   * to activate a different one — which needs one to exist — or to delete it,
   * which is destructive and is refused outright while any project pins it.
   *
   * Safe now in a way it would not have been: `is_active` used to be the
   * organization-wide fallback, so switching it off changed what unpinned
   * projects ran on. Every project pins its own template, so this only decides
   * which one new projects start from.
   */
  it('offers deactivate on the active template, and activate on the others', async () => {
    const { wrapper } = await mountPage({
      listTemplates: vi.fn().mockResolvedValue({
        data: [template({ id: 1, is_active: true }), template({ id: 2, is_active: false })],
      }),
    })

    expect(wrapper.find('[data-testid="template-deactivate-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="template-activate-1"]').exists()).toBe(false)

    // The mirror image on an inactive one — the two controls never both show.
    expect(wrapper.find('[data-testid="template-activate-2"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="template-deactivate-2"]').exists()).toBe(false)
  })

  it('deactivates without a confirmation dialog, and reloads', async () => {
    // No dialog on purpose. Activation gets one because it changes what every
    // NEW project starts from; withdrawing only removes a choice, moves nothing
    // live, and is one click to undo.
    const { wrapper, api } = await mountPage({
      listTemplates: vi.fn().mockResolvedValue({ data: [template({ id: 1, is_active: true })] }),
    })

    await wrapper.find('[data-testid="template-deactivate-1"]').trigger('click')
    await flushPromises()

    expect(api.deactivateTemplate).toHaveBeenCalledWith(1)
    // Reloaded rather than patched locally, same reason as activation: the
    // server owns which template is active and guessing is guessing.
    expect(api.listTemplates).toHaveBeenCalledTimes(2)
  })

  /**
   * The admin case, which is the one that shipped broken.
   *
   * Managing templates became PLATFORM-only on 2026-09-02 while this page kept
   * rendering every control to anyone who could open it — and an admin can
   * open it, because reading the list is still theirs. So the page offered New,
   * Edit and Activate to a role the API refuses, and the only way to find out
   * was to click and read a 403.
   *
   * Read stays. The point is not to hide the page from an admin; it is to stop
   * promising them actions that cannot happen.
   */
  describe('with an admin who may read but not manage', () => {
    const READ_ONLY = {
      viewAny: true,
      create: false,
      update: false,
      activate: false,
      delete: false,
    }

    it('still lists the templates', async () => {
      const { wrapper } = await mountPage({}, READ_ONLY)

      expect(wrapper.find('[data-testid="templates-list"]').exists()).toBe(true)
    })

    it('offers no New, no Edit, and no activation control', async () => {
      const { wrapper } = await mountPage(
        {
          listTemplates: vi
            .fn()
            .mockResolvedValue({ data: [template({ id: 1, is_active: false })] }),
        },
        READ_ONLY
      )

      expect(wrapper.find('[data-testid="template-new"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="template-edit-1"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="template-activate-1"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="template-delete-1"]').exists()).toBe(false)
    })

    it('offers no Deactivate on the active one either', async () => {
      // Activate and deactivate are one ability, not two: both write
      // `is_active`, and `AvatarTemplatePolicy::activate` guards the pair.
      const { wrapper } = await mountPage(
        {
          listTemplates: vi
            .fn()
            .mockResolvedValue({ data: [template({ id: 1, is_active: true })] }),
        },
        READ_ONLY
      )

      expect(wrapper.find('[data-testid="template-deactivate-1"]').exists()).toBe(false)
    })
  })

  describe('with the platform identity that may manage', () => {
    it('offers New and the row controls', async () => {
      const { wrapper } = await mountPage({
        listTemplates: vi.fn().mockResolvedValue({ data: [template({ id: 1, is_active: false })] }),
      })

      expect(wrapper.find('[data-testid="template-new"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="template-edit-1"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="template-activate-1"]').exists()).toBe(true)
    })
  })
})

/**
 * A failed WRITE has to survive the reload that follows it.
 *
 * Activate, deactivate and delete each set the LOAD error flag and then called
 * `load()`, which clears it the moment the listing succeeds. The flag was
 * raised and wiped in the same tick, so the operator clicked, the API refused,
 * and the screen showed a list identical to before — no error, no change, no
 * explanation. Nothing tested it: the spec rejected `listTemplates` and
 * `createTemplate` and never once rejected a write.
 *
 * Not academic. Since managing templates became platform-only on 2026-09-02,
 * 403 is the ORDINARY answer here for an admin.
 */
describe('AvatarTemplatesPage — a write that the API refuses', () => {
  // The same globals the main describe stubs. This block sits outside it, so it
  // inherits none of them, and without `useI18n` the page never finishes
  // setup — the list renders empty and every assertion here fails for a reason
  // that has nothing to do with what it tests.
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

  afterEach(() => {
    document.body.innerHTML = ''
  })

  function rejection(status: number) {
    return Object.assign(new Error(`HTTP ${status}`), { status })
  }

  it('keeps a failed activation visible after the list reloads', async () => {
    const { wrapper } = await mountPage({
      listTemplates: vi.fn().mockResolvedValue({ data: [template({ id: 1, is_active: false })] }),
      activateTemplate: vi.fn().mockRejectedValue(rejection(403)),
    })

    await wrapper.find('[data-testid="template-activate-1"]').trigger('click')
    await flushPromises()
    await confirmDialog()
    await flushPromises()

    expect(wrapper.find('[data-testid="template-write-error"]').exists()).toBe(true)
    // And NOT the load message, which says the listing failed — it did not.
    expect(wrapper.find('[data-testid="templates-error"]').exists()).toBe(false)
  })

  it('keeps a failed deactivation visible', async () => {
    const { wrapper } = await mountPage({
      listTemplates: vi.fn().mockResolvedValue({ data: [template({ id: 1, is_active: true })] }),
      deactivateTemplate: vi.fn().mockRejectedValue(rejection(403)),
    })

    await wrapper.find('[data-testid="template-deactivate-1"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="template-write-error"]').exists()).toBe(true)
  })

  it('keeps a failed delete visible', async () => {
    const { wrapper } = await mountPage({
      listTemplates: vi.fn().mockResolvedValue({ data: [template({ id: 1, is_active: false })] }),
      deleteTemplate: vi.fn().mockRejectedValue(rejection(409)),
    })

    await wrapper.find('[data-testid="template-delete-1"]').trigger('click')
    await flushPromises()
    await confirmDialog()
    await flushPromises()

    expect(wrapper.find('[data-testid="template-write-error"]').exists()).toBe(true)
  })

  it('tells the operator WHY a 409 happened, not that it will resolve itself', async () => {
    // The server answers `{"error": "template_in_use", "project_count": 7}`.
    // Mapped through the generic HTTP-state helper, 409 renders as "Not ready
    // yet — it becomes visible once processing completes, reopen this page
    // later." Nothing is processing, reopening never helps, and the count the
    // server computed so the operator knows how much reassignment work they
    // face is discarded. A confidently wrong message is worse than a vague one.
    const deleteTemplate = vi.fn().mockRejectedValue(
      Object.assign(new Error('HTTP 409'), {
        status: 409,
        data: { error: 'template_in_use', message: 'template_in_use', project_count: 7 },
      })
    )

    const { wrapper } = await mountPage({
      listTemplates: vi.fn().mockResolvedValue({ data: [template({ id: 1, is_active: false })] }),
      deleteTemplate,
    })

    await wrapper.find('[data-testid="template-delete-1"]').trigger('click')
    await flushPromises()
    await confirmDialog()
    await flushPromises()

    const alert = wrapper.get('[data-testid="template-write-error"]')

    expect(alert.text()).toContain('avatar_templates.serverError.template_in_use')
    expect(alert.text()).not.toContain('notReady')
    // The count reaches the operator rather than being thrown away.
    expect(wrapper.find('[data-testid="template-write-error-count"]').text()).toContain('7')
  })

  it('clears a previous write failure when the next write starts', async () => {
    // Otherwise a stale refusal sits under a later success and reads as though
    // the new action failed too.
    const activateTemplate = vi
      .fn()
      .mockRejectedValueOnce(rejection(403))
      .mockResolvedValue({ data: template({ id: 1, is_active: true }) })

    const { wrapper } = await mountPage({
      listTemplates: vi.fn().mockResolvedValue({ data: [template({ id: 1, is_active: false })] }),
      activateTemplate,
    })

    await wrapper.find('[data-testid="template-activate-1"]').trigger('click')
    await flushPromises()
    await confirmDialog()
    await flushPromises()
    expect(wrapper.find('[data-testid="template-write-error"]').exists()).toBe(true)

    await wrapper.find('[data-testid="template-activate-1"]').trigger('click')
    await flushPromises()
    await confirmDialog()
    await flushPromises()

    expect(wrapper.find('[data-testid="template-write-error"]').exists()).toBe(false)
  })
})
