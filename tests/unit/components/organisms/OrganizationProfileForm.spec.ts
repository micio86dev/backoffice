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
    expect(
      wrapper.get('[data-testid="organization-profile-name"]').attributes('aria-describedby')
    ).toBe(error.attributes('id'))
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
})
