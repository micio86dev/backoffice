/**
 * pages/index.vue (task 15.3 — RED)
 *
 * Minimal authenticated landing placeholder anchoring the shell (SidebarNav +
 * NavBar via layouts/default.vue) and the auth/SA-11 guards. Full dashboard
 * KPI cards are PR B2 (out of scope here — see tasks.md Phase 17).
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import IndexPage from '../../app/pages/index.vue'

describe('IndexPage (dashboard placeholder shell anchor)', () => {
  it('renders an i18n-labelled heading', () => {
    const tMock = vi.fn((key: string) => (key === 'dashboard.title' ? 'Dashboard' : key))
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    expect(wrapper.find('h1').text()).toBe('Dashboard')
  })
})
