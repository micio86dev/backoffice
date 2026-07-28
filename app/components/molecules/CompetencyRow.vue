<template>
  <TableRow>
    <TableCell class="font-medium">{{ code }}</TableCell>
    <TableCell>
      <CompetencyMean :mean="result.score" :locale="locale" />
    </TableCell>
    <TableCell>
      <ReliabilityBadge :reliability="result.reliability" />
    </TableCell>
    <TableCell>
      <ul :aria-label="`${$t('report.table.indicators')} — ${code}`" class="flex flex-wrap gap-1">
        <li v-for="(behavior, index) in result.behaviors" :key="index">
          <ScoreChip :score="behavior.score" />
        </li>
      </ul>
    </TableCell>
  </TableRow>
</template>

<script setup lang="ts">
// One BARS competency row (DESIGN.md §8.3/§5) — code, mean, reliability, and
// an indicator chip strip. Presentational: EvaluationReport owns the fetch
// and the surrounding <Table>.
import { TableRow, TableCell } from '@/components/ui/table'
import CompetencyMean from '@/components/atoms/CompetencyMean.vue'
import ReliabilityBadge from '@/components/atoms/ReliabilityBadge.vue'
import ScoreChip from '@/components/atoms/ScoreChip.vue'
import type { EvaluationCompetencyResult } from '@/composables/useEvaluationReport'

defineProps<{
  code: string
  result: EvaluationCompetencyResult
  locale: string
}>()
</script>
