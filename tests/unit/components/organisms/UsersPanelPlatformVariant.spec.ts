/**
 * UsersPanel — the PLATFORM variant (platform-user-management D6).
 *
 * A superadmin with no client selected is not managing an organization: they
 * are managing BEAI's own people. Same panel, same table, same confirmations —
 * one prop decides which population is listed and which endpoints are called.
 *
 * A `variant` prop rather than a second component, because the actions are the
 * same actions. What differs is one column and one composable.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { realI18n } from '../../support/i18n'
import { waitFor } from '../../support/wait-for'

const tMock = (key: string) => key

const listUsersMock = vi.fn()
const deactivateUserMock = vi.fn()
const activateUserMock = vi.fn()

const listPlatformUsersMock = vi.fn()
const deactivatePlatformUserMock = vi.fn()
const activatePlatformUserMock = vi.fn()

vi.mock('../../../../app/composables/useUsers', () => ({
  useUsers: () => ({
    listUsers: listUsersMock,
    deactivateUser: deactivateUserMock,
    activateUser: activateUserMock,
    createUser: vi.fn(),
    updateUser: vi.fn(),
  }),
}))

vi.mock('../../../../app/composables/usePlatformUsers', () => ({
  usePlatformUsers: () => ({
    listPlatformUsers: listPlatformUsersMock,
    deactivatePlatformUser: deactivatePlatformUserMock,
    activatePlatformUser: activatePlatformUserMock,
    createPlatformUser: vi.fn(),
    updatePlatformUser: vi.fn(),
  }),
}))

const UsersPanel = (await import('../../../../app/components/organisms/UsersPanel.vue')).default

const PLATFORM_USER = {
  id: 9,
  name: 'Ada Lovelace',
  email: 'ada@beai.test',
  is_deactivated: false,
  created_at: null,
  updated_at: null,
}

function mountPanel(variant: 'organization' | 'platform') {
  return mount(UsersPanel, {
    props: { variant },
    global: { mocks: { $t: tMock } },
    attachTo: document.body,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

// `te` must answer from the real locale file here: the global stub says
// true to everything, which makes every translation assertion below
// unfalsifiable.
vi.stubGlobal('useI18n', () => realI18n())

describe('UsersPanel — platform variant', () => {
  beforeEach(() => {
    listUsersMock.mockReset().mockResolvedValue({
      data: [{ ...PLATFORM_USER, id: 1, role: 'admin' }],
    })
    listPlatformUsersMock.mockReset().mockResolvedValue({ data: [PLATFORM_USER] })
    deactivateUserMock.mockReset().mockResolvedValue(undefined)
    activateUserMock.mockReset().mockResolvedValue(undefined)
    deactivatePlatformUserMock.mockReset().mockResolvedValue(undefined)
    activatePlatformUserMock.mockReset().mockResolvedValue(undefined)
  })

  it('reads BEAI’s own people, never the organization list', async () => {
    mountPanel('platform')
    await flushPromises()

    expect(listPlatformUsersMock).toHaveBeenCalledTimes(1)
    expect(listUsersMock).not.toHaveBeenCalled()
  })

  it('reads the organization list under the organization variant', async () => {
    mountPanel('organization')
    await flushPromises()

    expect(listUsersMock).toHaveBeenCalledTimes(1)
    expect(listPlatformUsersMock).not.toHaveBeenCalled()
  })

  it('offers no access-level column — there is one platform identity', async () => {
    const wrapper = mountPanel('platform')
    await flushPromises()

    // A role column here would be a control with one option, and a lie the
    // moment somebody read it as an organization role.
    expect(wrapper.text()).not.toContain('users.table.accessLevel')
  })

  it('keeps the access-level column for an organization', async () => {
    const wrapper = mountPanel('organization')
    await flushPromises()

    expect(wrapper.text()).toContain('users.table.accessLevel')
  })

  it('names the scope it is showing, so nobody adds the wrong person', async () => {
    // One click separates the two populations. An operator who cannot tell
    // which one is on screen is one click from a mistake nobody would catch.
    const platform = mountPanel('platform')
    await flushPromises()
    expect(platform.find('[data-testid="users-scope"]').text()).toContain('users.scope.platform')

    const organization = mountPanel('organization')
    await flushPromises()
    expect(organization.find('[data-testid="users-scope"]').text()).toContain(
      'users.scope.organization'
    )
  })

  it('deactivates through the PLATFORM endpoint, after confirmation', async () => {
    const wrapper = mountPanel('platform')
    await flushPromises()

    await wrapper.get('[data-testid="user-deactivate-9"]').trigger('click')
    await flushPromises()

    // Nothing on the first click — the same rule the org variant follows.
    expect(deactivatePlatformUserMock).not.toHaveBeenCalled()

    const confirm = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    confirm?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirm?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => deactivatePlatformUserMock.mock.calls.length > 0)

    expect(deactivatePlatformUserMock).toHaveBeenCalledWith(9)
    expect(deactivateUserMock).not.toHaveBeenCalled()
  })
})

describe('UsersPanel — failures are visible, and the scope is authoritative', () => {
  // Its own reset: the block above leaves every mock configured, so without
  // this each case here would inherit whatever the last one did.
  beforeEach(() => {
    listUsersMock.mockReset().mockResolvedValue({
      data: [{ ...PLATFORM_USER, id: 1, role: 'admin' }],
    })
    listPlatformUsersMock.mockReset().mockResolvedValue({ data: [PLATFORM_USER] })
    deactivatePlatformUserMock.mockReset().mockResolvedValue(undefined)
    activatePlatformUserMock.mockReset().mockResolvedValue(undefined)
  })

  it('renders a failed list as an ERROR, never as "no users yet"', async () => {
    // A rejection falling through into the empty state is a failure that looks
    // like success — the rule utils/error-state.ts writes down verbatim.
    listPlatformUsersMock.mockReset().mockRejectedValue({ status: 500 })

    const wrapper = mountPanel('platform')
    await flushPromises()

    expect(wrapper.find('[data-testid="users-load-error"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('users.table.empty')
  })

  it('keeps a 409 distinct from a real failure', async () => {
    // "Not ready yet" is temporal and self-resolving. Rendering it in the same
    // destructive red as a 403 throws away the reason resolveResourceErrorState
    // separates them.
    listPlatformUsersMock.mockReset().mockRejectedValue({ status: 409 })

    const wrapper = mountPanel('platform')
    await flushPromises()

    const banner = wrapper.get('[data-testid="users-load-error"]')
    expect(banner.exists()).toBe(true)
    expect(banner.classes().join(' ')).not.toContain('destructive')
  })

  it('explains a refused deactivation instead of doing nothing', async () => {
    // UserAbilities publishes the contract these invariants ship under: "the
    // button renders; the API explains". Swallowing the 422 left the row
    // reading Active with no explanation, teaching the operator the button is
    // broken.
    deactivatePlatformUserMock
      .mockReset()
      .mockRejectedValue({ status: 422, data: { error: 'last_superadmin', message: 'English.' } })

    const wrapper = mountPanel('platform')
    await flushPromises()
    await wrapper.get('[data-testid="user-deactivate-9"]').trigger('click')
    await flushPromises()

    const confirm = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    confirm?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirm?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => wrapper.find('[data-testid="users-action-error"]').exists())

    // The CODE, translated here — never the server's English sentence.
    expect(wrapper.get('[data-testid="users-action-error"]').text()).toContain(
      'users.serverError.last_superadmin'
    )
  })

  it('DISCARDS a response that lands after the scope changed', async () => {
    // Clearing the rows does not cancel the request already in flight. With
    // the organization list resolving last, an organization's people would be
    // repainted under "You are managing the BEAI team" — and every action
    // follows isPlatform against global ids from there.
    let resolveOrg: (value: unknown) => void = () => {}
    listUsersMock.mockReset().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOrg = resolve
        })
    )

    const wrapper = mountPanel('organization')
    await flushPromises()

    await wrapper.setProps({ variant: 'platform' })
    await flushPromises()

    // The org request now answers, LAST.
    resolveOrg({ data: [{ ...PLATFORM_USER, id: 1, role: 'admin', name: 'Org Person' }] })
    await flushPromises()

    expect(wrapper.text()).not.toContain('Org Person')
    expect(wrapper.text()).toContain('Ada Lovelace')
  })

  it('drops an action error belonging to the other population', async () => {
    deactivatePlatformUserMock
      .mockReset()
      .mockRejectedValue({ status: 422, data: { error: 'last_superadmin' } })

    const wrapper = mountPanel('platform')
    await flushPromises()
    await wrapper.get('[data-testid="user-deactivate-9"]').trigger('click')
    await flushPromises()

    const confirm = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    confirm?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirm?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => wrapper.find('[data-testid="users-action-error"]').exists())

    await wrapper.setProps({ variant: 'organization' })
    await flushPromises()

    expect(wrapper.find('[data-testid="users-action-error"]').exists()).toBe(false)
  })

  it('REFETCHES when the scope flips under it', async () => {
    // settings/index.vue resolves the scope from /api/organization's 404,
    // which lands after the rail has painted. Opening Users inside that window
    // mounted the organization variant, and the caption then flipped while the
    // rows stayed an organization's — with every action following isPlatform
    // and ids being global, Deactivate aimed a well-formed request at the
    // wrong population.
    const wrapper = mountPanel('organization')
    await flushPromises()
    expect(listUsersMock).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ variant: 'platform' })
    await flushPromises()

    expect(listPlatformUsersMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="user-deactivate-1"]').exists()).toBe(false)
  })
})
