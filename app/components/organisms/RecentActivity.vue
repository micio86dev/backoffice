<template>
  <section class="flex flex-col gap-4" aria-labelledby="recent-activity-heading">
    <h2 id="recent-activity-heading" class="text-lg font-semibold text-foreground">
      {{ $t('dashboard.activity.title') }}
    </h2>

    <!--
      An empty feed is a state, not a failure: a brand-new organization has no
      candidates yet, and a blank panel would read as something broken. It says
      what will fill it and who fills it, because BEAI never creates candidates
      itself (CLAUDE.md, ruling 8).
    -->
    <p v-if="rows.length === 0" class="text-sm text-muted-foreground" data-testid="activity-empty">
      {{ $t('dashboard.activity.empty') }}
    </p>

    <ol v-else class="flex flex-col" data-testid="activity-list">
      <li
        v-for="row in rows"
        :key="`${row.project_name}-${row.candidate_ref}`"
        class="flex items-center gap-4 border-b border-border py-3 last:border-b-0"
      >
        <div class="flex min-w-0 flex-1 flex-col">
          <!--
            A LINK, not a label. The feed exists to answer "is anything
            moving?", and a row that names a candidate without a way to go and
            look sends the reader to the search box on another page — which is
            the trip this panel was added to remove.
          -->
          <NuxtLink
            :to="`/participants/${row.id}`"
            class="truncate text-sm font-medium text-foreground hover:underline"
            data-testid="activity-candidate-link"
            >{{ row.display_name }}</NuxtLink
          >
          <span class="truncate text-xs text-muted-foreground">{{
            row.project_name ?? $t('dashboard.activity.noProject')
          }}</span>
        </div>

        <StatusBadge :status="row.status" />

        <!--
          `datetime` carries the machine-readable instant while the text is
          locale-formatted: the two are not the same value and conflating them
          is how a date ends up unreadable to one of the two audiences.
        -->
        <time
          :datetime="row.updated_at"
          class="w-32 shrink-0 text-right text-xs text-muted-foreground"
        >
          {{ formatDate(row.updated_at, locale) }}
        </time>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
/**
 * The dashboard's recent-activity feed (DESIGN.md §8.2).
 *
 * The dashboard was four counters and 650px of nothing: it said how much work
 * existed but never what had just happened, so the answer to "is anything
 * moving?" lived one page away in the candidate list.
 *
 * Presentational: the page owns the fetch, this owns the rendering. Rows arrive
 * already ordered by the API (most recent first) and already capped, so there
 * is no sorting or slicing here to drift out of step with the server.
 */
import StatusBadge from '@/components/atoms/StatusBadge.vue'
import { formatDate } from '@/utils/format'
import type { DashboardActivityRow } from '@/composables/useDashboardMetrics'

defineProps<{
  rows: DashboardActivityRow[]
  locale: string
}>()
</script>
