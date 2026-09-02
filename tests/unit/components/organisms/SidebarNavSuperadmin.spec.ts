/**
 * The sidebar for a superadmin who has not chosen a client.
 *
 * Dashboard, Projects, Candidates and Reports are CLIENT data. A superadmin
 * with no client selected has no answer to "whose?" — and the product agrees
 * at a level deeper than the UI: `TenantScoped` throws
 * MissingTenantContextException on a create with no organization resolved, so
 * a "New project" button in that state offers an action that cannot complete.
 *
 * Offering a door that is locked is worse than not showing it. The existing
 * `requires` gating already says so for the pages an operator cannot use;
 * this extends the same rule to the state a superadmin can be in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { visibleNavItemsFor } from '../../../../app/utils/nav-visibility'

const can = vi.fn()
const isSuperadmin = { value: false }
const actingClientId = { value: null as number | null }

vi.mock('@/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ can, ensureLoaded: vi.fn() }),
}))

beforeEach(() => {
  can.mockReset().mockReturnValue(true)
  isSuperadmin.value = false
  actingClientId.value = null
})

const ITEMS = [
  { to: '/', scope: 'client' as const },
  { to: '/projects', scope: 'client' as const },
  { to: '/avatar-templates', scope: 'platform' as const },
  { to: '/settings', scope: 'platform' as const },
]

describe('nav visibility', () => {
  it('shows client pages to an ordinary operator', () => {
    const visible = visibleNavItemsFor(ITEMS, { isSuperadmin: false, actingClientId: null })

    expect(visible.map((i) => i.to)).toContain('/projects')
  })

  it('HIDES client pages from a superadmin with no client selected', () => {
    const visible = visibleNavItemsFor(ITEMS, { isSuperadmin: true, actingClientId: null })

    expect(visible.map((i) => i.to)).not.toContain('/projects')
    expect(visible.map((i) => i.to)).not.toContain('/')
  })

  it('shows them again once a client is selected', () => {
    const visible = visibleNavItemsFor(ITEMS, { isSuperadmin: true, actingClientId: 7 })

    expect(visible.map((i) => i.to)).toContain('/projects')
  })

  it('always shows platform pages to a superadmin', () => {
    // With or without a client: templates, LLM config and settings are what a
    // superadmin manages ABOVE the tenants, and hiding them would leave the
    // unscoped view with nothing in it at all.
    const none = visibleNavItemsFor(ITEMS, { isSuperadmin: true, actingClientId: null })
    const one = visibleNavItemsFor(ITEMS, { isSuperadmin: true, actingClientId: 7 })

    expect(none.map((i) => i.to)).toContain('/avatar-templates')
    expect(one.map((i) => i.to)).toContain('/avatar-templates')
  })
})
