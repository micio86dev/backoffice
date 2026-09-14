/**
 * NavBar.vue (task 15.3, DESIGN.md §8.1 — RED)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { SidebarProvider } from '../../../../app/components/ui/sidebar'
import NavBar from '../../../../app/components/organisms/NavBar.vue'

const tMock = (key: string) => key

const Harness = defineComponent({
  render: () => h(SidebarProvider, () => h(NavBar)),
})

describe('NavBar', () => {
  beforeEach(() => {
    sessionStorage.clear()
    // Wipes setup.ts's globals too, so anything NavBar's subtree auto-imports
    // has to be restored here. `useRoute` is HelpSheet's — it picks its topic
    // from the current path.
    vi.unstubAllGlobals()
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
    )
    vi.stubGlobal(
      'useRoute',
      vi.fn(() => ({ path: '/', fullPath: '/', params: {}, query: {} }))
    )
  })

  it('renders a sidebar-toggle control', () => {
    const wrapper = mount(Harness, { global: { mocks: { $t: tMock } } })
    expect(wrapper.find('[data-slot="sidebar-trigger"]').exists()).toBe(true)
  })

  it('renders a logout control labelled through i18n', () => {
    const tSpy = vi.fn((key: string) => `translated:${key}`)
    const wrapper = mount(Harness, { global: { mocks: { $t: tSpy } } })

    const logoutButton = wrapper.find('[data-testid="logout-button"]')
    expect(logoutButton.exists()).toBe(true)
    expect(logoutButton.text()).toContain('translated:nav.logout')
  })

  it('calls useAuth().logout() when the logout control is activated', async () => {
    const fetchMock = vi.fn(async () => ({ message: 'Successfully logged out.' }))
    const navigateToMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('navigateTo', navigateToMock)

    const { useAuth } = await import('../../../../app/composables/useAuth')
    useAuth().setSession('some-token')

    const wrapper = mount(Harness, { global: { mocks: { $t: tMock } } })
    await wrapper.find('[data-testid="logout-button"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/auth/logout',
      expect.objectContaining({ method: 'POST' })
    )
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })

  /**
   * WHO SEES THE CLIENT SWITCHER — the line the hotfix changed, and the one
   * line in it that had no net at any tier.
   *
   * `NavBar` now reads `can('clients.viewAny')` instead of
   * `user.is_superadmin`. Nothing asserted on that: this file never mocked
   * `useCurrentUser` and never looked for the control, no E2E mentions it, and
   * `ClientSwitcher.spec.ts` mounts the component from props — which says how
   * it renders, never who gets to see it. Forcing the flag true left all 2069
   * tests green.
   *
   * That mutation is not cosmetic. It puts an ALL-TENANT switcher in the
   * topbar of every ordinary operator, in a product whose binding constraint
   * is that a tenant must never see another tenant's data. The API still
   * refuses — the affordance is not the control — but it is the one visible
   * claim the shell makes about whose data this is.
   */
  function mockIdentity(canSwitch: boolean, clientsFail = false) {
    vi.doMock('../../../../app/composables/useCurrentUser', () => ({
      useCurrentUser: () => ({
        ensureLoaded: vi.fn().mockResolvedValue({
          user: { name: 'Ada', photo_url: null, is_superadmin: canSwitch },
        }),
        can: (ability: string) => ability === 'clients.viewAny' && canSwitch,
      }),
    }))

    vi.doMock('../../../../app/composables/useSuperadmin', () => ({
      useSuperadmin: () => ({
        fetchClients: clientsFail
          ? vi.fn().mockRejectedValue(new Error('clients unavailable'))
          : vi.fn().mockResolvedValue({
              data: [{ id: 1, name: 'Acme' }],
              acting_organization_id: 7,
            }),
        setActingClient: vi.fn(),
      }),
    }))
  }

  async function mountFresh() {
    vi.resetModules()

    // BOTH re-imported after the reset, not just NavBar. `SidebarProvider`
    // publishes its context under a module-scoped Symbol, so a provider from
    // the pre-reset module instance and a trigger from the post-reset one look
    // up different keys — "Injection Symbol(SidebarContext) not found", which
    // reads like a missing wrapper rather than two copies of the module.
    const { SidebarProvider: FreshProvider } = await import('../../../../app/components/ui/sidebar')
    const Fresh = (await import('../../../../app/components/organisms/NavBar.vue')).default
    const wrapper = mount(defineComponent({ render: () => h(FreshProvider, () => h(Fresh)) }), {
      global: { mocks: { $t: tMock } },
    })
    await flushPromises()

    return wrapper
  }

  it('hides the client switcher from a viewer without clients.viewAny', async () => {
    mockIdentity(false)

    expect((await mountFresh()).find('[data-testid="client-switcher"]').exists()).toBe(false)
  })

  it('shows the client switcher to a viewer who holds clients.viewAny', async () => {
    // The positive half, so the negative case above cannot pass by the control
    // simply never rendering.
    mockIdentity(true)

    expect((await mountFresh()).find('[data-testid="client-switcher"]').exists()).toBe(true)
  })

  /**
   * A FAILED client read must not render as a state the operator could have
   * chosen.
   *
   * `canSwitchClients` used to be set BEFORE the `fetchClients()` await, so a
   * rejection left the switcher on screen with an empty list and a null acting
   * id — and `ClientSwitcher` binds null to the `superadmin.allClients`
   * option. A superadmin acting as ONE client then read "All clients" in the
   * topbar while every list on the page was that client's data.
   *
   * That is a tenancy claim made out of a read that failed, in a product whose
   * binding constraint is that a tenant must never see another tenant's data.
   * `SidebarNav` already guarded it with `actingClientKnown`; this is the same
   * rule, the same shell, the file that did not have it.
   */
  it('hides the switcher when the client list fails, rather than claiming "all clients"', async () => {
    mockIdentity(true, true)

    const wrapper = await mountFresh()

    expect(wrapper.find('[data-testid="client-switcher"]').exists()).toBe(false)
  })
})
