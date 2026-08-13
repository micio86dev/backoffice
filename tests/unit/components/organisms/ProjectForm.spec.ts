/**
 * ProjectForm.vue (Unit 2b, tasks 20.4-20.7 — RED)
 *
 * Mirrors server-side immutability (D9) instead of letting the operator hit
 * an unexplained 422, and follows the ratified two-level feedback contract
 * (login.vue/login.spec.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

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
    id: '1',
    organization_id: '1',
    framework_version_id: '3',
    slug: 'demo-project',
    name: 'Demo Project',
    assessment_type: 'standard',
    role_code: 'FLL',
    language: 'en',
    status: 'active',
    pause_every_n_competencies: '3',
    nudge_min_chars: '40',
    exit_redirect_url: null,
    webhook_url: null,
    webhook_events: '[]',
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
    expect(nameInput.attributes('aria-describedby')).toBe(error.attributes('id'))
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
    expect(input.attributes('aria-describedby')).toBe(error.attributes('id'))
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
    expect(input.attributes('aria-describedby')).toBe(error.attributes('id'))
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
