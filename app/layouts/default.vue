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
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import SidebarNav from '@/components/organisms/SidebarNav.vue'
import NavBar from '@/components/organisms/NavBar.vue'
</script>
