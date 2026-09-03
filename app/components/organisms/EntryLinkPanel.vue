<template>
  <div class="flex flex-col gap-4">
    <!--
      DOM order is load-bearing (design D4): disclosure, THEN expiry, THEN
      the URL, THEN Copy/Generate. A toast shown after copy would be too
      late by construction — the exchange consumes the jti before evaluating
      whether it can proceed, so opening the link even once (to "check it
      works") spends it.
    -->
    <Alert variant="warning" data-testid="entry-link-disclosure">
      <AlertDescription>{{ $t('entryLink.disclosure') }}</AlertDescription>
    </Alert>

    <p class="text-muted-foreground text-sm" data-testid="entry-link-expiry">
      {{ $t('entryLink.expiresAt') }}
      <FormattedDate :value="link.expires_at" :locale="locale" show-zone />
    </p>

    <p class="bg-muted rounded-lg p-3 font-mono text-sm break-all" data-testid="entry-link-url">
      {{ link.entry_url }}
    </p>

    <Alert v-if="copyHint" variant="default" data-testid="entry-link-copy-hint">
      <AlertDescription>{{ $t('entryLink.copyBlocked') }}</AlertDescription>
    </Alert>

    <div class="flex gap-2">
      <Button :disabled="copyDisabled" data-testid="entry-link-copy" @click="onCopy">
        {{ copied ? $t('entryLink.copied') : $t('entryLink.copy') }}
      </Button>
      <Button variant="outline" data-testid="entry-link-generate" @click="$emit('generate')">
        {{ $t('entryLink.generate') }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
// EntryLinkPanel — the ONE shared organism rendered by both surfaces
// (participant-detail re-issue, project-row invite). A security disclosure
// duplicated across two components is a security disclosure that drifts
// (design D4).
import { ref, computed } from 'vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import FormattedDate from '@/components/atoms/FormattedDate.vue'

export interface EntryLink {
  entry_url: string
  expires_at: string
}

const props = defineProps<{
  link: EntryLink
  locale: string
}>()

defineEmits<{
  (e: 'generate'): void
}>()

const copied = ref(false)
const copyFailed = ref(false)

// Clipboard failure is designed out, not handled (design D6): the URL above
// is ALWAYS rendered as selectable text before this button exists, so a
// denied/unavailable clipboard degrades to manual selection with nothing
// lost. `navigator.clipboard === undefined` (an insecure http:// context)
// disables the button up front, with the SAME hint, rather than throwing on
// click — a `document.execCommand('copy')` fallback was rejected as
// deprecated and silently no-op in several browsers.
const clipboardAvailable = typeof navigator !== 'undefined' && navigator.clipboard !== undefined

const copyDisabled = computed(() => !clipboardAvailable)
const copyHint = computed(() => !clipboardAvailable || copyFailed.value)

async function onCopy(): Promise<void> {
  if (!clipboardAvailable) return

  try {
    await navigator.clipboard.writeText(props.link.entry_url)
    copied.value = true
    copyFailed.value = false
  } catch {
    // Not a silent catch (D6's addition over the ApiKeysPanel precedent):
    // the URL above remains selectable, so nothing is lost — but the
    // operator is told explicitly rather than left to wonder why nothing
    // happened.
    copyFailed.value = true
  }
}
</script>
