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
          <SidebarMenuItem v-for="item in visibleNavItems" :key="item.to">
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

    <!--
      Shell identity (user-profile-self-service, design D7) — replaces the
      literal "BEAI" header above as the shell's only identity element.
      Deliberately NOT in NavBar: that row already carries a truncating
      ORGANIZATION string plus Help plus Logout, and a second identity
      element there would make "who" and "where" compete.
    -->
    <SidebarFooter v-if="currentUserName">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton as-child>
            <NuxtLink
              to="/profile"
              data-testid="sidebar-footer-identity"
              :aria-label="$t('nav.profileLabel', { name: currentUserName })"
            >
              <!--
                :key forces a fresh AvatarRoot across a null <-> non-null
                photoUrl transition — see ProfilePhotoForm.vue's comment on
                the same pattern (reka-ui's shared imageLoadingStatus is
                never reset by AvatarImage's own v-if unmount).
              -->
              <Avatar
                :key="currentUserPhotoUrl ? 'photo' : 'no-photo'"
                size="sm"
                aria-hidden="true"
                data-testid="sidebar-footer-avatar"
              >
                <AvatarImage
                  v-if="currentUserPhotoUrl"
                  data-testid="sidebar-footer-avatar-image"
                  :src="currentUserPhotoUrl"
                  alt=""
                />
                <AvatarFallback data-testid="sidebar-footer-avatar-fallback">{{
                  initials(currentUserName)
                }}</AvatarFallback>
              </Avatar>
              <span>{{ currentUserName }}</span>
            </NuxtLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
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
import { computed, onMounted, ref } from 'vue'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { AbilityKey } from '@/composables/useCurrentUser'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { initials } from '@/utils/initials'

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
  //
  // The last two carry a `requires`: an operator and an observer cannot use
  // either page, and every request behind them comes back 403. Offering a
  // door that is locked is worse than not showing it — the user clicks,
  // waits, and is told no, with nothing they can do about it.
  {
    to: '/avatar-templates',
    labelKey: 'nav.avatarTemplates',
    icon: Cog6ToothIcon,
    requires: 'avatarTemplates.viewAny',
  },
  { to: '/settings', labelKey: 'nav.settings', icon: Cog6ToothIcon, requires: 'users.viewAny' },
] as const satisfies readonly NavItem[]

/**
 * `requires` is the ability the SERVER publishes for that page, not a role
 * name — same map `03.abilities.global.ts` guards the route with, so the link
 * and the guard cannot disagree about who may go there.
 */
interface NavItem {
  to: string
  labelKey: string
  icon: unknown
  requires?: AbilityKey
}

/**
 * Items with no `requires` are always shown. `can()` fails closed, so on a
 * cold load — before `/auth/me` settles — the gated items are simply absent
 * and appear once the identity arrives, rather than flashing into view and
 * out again for the users who may not have them.
 */
const visibleNavItems = computed(() =>
  navItems.filter((item) => {
    const requires = 'requires' in item ? item.requires : undefined

    return requires === undefined || can(requires)
  })
)

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

// Shell identity (design D7). Silent on failure, same discipline as
// NavBar.vue's organization fetch — a transient error here must not break
// navigation, and the footer simply omits identity rather than showing one.
const currentUserName = ref<string | null>(null)
// user-avatar-image (design D6): sourced from useCurrentUser().user.photo_url
// — the /auth/me contract — never the /profile resource's own photo_url,
// which pages/profile.vue reads independently (two contracts, never conflated).
const currentUserPhotoUrl = ref<string | null>(null)

// `can` is reactive: it reads the module-scoped identity `ensureLoaded()`
// below fills in, so `visibleNavItems` recomputes on its own once /auth/me
// settles. Destructured here rather than called inline in the filter so the
// computed has a stable dependency.
const { can } = useCurrentUser()

onMounted(async () => {
  try {
    const { user } = await useCurrentUser().ensureLoaded()
    currentUserName.value = user.name
    currentUserPhotoUrl.value = user.photo_url
  } catch {
    currentUserName.value = null
    currentUserPhotoUrl.value = null
  }
})
</script>
