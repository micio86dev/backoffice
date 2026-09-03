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
    <!--
      A superadmin gets the SWITCHER in the place an ordinary operator sees
      their organization's name, and that is the right substitution rather
      than an addition: both answer the same question — which tenant am I
      acting in — and showing a fixed name beside a control that changes it
      would put two answers in one topbar.
    -->
    <ClientSwitcher
      v-if="isSuperadmin"
      :clients="clients"
      :acting-client-id="actingClientId"
      @change="onSwitchClient"
    />
    <p
      v-else-if="organizationName"
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
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useSuperadmin, type Client } from '@/composables/useSuperadmin'
import ClientSwitcher from '@/components/organisms/ClientSwitcher.vue'

const organizationName = ref<string | null>(null)
const isSuperadmin = ref(false)
const clients = ref<Client[]>([])
const actingClientId = ref<number | null>(null)

/**
 * RELOAD after switching, rather than refreshing state in place.
 *
 * Every list, count and report on the screen was fetched under the previous
 * selection. Re-fetching them one by one would leave whichever component the
 * next developer forgets showing another tenant's data — in a product whose
 * binding constraint is that this must never happen. A reload is the only
 * version of this that cannot be half-done.
 *
 * It reloads on failure too: the server is the authority on which client is
 * selected, so the page comes back showing whatever it actually recorded
 * rather than what the select optimistically displayed.
 */
async function onSwitchClient(clientId: number | null): Promise<void> {
  try {
    await useSuperadmin().setActingClient(clientId)
  } finally {
    window.location.reload()
  }
}

onMounted(async () => {
  try {
    // The shell's identity contract, cached once per page load — so the
    // switcher exists before the first navigation rather than after a second
    // request.
    const me = await useCurrentUser().ensureLoaded()
    isSuperadmin.value = me.user.is_superadmin === true

    if (isSuperadmin.value) {
      const response = await useSuperadmin().fetchClients()
      clients.value = response.data
      actingClientId.value = response.acting_organization_id ?? null

      // A superadmin has no organization of their own, so there is no name to
      // fetch and the request below would 404 on every page load.
      return
    }
  } catch {
    // Same doctrine as below: identity failures on the login-adjacent routes
    // must not make the topbar shout.
  }

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
