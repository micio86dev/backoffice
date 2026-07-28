/**
 * layouts/default.vue (task 15.3 — RED)
 *
 * Smoke test: the shell (SidebarProvider > SidebarNav + NavBar) mounts without
 * throwing and renders slot content — the real regression risk here is the
 * SidebarContext injection error that surfaced during SidebarNav/NavBar
 * development when either was mounted outside a SidebarProvider ancestor.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
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
})
