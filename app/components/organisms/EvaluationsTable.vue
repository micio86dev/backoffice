<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>{{ $t('reports.table.candidate') }}</TableHead>
        <TableHead>{{ $t('reports.table.project') }}</TableHead>
        <TableHead>{{ $t('reports.table.assessmentType') }}</TableHead>
        <TableHead>{{ $t('reports.table.roleCode') }}</TableHead>
        <TableHead>{{ $t('reports.table.evaluatedAt') }}</TableHead>
        <TableHead>{{ $t('reports.table.status') }}</TableHead>
        <TableHead>{{ $t('reports.table.reliability') }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableEmpty v-if="rows.length === 0" :colspan="7">
        {{ $t('reports.table.empty') }}
      </TableEmpty>
      <TableRow v-for="row in rows" :key="row.participant_id">
        <TableCell>
          <NuxtLink
            :to="`/participants/${row.participant_id}`"
            :data-testid="`evaluation-row-link-${row.participant_id}`"
            class="text-foreground font-medium hover:underline"
          >
            {{ row.display_name }}
          </NuxtLink>
        </TableCell>
        <TableCell>{{ row.project_name }}</TableCell>
        <TableCell>{{ $t(`projects.assessmentType.${row.assessment_type}`) }}</TableCell>
        <TableCell>{{ row.role_code }}</TableCell>
        <TableCell>{{ formatDate(row.evaluated_at, locale) }}</TableCell>
        <TableCell>{{ $t(`reports.filters.status${capitalize(row.status)}`) }}</TableCell>
        <TableCell>
          <!--
            The lifecycle read-gate (D6) is a JOIN PREDICATE server-side: a
            participant below `completato` is structurally absent from this
            endpoint's response, not present with a nulled score. This
            branch covers the one real edge case the resource itself
            documents — `reliability: null` when the page's grouped
            aggregate found no `competency_results` row yet — and renders
            status only, never implying a score exists.
          -->
          <span v-if="row.reliability !== null">{{ row.reliability }}</span>
          <span v-else class="text-muted-foreground">{{ $t('reports.table.notYetScored') }}</span>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>

<script setup lang="ts">
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/utils/format'
import type { components } from '../../../types/api'

export type EvaluationRow = components['schemas']['EvaluationIndexResource']

defineProps<{
  rows: EvaluationRow[]
}>()

const { locale } = useI18n()

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
</script>
