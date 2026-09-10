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
import { realI18n } from '../support/i18n'
import { ref } from 'vue'

const tMock = (key: string) => key

function profileResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: 1,
      name: 'Ada Lovelace',
      email: 'ada@example.test',
      locale: 'en',
      role: 'operator',
      // Explicit, never absent: the page branches on it, and a fixture that
      // omits it would exercise the `undefined` path in every test while the
      // API always sends a boolean.
      is_superadmin: false,
      organization: { id: 1, name: 'Acme' },
      photo_url: null,
      ...overrides,
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
    // `te` from the REAL locale files: `AccessLevelBadge` asks it whether a
    // role has copy before rendering, so a stub without it crashes — and a
    // stub answering true to everything would let a missing key render as
    // its own name.
    vi.stubGlobal('useI18n', () => ({ ...realI18n(), locale: ref('en') }))
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

  describe('what access level the page reports', () => {
    it('says SUPER ADMIN for a superadmin, not Observer', async () => {
      // A superadmin holds no Spatie role — their power comes from
      // `Gate::before` — so `role` is null and the old fallback to `viewer`
      // told the one person who can do anything that they were an observer.
      fetchProfileMock.mockResolvedValue(profileResponse({ role: null, is_superadmin: true }))

      const wrapper = await mountPage()

      expect(wrapper.get('[data-testid="profile-role-badge"]').text()).toContain(
        'users.role.superadmin'
      )
      expect(wrapper.text()).not.toContain('users.role.viewer')
    })

    it('says NO ROLE rather than inventing one', async () => {
      // A user with no organization role is not an observer either. Guessing
      // one is the same defect one case over.
      fetchProfileMock.mockResolvedValue(profileResponse({ role: null, is_superadmin: false }))

      const wrapper = await mountPage()

      expect(wrapper.get('[data-testid="profile-role-badge"]').text()).toContain('users.role.none')
    })

    it('still reports a real organization role verbatim', async () => {
      // The control: a rule that answered `superadmin` or `none` for everyone
      // would look identical on the two cases above.
      fetchProfileMock.mockResolvedValue(profileResponse({ role: 'admin' }))

      const wrapper = await mountPage()

      expect(wrapper.get('[data-testid="profile-role-badge"]').text()).toContain('users.role.admin')
    })
  })
})
