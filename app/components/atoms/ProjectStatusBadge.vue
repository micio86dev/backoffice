<template>
  <Badge :variant="variant">{{ $t(`projects.status.${status}`) }}</Badge>
</template>

<script setup lang="ts">
// Project lifecycle status badge (D8), mirroring StatusBadge.vue's pattern:
// maps onto Badge's own pre-verified-contrast variants, never a custom class.
import { computed } from 'vue'
import { Badge, type BadgeVariants } from '@/components/ui/badge'

const props = defineProps<{
  status: string
}>()

// `active` was `default`, i.e. `bg-primary` — the Quint purple. A lifecycle
// status rendered in the brand colour tells you a state exists without telling
// you anything about it, and spends the brand's most emphatic colour saying
// nothing. These map onto MEANING instead: live is good, archived is inert,
// draft is not yet anything.
const VARIANT_BY_STATUS: Record<string, NonNullable<BadgeVariants['variant']>> = {
  draft: 'outline',
  active: 'success',
  archived: 'neutral',
}

const variant = computed<NonNullable<BadgeVariants['variant']>>(
  () => VARIANT_BY_STATUS[props.status] ?? 'outline'
)
</script>
