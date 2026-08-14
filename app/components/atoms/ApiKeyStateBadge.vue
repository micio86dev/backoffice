<template>
  <Badge :variant="variant">
    {{ $t(`settings.apiKeys.state.${state}`) }}
  </Badge>
</template>

<script setup lang="ts">
// Three-state badge — active / expired / revoked (design.md D3) — driven by
// `client.state`, server-derived from the SAME predicate
// `ApiClient::scopeActive` uses. Mirrors UserStateBadge.vue.
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  state: 'active' | 'expired' | 'revoked'
}>()

const variant = computed(() => (props.state === 'active' ? 'default' : 'destructive'))
</script>
