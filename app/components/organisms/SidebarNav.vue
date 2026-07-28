<template>
  <Sidebar>
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
  { to: '/settings', labelKey: 'nav.settings', icon: Cog6ToothIcon },
] as const

const route = useRoute()

function isCurrent(to: string): boolean {
  return route.path === to
}
</script>
