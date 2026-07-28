<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-2xl font-semibold text-foreground">{{ $t('dashboard.title') }}</h1>

    <p v-if="!metrics" class="text-muted-foreground text-sm">{{ $t('dashboard.kpi.noData') }}</p>
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
import { ref, computed, onMounted } from 'vue'
import MetricCard from '@/components/molecules/MetricCard.vue'
import { useDashboardMetrics, type DashboardMetrics } from '@/composables/useDashboardMetrics'
import { formatNumber, formatPercent } from '@/utils/format'

definePageMeta({
  name: 'dashboard',
})

useHead({
  title: 'Dashboard',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { locale } = useI18n()
const { fetchMetrics } = useDashboardMetrics()

const metrics = ref<DashboardMetrics | null>(null)

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
  return `${p50} / ${p95} ms`
})

onMounted(async () => {
  const response = await fetchMetrics()
  metrics.value = response.data
})
</script>
