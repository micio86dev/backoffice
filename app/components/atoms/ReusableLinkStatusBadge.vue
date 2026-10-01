<template>
  <Badge :variant="variant">{{ $t(`reusableLinks.status.${status}`) }}</Badge>
</template>

<script setup lang="ts">
// Reusable link status badge (DESIGN.md 16.18), mirroring ProjectStatusBadge.vue:
// it maps onto Badge's own pre-verified-contrast status variants and never a
// custom class. The word is rendered in every state, so colour is never the only
// signal that a link is live or switched off.
import { computed } from 'vue'
import { Badge, type BadgeVariants } from '@/components/ui/badge'
import type { ReusableLink } from '@/composables/useReusableLinks'

const props = defineProps<{
  // The generated union, so a state the api adds is a compile error here rather
  // than a badge that silently falls back to the wrong look.
  status: ReusableLink['status']
}>()

// Live is good (the same `success` an active project carries); disabled is inert
// and final, the same `neutral` an archived project carries. Not `destructive`:
// disabling is something the operator did on purpose, not a failure.
const VARIANT_BY_STATUS: Record<ReusableLink['status'], NonNullable<BadgeVariants['variant']>> = {
  active: 'success',
  disabled: 'neutral',
}

const variant = computed(() => VARIANT_BY_STATUS[props.status])
</script>
