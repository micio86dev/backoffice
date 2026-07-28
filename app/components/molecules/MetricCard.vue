<template>
  <Card>
    <CardHeader>
      <CardDescription>{{ label }}</CardDescription>
      <CardTitle class="text-2xl">{{ value }}</CardTitle>
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
}>()
</script>
