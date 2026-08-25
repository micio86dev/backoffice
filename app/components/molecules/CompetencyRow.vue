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
      <div v-if="unscorableKey" class="flex items-start gap-1.5 text-muted-foreground text-xs">
        <ExclamationTriangleIcon class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>{{ $t(unscorableKey, { reason: result.unscorable_reason }) }}</span>
      </div>
      <ul
        v-else
        :aria-label="`${$t('report.table.indicators')} — ${code}`"
        class="flex flex-wrap gap-1"
      >
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
//
// unscorable_reason (scoring-failure-containment D11): the Indicators cell —
// today an empty <ul>, which IS the visual hole — renders the reason
// instead, muted, on the SAME row as the Mean ('–') and Reliability ('0%')
// badges. Both those values stay exactly as they are: they are TRUE, and
// hiding a true value to make room for the explanation would be a second
// lie.
import { computed } from 'vue'
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline'
import { TableRow, TableCell } from '@/components/ui/table'
import CompetencyMean from '@/components/atoms/CompetencyMean.vue'
import ReliabilityBadge from '@/components/atoms/ReliabilityBadge.vue'
import ScoreChip from '@/components/atoms/ScoreChip.vue'
import { unscorableReasonKey } from '@/utils/bars'
import type { EvaluationCompetencyResult } from '@/composables/useEvaluationReport'

const props = defineProps<{
  code: string
  result: EvaluationCompetencyResult
  locale: string
}>()

const unscorableKey = computed(() => unscorableReasonKey(props.result.unscorable_reason))
</script>
