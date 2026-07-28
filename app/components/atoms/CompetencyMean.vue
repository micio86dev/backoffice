<template>
  <span class="font-bold" :class="colorClass">{{ display }}</span>
</template>

<script setup lang="ts">
// Competency-level mean score (DESIGN.md §8.3). Colored by threshold, using
// the same *-dark accessible tokens as ScoreChip — see ScoreChip.vue for why
// the plain --color-success/--color-warning tokens are unsafe for text.
import { computed } from 'vue'
import { competencyMeanState } from '@/utils/bars'
import { formatCompetencyMean } from '@/utils/format'

const props = defineProps<{
  mean: number | null
  locale: string
}>()

const state = computed(() => competencyMeanState(props.mean))

const display = computed(() => formatCompetencyMean(props.mean, props.locale))

const colorClass = computed(() => {
  switch (state.value) {
    case 'error':
      return 'text-destructive'
    case 'warning':
      return 'text-warning-dark'
    case 'success':
      return 'text-success-dark'
    default:
      return 'text-muted-foreground'
  }
})
</script>
