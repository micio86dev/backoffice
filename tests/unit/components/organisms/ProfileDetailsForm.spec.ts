/**
 * ProfileDetailsForm.vue (user-profile-self-service, design D8, task 6.1 —
 * RED)
 *
 * `name`/`email`/`locale`, submitting ONLY `PATCH /api/profile` — never the
 * password endpoint. Two-level feedback contract per
 * OrganizationProfileForm.vue's precedent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const tMock = (key: string) => key
const updateProfileMock = vi.fn()
const updatePasswordMock = vi.fn()

vi.mock('../../../../app/composables/useProfile', () => ({
  useProfile: () => ({ updateProfile: updateProfileMock, updatePassword: updatePasswordMock }),
}))

const ProfileDetailsForm = (
  await import('../../../../app/components/organisms/ProfileDetailsForm.vue')
).default

describe('ProfileDetailsForm', () => {
  beforeEach(() => {
    updateProfileMock
      .mockReset()
      .mockResolvedValue({ data: { id: 1, name: 'Ada', email: 'ada@example.test', locale: 'en' } })
    updatePasswordMock.mockReset()
  })

  function mountForm() {
    return mount(ProfileDetailsForm, {
      props: {
        profile: {
          id: 1,
          name: 'Ada Lovelace',
          email: 'ada@example.test',
          locale: 'en',
          role: 'operator',
          organization: { id: 1, name: 'Acme' },
        },
      },
      global: { mocks: { $t: tMock } },
    })
  }

  it('renders name and email prefilled with the current values', () => {
    const wrapper = mountForm()

    expect(
      (wrapper.get('[data-testid="profile-details-name"]').element as HTMLInputElement).value
    ).toBe('Ada Lovelace')
    expect(
      (wrapper.get('[data-testid="profile-details-email"]').element as HTMLInputElement).value
    ).toBe('ada@example.test')
  })

  it('submits only PATCH /api/profile via useProfile — never the password endpoint', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="profile-details-name"]').setValue('New Name')
    await wrapper.get('[data-testid="profile-details-form"]').trigger('submit')
    await flushPromises()

    expect(updateProfileMock).toHaveBeenCalledWith({
      name: 'New Name',
      email: 'ada@example.test',
      locale: 'en',
    })
    expect(updatePasswordMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('surfaces a 422 on email next to its own control with aria-invalid and aria-describedby', async () => {
    updateProfileMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { email: ['That email is already in use.'] } },
      })
    )

    const wrapper = mountForm()

    await wrapper.get('[data-testid="profile-details-form"]').trigger('submit')
    await flushPromises()

    const emailInput = wrapper.get('[data-testid="profile-details-email"]')
    const error = wrapper.get('[data-testid="profile-details-email-error"]')

    expect(error.text()).toContain('That email is already in use.')
    expect(emailInput.attributes('aria-invalid')).toBe('true')
    expect((emailInput.attributes('aria-describedby') ?? '').split(/\s+/)).toContain(
      error.attributes('id')
    )
  })

  it('surfaces a 422 on an unmapped field in the banner, not silently dropped', async () => {
    updateProfileMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { role: ['role is not an editable field on this resource.'] } },
      })
    )

    const wrapper = mountForm()

    await wrapper.get('[data-testid="profile-details-form"]').trigger('submit')
    await flushPromises()

    const banner = wrapper.get('[data-testid="profile-details-banner"]')
    expect(banner.attributes('role')).toBe('alert')
    expect(banner.text()).toContain('role is not an editable field on this resource.')
  })
})
