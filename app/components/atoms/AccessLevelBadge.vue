<template>
  <Badge :variant="variant">{{ label }}</Badge>
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

const { t, te } = useI18n()

const VARIANT_BY_ROLE: Record<string, NonNullable<BadgeVariants['variant']>> = {
  // A superadmin holds no organization role — `getRoleNames()` is empty for
  // them — so every surface that read that field fell to its default and told
  // the one person who can do anything that they were an observer.
  superadmin: 'destructive',
  admin: 'default',
  operator: 'secondary',
  viewer: 'outline',
}

const variant = computed<NonNullable<BadgeVariants['variant']>>(
  () => VARIANT_BY_ROLE[props.role] ?? 'outline'
)

/**
 * The variant map had a fallback and the LABEL did not, so an unmapped role
 * printed `users.role.<whatever>` at the operator — a raw i18n key as
 * user-facing copy. `role` is a plain string, so "unmapped" is one API change
 * away, not hypothetical.
 */
const label = computed(() => {
  const key = `users.role.${props.role}`

  return te(key) ? t(key) : t('users.role.unknown')
})
</script>
