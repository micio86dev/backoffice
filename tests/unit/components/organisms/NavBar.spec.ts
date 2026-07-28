/**
 * NavBar.vue (task 15.3, DESIGN.md §8.1 — RED)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
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
    vi.unstubAllGlobals()
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
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
})
