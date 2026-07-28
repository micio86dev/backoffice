<template>
  <div class="flex flex-col gap-6">
    <NuxtLink to="/participants" class="text-muted-foreground w-fit text-sm hover:underline">
      {{ $t('participants.detail.backToList') }}
    </NuxtLink>

    <div v-if="participant" class="flex flex-col gap-6">
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
  </div>
</template>

<script setup lang="ts">
// Candidate detail view (DESIGN.md §8.2): timeline + BARS evaluation report +
// gated downloads. The report and download-error states are resolved from
// REAL HTTP responses (D4) — 409 (not ready, temporal/self-resolving), 403
// (forbidden, permanent), 404 (not found), and a generic fallback are always
// rendered as three-plus distinct, meaningful states, never collapsed into
// one generic error toast.
import { ref, computed, onMounted } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import StatusBadge from '@/components/atoms/StatusBadge.vue'
import EvaluationReport from '@/components/organisms/EvaluationReport.vue'
import { useParticipants, type ParticipantDetailResponse } from '@/composables/useParticipants'
import { useEvaluationReport, type EvaluationReportData } from '@/composables/useEvaluationReport'
import { useDownloads } from '@/composables/useDownloads'
import { isParticipantResourceReady } from '@/utils/participant-lifecycle'
import { formatDate } from '@/utils/format'
import { getErrorStatus } from '@/utils/http-error'

definePageMeta({
  name: 'participant-detail',
})

useHead({
  title: 'Candidate detail',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

type GatedState = 'loading' | 'ready' | 'not-ready' | 'forbidden' | 'not-found' | 'error'

function resolveGatedState(error: unknown): Exclude<GatedState, 'loading' | 'ready'> {
  switch (getErrorStatus(error)) {
    case 409:
      return 'not-ready'
    case 403:
      return 'forbidden'
    case 404:
      return 'not-found'
    default:
      return 'error'
  }
}

const route = useRoute()
const { locale } = useI18n()
const { fetchParticipant } = useParticipants()
const { fetchEvaluation } = useEvaluationReport()
const { downloadTranscript, downloadEvaluation } = useDownloads()

const participant = ref<ParticipantDetailResponse['data'] | null>(null)

const transcriptReady = computed(() =>
  participant.value ? isParticipantResourceReady(participant.value.status, 'transcript') : false
)
const evaluationReady = computed(() =>
  participant.value ? isParticipantResourceReady(participant.value.status, 'evaluation') : false
)

const evaluationState = ref<GatedState>('loading')
const evaluationData = ref<EvaluationReportData | null>(null)

const transcriptDownloading = ref(false)
const evaluationDownloading = ref(false)
const downloadError = ref<Exclude<GatedState, 'loading' | 'ready'> | null>(null)

const downloadErrorTitleKey = computed(
  () => `report.states.${gatedStateKey(downloadError.value)}.title`
)
const downloadErrorMessageKey = computed(
  () => `report.states.${gatedStateKey(downloadError.value)}.message`
)

function gatedStateKey(state: Exclude<GatedState, 'loading' | 'ready'> | null): string {
  switch (state) {
    case 'not-ready':
      return 'notReady'
    case 'forbidden':
      return 'forbidden'
    case 'not-found':
      return 'notFound'
    default:
      return 'error'
  }
}

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
    downloadError.value = resolveGatedState(error)
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
    downloadError.value = resolveGatedState(error)
  } finally {
    evaluationDownloading.value = false
  }
}

onMounted(async () => {
  const id = Array.isArray(route.params['id']) ? route.params['id'][0] : route.params['id']
  const response = await fetchParticipant(id as string)
  participant.value = response.data

  try {
    evaluationData.value = await fetchEvaluation(id as string)
    evaluationState.value = 'ready'
  } catch (error) {
    evaluationState.value = resolveGatedState(error)
  }
})
</script>
