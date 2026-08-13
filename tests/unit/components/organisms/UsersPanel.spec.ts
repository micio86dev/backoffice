/**
 * UsersPanel.vue (Unit 6, task 24.5-24.6 — RED)
 *
 * Lists users, wires create/edit via `UserForm`, deactivate/activate via
 * `ConfirmDialog` — nothing happens on the first click, only after
 * confirmation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const tMock = (key: string) => key
const listUsersMock = vi.fn()
const deactivateUserMock = vi.fn()
const activateUserMock = vi.fn()

vi.mock('../../../../app/composables/useUsers', () => ({
  useUsers: () => ({
    listUsers: listUsersMock,
    deactivateUser: deactivateUserMock,
    activateUser: activateUserMock,
    createUser: vi.fn(),
    updateUser: vi.fn(),
  }),
}))

const UsersPanel = (await import('../../../../app/components/organisms/UsersPanel.vue')).default

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('UsersPanel', () => {
  beforeEach(() => {
    listUsersMock.mockReset().mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Ada',
          email: 'ada@example.com',
          role: 'admin',
          is_deactivated: false,
          created_at: null,
          updated_at: null,
        },
      ],
    })
    deactivateUserMock.mockReset().mockResolvedValue(undefined)
    activateUserMock.mockReset().mockResolvedValue(undefined)
  })

  it('lists users with their access level and state badges', async () => {
    const wrapper = mount(UsersPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.text()).toContain('Ada')
    expect(wrapper.text()).toContain('users.role.admin')
    expect(wrapper.text()).toContain('users.state.active')
  })

  it('deactivates only after confirming, not on the first click', async () => {
    const wrapper = mount(UsersPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="user-deactivate-1"]').trigger('click')
    expect(deactivateUserMock).not.toHaveBeenCalled()

    const confirmButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    confirmButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settle()

    expect(deactivateUserMock).toHaveBeenCalledWith(1)

    wrapper.unmount()
  })
})
