/**
 * OrganizationProfileForm.vue (Unit 6, task 24.1 — RED)
 *
 * `name` editable, `slug` read-only display (a tenancy identifier, never
 * editable — D2), two-level feedback contract on submit failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { currentUserStub } from '../../support/abilities'

const tMock = (key: string) => key
const updateOrganizationMock = vi.fn()

vi.mock('../../../../app/composables/useOrganization', () => ({
  useOrganization: () => ({ updateOrganization: updateOrganizationMock }),
}))

// Who is looking at the form. `vi.mock` is hoisted, so the role has to live in
// a mutable box the factory closes over rather than be passed per-mount.
const role = { current: 'admin' }
vi.mock('../../../../app/composables/useCurrentUser', () => ({
  useCurrentUser: () => currentUserStub(role.current),
}))

const OrganizationProfileForm = (
  await import('../../../../app/components/organisms/OrganizationProfileForm.vue')
).default

describe('OrganizationProfileForm', () => {
  beforeEach(() => {
    role.current = 'admin'
    updateOrganizationMock.mockReset().mockResolvedValue({ data: { name: 'Acme', slug: 'acme' } })
  })

  function mountForm() {
    return mount(OrganizationProfileForm, {
      props: {
        organization: {
          id: 1,
          name: 'Acme',
          slug: 'acme',
          default_webhook_url: null,
          default_webhook_events: null,
          has_default_webhook_secret: false,
          created_at: null,
          updated_at: null,
        },
      },
      global: { mocks: { $t: tMock } },
    })
  }

  it('renders slug as read-only display, never an editable control', () => {
    const wrapper = mountForm()

    const slugField = wrapper.get('[data-testid="organization-profile-slug"]')
    expect(slugField.text()).toContain('acme')
    expect(slugField.element.tagName).not.toBe('INPUT')
  })

  it('renders name as an editable field, prefilled with the current value', () => {
    const wrapper = mountForm()

    const nameInput = wrapper.get('[data-testid="organization-profile-name"]')
    expect((nameInput.element as HTMLInputElement).value).toBe('Acme')
  })

  it('shows a required-field message under name on blur', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="organization-profile-name"]').setValue('')
    await wrapper.get('[data-testid="organization-profile-name"]').trigger('blur')

    const error = wrapper.get('[data-testid="organization-profile-name-error"]')
    // Split, not a strict string equality: aria-describedby also carries the
    // field's help-text id (D6) alongside the error id.
    expect(
      (
        wrapper.get('[data-testid="organization-profile-name"]').attributes('aria-describedby') ??
        ''
      ).split(/\s+/)
    ).toContain(error.attributes('id'))
  })

  it('renders a role="alert" banner adjacent to the submit CTA on a failed save', async () => {
    updateOrganizationMock.mockRejectedValue(Object.assign(new Error('fail'), { status: 500 }))
    const wrapper = mountForm()

    await wrapper.get('[data-testid="organization-profile-form"]').trigger('submit')
    await flushPromises()

    const banner = wrapper.get('[data-testid="organization-profile-banner"]')
    expect(banner.attributes('role')).toBe('alert')
    const html = wrapper.html()
    expect(html.indexOf('organization-profile-banner')).toBeLessThan(
      html.indexOf('organization-profile-submit')
    )
  })

  it('saves the name via useOrganization on submit and emits saved', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="organization-profile-name"]').setValue('New Name')
    await wrapper.get('[data-testid="organization-profile-form"]').trigger('submit')
    await flushPromises()

    expect(updateOrganizationMock).toHaveBeenCalledWith({ name: 'New Name' })
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  // form-clarity-and-console-warnings, D2: adopts the shared mapper instead of
  // the ad-hoc `getErrorFields(...)['name']` lookup.
  it('surfaces a 422 on name next to its own control', async () => {
    updateOrganizationMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { name: ['That name is already in use.'] } },
      })
    )

    const wrapper = mountForm()

    await wrapper.get('[data-testid="organization-profile-name"]').setValue('New Name')
    await wrapper.get('[data-testid="organization-profile-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="organization-profile-name-error"]').text()).toContain(
      'That name is already in use.'
    )
  })

  // form-clarity-and-console-warnings — CRITICAL 1 fix. `slug` has no entry in
  // SERVER_FIELD_TO_ERROR_KEY (it is read-only display, not a submitted
  // field), so a server 422 naming it must reach the form-level banner
  // VERBATIM — not be silently discarded in favour of the generic saveError
  // string.
  it('surfaces a 422 on a field outside the map (slug) in the banner, not the generic message', async () => {
    updateOrganizationMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { slug: ['That slug is already taken by another organization.'] } },
      })
    )

    const wrapper = mountForm()

    await wrapper.get('[data-testid="organization-profile-name"]').setValue('New Name')
    await wrapper.get('[data-testid="organization-profile-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="organization-profile-banner"]').text()).toContain(
      'That slug is already taken by another organization.'
    )
  })

  // form-clarity-and-console-warnings, D6
  it("renders the name help text and points the control's aria-describedby at it", () => {
    const wrapper = mountForm()

    expect(wrapper.text()).toContain('settings.organization.help.name')

    const control = wrapper.get('[data-testid="organization-profile-name"]')
    const describedIds = (control.attributes('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
    const matched = describedIds.some((id) => {
      const el = wrapper.find(`#${id}`)
      return el.exists() && el.text() === 'settings.organization.help.name'
    })
    expect(matched).toBe(true)
  })

  /**
   * The settings rail shows this section to EVERY role — reading the
   * organization's own name is not privileged, and both apps need it. Changing
   * it is `organization.update`, which is admin-only, so an operator reached a
   * section they may open, filled in an editable field, pressed Save and got a
   * 403 from a form that had given them no hint.
   *
   * The fix is not to hide the section. It is to render the name the way the
   * slug beside it has always been rendered — as a fact, not a control.
   */
  describe('for someone who may read the organization but not change it', () => {
    it('renders the name as read-only text, with no input and no save', () => {
      role.current = 'operator'

      const wrapper = mountForm()

      expect(wrapper.find('[data-testid="organization-profile-submit"]').exists()).toBe(false)

      // Same test id in both branches, on purpose: "the name is on screen" is
      // one requirement, and asserting the TAG is what separates reading it
      // from editing it — the same assertion the slug field above already
      // makes.
      const name = wrapper.get('[data-testid="organization-profile-name"]')
      expect(name.text()).toContain('Acme')
      expect(name.element.tagName).not.toBe('INPUT')
    })

    it('cannot submit at all', async () => {
      role.current = 'viewer'

      const wrapper = mountForm()
      await wrapper.get('[data-testid="organization-profile-form"]').trigger('submit')
      await flushPromises()

      // Not merely hidden: the handler itself refuses. A form element still
      // submits on Enter in a text field, and this one has no button to hide
      // behind.
      expect(updateOrganizationMock).not.toHaveBeenCalled()
    })
  })
})
