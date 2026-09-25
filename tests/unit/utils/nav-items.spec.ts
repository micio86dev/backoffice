/**
 * NAV_ITEMS — superadmin organization management is reachable from the sidebar
 * (template-provider-fixes T7). The Clients entry is what leads to the create
 * and edit form, so what matters is that it exists, is gated on the ability
 * only a superadmin holds, and is a platform-level page.
 */
import { describe, expect, it } from 'vitest'
import { NAV_ITEMS } from '../../../app/utils/nav-items'
import { visibleNavItemsFor } from '../../../app/utils/nav-visibility'

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
