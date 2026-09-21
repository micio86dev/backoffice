/**
 * The canonical sidebar nav item list (DESIGN.md §8.1).
 *
 * Extracted from `SidebarNav.vue` so a second consumer — the onboarding tour
 * composable (`useOnboardingTour.ts`) — walks the SAME list instead of
 * maintaining an independent copy that can silently drift from what the
 * sidebar actually renders. `nav-visibility.ts` already extracted the
 * FILTERING rule for the identical reason; this extracts the DATA the
 * filter runs over.
 */
import {
  HomeIcon,
  FolderIcon,
  UsersIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  BuildingOffice2Icon,
  BookOpenIcon,
} from '@heroicons/vue/24/outline'
import type { AbilityKey } from '../composables/useCurrentUser'
import type { NavScope } from './nav-visibility'

/**
 * `requires` is the ability the SERVER publishes for that page, not a role
 * name — the same map `03.abilities.global.ts` guards the route with, so the
 * link and the guard cannot disagree about who may go there.
 */
export interface NavItem {
  to: string
  labelKey: string
  icon: unknown
  requires?: AbilityKey
  scope: NavScope
}

export const NAV_ITEMS = [
  { to: '/', labelKey: 'nav.dashboard', icon: HomeIcon, scope: 'client' },
  { to: '/projects', labelKey: 'nav.projects', icon: FolderIcon, scope: 'client' },
  { to: '/participants', labelKey: 'nav.candidates', icon: UsersIcon, scope: 'client' },
  { to: '/reports', labelKey: 'nav.reports', icon: ChartBarIcon, scope: 'client' },
  {
    to: '/clients',
    labelKey: 'nav.clients',
    icon: BuildingOffice2Icon,
    requires: 'clients.viewAny',
    scope: 'platform',
  },
  {
    to: '/avatar-templates',
    labelKey: 'nav.avatarTemplates',
    icon: Cog6ToothIcon,
    requires: 'avatarTemplates.viewAny',
    scope: 'platform',
  },
  {
    to: '/settings',
    labelKey: 'nav.settings',
    icon: Cog6ToothIcon,
    requires: 'users.viewAny',
    scope: 'platform',
  },
  {
    to: '/catalogue',
    labelKey: 'nav.catalogue',
    icon: BookOpenIcon,
    requires: 'catalogue.manage',
    scope: 'platform',
  },
] as const satisfies readonly NavItem[]
