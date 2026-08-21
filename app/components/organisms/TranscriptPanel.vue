<template>
  <div class="flex flex-col gap-6" data-testid="transcript-panel">
    <!--
      Partial evidence is a caveat, not a failure (design D7): `default`
      variant, never `destructive`. It renders ABOVE the turns, in DOM
      order, so the operator reads the caveat BEFORE the evidence — a badge
      near the heading would be a label, not a reason read first.
    -->
    <Alert v-if="isPartial" data-testid="transcript-partial">
      <AlertTitle>{{ $t('participants.detail.transcript.partial.title') }}</AlertTitle>
      <AlertDescription>{{
        $t('participants.detail.transcript.partial.message')
      }}</AlertDescription>
    </Alert>

    <p
      v-if="sessions.length === 0"
      class="text-muted-foreground text-sm"
      data-testid="transcript-empty"
    >
      {{ $t('participants.detail.transcript.empty') }}
    </p>

    <section
      v-for="session in sessions"
      :key="session.session_id"
      class="flex flex-col gap-3"
      :aria-labelledby="`transcript-session-${session.session_id}-heading`"
    >
      <h3
        :id="`transcript-session-${session.session_id}-heading`"
        class="text-foreground text-sm font-semibold"
      >
        {{ session.competency_code }} —
        {{ $t('participants.detail.transcript.question', { index: session.question_index + 1 }) }}
      </h3>

      <ol class="flex flex-col gap-3">
        <li
          v-for="(utterance, index) in session.utterances"
          :key="index"
          class="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0"
        >
          <span class="text-muted-foreground text-xs font-semibold uppercase">
            {{ speakerLabel(utterance.speaker) }}
          </span>
          <p class="text-foreground text-sm">{{ utterance.text }}</p>
        </li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
// Turn-by-turn transcript (operator-participant-visibility, design D2/D7):
// every turn attributed to its speaker, grouped by question (one section per
// InterviewSession). Presentational only — the page fetches via
// `useTranscript` and resolves the 409/403/404/loading states before ever
// mounting this, mirroring EvaluationReport's own contract.
//
// Deliberately takes NO status/lifecycle prop: `isPartial` arrives welded to
// the payload (D2's DTO) and is rendered exactly as received, never
// recomputed from a client-side lifecycle check — a locally recomputed flag
// could disagree with the very data it labels.
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import type { TranscriptSession } from '@/composables/useTranscript'

defineProps<{
  sessions: TranscriptSession[]
  isPartial: boolean
}>()

const { t } = useI18n()

/**
 * `speaker` is a machine-facing literal ('avatar' | 'candidate',
 * UtteranceController.php:56 `in:candidate,avatar`) — normalized to
 * lowercase before mapping so it is never rendered as an i18n key itself.
 * An unrecognized value falls back to the raw literal rather than throwing,
 * matching `statusBadgeVariant`'s fail-closed discipline.
 */
function speakerLabel(speaker: string): string {
  const normalized = speaker.toLowerCase()
  if (normalized === 'avatar' || normalized === 'candidate') {
    return t(`participants.detail.transcript.speaker.${normalized}`)
  }
  return speaker
}
</script>
