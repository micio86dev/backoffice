/**
 * ApiKeysPanel.vue (Unit 6, task 24.3 — RED)
 *
 * The raw key is returned exactly once, on create, and can never be
 * retrieved again — the UI must make that explicit and offer a copy
 * affordance. `key_hash` is never displayed (it is not even part of
 * `ApiClientResource`, but this is asserted anyway as documentation of the
 * invariant).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const tMock = (key: string) => key
const listClientsMock = vi.fn()
const createClientMock = vi.fn()
const revokeClientMock = vi.fn()

vi.mock('../../../../app/composables/useApiClients', () => ({
  useApiClients: () => ({
    listClients: listClientsMock,
    createClient: createClientMock,
    revokeClient: revokeClientMock,
  }),
}))

const ApiKeysPanel = (await import('../../../../app/components/organisms/ApiKeysPanel.vue')).default

// Teleported Dialog content can take a render cycle beyond a single
// microtask flush to settle (observed intermittently in this suite for
// other Dialog-based organisms too, e.g. `pages/projects/index.vue`'s
// dialog tests) — combines a microtask flush with a real timer tick so
// interacting with the freshly-opened dialog's fields is never a race.
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ApiKeysPanel', () => {
  beforeEach(() => {
    listClientsMock.mockReset().mockResolvedValue({
      data: [
        {
          id: '1',
          name: 'CI key',
          abilities: ['read'],
          is_active: 'true',
          expires_at: null,
          last_used_at: null,
          created_at: '2026-03-01T10:00:00Z',
        },
      ],
    })
    createClientMock.mockReset()
    revokeClientMock.mockReset().mockResolvedValue(undefined)
  })

  async function openCreateDialogAndFill(
    wrapper: ReturnType<typeof mount>,
    name: string,
    abilities: string
  ): Promise<void> {
    await wrapper.get('[data-testid="api-keys-new"]').trigger('click')
    await settle()

    const nameInput = document.body.querySelector<HTMLInputElement>(
      '[data-testid="api-key-form-name"]'
    )
    nameInput!.value = name
    nameInput!.dispatchEvent(new Event('input'))
    await flushPromises()

    const abilitiesInput = document.body.querySelector<HTMLInputElement>(
      '[data-testid="api-key-form-abilities"]'
    )
    abilitiesInput!.value = abilities
    abilitiesInput!.dispatchEvent(new Event('input'))
    await flushPromises()

    document.body
      .querySelector<HTMLFormElement>('[data-testid="api-key-form"]')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await settle()
  }

  it('lists existing keys without ever rendering a key_hash', async () => {
    const wrapper = mount(ApiKeysPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.text()).toContain('CI key')
    expect(wrapper.html()).not.toContain('key_hash')
  })

  it('shows the raw key exactly once, right after creation', async () => {
    createClientMock.mockResolvedValue({
      data: {
        id: '2',
        name: 'New key',
        abilities: ['read'],
        is_active: 'true',
        expires_at: null,
        last_used_at: null,
        created_at: '2026-03-01T10:00:00Z',
      },
      api_key: 'beai_live_raw_secret',
    })

    const wrapper = mount(ApiKeysPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await openCreateDialogAndFill(wrapper, 'New key', 'read')

    expect(createClientMock).toHaveBeenCalledWith({ name: 'New key', abilities: ['read'] })
    expect(document.body.textContent).toContain('beai_live_raw_secret')

    wrapper.unmount()
  })

  it('never re-displays the raw key once the reveal is dismissed, even after reloading the list', async () => {
    createClientMock.mockResolvedValue({
      data: {
        id: '2',
        name: 'New key',
        abilities: ['read'],
        is_active: 'true',
        expires_at: null,
        last_used_at: null,
        created_at: '2026-03-01T10:00:00Z',
      },
      api_key: 'beai_live_raw_secret',
    })

    const wrapper = mount(ApiKeysPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await openCreateDialogAndFill(wrapper, 'New key', 'read')
    expect(document.body.textContent).toContain('beai_live_raw_secret')

    document.body.querySelector<HTMLButtonElement>('[data-testid="api-key-reveal-close"]')?.click()
    await settle()

    expect(document.body.textContent).not.toContain('beai_live_raw_secret')

    wrapper.unmount()
  })

  it('revokes a key via the confirm dialog, not on the first click', async () => {
    const wrapper = mount(ApiKeysPanel, {
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('[data-testid="api-key-revoke-1"]').trigger('click')
    await settle()
    expect(revokeClientMock).not.toHaveBeenCalled()

    const confirmButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    // A real click is preceded by pointerdown/mouseup — dispatched explicitly
    // because reka-ui's AlertDialogAction closes the dialog as part of its
    // OWN click handling (same as Cancel), and ConfirmDialog.vue's
    // `suppressNextCancel` guard (which stops that auto-close from ALSO
    // emitting a spurious 'cancel' after 'confirm') is armed on pointerdown,
    // matching real pointer-driven interaction.
    confirmButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settle()

    expect(revokeClientMock).toHaveBeenCalledWith('1')

    wrapper.unmount()
  })

  // The abilities field previously had NEITHER aria-invalid nor
  // aria-describedby despite being validated and rendering its own message —
  // the error was visible and, to assistive tech, did not exist.
  //
  // The form lives inside a teleported Dialog, so it is queried off
  // document.body rather than the wrapper, matching this file's other tests.
  it.each([
    ['name', 'api-key-form-name'],
    ['abilities', 'api-key-form-abilities'],
  ])('pairs aria-invalid with aria-describedby on the %s field', async (_label, testid) => {
    const wrapper = mount(ApiKeysPanel, {
      attachTo: document.body,
      global: { mocks: { $t: tMock } },
    })
    await wrapper.get('[data-testid="api-keys-new"]').trigger('click')
    await flushPromises()

    // Validation runs on submit, and an empty form trips both fields at once —
    // which is the state this contract has to hold in.
    const form = document.body.querySelector<HTMLFormElement>('[data-testid="api-key-form"]')
    expect(form).not.toBeNull()
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    const input = document.body.querySelector(`[data-testid="${testid}"]`)
    const error = document.body.querySelector(`[data-testid="${testid}-error"]`)
    expect(input).not.toBeNull()
    expect(error).not.toBeNull()

    expect(error?.getAttribute('id')).toBeTruthy()
    expect(input?.getAttribute('aria-invalid')).toBe('true')
    expect(input?.getAttribute('aria-describedby')).toBe(error?.getAttribute('id'))

    wrapper.unmount()
  })
})
