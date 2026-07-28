/**
 * SidebarNav.vue (task 15.3, DESIGN.md §8.1 — RED)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { SidebarProvider } from '../../../../app/components/ui/sidebar'
import SidebarNav from '../../../../app/components/organisms/SidebarNav.vue'

const tMock = (key: string) => key

const NuxtLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

// SidebarMenuButton/Sidebar (shadcn/reka-ui) require an ancestor
// SidebarProvider for context injection — exactly how layouts/default.vue
// wraps SidebarNav + NavBar in production.
const Harness = defineComponent({
  render: () => h(SidebarProvider, () => h(SidebarNav)),
})

function mountSidebarNav(currentPath: string) {
  vi.stubGlobal(
    'useRoute',
    vi.fn(() => ({ path: currentPath }))
  )
  return mount(Harness, {
    global: {
      mocks: { $t: tMock },
      stubs: { NuxtLink: NuxtLinkStub },
    },
  })
}

describe('SidebarNav', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a link for each nav item from DESIGN.md §8.1 (Dashboard, Projects, Candidates, Reports, Settings)', () => {
    const wrapper = mountSidebarNav('/')

    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(hrefs).toEqual(
      expect.arrayContaining(['/', '/projects', '/participants', '/reports', '/settings'])
    )
  })

  it('renders every nav label through i18n, never hardcoded text', () => {
    const tSpy = vi.fn((key: string) => `translated:${key}`)
    vi.stubGlobal(
      'useRoute',
      vi.fn(() => ({ path: '/' }))
    )
    const wrapper = mount(Harness, {
      global: {
        mocks: { $t: tSpy },
        stubs: { NuxtLink: NuxtLinkStub },
      },
    })

    expect(wrapper.text()).toContain('translated:nav.dashboard')
    expect(wrapper.text()).toContain('translated:nav.projects')
    expect(wrapper.text()).toContain('translated:nav.candidates')
    expect(wrapper.text()).toContain('translated:nav.reports')
    expect(wrapper.text()).toContain('translated:nav.settings')
  })

  it('marks the current route with aria-current="page" and no other item', () => {
    const wrapper = mountSidebarNav('/participants')

    const current = wrapper.findAll('a[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]?.attributes('href')).toBe('/participants')
  })

  it('marks no item as current when on an unrelated route', () => {
    const wrapper = mountSidebarNav('/login')
    expect(wrapper.findAll('a[aria-current="page"]')).toHaveLength(0)
  })
})
