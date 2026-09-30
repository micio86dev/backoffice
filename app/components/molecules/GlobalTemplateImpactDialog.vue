<template>
  <!--
    A platform template is read LIVE by every project that pins it, in every
    organization (design D1), so an edit, a retire or a delete is not a private
    change. This states how far it reaches BEFORE anything is sent; the caller
    sends nothing until `confirm`, and `cancel` leaves its form values alone.
    DESIGN.md §16.17.
  -->
  <ConfirmDialog
    :open="open"
    :title="$t(`platformTemplates.impact.${action}.title`, { name })"
    :description="description"
    :confirm-label="$t(`platformTemplates.impact.${action}.confirm`)"
    :variant="action === 'delete' ? 'destructive' : 'default'"
    @confirm="emit('confirm')"
    @cancel="emit('cancel')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import type { PlatformTemplateUsage } from '@/types/avatar-template'

const props = defineProps<{
  open: boolean
  action: 'edit' | 'retire' | 'delete'
  name: string
  usage: PlatformTemplateUsage
}>()

const emit = defineEmits<{ (e: 'confirm' | 'cancel'): void }>()

const { t } = useI18n()

/**
 * Usage sentence (only when something uses it) + what this action does to
 * those users. Delete always ends on its own irreversibility sentence, which
 * holds at zero usage too.
 */
const description = computed(() => {
  const inUse = props.usage.project_count > 0
  const usage = inUse
    ? t('platformTemplates.impact.usage', {
        organizations: props.usage.organization_count,
        projects: props.usage.project_count,
      })
    : ''
  const effect =
    inUse || props.action === 'delete' ? t(`platformTemplates.impact.${props.action}.effect`) : ''

  return [usage, effect].filter((part) => part !== '').join(' ')
})
</script>
