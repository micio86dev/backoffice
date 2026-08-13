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
import { waitFor } from '../../support/wait-for'

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

// Teleported Dialog content takes render cycles beyond a single microtask
// flush to appear (observed intermittently across this suite's Dialog-based
// organisms). Every wait below is therefore on the CONDITION, never on a
// fixed timer budget: the previous fixed ~50 ms loop was simply too short
// under a full parallel `vitest run`.
const dialogForm = () => document.body.querySelector('[data-testid="api-key-form"]')

const waitForDialogOpen = () => waitFor(dialogForm, 'the API key dialog to mount')

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

  /**
   * `abilityIds` are the DOM-safe ids of `M2M_ABILITIES` entries (e.g.
   * `participants-read` for `participants:read`). Abilities are a closed set
   * rendered as checkboxes, so the test clicks the same control an operator
   * does rather than typing an ability name no UI ever offered.
   */
  async function openCreateDialogAndFill(
    wrapper: ReturnType<typeof mount>,
    name: string,
    abilityIds: string[]
  ): Promise<void> {
    await wrapper.get('[data-testid="api-keys-new"]').trigger('click')
    await waitForDialogOpen()

    const nameInput = document.body.querySelector<HTMLInputElement>(
      '[data-testid="api-key-form-name"]'
    )
    nameInput!.value = name
    nameInput!.dispatchEvent(new Event('input'))
    await flushPromises()

    for (const abilityId of abilityIds) {
      const checkbox = document.body.querySelector<HTMLElement>(
        `[data-testid="api-key-ability-${abilityId}"]`
      )
      expect(checkbox).not.toBeNull()
      checkbox!.click()
      await flushPromises()
    }

    document.body
      .querySelector<HTMLFormElement>('[data-testid="api-key-form"]')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await waitFor(
      () => document.body.querySelector('[data-testid="api-key-raw-value"]'),
      'the raw key reveal dialog to render'
    )
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

    await openCreateDialogAndFill(wrapper, 'New key', ['participants-read'])

    expect(createClientMock).toHaveBeenCalledWith({
      name: 'New key',
      abilities: ['participants:read'],
    })
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

    await openCreateDialogAndFill(wrapper, 'New key', ['participants-read'])
    expect(document.body.textContent).toContain('beai_live_raw_secret')

    document.body.querySelector<HTMLButtonElement>('[data-testid="api-key-reveal-close"]')?.click()
    await waitFor(
      () => !(document.body.textContent ?? '').includes('beai_live_raw_secret'),
      'the raw key reveal to be dismissed'
    )

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
    await waitFor(
      () => document.body.querySelector('[data-testid="confirm-dialog-confirm"]'),
      'the revoke confirmation dialog to mount'
    )
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
    await waitFor(() => revokeClientMock.mock.calls.length > 0, 'the revoke call to fire')

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
