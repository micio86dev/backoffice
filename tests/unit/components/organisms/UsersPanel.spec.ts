/**
 * UsersPanel.vue (Unit 6, task 24.5-24.6 — RED)
 *
 * Lists users, wires create/edit via `UserForm`, deactivate/activate via
 * `ConfirmDialog` — nothing happens on the first click, only after
 * confirmation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { waitFor } from '../../support/wait-for'

const tMock = (key: string) => key
const listUsersMock = vi.fn()
const deactivateUserMock = vi.fn()
const activateUserMock = vi.fn()
const createUserMock = vi.fn()
const updateUserMock = vi.fn()

vi.mock('../../../../app/composables/useUsers', () => ({
  useUsers: () => ({
    listUsers: listUsersMock,
    deactivateUser: deactivateUserMock,
    activateUser: activateUserMock,
    createUser: createUserMock,
    updateUser: updateUserMock,
  }),
}))

const UsersPanel = (await import('../../../../app/components/organisms/UsersPanel.vue')).default

// Waits on the CONDITION, not on a fixed timer budget: the previous
// fixed-iteration loop assumed the confirm -> API call round trip always fit
// in ~50 ms, which does not hold under a full parallel `vitest run`.

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
    createUserMock.mockReset().mockResolvedValue({ data: {} })
    updateUserMock.mockReset().mockResolvedValue({ data: {} })
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
    await waitFor(() => deactivateUserMock.mock.calls.length > 0, 'the deactivate call to fire')

    expect(deactivateUserMock).toHaveBeenCalledWith(1)

    wrapper.unmount()
  })

  // feature/form-drawer — the user create/edit form is a record-editing form
  // launched from a list, so it moves off the centred Dialog onto the shared
  // FormDrawer, exactly like projects and avatar templates.
  describe('the create/edit drawer', () => {
    const formInDrawer = () =>
      document.body.querySelector('[data-testid="form-drawer"] [data-testid="user-form"]')

    async function openCreateForm() {
      const wrapper = mount(UsersPanel, {
        global: { mocks: { $t: tMock } },
        attachTo: document.body,
      })
      await flushPromises()

      await wrapper.get('[data-testid="users-new"]').trigger('click')
      await waitFor(formInDrawer, 'the user form to mount inside the drawer')

      return wrapper
    }

    function fillValidUser(): void {
      const set = (testId: string, value: string) => {
        const input = document.body.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)
        input!.value = value
        input!.dispatchEvent(new Event('input'))
      }

      set('user-form-name', 'Grace')
      set('user-form-email', 'grace@example.com')
      set('user-form-password', 'a-long-enough-password')
    }

    function submitFromFooter(): void {
      document.body
        .querySelector<HTMLButtonElement>('[data-testid="form-drawer-save"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }

    it('renders the form inside the drawer, not a centred dialog', async () => {
      const wrapper = await openCreateForm()

      expect(document.body.querySelector('[data-slot="dialog-content"]')).toBeNull()
      expect(formInDrawer()).not.toBeNull()

      wrapper.unmount()
    })

    it('keeps the submit control out of the scrolling region', async () => {
      const wrapper = await openCreateForm()

      const scrollRegion = document.body.querySelector('.overflow-y-auto')
      const submit = document.body.querySelector('[data-testid="form-drawer-save"]')

      expect(submit).not.toBeNull()
      expect(scrollRegion!.contains(submit)).toBe(false)

      wrapper.unmount()
    })

    it('closes the drawer and refetches the list on a successful save', async () => {
      const wrapper = await openCreateForm()

      fillValidUser()
      await flushPromises()
      submitFromFooter()
      await waitFor(() => formInDrawer() === null, 'the drawer to close after a successful save')

      expect(createUserMock).toHaveBeenCalled()
      expect(listUsersMock).toHaveBeenCalledTimes(2)

      wrapper.unmount()
    })

    // THE regression this conversion is most likely to introduce: a drawer
    // that closes on ANY submit, discarding both the operator's input and the
    // 422 explaining what was wrong with it.
    it('leaves the drawer OPEN with the field error visible when the save is rejected', async () => {
      createUserMock.mockRejectedValue(
        Object.assign(new Error('Unprocessable'), {
          status: 422,
          data: { errors: { email: ['That email is already in use.'] } },
        })
      )
      const wrapper = await openCreateForm()

      fillValidUser()
      await flushPromises()
      submitFromFooter()
      const error = await waitFor(
        () => document.body.querySelector('[data-testid="user-form-email-error"]'),
        'the server field error to render on the email field'
      )

      expect(formInDrawer()).not.toBeNull()
      expect(error.textContent).toContain('That email is already in use.')

      wrapper.unmount()
    })

    it('closes on the drawer footer cancel without saving', async () => {
      const wrapper = await openCreateForm()

      const cancel = document.body.querySelector<HTMLButtonElement>(
        '[data-testid="form-drawer-cancel"]'
      )
      cancel!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      cancel!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(() => formInDrawer() === null, 'the drawer to close after cancel')

      expect(createUserMock).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('closes on Escape without saving', async () => {
      const wrapper = await openCreateForm()

      formInDrawer()!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
      await waitFor(() => formInDrawer() === null, 'the drawer to close after Escape')

      expect(createUserMock).not.toHaveBeenCalled()

      wrapper.unmount()
    })
  })
})

describe('UsersPanel — edit, activate and refused actions', () => {
  const ada = {
    id: 1,
    name: 'Ada',
    email: 'ada@example.com',
    role: 'admin',
    is_deactivated: false,
    created_at: null,
    updated_at: null,
  }
  const grace = {
    id: 2,
    name: 'Grace',
    email: 'grace@example.com',
    role: null,
    is_deactivated: true,
    created_at: null,
    updated_at: null,
  }

  beforeEach(() => {
    listUsersMock.mockReset().mockResolvedValue({ data: [ada, grace] })
    deactivateUserMock.mockReset().mockResolvedValue(undefined)
    activateUserMock.mockReset().mockResolvedValue(undefined)
    updateUserMock.mockReset().mockResolvedValue({ data: {} })
  })

  async function mountPanel() {
    const wrapper = mount(UsersPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()
    return wrapper
  }

  async function confirm(): Promise<void> {
    const button = await waitFor(
      () =>
        document.body.querySelector<HTMLButtonElement>('[data-testid="confirm-dialog-confirm"]'),
      'the confirm button'
    )
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
  }

  it('reads a deactivated user without an access level as such, offering Activate not Deactivate', async () => {
    const wrapper = await mountPanel()

    const row = wrapper.findAll('tr').find((tr) => tr.text().includes('Grace'))!
    expect(row.text()).toContain('users.table.noAccessLevel')
    expect(row.text()).toContain('users.state.deactivated')
    expect(wrapper.find('[data-testid="user-deactivate-2"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('activates only after confirming, then refetches the list', async () => {
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="user-activate-2"]').trigger('click')
    expect(activateUserMock).not.toHaveBeenCalled()
    await confirm()

    expect(activateUserMock).toHaveBeenCalledExactlyOnceWith(2)
    expect(listUsersMock).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('cancelling the confirmation changes nothing', async () => {
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="user-deactivate-1"]').trigger('click')
    const cancel = await waitFor(
      () => document.body.querySelector<HTMLButtonElement>('[data-testid="confirm-dialog-cancel"]'),
      'the cancel button'
    )
    cancel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    cancel.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(deactivateUserMock).not.toHaveBeenCalled()
    expect(activateUserMock).not.toHaveBeenCalled()
    expect(listUsersMock).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('opens the edit drawer prefilled with that user and saves against its id', async () => {
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="user-edit-1"]').trigger('click')
    const nameInput = await waitFor(
      () => document.body.querySelector<HTMLInputElement>('[data-testid="user-form-name"]'),
      'the edit form to mount'
    )
    expect(nameInput.value).toBe('Ada')

    document.body
      .querySelector<HTMLButtonElement>('[data-testid="form-drawer-save"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => updateUserMock.mock.calls.length > 0, 'the update call')

    expect(updateUserMock.mock.calls[0]?.[0]).toBe(1)

    wrapper.unmount()
  })

  it('explains a refused deactivation in the operator language and keeps the list as it was', async () => {
    deactivateUserMock.mockRejectedValueOnce({
      status: 422,
      data: { error: 'last_admin', message: 'English prose.' },
    })
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="user-deactivate-1"]').trigger('click')
    await confirm()

    const text = wrapper.get('[data-testid="users-action-error"]').text()
    expect(text).toContain('users.serverError.last_admin')
    expect(text).not.toContain('English prose.')
    expect(listUsersMock).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('shows the generic action error when the failure carries no guard code', async () => {
    activateUserMock.mockRejectedValueOnce({ status: 500 })
    const wrapper = await mountPanel()

    await wrapper.get('[data-testid="user-activate-2"]').trigger('click')
    await confirm()

    expect(wrapper.get('[data-testid="users-action-error"]').text()).toContain('users.actionError')

    wrapper.unmount()
  })
})
