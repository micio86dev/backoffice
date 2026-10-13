/**
 * layouts/default.vue (task 15.3 — RED)
 *
 * Smoke test: the shell (SidebarProvider > SidebarNav + NavBar) mounts without
 * throwing and renders slot content — the real regression risk here is the
 * SidebarContext injection error that surfaced during SidebarNav/NavBar
 * development when either was mounted outside a SidebarProvider ancestor.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DefaultLayout from '../../../app/layouts/default.vue'

const tMock = (key: string) => key

describe('layouts/default.vue', () => {
  it('renders the sidebar, the nav bar and the page slot content without throwing', () => {
    vi.stubGlobal(
      'useRoute',
      vi.fn(() => ({ path: '/' }))
    )
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
    )

    const wrapper = mount(DefaultLayout, {
      global: {
        mocks: { $t: tMock },
        stubs: { NuxtLink: { template: '<a><slot /></a>' } },
      },
      slots: {
        default: '<p data-testid="page-content">page content</p>',
      },
    })

    expect(wrapper.find('[data-slot="sidebar-trigger"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="logout-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="page-content"]').exists()).toBe(true)
  })

  describe('brand colour on mount', () => {
    afterEach(() => {
      vi.doUnmock('../../../app/composables/useOrganization')
      vi.doUnmock('../../../app/composables/useBrandTheme')
      vi.resetModules()
    })

    async function mountWith(fetchOrganization: () => Promise<unknown>) {
      const applyBrandColor = vi.fn()
      vi.doMock('../../../app/composables/useOrganization', () => ({
        useOrganization: () => ({ fetchOrganization }),
      }))
      vi.doMock('../../../app/composables/useBrandTheme', () => ({ applyBrandColor }))
      vi.resetModules()
      vi.stubGlobal(
        'useRoute',
        vi.fn(() => ({ path: '/', fullPath: '/', params: {}, query: {} }))
      )
      vi.stubGlobal(
        'useRuntimeConfig',
        vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
      )
      const Layout = (await import('../../../app/layouts/default.vue')).default
      const wrapper = mount(Layout, {
        global: { mocks: { $t: tMock }, stubs: { NuxtLink: { template: '<a><slot /></a>' } } },
      })
      await flushPromises()
      return { wrapper, applyBrandColor }
    }

    it("paints the organization's primary colour", async () => {
      const { applyBrandColor } = await mountWith(
        vi.fn().mockResolvedValue({ data: { primary_color: '#112233' } })
      )

      expect(applyBrandColor).toHaveBeenCalledWith('#112233')
    })

    it('passes undefined (product palette) when there is no acting organization', async () => {
      const { applyBrandColor } = await mountWith(vi.fn().mockResolvedValue({ data: null }))

      expect(applyBrandColor).toHaveBeenCalledWith(undefined)
    })

    it('stays silent and keeps rendering the shell when the organization read fails', async () => {
      const { wrapper, applyBrandColor } = await mountWith(
        vi.fn().mockRejectedValue(new Error('down'))
      )

      expect(applyBrandColor).not.toHaveBeenCalled()
      expect(wrapper.find('[data-testid="logout-button"]').exists()).toBe(true)
    })
  })
})
