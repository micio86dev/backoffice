<template>
  <header class="flex items-start justify-between gap-6">
    <div class="flex max-w-[65ch] flex-col gap-1.5">
      <h1 class="text-2xl font-semibold tracking-tight text-foreground">{{ title }}</h1>
      <p v-if="subtitle" class="text-sm text-muted-foreground">{{ subtitle }}</p>
    </div>

    <!-- Page-level actions sit on the header's baseline rather than floating
         above the content, so "New project" is visibly an action ON this page
         and not a stray button. -->
    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
/**
 * The one page header for every backoffice route.
 *
 * Written because the six routes had four different headers: some an `<h1>`
 * alone, some an `<h1>` with a subtitle, some an `<h1>` in a flex row with a
 * button, each with its own spacing. The result was a title that shifted
 * position as you moved between pages, and half the routes never explaining
 * what they were for — the operator had to open a page to find out whether it
 * was the one they wanted.
 *
 * `subtitle` is optional but should be filled: one line saying what the page is
 * for costs nothing and answers the question every first-time operator has.
 */
defineProps<{
  title: string
  subtitle?: string
}>()
</script>
