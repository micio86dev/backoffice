<template>
  <div class="flex flex-col gap-6">
    <PageHeader :title="$t('dashboard.title')" :subtitle="$t('dashboard.subtitle')" />

    <Alert
      v-if="loadError"
      :variant="loadError === 'not-ready' ? 'default' : 'destructive'"
      :data-state="loadError"
      data-testid="dashboard-error"
    >
      <AlertTitle>{{ $t(loadErrorTitleKey) }}</AlertTitle>
      <AlertDescription>{{ $t(loadErrorMessageKey) }}</AlertDescription>
    </Alert>
    <p v-else-if="!metrics" class="text-muted-foreground text-sm">
      {{ $t('dashboard.kpi.noData') }}
    </p>
    <div v-else class="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <MetricCard
        :label="$t('dashboard.kpi.totalParticipants')"
        :value="formatNumber(totalParticipants, locale)"
      />
      <MetricCard
        :label="$t('dashboard.kpi.completionRate')"
        :value="formatPercent(metrics.completion_rate, locale)"
      />
      <MetricCard
        :label="$t('dashboard.kpi.tokensUsed')"
        :value="formatNumber(totalTokens, locale)"
      />
      <MetricCard :label="$t('dashboard.kpi.latency')" :value="latencyLabel" />
    </div>
  </div>
</template>

<script setup lang="ts">
// Usage + AI-cost KPI cards only (D7) — no billing/MRR/trial widget, not
// even disabled/placeholder (observability delta scenario).
import PageHeader from '@/components/molecules/PageHeader.vue'
import { ref, computed, onMounted } from 'vue'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import MetricCard from '@/components/molecules/MetricCard.vue'
import { useDashboardMetrics, type DashboardMetrics } from '@/composables/useDashboardMetrics'
import { formatNumber, formatPercent } from '@/utils/format'
import {
  resolveResourceErrorState,
  resourceErrorKey,
  type ResourceErrorState,
} from '@/utils/error-state'

definePageMeta({
  name: 'dashboard',
})

const { t, locale } = useI18n()

useHead({
  // A <title> is user-facing (browser tab, bookmark, window switcher, and the
  // first thing a screen reader announces on navigation) — it goes through
  // i18n like every other user-facing string.
  title: () => t('head.title.dashboard'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { fetchMetrics } = useDashboardMetrics()

const metrics = ref<DashboardMetrics | null>(null)

// A failed metrics fetch must NEVER fall through to the "no data yet"
// placeholder: that reports a 403 to the operator as an empty tenant (D4).
const loadError = ref<ResourceErrorState | null>(null)

const loadErrorTitleKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'title'))
const loadErrorMessageKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'message'))

const totalParticipants = computed(() =>
  metrics.value
    ? Object.values(metrics.value.participants_by_status).reduce((sum, count) => sum + count, 0)
    : 0
)

const totalTokens = computed(() =>
  metrics.value ? metrics.value.ai_usage.input_tokens + metrics.value.ai_usage.output_tokens : 0
)

const latencyLabel = computed(() => {
  if (!metrics.value) return '–'
  const { latency_ms_p50, latency_ms_p95 } = metrics.value.ai_usage
  const p50 = latency_ms_p50 === null ? '–' : formatNumber(latency_ms_p50, locale.value)
  const p95 = latency_ms_p95 === null ? '–' : formatNumber(latency_ms_p95, locale.value)
  // The unit and the separator are user-facing copy, not machine-readable
  // values — they belong in the locale files, not in a template literal.
  return t('dashboard.kpi.latencyValue', { p50, p95 })
})

onMounted(async () => {
  try {
    const response = await fetchMetrics()
    metrics.value = response.data
    loadError.value = null
  } catch (error) {
    loadError.value = resolveResourceErrorState(error)
  }
})
</script>
