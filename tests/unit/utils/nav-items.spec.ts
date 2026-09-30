/**
 * NAV_ITEMS — superadmin organization management is reachable from the sidebar
 * (template-provider-fixes T7). The Clients entry is what leads to the create
 * and edit form, so what matters is that it exists, is gated on the ability
 * only a superadmin holds, and is a platform-level page.
 */
import { describe, expect, it } from 'vitest'
import { NAV_ITEMS } from '../../../app/utils/nav-items'
import { visibleNavItemsFor } from '../../../app/utils/nav-visibility'
import { currentUserStub } from '../support/abilities'

describe('NAV_ITEMS clients entry', () => {
  const clients = NAV_ITEMS.find((item) => item.to === '/clients')

  it('exists and requires the superadmin-only clients.viewAny ability', () => {
    expect(clients).toBeDefined()
    expect(clients).toMatchObject({ requires: 'clients.viewAny', scope: 'platform' })
  })

  it('stays visible to a superadmin who has not picked a client, where tenant pages are hidden', () => {
    const visible = visibleNavItemsFor(NAV_ITEMS, { canSwitchClients: true, actingClientId: null })

    expect(visible.map((item) => item.to)).toContain('/clients')
    expect(visible.map((item) => item.to)).not.toContain('/projects')
  })
})

describe('NAV_ITEMS platform templates entry', () => {
  const platformTemplates = NAV_ITEMS.find((item) => item.to === '/platform-templates')

  it('exists, is a platform page and requires the manageGlobal ability', () => {
    expect(platformTemplates).toMatchObject({
      labelKey: 'nav.platformTemplates',
      requires: 'avatarTemplates.manageGlobal',
      scope: 'platform',
    })
  })

  it('is offered to a superadmin and hidden from an org admin, by the published ability', () => {
    // R3-manageglobal-untested: the mirror in tests/unit/support/abilities.ts
    // answered `manageGlobal` and nothing read the value.
    const requires = platformTemplates?.requires as Parameters<
      ReturnType<typeof currentUserStub>['can']
    >[0]

    expect(currentUserStub({ roles: [], isSuperadmin: true }).can(requires)).toBe(true)
    expect(currentUserStub('admin').can(requires)).toBe(false)
    expect(currentUserStub('operator').can(requires)).toBe(false)
    expect(currentUserStub('viewer').can(requires)).toBe(false)
  })

  it('stays reachable for a superadmin with no client selected, where tenant pages are hidden', () => {
    const visible = visibleNavItemsFor(NAV_ITEMS, { canSwitchClients: true, actingClientId: null })

    expect(visible.map((item) => item.to)).toContain('/platform-templates')
  })
})
