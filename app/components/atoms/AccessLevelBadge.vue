<template>
  <Badge :variant="variant">{{ $t(`users.role.${role}`) }}</Badge>
</template>

<script setup lang="ts">
// Auth role badge (D8) — deliberately NOT named RoleBadge: `role`
// (admin/operator/viewer, Spatie authorization) and `role_code`
// (ICO/FLL/MLL/BUL/SRX, BEAI organizational) are unrelated concepts and a
// shared component name would invite conflating them.
import { computed } from 'vue'
import { Badge, type BadgeVariants } from '@/components/ui/badge'

const props = defineProps<{
  role: string
}>()

const VARIANT_BY_ROLE: Record<string, NonNullable<BadgeVariants['variant']>> = {
  admin: 'default',
  operator: 'secondary',
  viewer: 'outline',
}

const variant = computed<NonNullable<BadgeVariants['variant']>>(
  () => VARIANT_BY_ROLE[props.role] ?? 'outline'
)
</script>
