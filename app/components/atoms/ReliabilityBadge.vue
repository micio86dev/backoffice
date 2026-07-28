<template>
  <span class="text-muted-foreground text-sm">
    <span class="sr-only">{{ $t('report.reliability') }}:</span>
    {{ reliability }}
  </span>
</template>

<script setup lang="ts">
// Verbatim reliability render (D8, DESIGN.md §8.3) — NEVER map to a
// High/Medium/Low band. No threshold formula is ratified (open product
// decision #1); inventing one here would present an unapproved business rule
// as authoritative.
defineProps<{
  reliability: string
}>()
</script>
