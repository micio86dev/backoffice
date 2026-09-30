<template>
  <!--
    Marks a template BEAI owns (scope `platform`) wherever it is shown next to
    the organization's own. Text is always present, colour is never the only
    signal. Primary tint (`text-primary` on `bg-primary/10`, 6.91:1) rather than
    a bare lavender: DESIGN.md §9.1 puts lavender text below AA on white.
  -->
  <Badge variant="outline" class="border-transparent bg-primary/10 text-primary">
    <slot />
  </Badge>
</template>

<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
</script>
