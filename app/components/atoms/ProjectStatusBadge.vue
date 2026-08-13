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

const VARIANT_BY_STATUS: Record<string, NonNullable<BadgeVariants['variant']>> = {
  draft: 'outline',
  active: 'default',
  archived: 'secondary',
}

const variant = computed<NonNullable<BadgeVariants['variant']>>(
  () => VARIANT_BY_STATUS[props.status] ?? 'outline'
)
</script>
