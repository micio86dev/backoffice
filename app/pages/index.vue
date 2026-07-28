<template>
  <div>
    <h1 class="text-2xl font-semibold text-foreground">{{ $t('dashboard.title') }}</h1>
  </div>
</template>

<script setup lang="ts">
// Minimal authenticated landing placeholder — anchors the shell (SidebarNav +
// NavBar via layouts/default.vue) and the auth/SA-11 route guards so they are
// exercisable end-to-end. Dashboard KPI cards (usage + AI-cost) are PR B2
// (tasks.md Phase 17), out of scope for this PR.
definePageMeta({
  name: 'dashboard',
})

useHead({
  title: 'Dashboard',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>
