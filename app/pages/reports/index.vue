<template>
  <div class="flex flex-col gap-6">
    <PageHeader :title="$t('reports.title')" :subtitle="$t('reports.subtitle')" />

    <!-- The filter bar stays mounted in the error state: a failed load must be
         recoverable by changing a filter or retrying, without a page reload. -->
    <ReportFilters v-model="filters" :projects="projects" />

    <Alert
      v-if="loadError"
      :variant="loadError === 'not-ready' ? 'default' : 'destructive'"
      :data-state="loadError"
      data-testid="reports-error"
    >
      <AlertTitle>{{ $t(loadErrorTitleKey) }}</AlertTitle>
      <AlertDescription>{{ $t(loadErrorMessageKey) }}</AlertDescription>
      <Button
        variant="outline"
        size="sm"
        :disabled="loading"
        data-testid="reports-retry"
        @click="load"
      >
        {{ $t('reports.retry') }}
      </Button>
    </Alert>

    <template v-else>
      <!-- Summary is a secondary panel — code-split (D10), never blocking the table. -->
      <ReportSummary v-if="summary" :summary="summary" />

      <EvaluationsTable :rows="rows" />
    </template>
  </div>
</template>

<script setup lang="ts">
import PageHeader from '@/components/molecules/PageHeader.vue'
import { ref, computed, onMounted, watch, defineAsyncComponent } from 'vue'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import ReportFilters from '@/components/molecules/ReportFilters.vue'
import EvaluationsTable, { type EvaluationRow } from '@/components/organisms/EvaluationsTable.vue'
import type { EvaluationsSummary } from '@/components/organisms/ReportSummary.vue'
import { useEvaluations } from '@/composables/useEvaluations'
import { useProjects, type Project } from '@/composables/useProjects'
import type { EvaluationQueryParams } from '@/utils/evaluation-query'
import {
  resolveResourceErrorState,
  resourceErrorKey,
  type ResourceErrorState,
} from '@/utils/error-state'

const ReportSummary = defineAsyncComponent(() => import('@/components/organisms/ReportSummary.vue'))

definePageMeta({
  name: 'reports',
})

const { t } = useI18n()

useHead({
  title: () => t('head.title.reports'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { index, summary: fetchSummary } = useEvaluations()
const { listProjects } = useProjects()

const rows = ref<EvaluationRow[]>([])
const projects = ref<Project[]>([])
const filters = ref<EvaluationQueryParams>({})
const summary = ref<EvaluationsSummary | null>(null)

const loadError = ref<ResourceErrorState | null>(null)
const loadErrorTitleKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'title'))
const loadErrorMessageKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'message'))

const loading = ref(false)
// Each load takes a ticket; only the latest ticket may write state, so a slow
// stale response (an older filter set, a retry overtaken by a filter change)
// can never overwrite or error over a newer result.
let latestLoad = 0

async function load(): Promise<void> {
  const ticket = ++latestLoad
  loading.value = true
  try {
    const [indexResponse, summaryResponse] = await Promise.all([
      index(filters.value),
      fetchSummary(filters.value),
    ])
    if (ticket !== latestLoad) return
    rows.value = indexResponse.data
    // The summary is secondary: a response without `data` degrades the panel
    // (hidden) and must never throw into the table's error state.
    const summaryData = summaryResponse?.data
    summary.value = summaryData
      ? {
          by_status: summaryData.by_status ?? {},
          competencies: summaryData.competencies ?? [],
        }
      : null
    loadError.value = null
  } catch (error) {
    if (ticket !== latestLoad) return
    loadError.value = resolveResourceErrorState(error)
  } finally {
    if (ticket === latestLoad) loading.value = false
  }
}

async function loadProjects(): Promise<void> {
  try {
    const response = await listProjects()
    projects.value = response.data
  } catch {
    // Non-fatal: the report list/summary are the primary data on this page;
    // a failed project list only degrades the filter dropdown to "all
    // projects", never blocks the page.
  }
}

watch(filters, () => {
  void load()
})

onMounted(() => {
  void load()
  void loadProjects()
})
</script>
