<template>
  <div class="flex flex-col gap-6">
    <Table>
      <TableCaption>{{ $t('report.table.caption') }}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t('report.table.competency') }}</TableHead>
          <TableHead>{{ $t('report.table.mean') }}</TableHead>
          <TableHead>{{ $t('report.table.reliability') }}</TableHead>
          <TableHead>{{ $t('report.table.indicators') }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <CompetencyRow
          v-for="(result, code) in evaluation"
          :key="code"
          :code="code"
          :result="result"
          :locale="locale"
        />
      </TableBody>
    </Table>

    <div class="flex flex-col gap-4">
      <h3 class="text-foreground text-sm font-semibold">{{ $t('report.excerpts.title') }}</h3>
      <div v-for="(result, code) in evaluation" :key="code" class="flex flex-col gap-2">
        <p class="text-muted-foreground text-xs font-semibold uppercase">{{ code }}</p>
        <ExcerptList
          v-for="(behavior, index) in result.behaviors"
          :key="index"
          :indicator="behavior.indicator"
          :excerpts="behavior.excerpts"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Full BARS competency grid (D8, DESIGN.md §8.3) — <table> + <caption> +
// per-competency CompetencyRows + per-indicator ExcerptLists. Presentational
// only: the container (participant detail page) fetches the data and
// resolves the 409/403/404/loading states before ever mounting this.
import {
  Table,
  TableBody,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import CompetencyRow from '@/components/molecules/CompetencyRow.vue'
import ExcerptList from '@/components/molecules/ExcerptList.vue'
import type { EvaluationReportData } from '@/composables/useEvaluationReport'

defineProps<{
  evaluation: EvaluationReportData
  locale: string
}>()
</script>
