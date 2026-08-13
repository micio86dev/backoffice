<template>
  <Badge :variant="deactivated ? 'destructive' : 'default'">
    {{ deactivated ? $t('users.state.deactivated') : $t('users.state.active') }}
  </Badge>
</template>

<script setup lang="ts">
import { Badge } from '@/components/ui/badge'

defineProps<{
  deactivated: boolean
}>()
</script>
