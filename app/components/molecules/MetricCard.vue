<template>
  <Card>
    <CardHeader>
      <CardDescription>{{ label }}</CardDescription>
      <CardTitle class="text-2xl">{{ value }}</CardTitle>
      <!--
        A second line for the figures that are a sum of parts. The headline
        answers "how much", and without the breakdown the next question — "on
        what" — has no answer on this page at all.
      -->
      <CardDescription v-if="detail" data-testid="metric-card-detail">{{ detail }}</CardDescription>
    </CardHeader>
  </Card>
</template>

<script setup lang="ts">
// Presentational KPI card — label/value arrive already locale-formatted
// (Intl.NumberFormat/Intl.DateTimeFormat happen at the call site, format.ts)
// so this molecule stays free of locale logic (DESIGN.md §5: molecules
// contain UI composition only).
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

defineProps<{
  label: string
  value: string
  /** Optional second line, for a headline figure that is a sum of parts. */
  detail?: string
}>()
</script>
