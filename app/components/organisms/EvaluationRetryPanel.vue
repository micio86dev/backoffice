<template>
  <div v-if="visible" class="flex flex-col gap-4" data-testid="evaluation-retry-panel">
    <!--
      The link is shown from `result` ONLY: it is a bearer credential the API
      returns once, so it lives in this component's memory and nowhere else —
      not a prop, not an emitted event, not storage, not a URL.
    -->
    <template v-if="result">
      <Alert variant="success" data-testid="evaluation-retry-success">
        <AlertTitle>{{ $t('evaluationRetry.success.title') }}</AlertTitle>
        <AlertDescription>
          {{ $t('evaluationRetry.success.body', { count: result.competencies_reset.length }) }}
        </AlertDescription>
      </Alert>

      <EntryLinkPanel
        :link="{ entry_url: result.entry_url, expires_at: result.expires_at }"
        :locale="locale"
        hide-generate
      />

      <p class="text-sm" data-testid="evaluation-retry-email-status">
        {{
          result.email_sent
            ? $t('evaluationRetry.success.emailSent')
            : $t('evaluationRetry.success.emailNotSent')
        }}
      </p>

      <div class="flex gap-2">
        <Button variant="outline" data-testid="evaluation-retry-dismiss" @click="onDismiss">
          {{ $t('evaluationRetry.success.dismiss') }}
        </Button>
      </div>
    </template>

    <p
      v-else-if="stateKey"
      class="text-sm"
      data-testid="evaluation-retry-state"
      :data-state="stateKey"
    >
      <template v-if="stateKey === 'waiting'">
        {{ $t('evaluationRetry.state.waiting', { date: authorizedAtLabel }) }}
      </template>
      <template v-else>{{ $t(`evaluationRetry.state.${stateKey}`) }}</template>
    </p>

    <template v-else>
      <p class="text-muted-foreground text-sm">{{ $t('evaluationRetry.description') }}</p>

      <Alert v-if="errorReason" variant="destructive" data-testid="evaluation-retry-error">
        <AlertDescription>
          {{ $t(`evaluationRetry.refusalReason.${errorReason}`) }}
        </AlertDescription>
      </Alert>

      <Button
        v-if="!confirming"
        variant="destructive"
        :disabled="refused"
        data-testid="evaluation-retry-open"
        @click="confirming = true"
      >
        {{ $t('evaluationRetry.action') }}
      </Button>

      <template v-else>
        <Alert variant="destructive" data-testid="evaluation-retry-disclosure">
          <AlertTitle>{{ $t('evaluationRetry.confirm.title') }}</AlertTitle>
          <AlertDescription>
            <ul class="list-disc pl-5">
              <li v-for="key in CONSEQUENCES" :key="key">
                {{ $t(`evaluationRetry.confirm.consequence.${key}`) }}
              </li>
            </ul>
          </AlertDescription>
        </Alert>

        <Field>
          <FieldLabel for="evaluation-retry-reason">
            {{ $t('evaluationRetry.confirm.reasonLabel') }}
          </FieldLabel>
          <Textarea
            id="evaluation-retry-reason"
            v-model="reason"
            data-testid="evaluation-retry-reason"
            maxlength="500"
            :placeholder="$t('evaluationRetry.confirm.reasonPlaceholder')"
          />
        </Field>

        <div class="flex gap-2">
          <Button
            variant="destructive"
            :disabled="authorizing || refused"
            data-testid="evaluation-retry-confirm"
            @click="onConfirm"
          >
            {{
              authorizing
                ? $t('evaluationRetry.confirm.submitting')
                : $t('evaluationRetry.confirm.submit')
            }}
          </Button>
          <Button
            variant="outline"
            :disabled="authorizing"
            data-testid="evaluation-retry-cancel"
            @click="onCancel"
          >
            {{ $t('evaluationRetry.confirm.cancel') }}
          </Button>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
// EvaluationRetryPanel — the operator's single re-interview of a `pending`
// evaluation (scoring-retry-rt-b; spec admin-backoffice "Operator Evaluation
// Retry Panel"). Mirrors ParticipantRecoveryPanel: a presentational organism
// that owns only its own confirm/result state and delegates the write to
// `useEvaluationRetry`.
//
// GATING: `canRetry` is the abilities contract's retry flag, computed by the
// parent (`can('participants.retry')`); the role name is never consulted here.
// The API's 403 is the real control — this is UI convenience. A user without
// the flag sees NOTHING in the Available state; the read-only progress lines
// (Waiting / In progress / Scoring / Finished) are shown to every role.
//
// NO FIXED LIFETIME is ever written here: the retry link lives 24 h only when
// BEAI emails it and 30 min when it is only returned, so the sole expiry the
// UI states is the absolute `expires_at` from the response.
import { ref, computed } from 'vue'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel } from '@/components/ui/field'
import EntryLinkPanel from '@/components/organisms/EntryLinkPanel.vue'
import { useEvaluationRetry, type AuthorizeRetryResponse } from '@/composables/useEvaluationRetry'
import { getErrorReason } from '@/utils/http-error'
import { formatDate } from '@/utils/format'

const props = defineProps<{
  participantId: number
  /** The participant's literal lifecycle status. */
  status: string
  retryAvailable: boolean
  retryAttempt: boolean
  retryAuthorizedAt: string | null
  /** The abilities contract's `participants.retry` flag. */
  canRetry: boolean
  locale: string
}>()

const emit = defineEmits<{
  /**
   * Deliberately WITHOUT `entry_url`/`expires_at`: the link never leaves this
   * component, the parent only needs to refresh the participant.
   */
  (e: 'authorized', result: Pick<AuthorizeRetryResponse, 'status' | 'competencies_reset'>): void
}>()

// The consequence list, in the order the confirm step states them.
const CONSEQUENCES = ['reDo', 'unreadable', 'once', 'link'] as const

// The closed set of 409 reasons the API can return. A known reason is final
// (the action stays disabled); anything else is a transient failure.
const REFUSAL_REASONS = [
  'retry_already_consumed',
  'not_completed',
  'test_mode_participant',
  'evaluation_not_pending',
  'project_inaccessible',
]

const STATE_BY_STATUS: Record<string, 'waiting' | 'inProgress' | 'scoring' | 'finished'> = {
  in_attesa: 'waiting',
  in_corso: 'inProgress',
  in_valutazione: 'scoring',
  completato: 'finished',
}

const { authorizeRetry } = useEvaluationRetry()

const confirming = ref(false)
const authorizing = ref(false)
const reason = ref('')
const errorReason = ref<string | null>(null)
const result = ref<AuthorizeRetryResponse | null>(null)
// Set once this panel authorized: until the parent refreshes, `retryAvailable`
// is still true, and the action must not reappear for a retry that is spent.
const spent = ref(false)

const refused = computed(
  () => errorReason.value !== null && REFUSAL_REASONS.includes(errorReason.value)
)

// The read-only progress line: only once a retry was authorized and not while
// the action itself is on offer.
const stateKey = computed(() =>
  props.retryAttempt && !props.retryAvailable ? (STATE_BY_STATUS[props.status] ?? null) : null
)

const authorizedAtLabel = computed(() => formatDate(props.retryAuthorizedAt, props.locale))

const actionVisible = computed(() => props.retryAvailable && props.canRetry && !spent.value)

const visible = computed(
  () => result.value !== null || stateKey.value !== null || actionVisible.value
)

function onCancel(): void {
  confirming.value = false
  reason.value = ''
  // A final refusal stays on screen with the action disabled; a transient
  // failure is forgotten.
  if (!refused.value) errorReason.value = null
}

function onDismiss(): void {
  result.value = null
}

async function onConfirm(): Promise<void> {
  errorReason.value = null
  authorizing.value = true
  const trimmed = reason.value.trim()
  try {
    const response = await authorizeRetry(
      props.participantId,
      trimmed === '' ? {} : { reason: trimmed }
    )
    result.value = response
    spent.value = true
    confirming.value = false
    emit('authorized', { status: response.status, competencies_reset: response.competencies_reset })
  } catch (error) {
    // Mapped onto an i18n key, never rendered as the raw machine string.
    const code = getErrorReason(error)
    errorReason.value = code !== null && REFUSAL_REASONS.includes(code) ? code : 'unknown'
  } finally {
    authorizing.value = false
  }
}
</script>
