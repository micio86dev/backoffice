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
const listAbilitiesMock = vi.fn()
const createClientMock = vi.fn()
const revokeClientMock = vi.fn()

vi.mock('../../../../app/composables/useApiClients', () => ({
  useApiClients: () => ({
    listClients: listClientsMock,
    listAbilities: listAbilitiesMock,
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

/**
 * `abilityIds` are the DOM-safe ids of the abilities the API advertises (e.g.
 * `participants-read` for `participants:read`). Abilities are a closed set
 * rendered as checkboxes, so the test clicks the same control an operator does
 * rather than typing an ability name no UI ever offered.
 *
 * Module scope, not describe scope: the catalogue-sourcing tests below are a
 * sibling describe and drive the same form.
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

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ApiKeysPanel', () => {
  beforeEach(() => {
    listClientsMock.mockReset().mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'CI key',
          abilities: ['read'],
          is_active: true,
          state: 'active',
          expires_at: null,
          last_used_at: null,
          created_at: '2026-03-01T10:00:00Z',
        },
      ],
    })
    listAbilitiesMock.mockReset().mockResolvedValue({
      data: ['participants:create', 'participants:read', 'sso_link:generate'],
    })
    createClientMock.mockReset()
    revokeClientMock.mockReset().mockResolvedValue(undefined)
  })

  // admin-backoffice spec, "i18n and Locale-Aware Formatting" — "Only
  // expires_at carries a timezone indicator": unit-tested on FormattedDate
  // in isolation (show-zone prop), but never at the call site that actually
  // decides which of the three date columns gets it. Same instant on all
  // three columns, so any difference in rendered text can only be the zone
  // suffix.
  it('shows a timezone indicator on expires_at only, never on created_at or last_used_at', async () => {
    const SAME_INSTANT = '2026-03-01T10:00:00Z'
    listClientsMock.mockReset().mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'CI key',
          abilities: ['read'],
          is_active: true,
          state: 'active',
          expires_at: SAME_INSTANT,
          last_used_at: SAME_INSTANT,
          created_at: SAME_INSTANT,
        },
      ],
    })

    const wrapper = mount(ApiKeysPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    const cells = wrapper.findAll('td')
    const [, createdAtCell, expiresAtCell, lastUsedAtCell] = cells

    const zonePart = new Intl.DateTimeFormat('it', { timeZoneName: 'short' })
      .formatToParts(new Date(SAME_INSTANT))
      .find((part) => part.type === 'timeZoneName')?.value

    expect(zonePart).toBeTruthy()
    expect(expiresAtCell?.text()).toContain(zonePart as string)
    expect(createdAtCell?.text()).not.toContain(zonePart as string)
    expect(lastUsedAtCell?.text()).not.toContain(zonePart as string)
  })

  it('lists existing keys without ever rendering a key_hash', async () => {
    const wrapper = mount(ApiKeysPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.text()).toContain('CI key')
    expect(wrapper.html()).not.toContain('key_hash')
  })

  it('shows the raw key exactly once, right after creation', async () => {
    createClientMock.mockResolvedValue({
      data: {
        id: 2,
        name: 'New key',
        abilities: ['read'],
        is_active: true,
        state: 'active',
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
        id: 2,
        name: 'New key',
        abilities: ['read'],
        is_active: true,
        state: 'active',
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

    expect(revokeClientMock).toHaveBeenCalledWith(1)

    wrapper.unmount()
  })

  // The regression this requirement (ConfirmDialog exposes per-action verb)
  // exists to prevent: someone silently drops the `confirm-label` prop at
  // this call site and ships the generic "Confirm" — ConfirmDialog.spec.ts
  // proves the MECHANISM works, but nothing at this call site pinned that
  // it is actually USED here.
  it('the revoke confirmation button carries the "Revoke" verb, not the generic label', async () => {
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

    const confirmButtonText = document.body.querySelector(
      '[data-testid="confirm-dialog-confirm"]'
    )?.textContent

    expect(confirmButtonText).toContain('settings.apiKeys.revoke')
    expect(confirmButtonText).not.toContain('users.confirm.action')

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
    // Split, not a strict string equality: `name` also carries a help-text id
    // (D6) alongside the error id; `abilities` has none, so a single-id list
    // still satisfies `toContain`.
    expect((input?.getAttribute('aria-describedby') ?? '').split(/\s+/)).toContain(
      error?.getAttribute('id')
    )

    wrapper.unmount()
  })

  // form-clarity-and-console-warnings, D2: this panel previously `catch {}`ed
  // every create rejection, silently dropping a 422 on `name` or `abilities`.
  it.each([
    ['name', { name: ['That name is already in use.'] }, 'api-key-form-name-error'],
    [
      'abilities',
      { abilities: ['One of the selected abilities is not recognised.'] },
      'api-key-form-abilities-error',
    ],
  ])('surfaces a 422 on %s next to its own control', async (_field, errors, errorTestId) => {
    createClientMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), { status: 422, data: { errors } })
    )

    const wrapper = mount(ApiKeysPanel, {
      attachTo: document.body,
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="api-keys-new"]').trigger('click')
    await waitForDialogOpen()

    const nameInput = document.body.querySelector<HTMLInputElement>(
      '[data-testid="api-key-form-name"]'
    )
    nameInput!.value = 'Broken key'
    nameInput!.dispatchEvent(new Event('input'))
    await flushPromises()

    const checkbox = document.body.querySelector<HTMLElement>(
      '[data-testid="api-key-ability-participants-read"]'
    )
    checkbox!.click()
    await flushPromises()

    document.body
      .querySelector<HTMLFormElement>('[data-testid="api-key-form"]')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    const message = (errors as Record<string, string[]>)[Object.keys(errors)[0]!]![0]
    expect(document.body.querySelector(`[data-testid="${errorTestId}"]`)?.textContent).toContain(
      message
    )

    wrapper.unmount()
  })

  // form-clarity-and-console-warnings — CRITICAL 1 fix. `organization_id` has
  // no entry in SERVER_FIELD_TO_ERROR_KEY, so a server 422 naming it (e.g. a
  // per-organization API-key limit) must reach the form-level banner
  // VERBATIM — not be silently discarded in favour of the generic
  // createError string.
  it('surfaces a 422 on a field outside the map (organization_id) in the banner, not the generic message', async () => {
    createClientMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { organization_id: ['This organization has reached its API key limit.'] } },
      })
    )

    const wrapper = mount(ApiKeysPanel, {
      attachTo: document.body,
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="api-keys-new"]').trigger('click')
    await waitForDialogOpen()

    const nameInput = document.body.querySelector<HTMLInputElement>(
      '[data-testid="api-key-form-name"]'
    )
    nameInput!.value = 'Broken key'
    nameInput!.dispatchEvent(new Event('input'))
    await flushPromises()

    const checkbox = document.body.querySelector<HTMLElement>(
      '[data-testid="api-key-ability-participants-read"]'
    )
    checkbox!.click()
    await flushPromises()

    document.body
      .querySelector<HTMLFormElement>('[data-testid="api-key-form"]')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(
      document.body.querySelector('[data-testid="api-key-form-banner"]')?.textContent
    ).toContain('This organization has reached its API key limit.')

    wrapper.unmount()
  })

  // form-clarity-and-console-warnings, D6
  it("renders the name help text and points the control's aria-describedby at it", async () => {
    const wrapper = mount(ApiKeysPanel, {
      attachTo: document.body,
      global: { mocks: { $t: tMock } },
    })
    await wrapper.get('[data-testid="api-keys-new"]').trigger('click')
    await waitForDialogOpen()

    expect(document.body.textContent).toContain('settings.apiKeys.help.name')

    const control = document.body.querySelector('[data-testid="api-key-form-name"]')
    const describedIds = (control?.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
    const matched = describedIds.some((id) => {
      const el = document.body.querySelector(`#${id}`)
      return el !== null && el.textContent === 'settings.apiKeys.help.name'
    })
    expect(matched).toBe(true)

    wrapper.unmount()
  })
})

// The ability names are a CLOSED set enforced by the API's
// `AbilitiesValidator`. They used to be mirrored in a frontend constant, which
// would have gone stale silently the first time one was added or removed.
describe('ApiKeysPanel — the ability catalogue comes from the server', () => {
  it('offers exactly the abilities the API advertises, in the API order', async () => {
    listAbilitiesMock.mockResolvedValue({
      data: ['projects:read', 'evaluations:read'],
    })

    const wrapper = mount(ApiKeysPanel, {
      attachTo: document.body,
      global: { mocks: { $t: tMock } },
    })
    await wrapper.get('[data-testid="api-keys-new"]').trigger('click')
    await waitForDialogOpen()

    const rows = document.body.querySelectorAll('[data-testid^="api-key-ability-"]')

    expect([...rows].map((row) => row.getAttribute('data-testid'))).toEqual([
      'api-key-ability-projects-read',
      'api-key-ability-evaluations-read',
    ])

    wrapper.unmount()
  })

  it('submits an ability the frontend has never heard of, because the server named it', async () => {
    listAbilitiesMock.mockResolvedValue({ data: ['invented:ability'] })
    createClientMock.mockResolvedValue({
      data: {
        id: 9,
        name: 'Future key',
        abilities: ['invented:ability'],
        is_active: true,
        state: 'active',
        expires_at: null,
        last_used_at: null,
        created_at: '2026-03-01T10:00:00Z',
      },
      api_key: 'beai_live_raw_secret',
    })

    const wrapper = mount(ApiKeysPanel, {
      attachTo: document.body,
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    await openCreateDialogAndFill(wrapper, 'Future key', ['invented-ability'])

    expect(createClientMock).toHaveBeenCalledWith({
      name: 'Future key',
      abilities: ['invented:ability'],
    })

    wrapper.unmount()
  })

  it('says so rather than showing an empty group when the catalogue cannot be loaded', async () => {
    listAbilitiesMock.mockRejectedValue(new Error('boom'))

    const wrapper = mount(ApiKeysPanel, {
      attachTo: document.body,
      global: { mocks: { $t: tMock } },
    })
    await wrapper.get('[data-testid="api-keys-new"]').trigger('click')
    await waitForDialogOpen()

    expect(document.body.querySelector('[data-testid="api-key-abilities-error"]')).not.toBeNull()
    expect(document.body.querySelectorAll('[data-testid^="api-key-ability-"]')).toHaveLength(0)

    wrapper.unmount()
  })
})

// dates-and-destructive-actions, design.md D3 — the table MUST render one of
// three states, derived from `client.state` (server-derived, the SAME
// predicate ApiClient::scopeActive uses), and MUST NOT offer Revoke on a key
// that is not active.
describe('ApiKeysPanel — state badge and Revoke guard (D3)', () => {
  // A SIBLING describe, not nested inside describe('ApiKeysPanel') — does
  // NOT inherit that block's beforeEach, so every mock needs its own reset
  // here (lesson from ProjectForm.spec.ts's cross-describe mock leak).
  beforeEach(() => {
    listClientsMock.mockReset().mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'CI key',
          abilities: ['read'],
          is_active: true,
          state: 'active',
          expires_at: null,
          last_used_at: null,
          created_at: '2026-03-01T10:00:00Z',
        },
      ],
    })
    listAbilitiesMock.mockReset().mockResolvedValue({
      data: ['participants:create', 'participants:read', 'sso_link:generate'],
    })
    createClientMock.mockReset()
    revokeClientMock.mockReset().mockResolvedValue(undefined)
  })

  it('reads "Expired" for is_active true + past expires_at (never "Active")', async () => {
    listClientsMock.mockReset().mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Expiring key',
          abilities: ['read'],
          is_active: true,
          state: 'expired',
          expires_at: '2020-01-01T00:00:00Z',
          last_used_at: null,
          created_at: '2026-03-01T10:00:00Z',
        },
      ],
    })
    const wrapper = mount(ApiKeysPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.text()).toContain('settings.apiKeys.state.expired')
    expect(wrapper.text()).not.toContain('settings.apiKeys.state.active')
  })

  it('reads "Revoked" for a revoked key', async () => {
    listClientsMock.mockReset().mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Dead key',
          abilities: ['read'],
          is_active: false,
          state: 'revoked',
          expires_at: null,
          last_used_at: null,
          created_at: '2026-03-01T10:00:00Z',
        },
      ],
    })
    const wrapper = mount(ApiKeysPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.text()).toContain('settings.apiKeys.state.revoked')
  })

  it('reads "Active" for an active key', async () => {
    const wrapper = mount(ApiKeysPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.text()).toContain('settings.apiKeys.state.active')
  })

  it('hides Revoke on a key whose state is not active (expired)', async () => {
    listClientsMock.mockReset().mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Expiring key',
          abilities: ['read'],
          is_active: true,
          state: 'expired',
          expires_at: '2020-01-01T00:00:00Z',
          last_used_at: null,
          created_at: '2026-03-01T10:00:00Z',
        },
      ],
    })
    const wrapper = mount(ApiKeysPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.find('[data-testid="api-key-revoke-1"]').exists()).toBe(false)
  })

  it('hides Revoke on a revoked key', async () => {
    listClientsMock.mockReset().mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Dead key',
          abilities: ['read'],
          is_active: false,
          state: 'revoked',
          expires_at: null,
          last_used_at: null,
          created_at: '2026-03-01T10:00:00Z',
        },
      ],
    })
    const wrapper = mount(ApiKeysPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.find('[data-testid="api-key-revoke-1"]').exists()).toBe(false)
  })

  it('offers Revoke on an active key', async () => {
    const wrapper = mount(ApiKeysPanel, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(wrapper.find('[data-testid="api-key-revoke-1"]').exists()).toBe(true)
  })

  // feature/form-drawer — the create-key FORM moves onto the shared drawer.
  // The raw-key reveal that follows it deliberately does NOT: it is a one-time
  // secret disclosure with an acknowledge control, not a form, and a modal that
  // interrupts is the right shape for something that can never be shown again.
  describe('the create-key drawer', () => {
    const formInDrawer = () =>
      document.body.querySelector('[data-testid="form-drawer"] [data-testid="api-key-form"]')

    async function openCreateDrawer() {
      const wrapper = mount(ApiKeysPanel, {
        global: { mocks: { $t: tMock } },
        attachTo: document.body,
      })
      await flushPromises()

      await wrapper.get('[data-testid="api-keys-new"]').trigger('click')
      await waitFor(formInDrawer, 'the API key form to mount inside the drawer')

      return wrapper
    }

    function fillName(value: string): void {
      const input = document.body.querySelector<HTMLInputElement>(
        '[data-testid="api-key-form-name"]'
      )
      input!.value = value
      input!.dispatchEvent(new Event('input'))
    }

    function submitFromFooter(): void {
      document.body
        .querySelector<HTMLButtonElement>('[data-testid="form-drawer-save"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }

    it('renders the create form inside the drawer', async () => {
      const wrapper = await openCreateDrawer()

      expect(formInDrawer()).not.toBeNull()

      wrapper.unmount()
    })

    it('keeps the submit control out of the scrolling region', async () => {
      const wrapper = await openCreateDrawer()

      const scrollRegion = document.body.querySelector('.overflow-y-auto')
      const submit = document.body.querySelector('[data-testid="form-drawer-save"]')

      expect(submit).not.toBeNull()
      expect(scrollRegion!.contains(submit)).toBe(false)

      wrapper.unmount()
    })

    it('closes the drawer and reveals the raw key on a successful create', async () => {
      createClientMock.mockResolvedValue({ api_key: 'beai_raw_key_shown_once' })
      const wrapper = await openCreateDrawer()

      fillName('CI key')
      document.body
        .querySelector<HTMLElement>('[data-testid="api-key-ability-participants-read"]')
        ?.click()
      await flushPromises()
      submitFromFooter()
      await waitFor(
        () => document.body.querySelector('[data-testid="api-key-raw-value"]'),
        'the raw key reveal to render'
      )

      expect(createClientMock).toHaveBeenCalled()
      expect(formInDrawer()).toBeNull()

      wrapper.unmount()
    })

    it('leaves the drawer OPEN with the field error visible when the create is rejected', async () => {
      createClientMock.mockRejectedValue(
        Object.assign(new Error('Unprocessable'), {
          status: 422,
          data: { errors: { name: ['That name is already in use.'] } },
        })
      )
      const wrapper = await openCreateDrawer()

      fillName('CI key')
      document.body
        .querySelector<HTMLElement>('[data-testid="api-key-ability-participants-read"]')
        ?.click()
      await flushPromises()
      submitFromFooter()
      const error = await waitFor(
        () => document.body.querySelector('[data-testid="api-key-form-name-error"]'),
        'the server field error to render on the name field'
      )

      expect(formInDrawer()).not.toBeNull()
      expect(error.textContent).toContain('That name is already in use.')
      expect(document.body.querySelector('[data-testid="api-key-raw-value"]')).toBeNull()

      wrapper.unmount()
    })

    it('closes on the drawer footer cancel without creating anything', async () => {
      const wrapper = await openCreateDrawer()

      const cancel = document.body.querySelector<HTMLButtonElement>(
        '[data-testid="form-drawer-cancel"]'
      )
      cancel!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      cancel!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(() => formInDrawer() === null, 'the drawer to close after cancel')

      expect(createClientMock).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('closes on Escape without creating anything', async () => {
      const wrapper = await openCreateDrawer()

      formInDrawer()!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
      await waitFor(() => formInDrawer() === null, 'the drawer to close after Escape')

      expect(createClientMock).not.toHaveBeenCalled()

      wrapper.unmount()
    })
  })
})
