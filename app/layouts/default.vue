<template>
  <SidebarProvider>
    <SidebarNav />
    <SidebarInset>
      <NavBar />
      <div class="flex-1 px-(--spacing-section) py-(--spacing-panel)">
        <slot />
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>

<script setup lang="ts">
// Admin shell layout (DESIGN.md §8.1): sidebar + top nav + fluid content area.
// Applied to every page EXCEPT /login and /unsupported, which opt out via
// definePageMeta({ layout: false }) — those are pre-auth/pre-gate surfaces
// and must never render the authenticated nav chrome.
import { onMounted } from 'vue'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import SidebarNav from '@/components/organisms/SidebarNav.vue'
import NavBar from '@/components/organisms/NavBar.vue'
import { useOrganization } from '@/composables/useOrganization'
import { applyBrandColor } from '@/composables/useBrandTheme'

/**
 * Paint the organization's colour once the shell mounts.
 *
 * HERE rather than in each page: `--primary` is set on `:root`, so it has to be
 * applied once for the whole authenticated area, and this layout is the single
 * thing every authenticated page passes through. Doing it per page would
 * re-request the organization on every navigation and flash the product colour
 * in between.
 *
 * A failed read is SILENT and leaves the product palette in place. Branding is
 * chrome: an operator who cannot load their logo still needs the panel to work,
 * and an error banner about a colour would be noise on top of whatever real
 * problem caused it.
 */
const { fetchOrganization } = useOrganization()

onMounted(async () => {
  try {
    const response = await fetchOrganization()
    applyBrandColor(response.data.primary_color)
  } catch {
    // Deliberately empty — see above.
  }
})
</script>
