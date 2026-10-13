/**
 * ProfilePasswordForm.vue (user-profile-self-service, design D3/D8, task
 * 6.2 — RED)
 *
 * Submits ONLY `PUT /api/profile/password`. On success, the response's
 * brand-new `access_token` (design D3 — the acting request token is
 * re-minted, not exempted) is handed to `useAuth().setSession(...)`, and
 * `useCurrentUser().refresh()` is called so no stale identity is cached
 * against the new session.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const tMock = (key: string) => key
const updateProfileMock = vi.fn()
const updatePasswordMock = vi.fn()
const setSessionMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('../../../../app/composables/useProfile', () => ({
  useProfile: () => ({ updateProfile: updateProfileMock, updatePassword: updatePasswordMock }),
}))

vi.mock('../../../../app/composables/useAuth', () => ({
  useAuth: () => ({ setSession: setSessionMock }),
}))

vi.mock('../../../../app/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ refresh: refreshMock }),
}))

const ProfilePasswordForm = (
  await import('../../../../app/components/organisms/ProfilePasswordForm.vue')
).default

describe('ProfilePasswordForm', () => {
  beforeEach(() => {
    updateProfileMock.mockReset()
    updatePasswordMock
      .mockReset()
      .mockResolvedValue({ access_token: 'brand-new-token', token_type: 'bearer' })
    setSessionMock.mockReset()
    refreshMock.mockReset().mockResolvedValue(undefined)
  })

  function mountForm() {
    return mount(ProfilePasswordForm, {
      props: { email: 'ada@example.test' },
      global: { mocks: { $t: tMock } },
    })
  }

  it('submits only PUT /api/profile/password — never the profile endpoint', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="profile-password-current"]').setValue('current-pass')
    await wrapper.get('[data-testid="profile-password-new"]').setValue('a-new-password-123')
    await wrapper
      .get('[data-testid="profile-password-confirmation"]')
      .setValue('a-new-password-123')
    await wrapper.get('[data-testid="profile-password-form"]').trigger('submit')
    await flushPromises()

    expect(updatePasswordMock).toHaveBeenCalledWith({
      current_password: 'current-pass',
      password: 'a-new-password-123',
      password_confirmation: 'a-new-password-123',
    })
    expect(updateProfileMock).not.toHaveBeenCalled()
  })

  it('on success, hands the response access_token to useAuth().setSession and refreshes useCurrentUser', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="profile-password-current"]').setValue('current-pass')
    await wrapper.get('[data-testid="profile-password-new"]').setValue('a-new-password-123')
    await wrapper
      .get('[data-testid="profile-password-confirmation"]')
      .setValue('a-new-password-123')
    await wrapper.get('[data-testid="profile-password-form"]').trigger('submit')
    await flushPromises()

    expect(setSessionMock).toHaveBeenCalledWith('brand-new-token')
    expect(refreshMock).toHaveBeenCalledOnce()
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('a 422 on current_password surfaces next to its own control', async () => {
    updatePasswordMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { current_password: ['The provided password does not match.'] } },
      })
    )

    const wrapper = mountForm()

    await wrapper.get('[data-testid="profile-password-current"]').setValue('wrong-pass')
    await wrapper.get('[data-testid="profile-password-new"]').setValue('a-new-password-123')
    await wrapper
      .get('[data-testid="profile-password-confirmation"]')
      .setValue('a-new-password-123')
    await wrapper.get('[data-testid="profile-password-form"]').trigger('submit')
    await flushPromises()

    const error = wrapper.get('[data-testid="profile-password-current-error"]')
    expect(error.text()).toContain('The provided password does not match.')
    expect(setSessionMock).not.toHaveBeenCalled()
  })

  it('renders a hidden username field carrying the email, for password-manager association', () => {
    const wrapper = mountForm()

    const usernameField = wrapper.get('[data-testid="profile-password-username"]')
    expect(usernameField.attributes('autocomplete')).toBe('username')
    expect(usernameField.attributes('readonly')).toBeDefined()
    expect(usernameField.attributes('tabindex')).toBe('-1')
    expect((usernameField.element as HTMLInputElement).value).toBe('ada@example.test')
  })

  it('declares new-password autocomplete on both password fields (password-manager hygiene)', () => {
    const wrapper = mountForm()

    expect(wrapper.get('[data-testid="profile-password-current"]').attributes('autocomplete')).toBe(
      'current-password'
    )
    expect(wrapper.get('[data-testid="profile-password-new"]').attributes('autocomplete')).toBe(
      'new-password'
    )
    expect(
      wrapper.get('[data-testid="profile-password-confirmation"]').attributes('autocomplete')
    ).toBe('new-password')
  })
  async function fill(current: string, next: string, confirm: string) {
    const wrapper = mountForm()
    await wrapper.get('[data-testid="profile-password-current"]').setValue(current)
    await wrapper.get('[data-testid="profile-password-new"]').setValue(next)
    await wrapper.get('[data-testid="profile-password-confirmation"]').setValue(confirm)
    return wrapper
  }

  it('refuses blank fields and a too-short new password, never calling the API', async () => {
    const blank = mountForm()
    await blank.get('[data-testid="profile-password-form"]').trigger('submit')

    expect(blank.get('[data-testid="profile-password-current-error"]').text()).toBe(
      'profile.password.currentRequired'
    )
    expect(blank.get('[data-testid="profile-password-new-error"]').text()).toBe(
      'profile.password.newRequired'
    )

    const short = await fill('current-pass', 'short', 'short')
    await short.get('[data-testid="profile-password-form"]').trigger('submit')

    expect(short.get('[data-testid="profile-password-new-error"]').text()).toBe(
      'profile.password.newTooShort'
    )
    expect(updatePasswordMock).not.toHaveBeenCalled()
  })

  it('refuses a confirmation that differs from the new password', async () => {
    const wrapper = await fill('current-pass', 'a-new-password-123', 'a-new-password-124')
    await wrapper.get('[data-testid="profile-password-form"]').trigger('submit')

    expect(wrapper.get('[data-testid="profile-password-confirmation-error"]').text()).toBe(
      'profile.password.confirmMismatch'
    )
    expect(updatePasswordMock).not.toHaveBeenCalled()
  })

  it('validates each field on blur and clears the error once valid', async () => {
    const wrapper = mountForm()
    const next = wrapper.get('[data-testid="profile-password-new"]')

    await next.trigger('blur')
    expect(wrapper.find('[data-testid="profile-password-new-error"]').exists()).toBe(true)

    await next.setValue('long-enough-pass')
    await next.trigger('blur')
    expect(wrapper.find('[data-testid="profile-password-new-error"]').exists()).toBe(false)

    await wrapper.get('[data-testid="profile-password-confirmation"]').trigger('blur')
    expect(wrapper.find('[data-testid="profile-password-confirmation-error"]').exists()).toBe(true)

    await wrapper.get('[data-testid="profile-password-current"]').trigger('blur')
    expect(wrapper.find('[data-testid="profile-password-current-error"]').exists()).toBe(true)
  })

  it('clears every password field after a successful change', async () => {
    const wrapper = await fill('current-pass', 'a-new-password-123', 'a-new-password-123')
    await wrapper.get('[data-testid="profile-password-form"]').trigger('submit')
    await flushPromises()

    for (const id of ['current', 'new', 'confirmation']) {
      expect(
        (wrapper.get(`[data-testid="profile-password-${id}"]`).element as HTMLInputElement).value
      ).toBe('')
    }
  })

  it('shows the generic save error on a failure without a validation body, keeping the session', async () => {
    updatePasswordMock.mockRejectedValueOnce(new Error('network down'))
    const wrapper = await fill('current-pass', 'a-new-password-123', 'a-new-password-123')
    await wrapper.get('[data-testid="profile-password-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="profile-password-banner"]').text()).toContain(
      'profile.password.saveError'
    )
    expect(setSessionMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('puts a refusal on a field the form has no control for in the banner', async () => {
    updatePasswordMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { throttle: ['Too many attempts.'] } },
      })
    )
    const wrapper = await fill('current-pass', 'a-new-password-123', 'a-new-password-123')
    await wrapper.get('[data-testid="profile-password-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="profile-password-banner"]').text()).toContain(
      'Too many attempts.'
    )
  })
})
