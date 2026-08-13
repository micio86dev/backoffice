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

  it('exposes a labelled navigation landmark, so E2E can target it by ROLE instead of a CSS selector', () => {
    // The vendored shadcn Sidebar renders bare <div>s. Without this landmark
    // the only way to reach it from Playwright is `[data-slot="sidebar"]`,
    // which AGENTS.md forbids — and a screen-reader user gets no landmark at
    // all. The E2E counterpart asserts ABSENCE (count 0), which would pass
    // trivially if the role were dropped; this test asserts PRESENCE.
    const wrapper = mountSidebarNav('/')

    const landmark = wrapper.find('[role="navigation"]')
    expect(landmark.exists()).toBe(true)
    expect(landmark.attributes('aria-label')).toBe('nav.sidebarLabel')
  })

  it('routes the navigation landmark label through i18n, never hardcoded text', () => {
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

    expect(wrapper.find('[role="navigation"]').attributes('aria-label')).toBe(
      'translated:nav.sidebarLabel'
    )
  })
})

// The generated SPA serves directory-style URLs, so a reload or a deep link
// arrives as `/projects/`. Comparing that to the nav item `/projects` with a
// strict `===` silently dropped the current-page highlight on every hard load —
// precisely when a bookmarked or shared link needs it most.
describe('SidebarNav — current page on a hard load', () => {
  function mountAt(path: string) {
    vi.stubGlobal(
      'useRoute',
      vi.fn(() => ({ path, fullPath: path, params: {}, query: {} }))
    )

    return mount(Harness, {
      global: { mocks: { $t: tMock }, stubs: { NuxtLink: NuxtLinkStub } },
    })
  }

  it.each(['/projects/', '/reports/', '/settings/', '/participants/'])(
    'marks exactly one item current when the path arrives as %s',
    (path) => {
      expect(mountAt(path).findAll('[aria-current="page"]')).toHaveLength(1)
    }
  )

  it('still matches the un-slashed form', () => {
    expect(mountAt('/projects').findAll('[aria-current="page"]')).toHaveLength(1)
  })

  it('marks the dashboard current at the root', () => {
    expect(mountAt('/').findAll('[aria-current="page"]')).toHaveLength(1)
  })

  it('marks nothing current on a route that is not in the nav', () => {
    expect(mountAt('/unknown/').findAll('[aria-current="page"]')).toHaveLength(0)
  })
})
