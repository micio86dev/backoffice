<template>
  <!--
    Rendered only for admins. Not disabled, not hidden behind a tooltip: an
    operator who has no use for these should not have to discover that by
    pressing them.
  -->
  <div v-if="isAdmin" class="flex flex-col gap-3" data-testid="template-portability">
    <div class="flex items-center gap-2">
      <Button variant="outline" size="sm" data-testid="template-export" @click="onExport">
        {{ $t('avatar_templates.portability.export') }}
      </Button>

      <Button variant="outline" size="sm" data-testid="template-import" @click="picker?.click()">
        {{ $t('avatar_templates.portability.import') }}
      </Button>

      <!--
        The picker is hidden and driven by the visible button above, so its
        label is screen-reader only. Nested AND paired by id: the accessibility
        rule wants both, and WCAG is satisfied either way.
      -->
      <label class="sr-only" for="template-import-input">
        {{ $t('avatar_templates.portability.import') }}
        <input
          id="template-import-input"
          ref="picker"
          type="file"
          accept="application/json,.json"
          class="hidden"
          data-testid="template-import-input"
          @change="onImport"
        />
      </label>
    </div>

    <Alert
      v-if="message"
      :variant="message.kind === 'error' ? 'destructive' : 'default'"
      data-testid="portability-result"
    >
      <AlertDescription>{{ message.text }}</AlertDescription>
    </Alert>
  </div>
</template>

<script setup lang="ts">
/**
 * Export / import of avatar template configuration (C14 portability).
 *
 * The import result is always reported. A silent partial import leaves the
 * operator believing a configuration is present when it is not — and they find
 * out at interview time, on a candidate.
 */
import { ref } from 'vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAvatarTemplates } from '@/composables/useAvatarTemplates'

defineProps<{ isAdmin: boolean }>()
const emit = defineEmits<{ (e: 'imported'): void }>()

const { t } = useI18n()
const { exportTemplates, importTemplates } = useAvatarTemplates()

const picker = ref<HTMLInputElement | null>(null)
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)

async function onExport(): Promise<void> {
  message.value = null

  try {
    const document_ = await exportTemplates()
    const blob = new Blob([JSON.stringify(document_, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'beai-avatar-templates.json'
    link.click()
    URL.revokeObjectURL(url)
  } catch {
    message.value = {
      kind: 'error',
      text: t('avatar_templates.portability.importFailed', { reason: '—' }),
    }
  }
}

async function onImport(event: Event): Promise<void> {
  message.value = null

  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  try {
    const parsed = JSON.parse(await file.text()) as Record<string, unknown>
    const result = await importTemplates(parsed)

    message.value = {
      kind: 'ok',
      text: t('avatar_templates.portability.importDone', { count: result.data.length }),
    }
    emit('imported')
  } catch (error) {
    // The server's own reason is shown rather than a generic failure: "unknown
    // key voiceSpeedd" is actionable, "import failed" is not.
    const reason = (error as { data?: { errors?: Record<string, string[]> } })?.data?.errors
      ? Object.values((error as { data: { errors: Record<string, string[]> } }).data.errors)
          .flat()
          .join(' ')
      : String((error as Error)?.message ?? '')

    message.value = {
      kind: 'error',
      text: t('avatar_templates.portability.importFailed', { reason }),
    }
  } finally {
    if (picker.value) picker.value.value = ''
  }
}
</script>
