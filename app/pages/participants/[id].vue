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
          <dl class="grid grid-cols-3 gap-4 text-sm">
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
            <div>
              <dt class="text-muted-foreground">
                {{ $t('participants.detail.timeline.sessionCount') }}
              </dt>
              <dd class="text-foreground">{{ participant.timeline.session_count }}</dd>
            </div>
          </dl>
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
            v-else-if="evaluationData"
            :evaluation="evaluationData"
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
import EvaluationReport from '@/components/organisms/EvaluationReport.vue'
import EntryLinkPanel, { type EntryLink } from '@/components/organisms/EntryLinkPanel.vue'
import { useParticipants, type ParticipantDetailResponse } from '@/composables/useParticipants'
import { useEvaluationReport, type EvaluationReportData } from '@/composables/useEvaluationReport'
import { useDownloads } from '@/composables/useDownloads'
import { useSessionReview, type SessionSummary } from '@/composables/useSessionReview'
import { useEntryLinks } from '@/composables/useEntryLinks'
import { useProfile } from '@/composables/useProfile'
import { isParticipantResourceReady } from '@/utils/participant-lifecycle'
import { formatDate } from '@/utils/format'
import { projectAccessibility, type ProjectAccessibility } from '@/utils/project-accessibility'
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

const evaluationState = ref<ResourceState>('loading')
const evaluationData = ref<EvaluationReportData | null>(null)

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

// Fail-safe default (project not accessible) until the participant row —
// carrying the nested `project` gate fields — has actually loaded.
const entryLinkAccessibility = computed<ProjectAccessibility>(() =>
  participant.value
    ? projectAccessibility(participant.value.project)
    : { eligible: false, reason: 'notActive' }
)

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
    evaluationData.value = await fetchEvaluation(id as string)
    evaluationState.value = 'ready'
  } catch (error) {
    evaluationState.value = resolveResourceErrorState(error)
  }

  await loadSessions(id as string)
})
</script>
