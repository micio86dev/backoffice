<template>
  <span
    class="border-border inline-flex items-center gap-1 rounded-md border bg-transparent px-1.5 py-0.5 text-sm font-medium"
    :class="colorClass"
  >
    <CheckCircleIcon v-if="state === 'success'" aria-hidden="true" class="size-4" />
    <ArrowUpCircleIcon v-else-if="state === 'above-mid'" aria-hidden="true" class="size-4" />
    <ExclamationTriangleIcon v-else-if="state === 'warning'" aria-hidden="true" class="size-4" />
    <ArrowDownCircleIcon v-else-if="state === 'below-mid'" aria-hidden="true" class="size-4" />
    <XCircleIcon v-else-if="state === 'error'" aria-hidden="true" class="size-4" />
    <ExclamationCircleIcon v-else-if="state === 'invalid'" aria-hidden="true" class="size-4" />
    <MinusCircleIcon v-else aria-hidden="true" class="size-4" />
    <span aria-hidden="true">{{ display }}</span>
    <span class="sr-only">{{ $t(labelKey, labelParams) }}</span>
  </span>
</template>

<script setup lang="ts">
// Single BARS indicator score (DESIGN.md §8.3, D1/D6). Seven states: three
// authored anchors (1/3/5), two residual levels (2/4, dashed border —
// selected only when the evidence matches neither bounding anchor), the
// neutral unassessable sentinel, and the loud out-of-domain `invalid` state.
// Independent signals carry the meaning — numeral text, icon shape, border
// style, and color — so color alone never conveys the state (WCAG 2.1 AA
// 1.4.1). Colors use the *-dark semantic tokens (DESIGN.md §9.1): the plain
// --color-success/--color-warning tokens measure well under the 3:1 AA floor
// for text/icon use (the exact contrast bug already found and fixed for
// status badges in PR B2). `invalid` uses `--destructive` on
// `--color-error-light` (≈5.30:1 AA, DESIGN.md §9.1).
//
// `invalid` renders `String(props.score)` VERBATIM — never `–` — so an
// out-of-domain value (a data-integrity bug) is never laundered into the
// neutral "not assessable" chip, which would hide the defect from the
// operator (D6).
import {
  CheckCircleIcon,
  ArrowUpCircleIcon,
  ExclamationTriangleIcon,
  ArrowDownCircleIcon,
  XCircleIcon,
  ExclamationCircleIcon,
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
    case 'below-mid':
      return 'report.chip.belowMid'
    case 'warning':
      return 'report.chip.mid'
    case 'above-mid':
      return 'report.chip.aboveMid'
    case 'success':
      return 'report.chip.high'
    case 'invalid':
      return 'report.chip.invalid'
    default:
      return 'report.chip.unassessable'
  }
})

// `invalid` interpolates the raw out-of-domain value into its label; every
// other state ignores this (harmless extra param).
const labelParams = computed(() => ({ score: props.score }))

const colorClass = computed(() => {
  switch (state.value) {
    case 'error':
      return 'text-destructive border-destructive/40'
    case 'below-mid':
      return 'text-destructive border-destructive/40 border-dashed'
    case 'warning':
      return 'text-warning-dark border-warning-dark/40'
    case 'above-mid':
      return 'text-success-dark border-success-dark/40 border-dashed'
    case 'success':
      return 'text-success-dark border-success-dark/40'
    case 'invalid':
      return 'text-destructive bg-error-light border-destructive'
    default:
      return 'text-muted-foreground'
  }
})
</script>
