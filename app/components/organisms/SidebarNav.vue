<template>
  <!--
    The vendored shadcn `Sidebar` primitive renders generic <div>s with no
    landmark role, so it can only be targeted by a CSS selector — which
    AGENTS.md forbids for E2E locators. The role/label are applied HERE, at the
    usage site, rather than inside the vendored primitive: this Sidebar IS the
    app's primary navigation, but the primitive itself is generic and must not
    claim a navigation landmark for every future consumer.
    `Sidebar` sets `inheritAttrs: false` and re-binds `$attrs` onto its
    rendered container, so both attributes land on a real element.
  -->
  <Sidebar role="navigation" :aria-label="$t('nav.sidebarLabel')">
    <SidebarHeader>
      <span class="px-2 text-lg font-semibold text-sidebar-foreground">BEAI</span>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem v-for="item in navItems" :key="item.to">
            <SidebarMenuButton as-child :is-active="isCurrent(item.to)">
              <NuxtLink :to="item.to" :aria-current="isCurrent(item.to) ? 'page' : undefined">
                <component :is="item.icon" aria-hidden="true" />
                <span>{{ $t(item.labelKey) }}</span>
              </NuxtLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
</template>

<script setup lang="ts">
import {
  HomeIcon,
  FolderIcon,
  UsersIcon,
  ChartBarIcon,
  Cog6ToothIcon,
} from '@heroicons/vue/24/outline'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

// Nav items per DESIGN.md §8.1 (Dashboard / Projects / Candidates / Reports /
// Settings). "Candidates" is the product-facing label for the Participant
// resource (CLAUDE.md domain glossary: Participant is the model, "candidate"
// is the user-facing term).
const navItems = [
  { to: '/', labelKey: 'nav.dashboard', icon: HomeIcon },
  { to: '/projects', labelKey: 'nav.projects', icon: FolderIcon },
  { to: '/participants', labelKey: 'nav.candidates', icon: UsersIcon },
  { to: '/reports', labelKey: 'nav.reports', icon: ChartBarIcon },
  // C14. Configuration rather than a record, so it sits beside Settings and
  // after the pages an operator opens daily.
  { to: '/avatar-templates', labelKey: 'nav.avatarTemplates', icon: Cog6ToothIcon },
  { to: '/settings', labelKey: 'nav.settings', icon: Cog6ToothIcon },
] as const

const route = useRoute()

/**
 * Trailing slashes are stripped before comparing.
 *
 * The generated SPA is served as directory-style URLs, so a hard load or a
 * deep link lands on `/projects/` while the nav item is `/projects`. A strict
 * `===` therefore matched only after a CLIENT-SIDE navigation: reload any page
 * and the sidebar stopped showing where you were, which is exactly when a
 * bookmarked or shared link needs it most.
 */
function isCurrent(to: string): boolean {
  const normalize = (path: string): string => path.replace(/\/+$/, '') || '/'

  return normalize(route.path) === normalize(to)
}
</script>
