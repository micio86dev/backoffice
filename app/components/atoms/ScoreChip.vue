<template>
  <span
    class="border-border inline-flex items-center gap-1 rounded-md border bg-transparent px-1.5 py-0.5 text-sm font-medium"
    :class="colorClass"
  >
    <CheckCircleIcon v-if="state === 'success'" aria-hidden="true" class="size-4" />
    <ExclamationTriangleIcon v-else-if="state === 'warning'" aria-hidden="true" class="size-4" />
    <XCircleIcon v-else-if="state === 'error'" aria-hidden="true" class="size-4" />
    <MinusCircleIcon v-else aria-hidden="true" class="size-4" />
    <span aria-hidden="true">{{ display }}</span>
    <span class="sr-only">{{ $t(labelKey) }}</span>
  </span>
</template>

<script setup lang="ts">
// Single BARS indicator score (DESIGN.md §8.3). Three independent signals
// carry the meaning — numeral text, icon shape, and color — so color alone
// never conveys the state (WCAG 2.1 AA 1.4.1). Colors use the *-dark
// semantic tokens (DESIGN.md §9.1): the plain --color-success/--color-warning
// tokens measure well under the 3:1 AA floor for text/icon use (the exact
// contrast bug already found and fixed for status badges in PR B2).
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  MinusCircleIcon,
} from '@heroicons/vue/24/outline'
import { computed } from 'vue'
import { indicatorChipState } from '@/utils/bars'

const props = defineProps<{
  score: number | null
}>()

const state = computed(() => indicatorChipState(props.score))

const display = computed(() => (state.value === 'unassessable' ? '–' : String(props.score)))

const labelKey = computed(() => {
  switch (state.value) {
    case 'error':
      return 'report.chip.low'
    case 'warning':
      return 'report.chip.mid'
    case 'success':
      return 'report.chip.high'
    default:
      return 'report.chip.unassessable'
  }
})

const colorClass = computed(() => {
  switch (state.value) {
    case 'error':
      return 'text-destructive border-destructive/40'
    case 'warning':
      return 'text-warning-dark border-warning-dark/40'
    case 'success':
      return 'text-success-dark border-success-dark/40'
    default:
      return 'text-muted-foreground'
  }
})
</script>
