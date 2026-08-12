/**
 * UserForm.vue (Unit 6, task 24.5 — RED)
 *
 * Role `<Select>` (installed component) offers exactly `admin`/`operator`/
 * `viewer`, never free text, never a BEAI `role_code` value.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const tMock = (key: string) => key
const createUserMock = vi.fn()
const updateUserMock = vi.fn()

vi.mock('../../../../app/composables/useUsers', () => ({
  useUsers: () => ({ createUser: createUserMock, updateUser: updateUserMock }),
}))

const UserForm = (await import('../../../../app/components/organisms/UserForm.vue')).default

describe('UserForm', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  beforeEach(() => {
    createUserMock.mockReset().mockResolvedValue({ data: {} })
    updateUserMock.mockReset().mockResolvedValue({ data: {} })
  })

  it('offers exactly admin/operator/viewer as role options, never free text', async () => {
    const wrapper = mount(UserForm, {
      props: { user: null },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })

    const roleSelect = wrapper.get('[data-testid="user-form-role"]')
    expect(roleSelect.element.tagName).not.toBe('INPUT')

    // The item list is a Select — only rendered once opened (reka-ui, same
    // Presence-gated pattern as Dialog's teleported content). reka-ui's
    // SelectTrigger opens on pointerdown, not click.
    roleSelect.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    for (let i = 0; i < 5; i += 1) {
      await flushPromises()
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    const optionText = document.body.textContent ?? ''
    expect(optionText).toContain('users.role.admin')
    expect(optionText).toContain('users.role.operator')
    expect(optionText).toContain('users.role.viewer')
    // Never a BEAI role_code value — the two vocabularies must never
    // co-appear in this control.
    expect(optionText).not.toMatch(/\bICO\b/)

    wrapper.unmount()
  })

  it('requires a password field only when creating', () => {
    const created = mount(UserForm, { props: { user: null }, global: { mocks: { $t: tMock } } })
    expect(created.find('[data-testid="user-form-password"]').exists()).toBe(true)

    const editing = mount(UserForm, {
      props: {
        user: {
          id: 1,
          name: 'Ada',
          email: 'ada@example.com',
          role: 'operator',
          is_deactivated: false,
          created_at: null,
          updated_at: null,
        },
      },
      global: { mocks: { $t: tMock } },
    })
    expect(editing.find('[data-testid="user-form-password"]').exists()).toBe(false)
  })

  it('shows a required-field message under email on blur', async () => {
    const wrapper = mount(UserForm, { props: { user: null }, global: { mocks: { $t: tMock } } })

    await wrapper.get('[data-testid="user-form-email"]').trigger('blur')

    const error = wrapper.get('[data-testid="user-form-email-error"]')
    expect(wrapper.get('[data-testid="user-form-email"]').attributes('aria-describedby')).toBe(
      error.attributes('id')
    )
  })

  it('creates via useUsers on submit and emits saved', async () => {
    const wrapper = mount(UserForm, { props: { user: null }, global: { mocks: { $t: tMock } } })

    await wrapper.get('[data-testid="user-form-name"]').setValue('Ada')
    await wrapper.get('[data-testid="user-form-email"]').setValue('ada@example.com')
    await wrapper.get('[data-testid="user-form-password"]').setValue('password123')
    await wrapper.get('[data-testid="user-form"]').trigger('submit')
    await flushPromises()

    expect(createUserMock).toHaveBeenCalledWith({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'password123',
      role: 'operator',
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
  })
})
