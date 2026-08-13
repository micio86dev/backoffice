<template>
  <div class="flex flex-col gap-6">
    <PageHeader :title="$t('reports.title')" :subtitle="$t('reports.subtitle')" />

    <Alert
      v-if="loadError"
      :variant="loadError === 'not-ready' ? 'default' : 'destructive'"
      :data-state="loadError"
      data-testid="reports-error"
    >
      <AlertTitle>{{ $t(loadErrorTitleKey) }}</AlertTitle>
      <AlertDescription>{{ $t(loadErrorMessageKey) }}</AlertDescription>
    </Alert>

    <template v-else>
      <ReportFilters v-model="filters" :projects="projects" />

      <!-- Summary is a secondary panel — code-split (D10), never blocking the table. -->
      <ReportSummary v-if="summary" :summary="summary" />

      <EvaluationsTable :rows="rows" />
    </template>
  </div>
</template>

<script setup lang="ts">
import PageHeader from '@/components/molecules/PageHeader.vue'
import { ref, computed, onMounted, watch, defineAsyncComponent } from 'vue'
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

async function load(): Promise<void> {
  try {
    const [indexResponse, summaryResponse] = await Promise.all([
      index(filters.value),
      fetchSummary(filters.value),
    ])
    rows.value = indexResponse.data
    // The generated `by_status` type (`unknown[]`) is a Scramble mistype —
    // it is actually a status-keyed object at runtime (see
    // ReportSummary.vue's own note, verified against
    // `EvaluationIndexController.php:114-123`'s `pluck('aggregate', 'status')`).
    summary.value = summaryResponse.data as unknown as EvaluationsSummary
    loadError.value = null
  } catch (error) {
    loadError.value = resolveResourceErrorState(error)
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
