/**
 * SidebarNav.vue (task 15.3, DESIGN.md §8.1 — RED; extended for
 * user-profile-self-service, design D7, task 7.1 — RED)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { SidebarProvider } from '../../../../app/components/ui/sidebar'
import SidebarNav from '../../../../app/components/organisms/SidebarNav.vue'
import { waitFor } from '../../support/wait-for'

const tMock = (key: string) => key

// user-profile-self-service, design D7: SidebarFooter identity reads
// `useCurrentUser().ensureLoaded()`. Mocked here so the pre-existing tests
// above (which never configure it) still resolve cleanly instead of hitting
// the real network-fetch path; each identity test below sets its own value.
const ensureLoadedMock = vi.fn()

vi.mock('../../../../app/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ ensureLoaded: ensureLoadedMock }),
}))

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
    ensureLoadedMock.mockReset().mockResolvedValue({
      user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test', locale: 'en' },
      organization: null,
      roles: ['operator'],
    })
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

// user-profile-self-service, design D7: identity goes in SidebarFooter, not
// NavBar — NavBar already carries a truncating ORGANIZATION string plus Help
// plus Logout in one row; a second identity element there would make "who"
// and "where" compete. SidebarFooter replaces the literal "BEAI" header as
// the shell's only identity element.
describe('SidebarNav — shell identity (design D7)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal(
      'useRoute',
      vi.fn(() => ({ path: '/', fullPath: '/', params: {}, query: {} }))
    )
    ensureLoadedMock.mockReset().mockResolvedValue({
      user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test', locale: 'en' },
      organization: null,
      roles: ['operator'],
    })
  })

  it('renders a SidebarFooter with an aria-hidden initials avatar and the user name', async () => {
    const wrapper = mountSidebarNav('/')
    await waitFor(
      () => wrapper.find('[data-testid="sidebar-footer-identity"]').exists(),
      'the SidebarFooter identity link to render'
    )

    const footer = wrapper.get('[data-testid="sidebar-footer-identity"]')
    expect(footer.text()).toContain('Ada Lovelace')

    const avatar = wrapper.get('[data-testid="sidebar-footer-avatar"]')
    expect(avatar.attributes('aria-hidden')).toBe('true')
    expect(avatar.text()).toBe('AL')
  })

  it('links the identity to /profile with an accessible name from nav.profileLabel', async () => {
    const wrapper = mountSidebarNav('/')
    await waitFor(
      () => wrapper.find('[data-testid="sidebar-footer-identity"]').exists(),
      'the SidebarFooter identity link to render'
    )

    const link = wrapper.get('[data-testid="sidebar-footer-identity"]')
    expect(link.attributes('href')).toBe('/profile')
    expect(link.attributes('aria-label')).toBe('nav.profileLabel')
  })

  it('renders no footer identity when the current user has not loaded (fails silently, like NavBar org fetch)', async () => {
    ensureLoadedMock.mockReset().mockRejectedValue(new Error('network error'))

    const wrapper = mountSidebarNav('/')
    await flushPromises()

    expect(wrapper.find('[data-testid="sidebar-footer-identity"]').exists()).toBe(false)
  })
})

// user-avatar-image, design D6: AvatarImage (reka-ui) renders only after a
// successful `load` event on the underlying Image; until then — and on any
// error — AvatarFallback holds the slot. jsdom never fires that `load`
// event for an <img>/Image() by default, so a photo_url that never
// completes loading is functionally indistinguishable, from this unit
// test's vantage point, from one that fails outright — exactly the "broken
// or expired photo URL falls back to initials" claim. The POSITIVE case
// (a real photo successfully rendering) is proved in Playwright (task 9.1),
// where an actual browser can complete a real image load.
describe('SidebarNav — broken photo URL falls back to initials (design D6)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal(
      'useRoute',
      vi.fn(() => ({ path: '/', fullPath: '/', params: {}, query: {} }))
    )
  })

  it('falls back to initials when the current user has a photo_url that never finishes loading', async () => {
    ensureLoadedMock.mockReset().mockResolvedValue({
      user: {
        id: 1,
        name: 'Ada Lovelace',
        email: 'ada@example.test',
        locale: 'en',
        photo_url: 'https://example.test/broken.jpg',
      },
      organization: null,
      roles: ['operator'],
    })

    const wrapper = mountSidebarNav('/')
    await waitFor(
      () => wrapper.find('[data-testid="sidebar-footer-identity"]').exists(),
      'the SidebarFooter identity link to render'
    )
    await flushPromises()

    const avatar = wrapper.get('[data-testid="sidebar-footer-avatar"]')
    expect(avatar.text()).toBe('AL')
  })
})
