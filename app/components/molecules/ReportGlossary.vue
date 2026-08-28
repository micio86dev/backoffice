<template>
  <p class="text-muted-foreground flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
    <span>{{ $t('report.glossary.label') }}</span>
    <HelpTip v-for="term in TERMS" :key="term" :term="term" />
  </p>
</template>

<script setup lang="ts">
/**
 * The vocabulary the BARS grid is written in, explained where the grid is
 * read.
 *
 * HelpSheet (DESIGN.md §8.2.4) already owns the glossary, but it is keyed on
 * the FIRST path segment — on `/participants/{id}` it serves the
 * participants topic (project, status, entry link) and never the scoring
 * words. So the one screen that is entirely made of BARS vocabulary was the
 * one screen where that vocabulary was undefined.
 *
 * Placement is load-bearing in two ways:
 *   - It sits ABOVE the table, where the question ("what is an indicator?")
 *     is actually asked.
 *   - It sits OUTSIDE the `<table>` element, because
 *     tests/e2e/admin-flow.spec.ts screenshots `getByRole('table')` against
 *     four committed baselines, only two of which can be regenerated off CI.
 *
 * `excerpt` is deliberately absent: it belongs beside the evidence that shows
 * excerpts (EvidenceAccordion), not above a grid that shows none.
 */
import HelpTip from '@/components/atoms/HelpTip.vue'

const TERMS = ['competency', 'indicator', 'reliability', 'bars'] as const
</script>
