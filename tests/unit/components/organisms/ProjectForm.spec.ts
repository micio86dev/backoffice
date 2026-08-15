/**
 * ProjectForm.vue (Unit 2b, tasks 20.4-20.7 — RED)
 *
 * Mirrors server-side immutability (D9) instead of letting the operator hit
 * an unexplained 422, and follows the ratified two-level feedback contract
 * (login.vue/login.spec.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { confirmDialog } from '../../support/confirm'

const tMock = (key: string) => key

const createProjectMock = vi.fn()
const updateProjectMock = vi.fn()
const fetchRoleCompetenciesMock = vi.fn()

vi.mock('../../../../app/composables/useProjects', () => ({
  useProjects: () => ({ createProject: createProjectMock, updateProject: updateProjectMock }),
}))

vi.mock('../../../../app/composables/useFrameworkRoles', () => ({
  useFrameworkRoles: () => ({ fetchRoleCompetencies: fetchRoleCompetenciesMock }),
}))

const ProjectForm = (await import('../../../../app/components/organisms/ProjectForm.vue')).default

function activeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    organization_id: 1,
    framework_version_id: 3,
    slug: 'demo-project',
    name: 'Demo Project',
    assessment_type: 'standard',
    role_code: 'FLL',
    language: 'en',
    status: 'active',
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
    competencies: [],
    ...overrides,
  }
}

describe('ProjectForm', () => {
  beforeEach(() => {
    createProjectMock.mockReset().mockResolvedValue({ data: activeProject() })
    updateProjectMock.mockReset().mockResolvedValue({ data: activeProject() })
    fetchRoleCompetenciesMock.mockReset().mockResolvedValue({ data: [] })
  })

  // ConfirmDialog renders through reka-ui's AlertDialog, which teleports to
  // document.body — wrapper.find() never matches it. Every test mounting a
  // dialog-driven interaction needs attachTo: document.body (task 4.5).
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('disables framework_version_id, assessment_type, and role_code on an active project', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'active' }) },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(
      wrapper.get('[data-testid="project-form-framework-version"]').attributes('disabled')
    ).toBeDefined()
    // ToggleGroup (reka-ui) propagates `disabled` to each item button, not to
    // the group container itself (a `role="group"` div has no HTML `disabled`
    // attribute) — so the assertion targets an item.
    expect(
      wrapper.get('[data-testid="project-form-assessment-type"] button').attributes('disabled')
    ).toBeDefined()
    expect(
      wrapper.get('[data-testid="project-form-role-code"]').attributes('disabled')
    ).toBeDefined()
    // Silent disabling is a bug (D11 rule 7): each immutable control carries a
    // FieldDescription explaining why.
    expect(wrapper.text()).toContain('projects.form.immutableWhenLive')
    expect(wrapper.text()).toContain('projects.form.frameworkVersionImmutable')
  })

  it('leaves assessment_type and role_code editable on a draft project', async () => {
    // NOTE: the admin-backoffice spec's "Draft project allows editing every
    // field" scenario reads literally as "including framework_version_id",
    // but design D9 (verified against the live `UpdateProjectRequest.php`:
    // "blanket-prohibited in ALL PATCH requests ... even on draft") and this
    // batch's own KEY REQUIREMENTS ("framework_version_id is prohibited on
    // EVERY PATCH -> render it read-only on edit") are unambiguous and
    // contradict that literal reading. Design is authoritative on contract
    // shapes; followed here, flagged rather than silently reconciled either
    // way. See the dedicated "always disables framework_version_id when
    // editing" test above for that field's actual (always-disabled) behavior.
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'draft' }) },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(
      wrapper.get('[data-testid="project-form-assessment-type"] button').attributes('disabled')
    ).toBeUndefined()
    expect(
      wrapper.get('[data-testid="project-form-role-code"]').attributes('disabled')
    ).toBeUndefined()
  })

  it('always disables framework_version_id when editing, even on a draft project (D9: prohibited on every PATCH)', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'draft' }) },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    // framework_version_id is a special case: prohibited on EVERY PATCH
    // regardless of status, unlike assessment_type/role_code which only lock
    // once the project goes live.
    expect(
      wrapper.get('[data-testid="project-form-framework-version"]').attributes('disabled')
    ).toBeDefined()
  })

  it('leaves framework_version_id editable when creating (no project yet)', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: null },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(
      wrapper.get('[data-testid="project-form-framework-version"]').attributes('disabled')
    ).toBeUndefined()
  })

  it('never prefills the webhook secret with a stored value', async () => {
    const wrapper = mount(ProjectForm, {
      props: {
        project: activeProject({ status: 'draft', webhook_url: 'https://example.com/hook' }),
      },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    const secretInput = wrapper.get('[data-testid="project-form-webhook-secret"]')
    expect((secretInput.element as HTMLInputElement).value).toBe('')
  })

  // The sibling assertion to the one above, and the one that was missing.
  // "The input is empty" is correct write-only behaviour and says nothing about
  // whether a secret exists. Without this, `:configured` was hardcoded to false
  // and every project reported "not set" — a claim the suite could not see.
  it('reports an existing webhook secret as configured without revealing it', async () => {
    const wrapper = mount(ProjectForm, {
      props: {
        project: activeProject({
          status: 'draft',
          webhook_url: 'https://example.com/hook',
          has_webhook_secret: true,
        }),
      },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="project-form-webhook-secret-status"]').text()).toBe(
      'projects.secret.configured'
    )
    expect(
      (wrapper.get('[data-testid="project-form-webhook-secret"]').element as HTMLInputElement).value
    ).toBe('')
  })

  it('reports a project with no webhook secret as not set', async () => {
    const wrapper = mount(ProjectForm, {
      props: {
        project: activeProject({ status: 'draft', has_webhook_secret: false }),
      },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="project-form-webhook-secret-status"]').text()).toBe(
      'projects.secret.notSet'
    )
  })

  it('offers only the legal draft→active transition for a draft project', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'draft' }) },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="project-form-transition-activate"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="project-form-transition-archive"]').exists()).toBe(false)
  })

  it('offers only the legal active→archived transition for an active project', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'active' }) },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="project-form-transition-archive"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="project-form-transition-activate"]').exists()).toBe(false)
  })

  it('offers no transition for an archived project (terminal state)', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'archived' }) },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="project-form-transition-activate"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="project-form-transition-archive"]').exists()).toBe(false)
  })

  it('offers no transition when creating (no project yet)', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: null },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="project-form-transition-activate"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="project-form-transition-archive"]').exists()).toBe(false)
  })

  it('shows a required-field message under the field on blur, with aria-invalid and aria-describedby', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: null },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    const nameInput = wrapper.get('[data-testid="project-form-name"]')
    await nameInput.trigger('blur')

    const error = wrapper.get('[data-testid="project-form-name-error"]')
    expect(error.text()).toBe('projects.form.nameRequired')
    expect(nameInput.attributes('aria-invalid')).toBe('true')
    // Split, not a strict string equality: aria-describedby also carries the
    // field's help-text id (D6) alongside the error id.
    expect((nameInput.attributes('aria-describedby') ?? '').split(/\s+/)).toContain(
      error.attributes('id')
    )
  })

  it('renders a role="alert" banner adjacent to the submit CTA on a failed save, not at the top of the form', async () => {
    createProjectMock.mockRejectedValue(
      Object.assign(new Error('Unprocessable'), {
        status: 422,
        data: { errors: { name: ['The name has already been taken.'] } },
      })
    )

    const wrapper = mount(ProjectForm, {
      props: { project: null },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form-name"]').setValue('Demo')
    await wrapper.get('[data-testid="project-form-slug"]').setValue('demo')
    // Switch to `potential` (a real ToggleGroupItem button click) so the test
    // is not also incidentally exercising the `role_code`-required-for-
    // `standard` validation — that path is covered by its own test.
    await wrapper
      .get('[data-testid="project-form-assessment-type"] button:last-child')
      .trigger('click')
    await wrapper.get('[data-testid="project-form"]').trigger('submit')
    await flushPromises()

    const banner = wrapper.get('[data-testid="project-form-banner"]')
    expect(banner.attributes('role')).toBe('alert')

    const html = wrapper.html()
    expect(html.indexOf('project-form-banner')).toBeLessThan(html.indexOf('project-form-submit'))
  })

  it('maps a 422 field error onto the matching field, not only the banner', async () => {
    createProjectMock.mockRejectedValue(
      Object.assign(new Error('Unprocessable'), {
        status: 422,
        data: { errors: { name: ['The name has already been taken.'] } },
      })
    )

    const wrapper = mount(ProjectForm, {
      props: { project: null },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form-name"]').setValue('Demo')
    await wrapper.get('[data-testid="project-form-slug"]').setValue('demo')
    // Switch to `potential` (a real ToggleGroupItem button click) so the test
    // is not also incidentally exercising the `role_code`-required-for-
    // `standard` validation — that path is covered by its own test.
    await wrapper
      .get('[data-testid="project-form-assessment-type"] button:last-child')
      .trigger('click')
    await wrapper.get('[data-testid="project-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="project-form-name-error"]').text()).toBe(
      'The name has already been taken.'
    )
  })

  it('creates via useProjects on a valid submit and emits saved', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: null },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form-name"]').setValue('Demo')
    await wrapper.get('[data-testid="project-form-slug"]').setValue('demo')
    // Switch to `potential` (a real ToggleGroupItem button click) so the test
    // is not also incidentally exercising the `role_code`-required-for-
    // `standard` validation — that path is covered by its own test.
    await wrapper
      .get('[data-testid="project-form-assessment-type"] button:last-child')
      .trigger('click')
    await wrapper.get('[data-testid="project-form"]').trigger('submit')
    await flushPromises()

    expect(createProjectMock).toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('updates via useProjects and never sends framework_version_id when editing', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'draft' }) },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form"]').trigger('submit')
    await flushPromises()

    expect(updateProjectMock).toHaveBeenCalled()
    const [, payload] = updateProjectMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload).not.toHaveProperty('framework_version_id')
  })

  it.each([
    ['pause-every-n', 'project-form-pause-every-n'],
    ['nudge-min-chars', 'project-form-nudge-min-chars'],
  ])('pairs aria-invalid with aria-describedby on the %s field', async (_label, testid) => {
    const wrapper = mount(ProjectForm, {
      props: { project: null },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    const input = wrapper.get(`[data-testid="${testid}"]`)
    await input.setValue('-5')
    await input.trigger('blur')

    const error = wrapper.get(`[data-testid="${testid}-error"]`)
    expect(error.attributes('id')).toBeTruthy()
    expect(input.attributes('aria-invalid')).toBe('true')
    // Split, not a strict string equality: aria-describedby also carries the
    // field's help-text id (D6) alongside the error id.
    expect((input.attributes('aria-describedby') ?? '').split(/\s+/)).toContain(
      error.attributes('id')
    )
  })

  // The two URL fields shipped with no FieldError, no aria-invalid and no
  // client-side check at all, while every other field in this form had all
  // three: a malformed webhook URL produced a generic "could not save" banner
  // and no indication of which field the server had refused.
  it.each([
    ['exit redirect url', 'project-form-exit-redirect-url'],
    ['webhook url', 'project-form-webhook-url'],
  ])('reports a malformed %s on the field itself', async (_label, testid) => {
    const wrapper = mount(ProjectForm, {
      props: { project: null },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    const input = wrapper.get(`[data-testid="${testid}"]`)
    await input.setValue('example.com')
    await input.trigger('blur')

    const error = wrapper.get(`[data-testid="${testid}-error"]`)
    expect(error.attributes('id')).toBeTruthy()
    expect(input.attributes('aria-invalid')).toBe('true')
    // Split, not a strict string equality: aria-describedby also carries the
    // field's help-text id (D6) alongside the error id.
    expect((input.attributes('aria-describedby') ?? '').split(/\s+/)).toContain(
      error.attributes('id')
    )
  })

  it('refuses to submit while a URL field is malformed', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'draft' }) },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form-webhook-url"]').setValue('nope')
    await wrapper.get('[data-testid="project-form"]').trigger('submit')
    await flushPromises()

    expect(updateProjectMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="project-form-webhook-url-error"]').exists()).toBe(true)
  })

  // Previously only name/slug/role_code were mapped; every other 422 field was
  // reduced to the generic banner.
  it.each([
    ['webhook_url', 'project-form-webhook-url-error'],
    ['exit_redirect_url', 'project-form-exit-redirect-url-error'],
    ['nudge_min_chars', 'project-form-nudge-min-chars-error'],
    ['pause_every_n_competencies', 'project-form-pause-every-n-error'],
  ])('surfaces a 422 on %s next to its own control', async (serverField, errorTestId) => {
    updateProjectMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { [serverField]: ['Server says no.'] } },
      })
    )

    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'draft' }) },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get(`[data-testid="${errorTestId}"]`).text()).toContain('Server says no.')
  })

  // A field with no control of its own must still reach the operator rather
  // than being swallowed into a generic message.
  it('shows the server message in the banner for a field this form has no control for', async () => {
    updateProjectMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { framework_version_id: ['That framework version is retired.'] } },
      })
    )

    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'draft' }) },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="project-form-banner"]').text()).toContain(
      'That framework version is retired.'
    )
  })
})

// dates-and-destructive-actions, design.md D7 — archive stops calling
// onTransition directly; it sets archiveConfirm = true instead. onTransition
// is reachable ONLY from confirm, so cancel structurally cannot strand
// `saving` (the only place `saving = true` is assigned is inside
// onTransition itself).
describe('ProjectForm — archive requires confirmation (D7)', () => {
  // A SIBLING describe, not nested — does NOT inherit the outer
  // describe('ProjectForm')'s beforeEach, so updateProjectMock's call
  // history from whichever test in that block ran last would otherwise leak
  // into this block's first assertion. Reset explicitly here too.
  beforeEach(() => {
    updateProjectMock.mockReset().mockResolvedValue({ data: activeProject() })
  })

  // ConfirmDialog teleports to document.body, and confirmDialog() queries it
  // globally — without this, a previous test's dialog DOM can leak into the
  // next one's query.
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('clicking Archive does not call updateProject or set saving, until confirmed', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'active' }) },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form-transition-archive"]').trigger('click')
    await flushPromises()

    expect(updateProjectMock).not.toHaveBeenCalled()
    expect(
      wrapper.get('[data-testid="project-form-submit"]').attributes('disabled')
    ).toBeUndefined()
    wrapper.unmount()
  })

  it('cancelling the archive confirmation leaves saving false and calls nothing', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'active' }) },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form-transition-archive"]').trigger('click')
    await flushPromises()
    await confirmDialog('cancel')

    expect(updateProjectMock).not.toHaveBeenCalled()
    expect(
      wrapper.get('[data-testid="project-form-submit"]').attributes('disabled')
    ).toBeUndefined()
    wrapper.unmount()
  })

  it('confirming archives with { status: "archived" } and settles saving back to false', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'active', id: 7 }) },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form-transition-archive"]').trigger('click')
    await flushPromises()
    await confirmDialog('confirm')

    expect(updateProjectMock).toHaveBeenCalledWith(7, { status: 'archived' })
    expect(
      wrapper.get('[data-testid="project-form-submit"]').attributes('disabled')
    ).toBeUndefined()
    wrapper.unmount()
  })

  it('the confirmation names the resulting archived status', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'active' }) },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form-transition-archive"]').trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('projects.confirm.archiveTitle')
    expect(document.body.textContent).toContain('projects.confirm.archiveDescription')
    wrapper.unmount()
  })

  // The regression this requirement (ConfirmDialog exposes per-action verb)
  // exists to prevent: someone silently drops the `confirm-label` prop at
  // this call site and ships the generic "Confirm" — ConfirmDialog.spec.ts
  // proves the MECHANISM works, but nothing at this call site pinned that
  // it is actually USED here.
  it('the archive confirmation button carries the "Archive" verb, not the generic label', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'active' }) },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form-transition-archive"]').trigger('click')
    await flushPromises()

    const confirmButtonText = document.body.querySelector(
      '[data-testid="confirm-dialog-confirm"]'
    )?.textContent

    expect(confirmButtonText).toContain('projects.action.archive')
    expect(confirmButtonText).not.toContain('users.confirm.action')

    wrapper.unmount()
  })
})

// form-clarity-and-console-warnings, D6: 9 new FieldDescriptions, each
// nested inside the same Field as the control it describes and referenced
// from that control's aria-describedby.
describe('ProjectForm — field help (D6)', () => {
  it.each([
    ['project-form-name', 'projects.form.help.name'],
    ['project-form-slug', 'projects.form.help.slug'],
    ['project-form-language', 'projects.form.help.language'],
    ['project-form-pause-every-n', 'projects.form.help.pauseEveryN'],
    ['project-form-nudge-min-chars', 'projects.form.help.nudgeMinChars'],
    ['project-form-exit-redirect-url', 'projects.form.help.exitRedirectUrl'],
    ['project-form-webhook-url', 'projects.form.help.webhookUrl'],
  ])("%s renders and is pointed at by its control's aria-describedby", async (testId, helpKey) => {
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'draft' }) },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain(helpKey)

    const control = wrapper.get(`[data-testid="${testId}"]`)
    const describedBy = control.attributes('aria-describedby') ?? ''
    const describedIds = describedBy.split(/\s+/).filter(Boolean)

    const matched = describedIds.some((id) => {
      const el = wrapper.find(`#${id}`)
      return el.exists() && el.text() === helpKey
    })
    expect(matched, `expected an aria-describedby id on ${testId} to point at "${helpKey}"`).toBe(
      true
    )
  })

  // assessment_type's description previously only appeared AFTER the choice
  // was already frozen (`v-if="lockedWhenLive"`) — the warning arrived too
  // late to change anything. This asserts the fix: the new description
  // renders on a DRAFT project, before commitment.
  it('states assessment_type permanence on a draft project, before commitment', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'draft' }) },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('projects.form.help.assessmentTypeFreezes')
  })

  // The spec/design gap flagged in tasks.md 3.4: role_code's FieldDescription
  // also states permanence, via the EXISTING `roleCodeRequiredForStandard`
  // key extended to carry that clause — not a new key.
  it('states role_code permanence via the existing roleCodeRequiredForStandard description', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'draft' }) },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('projects.form.roleCodeRequiredForStandard')

    const control = wrapper.get('[data-testid="project-form-role-code"]')
    const describedBy = control.attributes('aria-describedby') ?? ''
    const describedIds = describedBy.split(/\s+/).filter(Boolean)
    const matched = describedIds.some((id) => {
      const el = wrapper.find(`#${id}`)
      return el.exists() && el.text() === 'projects.form.roleCodeRequiredForStandard'
    })
    expect(matched).toBe(true)
  })

  it('renders the competencies help text inside the CompetencyPicker FieldSet', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'draft' }) },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('projects.form.help.competencies')
  })
})
