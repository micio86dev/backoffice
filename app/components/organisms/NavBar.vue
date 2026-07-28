<template>
  <header class="flex h-(--spacing-nav) items-center gap-4 border-b border-border px-4">
    <SidebarTrigger />
    <div class="flex-1" />
    <Button
      variant="ghost"
      size="sm"
      data-testid="logout-button"
      :aria-label="$t('nav.logout')"
      @click="onLogout"
    >
      <ArrowRightOnRectangleIcon aria-hidden="true" />
      <span>{{ $t('nav.logout') }}</span>
    </Button>
  </header>
</template>

<script setup lang="ts">
import { ArrowRightOnRectangleIcon } from '@heroicons/vue/24/outline'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/composables/useAuth'

async function onLogout(): Promise<void> {
  await useAuth().logout()
}
</script>
