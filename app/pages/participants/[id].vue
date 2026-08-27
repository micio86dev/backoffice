<template>
  <div class="flex flex-col gap-6">
    <NuxtLink to="/participants" class="text-muted-foreground w-fit text-sm hover:underline">
      {{ $t('participants.detail.backToList') }}
    </NuxtLink>

    <Alert
      v-if="participantState !== 'loading' && participantState !== 'ready'"
      :variant="participantState === 'not-ready' ? 'default' : 'destructive'"
      :data-state="participantState"
      data-testid="participant-error"
    >
      <AlertTitle>{{ $t(participantErrorTitleKey) }}</AlertTitle>
      <AlertDescription>{{ $t(participantErrorMessageKey) }}</AlertDescription>
    </Alert>

    <div v-else-if="participant" class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-semibold text-foreground">{{ participant.display_name }}</h1>
        <p class="text-muted-foreground text-sm">
          {{ participant.candidate_ref }} · {{ participant.role_code }} ·
          {{ $t('participants.detail.language') }}: {{ participant.language }}
        </p>
        <StatusBadge :status="participant.status" class="mt-2" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{{ $t('participants.detail.timeline.title') }}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt class="text-muted-foreground">
                {{ $t('participants.detail.timeline.startedAt') }}
              </dt>
              <dd class="text-foreground">
                {{ formatDate(participant.timeline.started_at, locale) }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {{ $t('participants.detail.timeline.completedAt') }}
              </dt>
              <dd class="text-foreground">
                {{ formatDate(participant.timeline.completed_at, locale) }}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <!--
        Interview summary (operator-participant-visibility, design D3–D6):
        the five facts the operator's original report said were missing.
        `timeline.session_count` (above) stays in the payload but no longer
        renders — it counts session ROWS, not ended competencies, and
        showing both would put two different numbers on "how far" this
        interview got (D5). Every figure here carries its own coverage
        count, adjacent to the number, because progress/elapsed/cost
        genuinely differ in which sessions they exclude.
      -->
      <Card>
        <CardHeader>
          <CardTitle>{{ $t('participants.detail.interview.title') }}</CardTitle>
        </CardHeader>
        <CardContent class="grid gap-4 md:grid-cols-3">
          <MetricCard
            :label="$t('participants.detail.interview.progress')"
            :value="progressLabel"
            data-testid="interview-progress"
          />
          <div class="flex flex-col gap-1" data-testid="interview-elapsed">
            <MetricCard
              :label="$t('participants.detail.interview.elapsed')"
              :value="elapsedLabel"
            />
            <p
              v-if="elapsedCoverageLabel"
              class="text-muted-foreground text-xs"
              data-testid="elapsed-coverage"
            >
              {{ elapsedCoverageLabel }}
            </p>
          </div>
          <div class="flex flex-col gap-1" data-testid="interview-cost">
            <MetricCard :label="$t('review.costEstimate')" :value="costLabel" />
            <p
              v-if="costCoverageLabel"
              class="text-muted-foreground text-xs"
              data-testid="cost-coverage"
            >
              {{ costCoverageLabel }}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card v-if="!isViewer">
        <CardHeader>
          <CardTitle>{{ $t('entryLink.reissue.title') }}</CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <EntryLinkPanel
            v-if="entryLink"
            :link="entryLink"
            :locale="locale"
            @generate="onGenerateEntryLink"
          />
          <template v-else>
            <Button
              :disabled="!entryLinkAccessibility.eligible || generatingEntryLink"
              data-testid="participant-generate-entry-link"
              @click="onGenerateEntryLink"
            >
              {{ $t('entryLink.generate') }}
            </Button>
            <p
              v-if="!entryLinkAccessibility.eligible"
              class="text-muted-foreground text-sm"
              data-testid="participant-entry-link-disabled-reason"
            >
              {{ $t(`entryLink.disabledReason.${entryLinkAccessibility.reason}`) }}
            </p>
            <Alert
              v-if="entryLinkError"
              variant="destructive"
              data-testid="participant-entry-link-error"
            >
              <AlertDescription>{{ entryLinkError }}</AlertDescription>
            </Alert>
          </template>
        </CardContent>
      </Card>

      <!--
        Participant recovery (participant-error-recovery, design D9): the
        operator's ONLY path back out of `errore`. `!isViewer` is UI
        convenience only — ParticipantPolicy::recover is the real server-side
        gate (a control that renders and then 403s teaches the operator the
        product is broken, same reasoning as the entry-link card above).
        Visible while status === 'errore' OR immediately after a successful
        recovery (`justRecovered`) — status flips to 'in_attesa' the instant
        `onParticipantRecovered` runs, so gating on status ALONE would
        unmount this card (and its own success confirmation) before the
        operator ever saw it.
      -->
      <Card
        v-if="!isViewer && (participant.status === 'errore' || justRecovered)"
        data-testid="participant-recovery-card"
      >
        <CardHeader>
          <CardTitle>{{ $t('participantRecovery.action') }}</CardTitle>
        </CardHeader>
        <CardContent>
          <ParticipantRecoveryPanel
            :participant-id="participant.id"
            :sessions="sessions"
            @recovered="onParticipantRecovered"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{{ $t('participants.detail.resources.title') }}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul class="flex flex-col gap-2 text-sm">
            <li data-testid="resource-transcript" class="flex items-center justify-between">
              <span>{{ $t('participants.detail.resources.transcript') }}</span>
              <Badge :variant="transcriptReady ? 'default' : 'outline'">
                {{
                  transcriptReady
                    ? $t('participants.detail.resources.ready')
                    : $t('participants.detail.resources.notReady')
                }}
              </Badge>
            </li>
            <li data-testid="resource-evaluation" class="flex items-center justify-between">
              <span>{{ $t('participants.detail.resources.evaluation') }}</span>
              <Badge :variant="evaluationReady ? 'default' : 'outline'">
                {{
                  evaluationReady
                    ? $t('participants.detail.resources.ready')
                    : $t('participants.detail.resources.notReady')
                }}
              </Badge>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{{ $t('report.downloads.title') }}</CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col gap-3">
          <div class="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              data-testid="download-transcript"
              :disabled="!transcriptReady || transcriptDownloading"
              @click="onDownloadTranscript"
            >
              {{
                transcriptDownloading
                  ? $t('report.downloads.downloading')
                  : $t('report.downloads.transcript')
              }}
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="download-evaluation"
              :disabled="!evaluationReady || evaluationDownloading"
              @click="onDownloadEvaluation"
            >
              {{
                evaluationDownloading
                  ? $t('report.downloads.downloading')
                  : $t('report.downloads.evaluation')
              }}
            </Button>
          </div>
          <Alert v-if="downloadError" variant="destructive" data-testid="download-error">
            <AlertTitle>{{ $t(downloadErrorTitleKey) }}</AlertTitle>
            <AlertDescription>{{ $t(downloadErrorMessageKey) }}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <!--
        Turn-by-turn transcript (operator-participant-visibility, design
        D2/D7): what turned the operator's original report into an incident
        — the data existed and was never shown. Gated by the SAME
        `transcriptReady` mirror the download button above already uses, so
        the panel and the button can never disagree about `in_attesa` (D7).
        Hidden entirely rather than shown as a "not ready" state (unlike the
        Evaluation card below) — the spec is explicit that no panel is
        offered before the gate opens, not that it opens showing a stub.
      -->
      <Card v-if="transcriptReady">
        <CardHeader>
          <CardTitle>{{ $t('participants.detail.transcript.title') }}</CardTitle>
        </CardHeader>
        <CardContent>
          <p v-if="transcriptState === 'loading'" class="text-muted-foreground text-sm">
            {{ $t('report.states.loading') }}
          </p>
          <Alert
            v-else-if="transcriptState !== 'ready'"
            variant="destructive"
            data-testid="transcript-load-error"
          >
            <AlertTitle>{{ $t(transcriptErrorTitleKey) }}</AlertTitle>
            <AlertDescription>{{ $t(transcriptErrorMessageKey) }}</AlertDescription>
          </Alert>
          <TranscriptPanel
            v-else-if="transcriptData"
            :sessions="transcriptData.sessions"
            :is-partial="transcriptData.is_partial"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{{ $t('report.title') }}</CardTitle>
        </CardHeader>
        <CardContent>
          <p v-if="evaluationState === 'loading'" class="text-muted-foreground text-sm">
            {{ $t('report.states.loading') }}
          </p>
          <Alert v-else-if="evaluationState === 'not-ready'" data-testid="report-not-ready">
            <AlertTitle>{{ $t('report.states.notReady.title') }}</AlertTitle>
            <AlertDescription>{{ $t('report.states.notReady.message') }}</AlertDescription>
          </Alert>
          <Alert
            v-else-if="evaluationState === 'forbidden'"
            variant="destructive"
            data-testid="report-forbidden"
          >
            <AlertTitle>{{ $t('report.states.forbidden.title') }}</AlertTitle>
            <AlertDescription>{{ $t('report.states.forbidden.message') }}</AlertDescription>
          </Alert>
          <Alert
            v-else-if="evaluationState === 'not-found'"
            variant="destructive"
            data-testid="report-not-found"
          >
            <AlertTitle>{{ $t('report.states.notFound.title') }}</AlertTitle>
            <AlertDescription>{{ $t('report.states.notFound.message') }}</AlertDescription>
          </Alert>
          <Alert
            v-else-if="evaluationState === 'error'"
            variant="destructive"
            data-testid="report-error"
          >
            <AlertTitle>{{ $t('report.states.error.title') }}</AlertTitle>
            <AlertDescription>{{ $t('report.states.error.message') }}</AlertDescription>
          </Alert>
          <EvaluationReport
            v-else-if="evaluationData && evaluationMeta"
            :evaluation="evaluationData"
            :meta="evaluationMeta"
            :locale="locale"
          />
        </CardContent>
      </Card>
    </div>

    <SessionList v-if="participantState === 'ready'" :sessions="sessions" :locale="locale" />
  </div>
</template>

<script setup lang="ts">
// Candidate detail view (DESIGN.md §8.2): timeline + BARS evaluation report +
// gated downloads. The report and download-error states are resolved from
// REAL HTTP responses (D4) — 409 (not ready, temporal/self-resolving), 403
// (forbidden, permanent), 404 (not found), and a generic fallback are always
// rendered as three-plus distinct, meaningful states, never collapsed into
// one generic error toast.
import SessionList from '@/components/organisms/SessionList.vue'
import { ref, computed, onMounted } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import StatusBadge from '@/components/atoms/StatusBadge.vue'
import MetricCard from '@/components/molecules/MetricCard.vue'
import EvaluationReport from '@/components/organisms/EvaluationReport.vue'
import TranscriptPanel from '@/components/organisms/TranscriptPanel.vue'
import EntryLinkPanel, { type EntryLink } from '@/components/organisms/EntryLinkPanel.vue'
import ParticipantRecoveryPanel from '@/components/organisms/ParticipantRecoveryPanel.vue'
import { useParticipants, type ParticipantDetailResponse } from '@/composables/useParticipants'
import type { RecoverParticipantResponse } from '@/composables/useParticipantRecovery'
import {
  useEvaluationReport,
  type EvaluationReportData,
  type EvaluationScoringMeta,
} from '@/composables/useEvaluationReport'
import { useTranscript, type TranscriptData } from '@/composables/useTranscript'
import { useDownloads } from '@/composables/useDownloads'
import { useSessionReview, type SessionSummary } from '@/composables/useSessionReview'
import { useEntryLinks } from '@/composables/useEntryLinks'
import { useProfile } from '@/composables/useProfile'
import { isParticipantResourceReady } from '@/utils/participant-lifecycle'
import { formatDate, formatDuration, formatUsdAmount } from '@/utils/format'
import {
  projectAccessibility,
  type ProjectAccessibilityReason,
} from '@/utils/project-accessibility'
import { entryLinkParticipantReason } from '@/utils/entry-link-participant-gate'
import {
  resolveResourceErrorState,
  resourceErrorKey,
  type ResourceErrorState,
  type ResourceState,
} from '@/utils/error-state'

definePageMeta({
  name: 'participant-detail',
})

const route = useRoute()
const { t, locale } = useI18n()

useHead({
  // A <title> is user-facing (browser tab, bookmark, window switcher, and the
  // first thing a screen reader announces on navigation) — it goes through
  // i18n like every other user-facing string.
  title: () => t('head.title.participantDetail'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { fetchParticipant } = useParticipants()
const { fetchEvaluation } = useEvaluationReport()
const { fetchTranscript } = useTranscript()
const { downloadTranscript, downloadEvaluation } = useDownloads()

const participant = ref<ParticipantDetailResponse['data'] | null>(null)

// The PRIMARY resource fetch gets the same treatment the evaluation and the
// downloads already had (D4). Without it a failure left `participant` null,
// `v-if="participant"` never rendered, and the operator got a blank page with
// a back-link — a failure state that looks like an empty page, not an error.
const participantState = ref<ResourceState>('loading')

const participantErrorState = computed<ResourceErrorState>(() =>
  participantState.value === 'loading' || participantState.value === 'ready'
    ? 'error'
    : participantState.value
)

const participantErrorTitleKey = computed(() =>
  resourceErrorKey(participantErrorState.value, 'title')
)
const participantErrorMessageKey = computed(() =>
  resourceErrorKey(participantErrorState.value, 'message')
)

const transcriptReady = computed(() =>
  participant.value ? isParticipantResourceReady(participant.value.status, 'transcript') : false
)
const evaluationReady = computed(() =>
  participant.value ? isParticipantResourceReady(participant.value.status, 'evaluation') : false
)

// Interview summary (D3–D6): progress/elapsed/cost, each with its own
// coverage disclosure. A coverage line renders only while partial — full
// coverage (counted/estimated === total) says nothing extra, matching the
// "state it only when it's incomplete" doctrine from the top-level spec.
const progressLabel = computed(() => {
  if (!participant.value) return '–'
  const { done, total } = participant.value.progress
  return `${done} / ${total}`
})

const elapsedLabel = computed(() =>
  participant.value ? formatDuration(participant.value.elapsed.seconds, t) : '–'
)

const elapsedCoverageLabel = computed(() => {
  if (!participant.value) return null
  const { sessions_counted, sessions_total } = participant.value.elapsed
  if (sessions_counted >= sessions_total) return null
  return t('participants.detail.interview.elapsedCoverage', {
    counted: sessions_counted,
    total: sessions_total,
  })
})

// Always the word "estimate" (review.costEstimate label, reused verbatim):
// no provider exposes a per-session billed amount, and an operator who
// reads this as an invoice line will reconcile it against a real bill and
// find a discrepancy that was never a defect.
const costLabel = computed(() => {
  if (!participant.value || participant.value.cost.amount === null) return '–'
  // Same formatter as SessionReviewPanel's cost lines: one copy key must
  // not render through two different number formatters.
  return t('review.costValue', {
    usd: formatUsdAmount(participant.value.cost.amount, locale.value),
  })
})

const costCoverageLabel = computed(() => {
  if (!participant.value) return null
  const { sessions_estimated, sessions_total } = participant.value.cost
  if (sessions_estimated >= sessions_total) return null
  return t('participants.detail.interview.costCoverage', {
    estimated: sessions_estimated,
    total: sessions_total,
  })
})

const evaluationState = ref<ResourceState>('loading')
const evaluationData = ref<EvaluationReportData | null>(null)
const evaluationMeta = ref<EvaluationScoringMeta | null>(null)

// Transcript (D2/D7): fetched ONLY when the client-side mirror already says
// the resource should be reachable — D7's whole point is knowing this
// BEFORE the request, so a not-yet-ready participant never even attempts
// it (unlike the evaluation fetch above, which always attempts and lets a
// real 409 resolve the state).
const transcriptState = ref<ResourceState>('loading')
const transcriptData = ref<TranscriptData | null>(null)

const transcriptErrorState = computed<ResourceErrorState>(() =>
  transcriptState.value === 'loading' || transcriptState.value === 'ready'
    ? 'error'
    : transcriptState.value
)
const transcriptErrorTitleKey = computed(() =>
  resourceErrorKey(transcriptErrorState.value, 'title')
)
const transcriptErrorMessageKey = computed(() =>
  resourceErrorKey(transcriptErrorState.value, 'message')
)

const transcriptDownloading = ref(false)
const evaluationDownloading = ref(false)
const downloadError = ref<ResourceErrorState | null>(null)

// The report/download surfaces keep their report-specific wording, so they
// resolve their keys against the `report.states` namespace rather than the
// generic `errors.states` one.
const downloadErrorTitleKey = computed(() =>
  resourceErrorKey(downloadError.value ?? 'error', 'title', 'report.states')
)
const downloadErrorMessageKey = computed(() =>
  resourceErrorKey(downloadError.value ?? 'error', 'message', 'report.states')
)

function downloadFilename(type: 'transcript' | 'evaluation', extension: string): string {
  const ref = participant.value?.candidate_ref ?? 'candidate'
  const slug = ref.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'candidate'
  return `beai-${type}-${slug}.${extension}`
}

async function onDownloadTranscript(): Promise<void> {
  const id = participant.value?.id
  if (!id) return
  downloadError.value = null
  transcriptDownloading.value = true
  try {
    await downloadTranscript(id, downloadFilename('transcript', 'txt'))
  } catch (error) {
    downloadError.value = resolveResourceErrorState(error)
  } finally {
    transcriptDownloading.value = false
  }
}

async function onDownloadEvaluation(): Promise<void> {
  const id = participant.value?.id
  if (!id) return
  downloadError.value = null
  evaluationDownloading.value = true
  try {
    await downloadEvaluation(id, downloadFilename('evaluation', 'json'))
  } catch (error) {
    downloadError.value = resolveResourceErrorState(error)
  } finally {
    evaluationDownloading.value = false
  }
}

const sessions = ref<SessionSummary[]>([])
const { listSessions } = useSessionReview()

// "Generate new link" (operator-interview-link, design D4/D5): re-issue an
// entry link for this already-known participant, pre-filled from their own
// project/candidate_ref/display_name/role_code/language. Neither this Card
// NOR the "Invite candidate" row action (ProjectTable.vue) may render for a
// viewer — minting starts an assessment, it is not a read, and
// ParticipantPolicy::create already denies viewer server-side (a control
// that renders and then 403s teaches the operator the product is broken).
const { generateEntryLink } = useEntryLinks()
const { fetchProfile } = useProfile()
const isViewer = ref(true)
const entryLink = ref<EntryLink | null>(null)
const entryLinkError = ref<string | null>(null)
const generatingEntryLink = ref(false)

/**
 * Fail-safe default (project not accessible) until the participant row —
 * carrying the nested `project` gate fields — has actually loaded.
 *
 * Checked in the SAME order as `EntryLinkMinter::mint()` (design D5/D3): the
 * project gate first, THEN the participant's own terminal status — so a
 * participant failing both always reports the same reason the server would
 * encounter first. A `completato`/`errore` participant would otherwise show
 * an enabled "Generate new link" button that is guaranteed to 409.
 */
const entryLinkAccessibility = computed<{
  eligible: boolean
  reason: ProjectAccessibilityReason | 'completed' | 'failed' | null
}>(() => {
  if (!participant.value) return { eligible: false, reason: 'notActive' }

  const projectGate = projectAccessibility(participant.value.project)
  if (!projectGate.eligible) return projectGate

  const participantReason = entryLinkParticipantReason(participant.value.status)
  if (participantReason !== null) return { eligible: false, reason: participantReason }

  return { eligible: true, reason: null }
})

async function onGenerateEntryLink(): Promise<void> {
  if (!participant.value) return
  entryLinkError.value = null
  generatingEntryLink.value = true
  try {
    const response = await generateEntryLink({
      project_id: participant.value.project.id,
      candidate_ref: participant.value.candidate_ref,
      display_name: participant.value.display_name,
      role_code: participant.value.role_code,
      lang: participant.value.language,
    })
    entryLink.value = response
  } catch {
    entryLinkError.value = t('entryLink.mintError')
  } finally {
    generatingEntryLink.value = false
  }
}

// (participant-error-recovery, design D9) `justRecovered` keeps the
// recovery card mounted (see the Card's v-if above) after the status flips
// away from 'errore', so the panel's own success confirmation stays visible
// instead of unmounting the instant the badge updates.
const justRecovered = ref(false)

// Reflect the recovery immediately: the status badge above re-renders from
// `participant.value.status`, and sessions are re-fetched so the (now
// `pending`) reset session no longer shows as `error` in the session list
// below.
async function onParticipantRecovered(response: RecoverParticipantResponse): Promise<void> {
  if (participant.value) participant.value.status = response.status
  justRecovered.value = true
  await loadSessions(String(route.params['id']))
}

async function loadSessions(id: string): Promise<void> {
  try {
    sessions.value = (await listSessions(id)).data
  } catch {
    // Secondary content: a failed session list must not blank the participant
    // detail, which is what the operator actually came for.
    sessions.value = []
  }
}

async function loadViewerGate(): Promise<void> {
  try {
    const profile = await fetchProfile()
    // Fail-closed default, mirroring profile.vue:52's own coercion: an
    // unrecognized/missing role is treated as 'viewer' (the least
    // privileged), not as an accidental grant.
    isViewer.value = (profile.data.role ? String(profile.data.role) : 'viewer') === 'viewer'
  } catch {
    // The mint action is a bonus surface on this page, not its primary
    // purpose — a failed profile fetch hides it (fail-closed) rather than
    // blanking the whole participant detail view.
    isViewer.value = true
  }
}

onMounted(async () => {
  const id = Array.isArray(route.params['id']) ? route.params['id'][0] : route.params['id']

  void loadViewerGate()

  try {
    const response = await fetchParticipant(id as string)
    participant.value = response.data
    participantState.value = 'ready'
  } catch (error) {
    participantState.value = resolveResourceErrorState(error)
    // The evaluation belongs to a participant we could not read (403 / 404 /
    // transport failure) — fetching it would only produce a second, noisier
    // failure for a resource the operator cannot see anyway.
    return
  }

  try {
    const evaluation = await fetchEvaluation(id as string)
    evaluationData.value = evaluation.data
    evaluationMeta.value = evaluation.meta
    evaluationState.value = 'ready'
  } catch (error) {
    evaluationState.value = resolveResourceErrorState(error)
  }

  if (transcriptReady.value) {
    try {
      transcriptData.value = await fetchTranscript(id as string)
      transcriptState.value = 'ready'
    } catch (error) {
      transcriptState.value = resolveResourceErrorState(error)
    }
  }

  await loadSessions(id as string)
})
</script>
