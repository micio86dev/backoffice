<template>
  <span>{{ display }}</span>
</template>

<script setup lang="ts">
// FormattedDate — the single render path for any `*_at` field
// (admin-backoffice spec, "i18n and Locale-Aware Formatting"; design.md D1).
// Wraps `formatDate` (app/utils/format.ts:6-11) WITHOUT changing its
// signature — `show-zone` is an additive, opt-in prop, not a signature
// change. See format.ts's module docblock for the UTC-source /
// browser-local-display convention this atom renders under.
import { computed } from 'vue'
import { formatDate } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    value: string | null
    locale: string
    showZone?: boolean
  }>(),
  { showZone: false }
)

/**
 * Locale-aware timezone abbreviation ("CEST", "GMT+2") — `formatToParts`
 * rather than string surgery, and `timeZoneName: 'short'` rather than
 * `resolvedOptions().timeZone`, because the former is locale-aware and the
 * latter is not (design.md D9).
 */
const zoneSuffix = computed(() => {
  if (!props.value) return null

  return new Intl.DateTimeFormat(props.locale, { timeZoneName: 'short' })
    .formatToParts(new Date(props.value))
    .find((part) => part.type === 'timeZoneName')?.value
})

const display = computed(() => {
  const formatted = formatDate(props.value, props.locale)
  if (!props.value || !props.showZone || !zoneSuffix.value) return formatted

  return `${formatted} ${zoneSuffix.value}`
})
</script>
