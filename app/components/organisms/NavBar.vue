<template>
  <header class="flex h-(--spacing-nav) items-center gap-4 border-b border-border px-4">
    <SidebarTrigger />

    <!--
      The organization is not decoration on a multi-tenant admin: every list,
      every report and every key on these screens is scoped to one tenant, and
      an operator with access to more than one has no other way to tell which
      one they are acting in. Silent on failure — the org name is context, and
      a topbar that renders an error would be louder than the thing it reports.
    -->
    <p
      v-if="organizationName"
      class="truncate text-sm font-medium text-foreground"
      data-testid="navbar-organization"
    >
      {{ organizationName }}
    </p>

    <div class="flex-1" />
    <HelpSheet />
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
import { ref, onMounted } from 'vue'
import { ArrowRightOnRectangleIcon } from '@heroicons/vue/24/outline'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import HelpSheet from '@/components/organisms/HelpSheet.vue'
import { useAuth } from '@/composables/useAuth'
import { useOrganization } from '@/composables/useOrganization'

const organizationName = ref<string | null>(null)

onMounted(async () => {
  try {
    organizationName.value = (await useOrganization().fetchOrganization()).data.name
  } catch {
    // Context, not content: on the login-adjacent routes or a transient
    // failure the topbar simply omits it rather than showing an error.
    organizationName.value = null
  }
})

async function onLogout(): Promise<void> {
  await useAuth().logout()
}
</script>
