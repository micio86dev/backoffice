/**
 * Which navigation entries a viewer should see.
 *
 * Extracted from the component so the rule is testable on its own — it is an
 * authorization-shaped decision, and burying it in a template makes it
 * something you verify by reading rather than by running.
 *
 * The ABILITY gating stays in the component: `requires` is checked against
 * what the server publishes, and that already fails closed. This adds the one
 * thing abilities cannot express, because it is not about permission at all.
 */

/** `client` pages read tenant data; `platform` pages sit above the tenants. */
export type NavScope = 'client' | 'platform'

export interface ScopedNavItem {
  to: string
  scope: NavScope
}

export interface Viewer {
  /**
   * Whether this viewer operates the whole ESTATE rather than one client.
   *
   * Renamed from `isSuperadmin`, and the rename is the point: the caller now
   * answers it from the published `clients.viewAny` ability instead of from
   * `user.is_superadmin`. This module never cared which identity held the
   * capability — only that the viewer has no single client implied — so naming
   * it after the identity invited exactly the re-derivation being removed.
   */
  canSwitchClients: boolean
  /** Which client such a viewer is acting as, or null for the whole estate. */
  actingClientId: number | null
}

/**
 * A superadmin with NO client selected sees only platform pages.
 *
 * Not a permission rule — a superadmin passes every gate. It is that the
 * question has no answer: Dashboard, Projects and Candidates are one client's
 * data, and "whose?" is unanswered until a client is chosen. The product
 * already agrees underneath: `TenantScoped` throws
 * MissingTenantContextException on a create with no organization resolved, so
 * a "New project" button in that state offers an action that cannot complete.
 *
 * Everyone else is unaffected: an ordinary operator always has an
 * organization, so every page is about theirs.
 */
export function visibleNavItemsFor<T extends ScopedNavItem>(
  items: readonly T[],
  viewer: Viewer
): T[] {
  if (!viewer.canSwitchClients || viewer.actingClientId !== null) {
    return [...items]
  }

  return items.filter((item) => item.scope === 'platform')
}
