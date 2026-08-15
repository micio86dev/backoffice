/**
 * pages/profile.vue (user-profile-self-service, design D8, task 6.3 — RED)
 *
 * Role is read-only (`AccessLevelBadge`, never editable from this page —
 * role changes stay exclusively an admin action on `user-management`), and
 * the account form and the password form submit fully independently of
 * each other.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const tMock = (key: string) => key

function profileResponse() {
  return {
    data: {
      id: 1,
      name: 'Ada Lovelace',
      email: 'ada@example.test',
      locale: 'en',
      role: 'operator',
      organization: { id: 1, name: 'Acme' },
    },
  }
}

const fetchProfileMock = vi.fn()
const updateProfileMock = vi.fn()
const refreshCurrentUserMock = vi.fn()

vi.mock('../../../app/composables/useProfile', () => ({
  useProfile: () => ({
    fetchProfile: fetchProfileMock,
    updateProfile: updateProfileMock,
    updatePassword: vi.fn(),
  }),
}))

vi.mock('../../../app/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ refresh: refreshCurrentUserMock, ensureLoaded: vi.fn() }),
}))

vi.mock('../../../app/composables/useAuth', () => ({
  useAuth: () => ({ setSession: vi.fn() }),
}))

describe('pages/profile.vue', () => {
  beforeEach(() => {
    vi.resetModules()
    fetchProfileMock.mockReset().mockResolvedValue(profileResponse())
    updateProfileMock.mockReset().mockResolvedValue(profileResponse())
    refreshCurrentUserMock.mockReset().mockResolvedValue(undefined)
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useHead', vi.fn())
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: (key: string) => key, locale: ref('en') }))
    )
  })

  async function mountPage() {
    const ProfilePage = (await import('../../../app/pages/profile.vue')).default
    const wrapper = mount(ProfilePage, { global: { mocks: { $t: tMock } } })
    await flushPromises()
    return wrapper
  }

  it('renders the role via AccessLevelBadge, read-only', async () => {
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('users.role.operator')
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="user-form-role"]')).toHaveLength(0)
  })

  it('renders both the details form and the password form, independently', async () => {
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="profile-details-form"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="profile-password-form"]').exists()).toBe(true)
  })

  it('no control on the page can change the role', async () => {
    const wrapper = await mountPage()

    // Every real input on the page belongs to one of the two known forms;
    // none of them targets `role`.
    const roleInputs = wrapper.findAll('input[name="role"], select[name="role"]')
    expect(roleInputs).toHaveLength(0)
  })

  it('refreshes useCurrentUser after the details form saves', async () => {
    const wrapper = await mountPage()

    await wrapper.get('[data-testid="profile-details-form"]').trigger('submit')
    await flushPromises()

    expect(updateProfileMock).toHaveBeenCalled()
    expect(refreshCurrentUserMock).toHaveBeenCalled()
  })
})
