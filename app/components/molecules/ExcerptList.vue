<template>
  <ul v-if="excerpts.length > 0" class="flex flex-col gap-1">
    <li
      v-for="(excerpt, index) in excerpts"
      :key="index"
      class="text-muted-foreground border-border border-l-2 pl-3 font-mono text-xs"
    >
      "{{ excerpt }}"
    </li>
  </ul>
  <p v-else class="text-muted-foreground text-xs italic">{{ $t('report.excerpts.empty') }}</p>
</template>

<script setup lang="ts">
// Verbatim transcript excerpts for one BARS indicator (DESIGN.md §8.3:
// `--font-mono`, never reworded/truncated — the API already validates these
// by substring match against the transcript, never invented client-side).
//
// The `indicator` prop is gone: the indicator text now labels the accordion
// trigger that discloses these excerpts (IndicatorEvidence.vue), so printing
// it again inside the disclosure would repeat the heading the operator just
// clicked. This component is the evidence and nothing else.
defineProps<{
  excerpts: string[]
}>()
</script>
