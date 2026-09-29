<template>
  <Alert
    v-if="shown && layout === 'banner' && key === 'warning'"
    variant="warning"
    role="status"
    data-testid="pal-sync"
    data-status="warning"
    data-layout="banner"
  >
    <AlertTitle>{{ $t('avatar_templates.palSync.bannerTitle') }}</AlertTitle>
    <AlertDescription>
      {{ $t(messageKey) }}
      <span v-if="sync?.synced_at" class="block">
        {{ $t('avatar_templates.palSync.lastSynced') }}
        <FormattedDate data-testid="pal-sync-time" :value="sync.synced_at" :locale="locale" />
      </span>
    </AlertDescription>
  </Alert>

  <div
    v-else-if="shown"
    role="status"
    data-testid="pal-sync"
    :data-status="key"
    :data-layout="layout"
    class="flex flex-col gap-1"
  >
    <span class="flex flex-wrap items-center gap-2">
      <Badge :variant="variant">{{ $t(`avatar_templates.palSync.status.${key}`) }}</Badge>
      <span v-if="sync?.synced_at" class="text-xs text-muted-foreground">
        {{ $t('avatar_templates.palSync.lastSynced') }}
        <FormattedDate data-testid="pal-sync-time" :value="sync.synced_at" :locale="locale" />
      </span>
    </span>
    <p v-if="key === 'warning'" class="text-sm text-warning-dark dark:text-warning">
      {{ $t(messageKey) }}
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * The Tavus persona sync state of one template (DESIGN.md 16.16).
 *
 * A persona Tavus refuses to modify keeps the OLD voice while the operator
 * believes the one they chose is live. This says so, with an actionable
 * message per stable code, wherever a Tavus template is shown. Rendered for
 * Tavus only: a HeyGen template has no persona to sync.
 *
 * `synced_at` is the last SUCCESSFUL sync, so a warning can still say when it
 * last worked.
 */
import { computed } from 'vue'
import FormattedDate from '@/components/atoms/FormattedDate.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { PAL_SYNC_CODES, type PalSync } from '@/types/avatar-template'

const props = withDefaults(
  defineProps<{
    sync?: PalSync | null
    provider: 'heygen' | 'tavus'
    layout?: 'row' | 'banner'
  }>(),
  { sync: null, layout: 'row' }
)

const { locale } = useI18n()

const shown = computed(() => props.provider === 'tavus')
const key = computed<'never' | 'synced' | 'skipped' | 'warning'>(
  () => props.sync?.status ?? 'never'
)
const variant = computed(() => {
  if (key.value === 'synced') return 'success'
  if (key.value === 'warning') return 'warning'

  return 'neutral'
})

// A code this build has no copy for reads as the generic failure, never as the
// raw code or an i18n key.
const messageKey = computed(() => {
  const code = props.sync?.code
  const known = (PAL_SYNC_CODES as readonly string[]).includes(code ?? '')

  return `avatar_templates.warning.${known ? code : 'pal_sync_failed'}`
})
</script>
