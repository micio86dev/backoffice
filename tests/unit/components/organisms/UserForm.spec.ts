/**
 * UserForm.vue (Unit 6, task 24.5 — RED)
 *
 * Role `<Select>` (installed component) offers exactly `admin`/`operator`/
 * `viewer`, never free text, never a BEAI `role_code` value.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { waitFor } from '../../support/wait-for'

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
    // Condition, not a fixed timer budget — the popup is Presence-gated and
    // mounts on its own schedule.
    await waitFor(
      () => (document.body.textContent ?? '').includes('users.role.admin'),
      'the role select popup to render its options'
    )

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
    // Split, not a strict string equality: aria-describedby now also carries
    // the field's help-text id (D6) alongside the error id.
    expect(
      (wrapper.get('[data-testid="user-form-email"]').attributes('aria-describedby') ?? '').split(
        /\s+/
      )
    ).toContain(error.attributes('id'))
  })

  // DESIGN.md §16 / the admin-backoffice form contract: `aria-invalid` alone
  // announces "this field is wrong" and stops there. Without `aria-describedby`
  // pointing at the message, a screen-reader user is told something is invalid
  // and never told what — the explanation is on screen and programmatically
  // unreachable. The pairing is the requirement, not either half of it.
  it.each([
    ['name', 'user-form-name'],
    ['password', 'user-form-password'],
  ])('pairs aria-invalid with aria-describedby on the %s field', async (_label, testid) => {
    const wrapper = mount(UserForm, { props: { user: null }, global: { mocks: { $t: tMock } } })

    const input = wrapper.get(`[data-testid="${testid}"]`)
    await input.trigger('blur')

    const error = wrapper.get(`[data-testid="${testid}-error"]`)
    expect(error.attributes('id')).toBeTruthy()
    expect(input.attributes('aria-invalid')).toBe('true')
    // Split, not a strict string equality: `password` also carries a help-text
    // id (D6) alongside the error id; `name` has none, so a single-id list
    // still satisfies `toContain`.
    expect((input.attributes('aria-describedby') ?? '').split(/\s+/)).toContain(
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

  // form-clarity-and-console-warnings, D2: previously only `name`/`email` were
  // mapped ad hoc, and `email`'s message was dropped when the payload also
  // carried `password`.
  it.each([
    ['name', 'user-form-name-error'],
    ['email', 'user-form-email-error'],
    ['password', 'user-form-password-error'],
  ])('surfaces a 422 on %s next to its own control', async (serverField, errorTestId) => {
    createUserMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { [serverField]: ['Server says no.'] } },
      })
    )

    const wrapper = mount(UserForm, { props: { user: null }, global: { mocks: { $t: tMock } } })

    await wrapper.get('[data-testid="user-form-name"]').setValue('Ada')
    await wrapper.get('[data-testid="user-form-email"]').setValue('ada@example.com')
    await wrapper.get('[data-testid="user-form-password"]').setValue('password123')
    await wrapper.get('[data-testid="user-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get(`[data-testid="${errorTestId}"]`).text()).toContain('Server says no.')
  })

  // form-clarity-and-console-warnings — CRITICAL 1 fix. `role` has no entry in
  // SERVER_FIELD_TO_ERROR_KEY (Select is constrained client-side, D4/D8), so a
  // server 422 on it must reach the form-level banner VERBATIM — not be
  // silently discarded in favour of the generic saveError string.
  it('surfaces a 422 on a field outside the map (role) in the banner, not the generic message', async () => {
    createUserMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { role: ['That role assignment is not permitted.'] } },
      })
    )

    const wrapper = mount(UserForm, { props: { user: null }, global: { mocks: { $t: tMock } } })

    await wrapper.get('[data-testid="user-form-name"]').setValue('Ada')
    await wrapper.get('[data-testid="user-form-email"]').setValue('ada@example.com')
    await wrapper.get('[data-testid="user-form-password"]').setValue('password123')
    await wrapper.get('[data-testid="user-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="user-form-banner"]').text()).toContain(
      'That role assignment is not permitted.'
    )
  })
})

// form-clarity-and-console-warnings, D6: `name` is deliberately CUT (not
// ambiguous, unconstrained, or foreign — fails D6's three-question rule).
describe('UserForm — field help (D6)', () => {
  it.each([
    ['user-form-email', 'users.form.help.email'],
    ['user-form-password', 'users.form.help.password'],
  ])("%s renders and is pointed at by its control's aria-describedby", async (testId, helpKey) => {
    const wrapper = mount(UserForm, { props: { user: null }, global: { mocks: { $t: tMock } } })

    expect(wrapper.text()).toContain(helpKey)

    const control = wrapper.get(`[data-testid="${testId}"]`)
    const describedIds = (control.attributes('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
    const matched = describedIds.some((id) => {
      const el = wrapper.find(`#${id}`)
      return el.exists() && el.text() === helpKey
    })
    expect(matched, `expected an aria-describedby id on ${testId} to point at "${helpKey}"`).toBe(
      true
    )
  })

  it('renders the role help text', () => {
    const wrapper = mount(UserForm, { props: { user: null }, global: { mocks: { $t: tMock } } })

    expect(wrapper.text()).toContain('users.form.help.role')
  })

  it('does not render help text for name (D6 — self-evident field, deliberately cut)', () => {
    const wrapper = mount(UserForm, { props: { user: null }, global: { mocks: { $t: tMock } } })

    expect(wrapper.text()).not.toContain('users.form.help.name')
  })
})
