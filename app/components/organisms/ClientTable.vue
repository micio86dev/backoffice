<template>
  <Table data-testid="clients-table">
    <TableHeader>
      <TableRow>
        <TableHead>{{ $t('clients.table.client') }}</TableHead>
        <TableHead>{{ $t('clients.table.clientSince') }}</TableHead>
        <TableHead>{{ $t('clients.table.projects') }}</TableHead>
        <TableHead>{{ $t('clients.table.candidates') }}</TableHead>
        <TableHead>{{ $t('clients.table.completed') }}</TableHead>
        <TableHead>{{ $t('clients.table.errored') }}</TableHead>
        <TableHead>{{ $t('clients.table.lastActivity') }}</TableHead>
        <TableHead>
          <span class="sr-only">{{ $t('clients.table.actions') }}</span>
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableEmpty v-if="clients.length === 0" :colspan="8" data-testid="clients-table-empty">
        {{ $t('clients.table.empty') }}
      </TableEmpty>
      <TableRow v-for="client in clients" :key="client.id" :data-testid="`client-row-${client.id}`">
        <TableCell>
          <span class="text-foreground font-medium">{{ client.name }}</span>
        </TableCell>
        <!--
          Per-cell testids so an assertion can name the COLUMN it means. Row-wide
          `toContain` could not: `errored: 1` was satisfied by the `1` inside
          `candidates: 10`, so that binding could vanish and the test stayed
          green — and the two date columns had no assertion at all.
        -->
        <TableCell :data-testid="`client-since-${client.id}`">
          <FormattedDate :value="client.created_at" :locale="locale" />
        </TableCell>
        <TableCell :data-testid="`client-projects-${client.id}`">
          {{ formatNumber(client.projects, locale) }}
        </TableCell>
        <TableCell :data-testid="`client-candidates-${client.id}`">
          {{ formatNumber(client.candidates, locale) }}
        </TableCell>
        <TableCell :data-testid="`client-completed-${client.id}`">
          {{ formatNumber(client.completed, locale) }}
        </TableCell>
        <TableCell :data-testid="`client-errored-${client.id}`">
          {{ formatNumber(client.errored, locale) }}
        </TableCell>
        <TableCell :data-testid="`client-last-activity-${client.id}`">
          <FormattedDate :value="client.last_activity_at" :locale="locale" />
        </TableCell>
        <TableCell>
          <!--
            The label carries the CLIENT NAME, and the disabled state carries a
            reason. Both were missing, and both matter for the same reader:
            forty rows produced forty buttons with one identical accessible
            name, which is exactly how a screen reader's element list presents
            them — out of context, with nothing to tell them apart. And "you
            are already acting as this client" was conveyed by grey alone.

            `aria-describedby` pointing at a per-row reason is the shape
            `ProjectTable.vue` already uses for its disabled invite action, and
            `nav.profileLabel` is the interpolated-label pattern SidebarNav
            already uses. Neither is invented here; both were simply skipped.
          -->
          <Button
            variant="outline"
            size="sm"
            :disabled="client.id === actingOrganizationId"
            :aria-describedby="
              client.id === actingOrganizationId
                ? `client-act-as-disabled-reason-${client.id}`
                : undefined
            "
            :data-testid="`client-act-as-${client.id}`"
            @click="onActAsClient(client.id)"
          >
            {{ $t('clients.actAs', { name: client.name }) }}
          </Button>
          <span
            v-if="client.id === actingOrganizationId"
            :id="`client-act-as-disabled-reason-${client.id}`"
            class="sr-only"
            :data-testid="`client-act-as-current-${client.id}`"
          >
            {{ $t('clients.actAsCurrent', { name: client.name }) }}
          </span>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>

<script setup lang="ts">
// The superadmin's client directory (design D5). A page + organism split,
// same as `participants/index.vue` <-> `CandidateTable.vue`: the page owns
// the fetch and the failure state, this organism owns the table and is
// unit-testable without stubbing a fetch.
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import FormattedDate from '@/components/atoms/FormattedDate.vue'
import { formatNumber } from '@/utils/format'
import { useSuperadmin, type ClientOverviewRow } from '@/composables/useSuperadmin'

defineProps<{
  clients: ClientOverviewRow[]
  /** Marks the current row and disables its own "Act as" button. */
  actingOrganizationId: number | null
}>()

const { locale } = useI18n()

/**
 * Byte-for-byte the shape of NavBar.vue's onSwitchClient (design D6),
 * including the reload in `finally` on success AND on failure — every list,
 * count and report on screen was fetched under the previous selection, and a
 * reload is the only version of the switch that cannot be half-done.
 */
async function onActAsClient(clientId: number): Promise<void> {
  try {
    await useSuperadmin().setActingClient(clientId)
  } finally {
    window.location.reload()
  }
}

// Exposed so the failure path (design D6, "A failed switch still reloads")
// can be awaited and caught directly in a unit test. Vue's own runtime
// attaches a `.catch` to a DOM listener's returned promise, but only after
// the native event finishes dispatching — a real gap in a synchronous test
// assertion, and the reason this is not exercised through `trigger('click')`
// for the rejection case.
defineExpose({ onActAsClient })
</script>
