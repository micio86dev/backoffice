<template>
  <div class="flex flex-col gap-1">
    <p class="text-foreground text-sm font-medium">{{ indicator }}</p>
    <ul v-if="excerpts.length > 0" class="flex flex-col gap-1">
      <li
        v-for="(excerpt, index) in excerpts"
        :key="index"
        class="font-mono text-muted-foreground text-xs"
      >
        "{{ excerpt }}"
      </li>
    </ul>
    <p v-else class="text-muted-foreground text-xs italic">{{ $t('report.excerpts.empty') }}</p>
  </div>
</template>

<script setup lang="ts">
// Verbatim transcript excerpts for one BARS indicator (DESIGN.md §8.3:
// `--font-mono`, never reworded/truncated — the API already validates these
// by substring match against the transcript, never invented client-side).
defineProps<{
  indicator: string
  excerpts: string[]
}>()
</script>
