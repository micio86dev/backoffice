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
          @change="onFileChosen"
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

    <!--
      The file is already fully parsed at this point — the dialog names WHAT
      is about to be imported (count + names), not a bare "are you sure?"
      (design.md D8). A parse/shape failure never reaches here; it goes
      straight to the banner above.
    -->
    <ConfirmDialog
      :open="pendingImport !== null"
      :title="
        $t('avatar_templates.confirm.importTitle', { count: pendingImport?.names.length ?? 0 })
      "
      :description="importDescription"
      :confirm-label="$t('avatar_templates.portability.import')"
      @confirm="onImportConfirmed"
      @cancel="onImportCancelled"
    />
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
import { computed, ref } from 'vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import { useAvatarTemplates } from '@/composables/useAvatarTemplates'

defineProps<{ isAdmin: boolean }>()
const emit = defineEmits<{ (e: 'imported'): void }>()

const { t } = useI18n()
const { exportTemplates, importTemplates } = useAvatarTemplates()

const picker = ref<HTMLInputElement | null>(null)
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)

// The count and names to preview — the content, not a generic warning, IS
// the confirmation (design.md D8). Preview cutoff: every name when 10 or
// fewer, otherwise the first 10 plus "+N more" — a preview that hides what
// is about to be applied is not a preview.
const PREVIEW_CUTOFF = 10

interface PendingImport {
  document: Record<string, unknown>
  names: string[]
}

const pendingImport = ref<PendingImport | null>(null)

const importDescription = computed(() => {
  if (pendingImport.value === null) return ''
  const { names } = pendingImport.value
  const shown = names.slice(0, PREVIEW_CUTOFF)
  const remaining = names.length - shown.length
  const list = remaining > 0 ? `${shown.join(', ')}, +${remaining} more` : shown.join(', ')

  return t('avatar_templates.confirm.importDescription', { count: names.length, names: list })
})

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

/**
 * Reads and parses the chosen file, validating only the shape needed to
 * preview it (`templates` is an array). A file that fails either step NEVER
 * reaches the confirmation dialog — it reports through the existing
 * `message` banner, so a parse error is not disguised as a scary
 * confirmation (design.md D8). The network call happens only in
 * `onImportConfirmed`, below.
 */
async function onFileChosen(event: Event): Promise<void> {
  message.value = null

  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  try {
    const parsed = JSON.parse(await file.text()) as Record<string, unknown>
    const templates = parsed.templates
    if (!Array.isArray(templates)) {
      throw new TypeError('Malformed import document: "templates" is not an array.')
    }

    const names = templates.map((entry, index) => {
      const name = (entry as { name?: unknown })?.name
      return typeof name === 'string' && name !== '' ? name : `#${index + 1}`
    })

    pendingImport.value = { document: parsed, names }
  } catch {
    message.value = {
      kind: 'error',
      text: t('avatar_templates.portability.importFailed', {
        reason: t('avatar_templates.portability.parseError'),
      }),
    }
    if (picker.value) picker.value.value = ''
  }
}

async function onImportConfirmed(): Promise<void> {
  if (pendingImport.value === null) return
  const { document: document_ } = pendingImport.value
  pendingImport.value = null

  try {
    const result = await importTemplates(document_)

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

function onImportCancelled(): void {
  pendingImport.value = null
  if (picker.value) picker.value.value = ''
}
</script>
