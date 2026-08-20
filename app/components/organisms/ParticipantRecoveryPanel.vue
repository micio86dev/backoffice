<template>
  <div class="flex flex-col gap-4">
    <p class="text-muted-foreground text-sm">{{ $t('participantRecovery.description') }}</p>

    <template v-if="!confirming && !result">
      <Button
        variant="destructive"
        data-testid="participant-recover-open"
        @click="confirming = true"
      >
        {{ $t('participantRecovery.action') }}
      </Button>
    </template>

    <template v-else-if="confirming">
      <Alert variant="destructive" data-testid="participant-recover-disclosure">
        <AlertTitle>{{ $t('participantRecovery.confirm.title') }}</AlertTitle>
        <AlertDescription>
          <p>{{ $t('participantRecovery.confirm.dataLossWarning') }}</p>
          <ul v-if="competenciesToReset.length > 0" class="mt-2 list-disc pl-5">
            <li
              v-for="code in competenciesToReset"
              :key="code"
              data-testid="participant-recover-competency"
            >
              {{ code }}
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      <Field>
        <FieldLabel for="participant-recover-reason">
          {{ $t('participantRecovery.confirm.reasonLabel') }}
        </FieldLabel>
        <Textarea
          id="participant-recover-reason"
          v-model="reason"
          data-testid="participant-recover-reason"
          maxlength="500"
          :placeholder="$t('participantRecovery.confirm.reasonPlaceholder')"
        />
      </Field>

      <Alert v-if="errorReason" variant="destructive" data-testid="participant-recover-error">
        <AlertDescription>
          {{ $t(`participantRecovery.refusalReason.${errorReason}`) }}
        </AlertDescription>
      </Alert>

      <div class="flex gap-2">
        <Button
          variant="destructive"
          :disabled="recovering"
          data-testid="participant-recover-confirm"
          @click="onConfirm"
        >
          {{
            recovering
              ? $t('participantRecovery.confirm.submitting')
              : $t('participantRecovery.confirm.submit')
          }}
        </Button>
        <Button
          variant="outline"
          :disabled="recovering"
          data-testid="participant-recover-cancel"
          @click="onCancel"
        >
          {{ $t('participantRecovery.confirm.cancel') }}
        </Button>
      </div>
    </template>

    <template v-else-if="result">
      <Alert data-testid="participant-recover-success">
        <AlertTitle>{{ $t('participantRecovery.success.title') }}</AlertTitle>
        <AlertDescription>
          {{ $t('participantRecovery.success.body', { count: result.competencies_reset.length }) }}
        </AlertDescription>
      </Alert>
    </template>
  </div>
</template>

<script setup lang="ts">
// ParticipantRecoveryPanel — the operator's ONLY path back out of `errore`
// (participant-error-recovery, design D9). Mounted ONLY when
// participant.status === 'errore' (parent's job — the API's
// ParticipantPolicy::recover is the real gate; !isViewer/status===errore
// here is UI convenience, not the control).
//
// The competency list + data-loss warning are sourced from the SESSIONS the
// parent already loaded via GET /participants/{id}/sessions (design D9 —
// no new read endpoint), filtered to status='error': those are exactly the
// sessions the recovery action will reset, per the API's own guard 2
// (nothing_to_recover).
import { ref, computed } from 'vue'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  useParticipantRecovery,
  type RecoverParticipantResponse,
} from '@/composables/useParticipantRecovery'
import { getErrorReason } from '@/utils/http-error'
import type { SessionSummary } from '@/composables/useSessionReview'

const props = defineProps<{
  participantId: number
  sessions: SessionSummary[]
}>()

const emit = defineEmits<{
  (e: 'recovered', result: RecoverParticipantResponse): void
}>()

const { recoverParticipant } = useParticipantRecovery()

const confirming = ref(false)
const recovering = ref(false)
const reason = ref('')
const errorReason = ref<string | null>(null)
const result = ref<RecoverParticipantResponse | null>(null)

// Sourced from the already-loaded session list (design D9), not a fresh
// fetch: the recovery action resets exactly the sessions at status='error'
// for this participant (the same set guard 2 checks server-side).
const competenciesToReset = computed(() =>
  props.sessions.filter((session) => session.status === 'error').map((s) => s.competency_code)
)

function onCancel(): void {
  confirming.value = false
  errorReason.value = null
  reason.value = ''
}

async function onConfirm(): Promise<void> {
  errorReason.value = null
  recovering.value = true
  try {
    const response = await recoverParticipant(props.participantId, {
      reason: reason.value.trim() === '' ? null : reason.value.trim(),
    })
    result.value = response
    confirming.value = false
    emit('recovered', response)
  } catch (error) {
    // 409 refusal — mapped to an i18n key by the closed reason set, never
    // rendered as the raw machine string (design D9).
    errorReason.value = getErrorReason(error) ?? 'unknown'
  } finally {
    recovering.value = false
  }
}
</script>
