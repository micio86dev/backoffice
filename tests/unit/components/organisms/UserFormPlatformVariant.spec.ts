/**
 * UserForm — the PLATFORM variant (platform-user-management D2/D6).
 *
 * Same fields, same validation, same server-error mapping. Two differences,
 * and only two: there is no role to pick, and the writes go to BEAI's own
 * endpoints.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { realI18n } from '../../support/i18n'

const tMock = (key: string) => key

const createUserMock = vi.fn()
const updateUserMock = vi.fn()
const createPlatformUserMock = vi.fn()
const updatePlatformUserMock = vi.fn()

vi.mock('../../../../app/composables/useUsers', () => ({
  useUsers: () => ({ createUser: createUserMock, updateUser: updateUserMock }),
}))

vi.mock('../../../../app/composables/usePlatformUsers', () => ({
  usePlatformUsers: () => ({
    createPlatformUser: createPlatformUserMock,
    updatePlatformUser: updatePlatformUserMock,
  }),
}))

const UserForm = (await import('../../../../app/components/organisms/UserForm.vue')).default

function mountForm(variant: 'organization' | 'platform', user: unknown = null) {
  return mount(UserForm, {
    props: { user, variant },
    global: { mocks: { $t: tMock } },
  })
}

async function fillAndSubmit(wrapper: ReturnType<typeof mountForm>): Promise<void> {
  await wrapper.get('[data-testid="user-form-name"]').setValue('Ada Lovelace')
  await wrapper.get('[data-testid="user-form-email"]').setValue('ada@beai.test')
  await wrapper.get('[data-testid="user-form-password"]').setValue('a-strong-password-123')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

// `te` must answer from the real locale file here: the global stub says
// true to everything, which makes every translation assertion below
// unfalsifiable.
vi.stubGlobal('useI18n', () => realI18n())

describe('UserForm — platform variant', () => {
  beforeEach(() => {
    createUserMock.mockReset().mockResolvedValue({ data: {} })
    updateUserMock.mockReset().mockResolvedValue({ data: {} })
    createPlatformUserMock.mockReset().mockResolvedValue({ data: {} })
    updatePlatformUserMock.mockReset().mockResolvedValue({ data: {} })
  })

  it('offers no role picker — there is one platform identity', () => {
    expect(mountForm('platform').find('[data-testid="user-form-role"]').exists()).toBe(false)
  })

  it('keeps the role picker for an organization', () => {
    expect(mountForm('organization').find('[data-testid="user-form-role"]').exists()).toBe(true)
  })

  it('creates through the PLATFORM endpoint, with no role in the payload', async () => {
    const wrapper = mountForm('platform')

    await fillAndSubmit(wrapper)

    expect(createUserMock).not.toHaveBeenCalled()
    expect(createPlatformUserMock).toHaveBeenCalledTimes(1)
    // `role` is not merely unused here — sending it would be sending a field
    // the endpoint does not read and a concept the population does not have.
    expect(createPlatformUserMock.mock.calls[0]?.[0]).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@beai.test',
      password: 'a-strong-password-123',
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('creates through the organization endpoint under the other variant', async () => {
    const wrapper = mountForm('organization')

    await fillAndSubmit(wrapper)

    expect(createPlatformUserMock).not.toHaveBeenCalled()
    expect(createUserMock).toHaveBeenCalledTimes(1)
    expect(createUserMock.mock.calls[0]?.[0]).toHaveProperty('role')
  })

  it('updates through the PLATFORM endpoint when editing', async () => {
    const wrapper = mountForm('platform', {
      id: 9,
      name: 'Ada',
      email: 'ada@beai.test',
      is_deactivated: false,
    })

    await wrapper.get('[data-testid="user-form-name"]').setValue('Ada Byron')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateUserMock).not.toHaveBeenCalled()
    expect(updatePlatformUserMock).toHaveBeenCalledTimes(1)
    expect(updatePlatformUserMock.mock.calls[0]?.[0]).toBe(9)
  })

  it('still validates before it writes anything', async () => {
    const wrapper = mountForm('platform')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createPlatformUserMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="user-form-name-error"]').exists()).toBe(true)
  })
})

describe('UserForm — server errors under the platform variant', () => {
  // The docblock claims "same server-error mapping". Nothing exercised it, and
  // that gap is why the banner shipped rendering raw wire values while the
  // per-field path had already been fixed.
  it('translates a mapped field error rather than printing the code', async () => {
    createPlatformUserMock.mockReset().mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { email: ['email_taken'] } },
      })
    )

    const wrapper = mountForm('platform')
    await fillAndSubmit(wrapper)

    expect(wrapper.get('[data-testid="user-form-email-error"]').text()).toContain(
      'users.serverError.email_taken'
    )
  })

  it('translates the banner for a field it renders no control for', async () => {
    createPlatformUserMock.mockReset().mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { role: ['role_invalid'] } },
      })
    )

    const wrapper = mountForm('platform')
    await fillAndSubmit(wrapper)

    expect(wrapper.get('[data-testid="user-form-banner"]').text()).toContain(
      'users.serverError.role_invalid'
    )
  })

  it('says REFUSED on a 403, not "review the highlighted fields"', async () => {
    // Both create endpoints answer a permission refusal with `{message}` and
    // no `errors`, so applyServerFieldErrors returns null. Sending the
    // operator to check highlighted fields — with nothing highlighted, and no
    // field that could have fixed it — is the generic-error collapse the
    // error-state rule exists to stop.
    createPlatformUserMock
      .mockReset()
      .mockRejectedValueOnce(
        Object.assign(new Error('403'), { status: 403, data: { message: 'x' } })
      )

    const wrapper = mountForm('platform')
    await fillAndSubmit(wrapper)

    expect(wrapper.get('[data-testid="user-form-banner"]').text()).toContain('users.form.forbidden')
  })

  it('falls back to the generic message when the failure carries no field payload', async () => {
    createPlatformUserMock.mockReset().mockRejectedValueOnce(new Error('network down'))

    const wrapper = mountForm('platform')
    await fillAndSubmit(wrapper)

    expect(wrapper.get('[data-testid="user-form-banner"]').text()).toContain('users.form.saveError')
  })
})
