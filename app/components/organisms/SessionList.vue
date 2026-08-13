<template>
  <section class="flex flex-col gap-3" aria-labelledby="sessions-heading">
    <h2 id="sessions-heading" class="text-lg font-semibold text-foreground">
      {{ $t('review.sessions.title') }}
    </h2>

    <p
      v-if="sessions.length === 0"
      class="text-sm text-muted-foreground"
      data-testid="sessions-empty"
    >
      {{ $t('review.sessions.none') }}
    </p>

    <Table v-else data-testid="sessions-table">
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t('review.sessions.competency') }}</TableHead>
          <TableHead>{{ $t('review.sessions.startedAt') }}</TableHead>
          <TableHead>{{ $t('review.duration') }}</TableHead>
          <TableHead>{{ $t('review.sessions.events') }}</TableHead>
          <TableHead
            ><span class="sr-only">{{ $t('review.sessions.open') }}</span></TableHead
          >
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="session in sessions" :key="session.id">
          <TableCell>{{ session.competency_code }}</TableCell>
          <TableCell>{{
            session.started_at ? formatDate(session.started_at, locale) : '–'
          }}</TableCell>
          <TableCell>{{ durationLabel(session.duration_seconds) }}</TableCell>
          <TableCell>{{ session.integrity_event_count }}</TableCell>
          <TableCell class="text-right">
            <Button
              variant="outline"
              size="sm"
              :data-testid="`session-open-${session.id}`"
              @click="navigateTo(`/interview-sessions/${session.id}`)"
            >
              {{ $t('review.sessions.open') }}
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </section>
</template>

<script setup lang="ts">
/**
 * A participant's interview sessions, as a way in to each review.
 *
 * Deliberately thin: it exists so an operator can pick a session, not to be a
 * review of its own. Loading every session's events and minting signed snapshot
 * URLs for all of them would make a list pay for detail nobody asked for yet.
 */
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/utils/format'
import type { SessionSummary } from '@/composables/useSessionReview'

defineProps<{
  sessions: SessionSummary[]
  locale: string
}>()

const { t } = useI18n()

function durationLabel(seconds: number | null): string {
  if (seconds === null) return '–'

  return t('review.durationValue', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 })
}
</script>
