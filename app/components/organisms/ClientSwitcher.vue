<template>
  <select
    :value="actingClientId === null ? '' : String(actingClientId)"
    :aria-label="$t('superadmin.switchClient')"
    data-testid="client-switcher"
    class="border-border bg-card text-foreground max-w-56 truncate rounded-md border px-2 py-1 text-sm"
    @change="onChange"
  >
    <!--
      The all-clients option is FIRST and always present. Without it a
      superadmin who picked one client would have no way back to the whole
      view, and the switcher would be a one-way door.
    -->
    <option value="">{{ $t('superadmin.allClients') }}</option>
    <option v-for="client in clients" :key="client.id" :value="String(client.id)">
      {{ client.name }}
    </option>
  </select>
</template>

<script setup lang="ts">
/**
 * Which client a superadmin is looking at.
 *
 * Presentational: props in, events out. The shell owns the API call and the
 * reload that follows, so this is testable without either.
 *
 * A NATIVE <select>, and no new dependency. It is keyboard-operable,
 * announced correctly, and type-to-search in every browser this product
 * supports; a custom listbox would have to re-earn all of that, and this
 * control sits in the topbar of a multi-tenant admin where getting it wrong
 * means acting in the wrong client without noticing.
 *
 * `aria-label` rather than a visible label: a bare select in a topbar is an
 * unlabelled control, because the text it shows is the CURRENT VALUE and says
 * nothing about what changing it does.
 */
import type { Client } from '@/composables/useSuperadmin'

defineProps<{
  clients: Client[]
  actingClientId: number | null
}>()

const emit = defineEmits<{ (e: 'change', clientId: number | null): void }>()

function onChange(event: Event): void {
  const raw = (event.target as HTMLSelectElement).value

  // `null`, never `''`. The API distinguishes them: null clears the selection,
  // while an empty string fails validation as a non-integer and would leave
  // the superadmin scoped to whatever they had before with no visible reason.
  emit('change', raw === '' ? null : Number(raw))
}
</script>
