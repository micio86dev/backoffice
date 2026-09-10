/**
 * ProjectForm.vue (Unit 2b, tasks 20.4-20.7 — RED)
 *
 * Mirrors server-side immutability (D9) instead of letting the operator hit
 * an unexplained 422, and follows the ratified two-level feedback contract
 * (login.vue/login.spec.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { realI18n } from '../../support/i18n'
import { confirmDialog } from '../../support/confirm'
import { waitFor } from '../../support/wait-for'
import CompetencyPicker from '../../../../app/components/molecules/CompetencyPicker.vue'

const tMock = (key: string) => key

// `te` from the REAL locale files. The global setup stubs it as
// `() => true`, which reports a hit for every key — so a code with no
// copy would render as its own name and every assertion below would
// still pass.
vi.stubGlobal('useI18n', () => realI18n())

const createProjectMock = vi.fn()
const updateProjectMock = vi.fn()
const fetchRoleCompetenciesMock = vi.fn()
const fetchPotentialCompetenciesMock = vi.fn()
const listTemplatesMock = vi.fn()

vi.mock('../../../../app/composables/useProjects', () => ({
  useProjects: () => ({ createProject: createProjectMock, updateProject: updateProjectMock }),
}))

vi.mock('../../../../app/composables/useFrameworkRoles', () => ({
  useFrameworkRoles: () => ({
    fetchRoleCompetencies: fetchRoleCompetenciesMock,
    fetchPotentialCompetencies: fetchPotentialCompetenciesMock,
  }),
}))

vi.mock('../../../../app/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ listTemplateOptions: listTemplatesMock }),
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
    fetchPotentialCompetenciesMock.mockReset().mockResolvedValue({
      data: [
        { id: 91, code: 'MTG', name: 'Motivation', bars_available: false },
        { id: 92, code: 'LAT', name: 'Learning agility', bars_available: false },
      ],
    })
    // At least one template, ALWAYS. A project cannot exist without one —
    // the column is NOT NULL and the form refuses a submit with nothing
    // selected — so an empty list is not a state any of these tests are about;
    // it would just make every submit assertion fail for an unrelated reason.
    listTemplatesMock.mockReset().mockResolvedValue({
      data: [{ id: 7, name: 'Default template', provider: 'heygen', is_active: true }],
    })
  })

  describe('the framework pin is a required field with a control', () => {
    it('refuses a blank pin on create, on the FIELD', async () => {
      // `frameworkVersionId` starts as `''` and `Number('')` is `0`, so a blank
      // required field shipped as a valid-looking integer. The server refused
      // it, the key was excluded from the field map, and the refusal collapsed
      // to "could not save" with nothing highlighted.
      const wrapper = mount(ProjectForm, {
        props: { project: null },
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      await wrapper.get('[data-testid="project-form-name"]').setValue('Demo')
      await wrapper.get('[data-testid="project-form-slug"]').setValue('demo')
      await wrapper
        .get('[data-testid="project-form-assessment-type"] button:last-child')
        .trigger('click')
      await wrapper.get('[data-testid="project-form"]').trigger('submit')
      await flushPromises()

      expect(createProjectMock).not.toHaveBeenCalled()
      expect(wrapper.get('[data-testid="project-form-framework-version-error"]').exists()).toBe(
        true
      )
      expect(
        wrapper.get('[data-testid="project-form-framework-version"]').attributes('aria-invalid')
      ).toBe('true')
    })

    it('references its own help text, so the immutability is announced', async () => {
      // Every other field wires `describedBy`; this one call site was skipped,
      // so a screen-reader user was never told the field cannot be changed.
      const wrapper = mount(ProjectForm, {
        props: { project: null },
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      expect(
        wrapper.get('[data-testid="project-form-framework-version"]').attributes('aria-describedby')
      ).toContain('project-form-framework-version-help')
    })

    it('says a failed avatar-template load FAILED', async () => {
      // The list is required and now empty, so the only thing on screen was
      // "choose an avatar template" under a control with nothing to choose — a
      // network failure reported as the operator's mistake.
      listTemplatesMock.mockReset().mockRejectedValue(new Error('network down'))

      const wrapper = mount(ProjectForm, {
        props: { project: null },
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      expect(wrapper.get('[data-testid="project-form-templates-error"]').text()).toContain(
        'projects.form.templatesLoadError'
      )
    })
  })

  describe('the form-level refusal code', () => {
    it('translates POTENTIAL_CATALOG_INCOMPLETE rather than printing the token', async () => {
      // The one 422 no control on this form can fix, and the only path here
      // that could still put a raw machine token in front of an operator.
      // It is UPPER_SNAKE, which a lowercase-only token guard would have
      // discarded — replacing the message that says what actually went wrong
      // with the generic one.
      createProjectMock.mockRejectedValue(
        Object.assign(new Error('422'), {
          status: 422,
          data: { message: 'x', code: 'POTENTIAL_CATALOG_INCOMPLETE' },
        })
      )

      const wrapper = mount(ProjectForm, {
        props: { project: null },
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      await wrapper.get('[data-testid="project-form-name"]').setValue('Demo')
      await wrapper.get('[data-testid="project-form-slug"]').setValue('demo')
      await wrapper.get('[data-testid="project-form-framework-version"]').setValue('1')
      await wrapper
        .get('[data-testid="project-form-assessment-type"] button:last-child')
        .trigger('click')
      await wrapper.get('[data-testid="project-form"]').trigger('submit')
      await flushPromises()

      const banner = wrapper.get('[data-testid="project-form-banner"]').text()

      expect(banner).toContain('projects.form.serverError.POTENTIAL_CATALOG_INCOMPLETE')
      expect(banner).not.toBe('POTENTIAL_CATALOG_INCOMPLETE')
    })
  })

  describe('a failed lifecycle transition', () => {
    it('shows the banner even when a previous submit left a field error behind', async () => {
      // `applyServerErrors` suppresses the banner when a field error was
      // mapped. A transition refused with an empty `errors: {}` would find
      // the PREVIOUS submit's stale field error still set, decide the
      // operator already has their reason, and fail in silence.
      const wrapper = mount(ProjectForm, {
        props: { project: activeProject({ status: 'draft' }) },
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      updateProjectMock.mockReset().mockRejectedValueOnce(
        Object.assign(new Error('422'), {
          status: 422,
          data: { errors: { name: ['name_too_long'] } },
        })
      )
      await wrapper.get('[data-testid="project-form"]').trigger('submit')
      await flushPromises()
      expect(wrapper.find('[data-testid="project-form-name-error"]').exists()).toBe(true)

      updateProjectMock
        .mockReset()
        .mockRejectedValueOnce(
          Object.assign(new Error('422'), { status: 422, data: { errors: {} } })
        )
      await wrapper.get('[data-testid="project-form-transition-activate"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="project-form-banner"]').exists()).toBe(true)
    })
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
    // A field this form renders NO control for, so the banner is the only
    // place the refusal can go. A payload keyed on `name` maps to a control
    // and the banner is deliberately suppressed — the reason is already
    // under the field, and repeating it invites a retry that fails the same.
    createProjectMock.mockRejectedValue(
      Object.assign(new Error('Unprocessable'), {
        status: 422,
        data: { errors: { status: ['status_invalid'] } },
      })
    )

    const wrapper = mount(ProjectForm, {
      props: { project: null },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form-name"]').setValue('Demo')
    await wrapper.get('[data-testid="project-form-slug"]').setValue('demo')
    // REQUIRED on create. It used to ship as `Number('') === 0` and be
    // refused by the server; the form refuses it now, so every create path
    // has to fill it.
    await wrapper.get('[data-testid="project-form-framework-version"]').setValue('1')
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

    // The banner used to be asserted as preceding this form's own submit
    // button in document order, so an operator could not miss it. That button
    // moved to FormDrawer's footer (feature/form-drawer) and the guarantee is
    // now structural rather than positional: the footer never scrolls, and the
    // banner is the LAST thing in the scrolling body, so the two are visible
    // together no matter how far the form has been scrolled. What is still
    // this component's own responsibility — and what stays asserted here — is
    // that the banner is rendered inside the form at all.
    const html = wrapper.html()
    expect(html).toContain('project-form-banner')
    expect(html).not.toContain('project-form-submit')
  })

  it('maps a 422 field error onto the matching field, not only the banner', async () => {
    createProjectMock.mockRejectedValue(
      Object.assign(new Error('Unprocessable'), {
        status: 422,
        data: { errors: { name: ['name_too_long'] } },
      })
    )

    const wrapper = mount(ProjectForm, {
      props: { project: null },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form-name"]').setValue('Demo')
    await wrapper.get('[data-testid="project-form-slug"]').setValue('demo')
    // REQUIRED on create. It used to ship as `Number('') === 0` and be
    // refused by the server; the form refuses it now, so every create path
    // has to fill it.
    await wrapper.get('[data-testid="project-form-framework-version"]').setValue('1')
    // Switch to `potential` (a real ToggleGroupItem button click) so the test
    // is not also incidentally exercising the `role_code`-required-for-
    // `standard` validation — that path is covered by its own test.
    await wrapper
      .get('[data-testid="project-form-assessment-type"] button:last-child')
      .trigger('click')
    await wrapper.get('[data-testid="project-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="project-form-name-error"]').text()).toBe(
      'projects.form.serverError.name_too_long'
    )
  })

  it('maps a 422 on avatar_template_id onto its own control, not the banner', async () => {
    // `avatar_template_id` was absent from SERVER_FIELD_TO_ERROR_KEY while
    // `errors.avatarTemplateId` and `project-form-avatar-template-error` both
    // existed — so the one field with a control and no map entry sent its
    // refusal to the generic banner, which is the exact failure that table was
    // written to end. The docblock claimed it covered every submitted field.
    createProjectMock.mockRejectedValue(
      Object.assign(new Error('Unprocessable'), {
        status: 422,
        data: { errors: { avatar_template_id: ['avatar_template_invalid'] } },
      })
    )

    const wrapper = mount(ProjectForm, {
      props: { project: null },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form-name"]').setValue('Demo')
    await wrapper.get('[data-testid="project-form-slug"]').setValue('demo')
    // REQUIRED on create. It used to ship as `Number('') === 0` and be
    // refused by the server; the form refuses it now, so every create path
    // has to fill it.
    await wrapper.get('[data-testid="project-form-framework-version"]').setValue('1')
    await wrapper
      .get('[data-testid="project-form-assessment-type"] button:last-child')
      .trigger('click')
    await wrapper.get('[data-testid="project-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="project-form-avatar-template-error"]').text()).toBe(
      'projects.form.serverError.avatar_template_invalid'
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
    // REQUIRED on create. It used to ship as `Number('') === 0` and be
    // refused by the server; the form refuses it now, so every create path
    // has to fill it.
    await wrapper.get('[data-testid="project-form-framework-version"]').setValue('1')
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
        data: { errors: { [serverField]: ['name_invalid'] } },
      })
    )

    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'draft' }) },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form"]').trigger('submit')
    await flushPromises()

    // A CODE, translated. The endpoints answer with codes, and asserting
    // the wire value here is what let the raw English ship.
    expect(wrapper.get(`[data-testid="${errorTestId}"]`).text()).toContain(
      'projects.form.serverError.name_invalid'
    )
  })

  // A field with no control of its own must still reach the operator rather
  // than being swallowed into a generic message.
  it('shows the server message in the banner for a field this form has no control for', async () => {
    updateProjectMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        // `webhook_secret`: write-only, and this form renders no error slot
        // for it. `framework_version_id` used to be the example here and is
        // no longer control-less — it has a validator and a field error now,
        // which is the point of this change.
        data: { errors: { webhook_secret: ['webhook_secret_too_long'] } },
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
      'projects.form.serverError.webhook_secret_too_long'
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
    // Was read off this form's own submit button being enabled; that control
    // now lives in FormDrawer's footer and is driven by the flag this form
    // publishes (feature/form-drawer), so the flag itself is what gets
    // asserted — a stricter check than the button proxy it replaces.
    expect(wrapper.emitted('update:pending')?.at(-1)).toEqual([false])
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
    // Was read off this form's own submit button being enabled; that control
    // now lives in FormDrawer's footer and is driven by the flag this form
    // publishes (feature/form-drawer), so the flag itself is what gets
    // asserted — a stricter check than the button proxy it replaces.
    expect(wrapper.emitted('update:pending')?.at(-1)).toEqual([false])
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
    // Was read off this form's own submit button being enabled; that control
    // now lives in FormDrawer's footer and is driven by the flag this form
    // publishes (feature/form-drawer), so the flag itself is what gets
    // asserted — a stricter check than the button proxy it replaces.
    expect(wrapper.emitted('update:pending')?.at(-1)).toEqual([false])
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

// bars-coverage-visibility Phase 1 (design D2 "scope finding"): competencyIds
// never hydrated from props.project.competencies and never appeared in
// either submit payload. Hydration and submission MUST land together —
// submission alone would make the next save of an untouched project call
// sync([]) and wipe its competency set.
describe('ProjectForm — competency_ids hydration and submission (Phase 1 data-loss guard)', () => {
  it('hydrates the picker modelValue from props.project.competencies on mount', async () => {
    fetchRoleCompetenciesMock.mockResolvedValue({
      data: [{ id: 7, code: 'COL', name: 'Collaboration', bars_available: true }],
    })

    const wrapper = mount(ProjectForm, {
      props: {
        project: activeProject({
          status: 'draft',
          competencies: [{ id: 7, code: 'COL', type: 'standard', position: 0 }],
        }),
      },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    const picker = wrapper.findComponent(CompetencyPicker)
    expect(picker.props('modelValue')).toEqual([7])
  })

  it('submits competency_ids in the update payload on an unmodified save (not omitted, not emptied)', async () => {
    fetchRoleCompetenciesMock.mockResolvedValue({
      data: [{ id: 7, code: 'COL', name: 'Collaboration', bars_available: true }],
    })

    const wrapper = mount(ProjectForm, {
      props: {
        project: activeProject({
          status: 'draft',
          competencies: [{ id: 7, code: 'COL', type: 'standard', position: 0 }],
        }),
      },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form"]').trigger('submit')
    await flushPromises()

    expect(updateProjectMock).toHaveBeenCalled()
    const [, payload] = updateProjectMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload.competency_ids).toEqual([7])
  })

  it('includes competency_ids as an array in the create payload (potential assessment, no role)', async () => {
    const wrapper = mount(ProjectForm, {
      props: { project: null },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form-name"]').setValue('Demo')
    await wrapper.get('[data-testid="project-form-slug"]').setValue('demo')
    // REQUIRED on create. It used to ship as `Number('') === 0` and be
    // refused by the server; the form refuses it now, so every create path
    // has to fill it.
    await wrapper.get('[data-testid="project-form-framework-version"]').setValue('1')
    await wrapper
      .get('[data-testid="project-form-assessment-type"] button:last-child')
      .trigger('click')
    await wrapper.get('[data-testid="project-form"]').trigger('submit')
    await flushPromises()

    expect(createProjectMock).toHaveBeenCalled()
    const [payload] = createProjectMock.mock.calls[0] as [Record<string, unknown>]
    expect(payload.competency_ids).toEqual([])
  })

  it('can actually TICK a potential competency, which it could not before', async () => {
    // The options were built locally from two hardcoded codes with no `id`,
    // and `CompetencyPicker.toggle()` returns early without one: both boxes
    // rendered, neither responded, and a persisted selection rendered
    // unchecked. `potential` is a first-class assessment type and it was
    // unconfigurable. The case above asserts `[]` and never ticks a box —
    // a snapshot of that bug, not evidence against it.
    const wrapper = mount(ProjectForm, {
      props: { project: null },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="project-form-name"]').setValue('Demo')
    await wrapper.get('[data-testid="project-form-slug"]').setValue('demo')
    // REQUIRED on create. It used to ship as `Number('') === 0` and be
    // refused by the server; the form refuses it now, so every create path
    // has to fill it.
    await wrapper.get('[data-testid="project-form-framework-version"]').setValue('1')
    await wrapper
      .get('[data-testid="project-form-assessment-type"] button:last-child')
      .trigger('click')
    await flushPromises()

    // Sourced from the catalogue, so each option carries the id the picker
    // needs — and the picker is what decides whether a click does anything.
    expect(fetchPotentialCompetenciesMock).toHaveBeenCalled()
    expect(wrapper.findComponent(CompetencyPicker).props('options')).toEqual([
      { id: 91, code: 'MTG', name: 'Motivation', barsAvailable: false },
      { id: 92, code: 'LAT', name: 'Learning agility', barsAvailable: false },
    ])

    await wrapper.findComponent(CompetencyPicker).vm.$emit('update:modelValue', [91])
    await wrapper.get('[data-testid="project-form"]').trigger('submit')
    await flushPromises()

    const [payload] = createProjectMock.mock.calls.at(-1) as [Record<string, unknown>]
    expect(payload.competency_ids).toEqual([91])
  })

  it('says a failed catalogue load FAILED, rather than showing an empty list', async () => {
    // "No competencies available for this selection" is a claim about the
    // catalogue, and a failed request supports no claim about it — it would
    // send the operator changing the role to find the list they lost.
    fetchRoleCompetenciesMock.mockReset().mockRejectedValue(new Error('network down'))

    const wrapper = mount(ProjectForm, {
      props: { project: activeProject({ status: 'draft', role_code: 'ICO' }) },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="project-form-competencies-error"]').text()).toContain(
      'projects.form.competenciesLoadError'
    )
  })

  it('publishes NOTHING until the options have resolved', async () => {
    // The watcher resolves ids through the options, which load in
    // `onMounted` — so the first emit was always `[]`, for every project, and
    // the questions panel rendered "this project has no competencies yet"
    // about a fully configured one until the fetch landed.
    let resolveOptions: (value: unknown) => void = () => {}
    fetchRoleCompetenciesMock.mockReset().mockReturnValue(
      new Promise((resolve) => {
        resolveOptions = resolve
      })
    )

    const wrapper = mount(ProjectForm, {
      props: {
        project: activeProject({
          status: 'draft',
          role_code: 'ICO',
          competencies: [{ id: 7, code: 'COL', type: 'standard', position: 0 }],
        }),
      },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    expect(wrapper.emitted('update:competencies')).toBeUndefined()

    resolveOptions({ data: [{ id: 7, code: 'COL', name: 'Collaboration', bars_available: true }] })
    await flushPromises()

    expect(wrapper.emitted('update:competencies')?.at(-1)?.[0]).toEqual([{ id: 7, code: 'COL' }])
  })
})

// bars-coverage-visibility Phase 3 (design D2): coverage is a property of the
// role×competency PAIR, not of the competency alone, so it MUST re-evaluate
// when role_code changes. The archived regression note this guards against:
// a previous fix here survived because unit tests mocked the composable and
// never actually drove the Select — this test drives the REAL control.
describe('ProjectForm — coverage re-evaluates on role change (Phase 3)', () => {
  it("flips the picker's coverage flags and collapses persistedIds to [] when the role Select changes", async () => {
    fetchRoleCompetenciesMock.mockImplementation((roleCode: string) => {
      if (roleCode === 'ICO') {
        return Promise.resolve({
          data: [{ id: 1, code: 'COL', name: 'Collaboration', bars_available: true }],
        })
      }
      if (roleCode === 'FLL') {
        return Promise.resolve({
          data: [{ id: 2, code: 'STG', name: 'Strategy', bars_available: false }],
        })
      }
      return Promise.resolve({ data: [] })
    })

    const wrapper = mount(ProjectForm, {
      props: {
        project: activeProject({
          status: 'draft',
          role_code: 'ICO',
          competencies: [{ id: 1, code: 'COL', type: 'standard', position: 0 }],
        }),
      },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    // Before the role change: options reflect ICO's coverage, and
    // persistedIds carries the project's ORIGINAL role's attached ids.
    let picker = wrapper.findComponent(CompetencyPicker)
    expect(picker.props('options')).toEqual([
      { id: 1, code: 'COL', name: 'Collaboration', barsAvailable: true },
    ])
    expect(picker.props('persistedIds')).toEqual([1])

    // Drive the REAL role Select — reka-ui's SelectTrigger opens on
    // pointerdown, and SelectItem selects on pointerup.
    const roleSelect = wrapper.get('[data-testid="project-form-role-code"]')
    roleSelect.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await waitFor(
      () => (document.body.textContent ?? '').includes('projects.roleCode.FLL'),
      'the role select popup to render its options'
    )

    const flOption = Array.from(document.body.querySelectorAll('[role="option"]')).find((el) =>
      (el.textContent ?? '').includes('projects.roleCode.FLL')
    )
    if (!flOption) throw new Error('FLL role option not found in the open Select popup')
    flOption.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await flushPromises()

    await waitFor(() => {
      picker = wrapper.findComponent(CompetencyPicker)
      const options = picker.props('options') as unknown[]
      return options.length > 0 && (options[0] as { code: string }).code === 'STG'
    }, 'the picker options to reload for the new role')

    // After the role change: options reflect FLL's coverage (uncovered STG),
    // and persistedIds has collapsed to [] — the ids were attached under the
    // project's ORIGINAL role (ICO), not under FLL.
    expect(picker.props('options')).toEqual([
      { id: 2, code: 'STG', name: 'Strategy', barsAvailable: false },
    ])
    expect(picker.props('persistedIds')).toEqual([])

    wrapper.unmount()
  })

  /**
   * Per-project avatar template.
   *
   * Before this control existed a project had no say in which template it ran
   * on: the provider came from `provider_override` (never exposed in this
   * backoffice) or the `INTERVIEW_PROVIDER` env default, and the API returned
   * the organization's ONE active template for that provider. An operator
   * holding one active HeyGen template and one active Tavus template — a legal
   * state, since activation is scoped per provider — watched the env default
   * silently choose for them.
   */
  describe('avatar template selection', () => {
    it('offers every template, and pre-selects the one the project pinned', async () => {
      listTemplatesMock.mockResolvedValue({
        data: [
          { id: 7, name: 'Recruiter HeyGen', provider: 'heygen', is_active: true },
          { id: 9, name: 'Recruiter Tavus', provider: 'tavus', is_active: false },
        ],
      })

      const wrapper = mount(ProjectForm, {
        props: { project: activeProject({ avatar_template_id: 9 }) },
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      const select = wrapper.get('[data-testid="project-form-avatar-template"]')
      expect((select.element as HTMLSelectElement).value).toBe('9')
      // The two templates and nothing else. The "use the organization default"
      // option is gone: the column is NOT NULL and the API rejects an explicit
      // null, so offering it would be offering a choice that can only 422.
      expect(select.findAll('option')).toHaveLength(2)
    })

    it('sends the pinned template on save', async () => {
      listTemplatesMock.mockResolvedValue({
        data: [{ id: 7, name: 'Recruiter HeyGen', provider: 'heygen', is_active: true }],
      })

      const wrapper = mount(ProjectForm, {
        props: { project: activeProject({ avatar_template_id: null }) },
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      await wrapper.get('[data-testid="project-form-avatar-template"]').setValue('7')
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(updateProjectMock).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ avatar_template_id: 7 })
      )
    })

    it('refuses a submit when the organization has no templates at all', async () => {
      // REPLACES a test that asserted the opposite — that clearing the select
      // sent an explicit null, so an operator could return to an
      // organization-wide default. That default no longer exists: the column
      // is NOT NULL and the API rejects a null, which the test immediately
      // below has asserted since. The two contradicted each other, and this
      // one was the stale half.
      //
      // Clearing the select is no longer even reachable — there is no empty
      // option to choose. What IS reachable is this: an organization that has
      // not configured a template yet, where the default cannot resolve to
      // anything. The submit is refused HERE, with the error on the control,
      // rather than sent and bounced back as an unmapped 422 the operator
      // reads as "could not save".
      listTemplatesMock.mockResolvedValue({ data: [] })
      // This describe has no beforeEach of its own, so the create spy carries
      // calls from earlier tests in the block. Cleared, not reset: the
      // resolved value it was given at module level still has to stand.
      createProjectMock.mockClear()

      // `project: null` IS create mode. Omitting the required prop only
      // produced a [Vue warn].
      const wrapper = mount(ProjectForm, {
        props: { project: null },
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      await wrapper.get('#project-form-name').setValue('New project')
      await wrapper.get('#project-form-slug').setValue('new-project')
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(createProjectMock).not.toHaveBeenCalled()
      expect(wrapper.get('[data-testid="project-form-avatar-template-error"]').text()).toContain(
        'projects.form.avatarTemplateRequired'
      )
    })

    it('offers no "organization default" option — the field is required', async () => {
      // `projects.avatar_template_id` is NOT NULL and the API rejects an
      // explicit null. Leaving the empty option in place would offer an
      // operator a choice that can only ever come back as a 422.
      listTemplatesMock.mockResolvedValue({
        data: [{ id: 7, name: 'Recruiter HeyGen', provider: 'heygen', is_active: true }],
      })

      const wrapper = mount(ProjectForm, {
        props: { project: activeProject({ avatar_template_id: 7 }) },
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      const options = wrapper.get('[data-testid="project-form-avatar-template"]').findAll('option')
      expect(options).toHaveLength(1)
      expect(options.every((o) => o.attributes('value') !== '')).toBe(true)
    })

    it('defaults a NEW project to the most recently used template', async () => {
      // "Most recently used" rather than "first": an operator creating several
      // projects in a row is almost always continuing with the same template,
      // and making them re-pick it every time is the kind of friction that
      // turns a required field into an annoyance.
      listTemplatesMock.mockResolvedValue({
        data: [
          { id: 3, name: 'Older', provider: 'heygen', is_active: false },
          { id: 9, name: 'Most recent', provider: 'tavus', is_active: true },
        ],
      })

      const wrapper = mount(ProjectForm, {
        props: { project: {} },
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      expect(
        (wrapper.get('[data-testid="project-form-avatar-template"]').element as HTMLSelectElement)
          .value
      ).toBe('9')
    })

    it('falls back to the first template when none has been used yet', async () => {
      listTemplatesMock.mockResolvedValue({
        data: [{ id: 3, name: 'The only one', provider: 'heygen', is_active: false }],
      })

      const wrapper = mount(ProjectForm, {
        props: { project: {} },
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      expect(
        (wrapper.get('[data-testid="project-form-avatar-template"]').element as HTMLSelectElement)
          .value
      ).toBe('3')
    })

    it('never overwrites the template an existing project already pinned', async () => {
      // The default is for a project that has made no choice. Applying it to
      // one that has would silently re-point a live project on every edit.
      listTemplatesMock.mockResolvedValue({
        data: [
          { id: 3, name: 'Pinned', provider: 'heygen', is_active: false },
          { id: 9, name: 'Most recent', provider: 'tavus', is_active: true },
        ],
      })

      const wrapper = mount(ProjectForm, {
        props: { project: activeProject({ avatar_template_id: 3 }) },
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      expect(
        (wrapper.get('[data-testid="project-form-avatar-template"]').element as HTMLSelectElement)
          .value
      ).toBe('3')
    })

    it('still renders the control when no template exists yet', async () => {
      // An organization with no templates is the starting state of every new
      // tenant. Hiding the control there would read as "this product has no
      // such setting" rather than "you have not created one yet".
      listTemplatesMock.mockResolvedValue({ data: [] })

      const wrapper = mount(ProjectForm, {
        props: { project: activeProject() },
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      expect(wrapper.find('[data-testid="project-form-avatar-template"]').exists()).toBe(true)
    })

    it('survives a failed template load rather than breaking the whole form', async () => {
      // The template list is one optional control on a form that configures
      // far more important things. A rejected background load must not stop an
      // operator saving a name change.
      listTemplatesMock.mockRejectedValue(new Error('unreachable'))

      const wrapper = mount(ProjectForm, {
        props: { project: activeProject() },
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(updateProjectMock).toHaveBeenCalled()
    })
  })
  it('gives the assessment-type toggle an accessible name a label cannot provide', () => {
    // `for` binds only to LABELABLE elements — button, input, select, textarea,
    // meter, output, progress. reka-ui renders ToggleGroup as a
    // `<div role="group">`, so the old `<FieldLabel for>` was a no-op: it read
    // as correct precisely because the Select beside it, whose `for` targets a
    // SelectTrigger button, genuinely is.
    const wrapper = mount(ProjectForm, {
      props: { project: null },
      global: { mocks: { $t: tMock } },
    })

    const group = wrapper.get('[data-testid="project-form-assessment-type"]')
    const fieldset = group.element.closest('fieldset')

    expect(fieldset).not.toBeNull()
    expect(fieldset!.querySelector('legend')?.textContent).toContain('projects.form.assessmentType')
  })
})

/**
 * The questions panel sits below this form and groups by competency. It was
 * fed `project.competencies` — the PERSISTED set — so ticking a competency
 * showed nowhere to write its first question until the operator saved and
 * reopened the drawer, and unticking one left its group standing with its
 * questions still editable.
 */
describe('ProjectForm — publishing the live competency selection', () => {
  it('emits the ticked set on mount, before anything is touched', async () => {
    fetchRoleCompetenciesMock.mockResolvedValue({
      data: [{ id: 7, code: 'COL', name: 'Collaboration', bars_available: true }],
    })

    const wrapper = mount(ProjectForm, {
      props: {
        project: activeProject({
          status: 'draft',
          competencies: [{ id: 7, code: 'COL', type: 'standard', position: 0 }],
        }),
      },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    // Immediate: the drawer opens on a project that already has a set, and
    // waiting for a change would show no groups at all until the operator
    // touched something.
    const emitted = wrapper.emitted('update:competencies')
    expect(emitted).toBeTruthy()
    expect(emitted?.at(-1)?.[0]).toEqual([{ id: 7, code: 'COL' }])
  })

  it('re-emits the moment a competency is ticked, not on save', async () => {
    fetchRoleCompetenciesMock.mockResolvedValue({
      data: [
        { id: 7, code: 'COL', name: 'Collaboration', bars_available: true },
        { id: 8, code: 'INN', name: 'Innovation', bars_available: true },
      ],
    })

    const wrapper = mount(ProjectForm, {
      props: {
        project: activeProject({
          status: 'draft',
          competencies: [{ id: 7, code: 'COL', type: 'standard', position: 0 }],
        }),
      },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    const callsBefore = updateProjectMock.mock.calls.length

    await wrapper.findComponent(CompetencyPicker).vm.$emit('update:modelValue', [7, 8])
    await flushPromises()

    expect(wrapper.emitted('update:competencies')?.at(-1)?.[0]).toEqual([
      { id: 7, code: 'COL' },
      { id: 8, code: 'INN' },
    ])

    // And nothing was saved to produce it. Counted from THIS mount, because
    // the mock is shared across the file.
    expect(updateProjectMock.mock.calls.length).toBe(callsBefore)
  })

  it('drops a competency from the published set as soon as it is unticked', async () => {
    fetchRoleCompetenciesMock.mockResolvedValue({
      data: [{ id: 7, code: 'COL', name: 'Collaboration', bars_available: true }],
    })

    const wrapper = mount(ProjectForm, {
      props: {
        project: activeProject({
          status: 'draft',
          competencies: [{ id: 7, code: 'COL', type: 'standard', position: 0 }],
        }),
      },
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.findComponent(CompetencyPicker).vm.$emit('update:modelValue', [])
    await flushPromises()

    expect(wrapper.emitted('update:competencies')?.at(-1)?.[0]).toEqual([])
  })
})
