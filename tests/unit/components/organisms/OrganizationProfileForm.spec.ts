/**
 * OrganizationProfileForm.vue (Unit 6, task 24.1 — RED)
 *
 * `name` editable, `slug` read-only display (a tenancy identifier, never
 * editable — D2), two-level feedback contract on submit failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const tMock = (key: string) => key
const updateOrganizationMock = vi.fn()

vi.mock('../../../../app/composables/useOrganization', () => ({
  useOrganization: () => ({ updateOrganization: updateOrganizationMock }),
}))

const OrganizationProfileForm = (
  await import('../../../../app/components/organisms/OrganizationProfileForm.vue')
).default

describe('OrganizationProfileForm', () => {
  beforeEach(() => {
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
})
