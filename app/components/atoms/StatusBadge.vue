<template>
  <Badge :variant="statusBadgeVariant(status)">{{ $t(`participants.status.${status}`) }}</Badge>
</template>

<script setup lang="ts">
// Participant lifecycle status badge — extracted from CandidateTable.vue /
// pages/participants/[id].vue (PR B2) into a shared atom (DESIGN.md §5).
import { Badge } from '@/components/ui/badge'
import { statusBadgeVariant } from '@/utils/participant-lifecycle'

defineProps<{
  status: string
}>()
</script>
