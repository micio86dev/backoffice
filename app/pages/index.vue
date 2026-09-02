<template>
  <div class="flex flex-col gap-6">
    <PageHeader :title="$t('dashboard.title')" :subtitle="$t('dashboard.subtitle')" />

    <!--
      Above everything it filters, so the period is read before the numbers
      rather than discovered after wondering why they changed.
    -->
    <DashboardFilters :locale="locale" @change="onRangeChange" />

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
      <MetricCard
        :label="$t('dashboard.kpi.cost')"
        :value="costLabel"
        :detail="costBreakdown"
        data-testid="dashboard-cost"
      />
    </div>

    <RecentActivity v-if="!loadError" :rows="activity" :locale="locale" />
  </div>
</template>

<script setup lang="ts">
// Usage + AI-cost KPI cards only (D7) — no billing/MRR/trial widget, not
// even disabled/placeholder (observability delta scenario).
import PageHeader from '@/components/molecules/PageHeader.vue'
import { ref, computed, onMounted } from 'vue'
import DashboardFilters from '@/components/molecules/DashboardFilters.vue'
import type { DateRange } from '@/utils/dashboard-period'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import RecentActivity from '@/components/organisms/RecentActivity.vue'
import MetricCard from '@/components/molecules/MetricCard.vue'
import {
  useDashboardMetrics,
  type DashboardMetrics,
  type DashboardActivityRow,
} from '@/composables/useDashboardMetrics'
import { formatNumber, formatPercent, formatUsdAmount } from '@/utils/format'
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

const { fetchMetrics, fetchActivity } = useDashboardMetrics()

const metrics = ref<DashboardMetrics | null>(null)
const activity = ref<DashboardActivityRow[]>([])

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

/**
 * What the organization has spent, in USD.
 *
 * The currency comes from the API rather than from a symbol hardcoded here.
 * It is USD everywhere today because that is what every provider bills in, and
 * nothing converts it: putting a conversion in front of a figure an operator
 * may reconcile against an invoice would mean choosing an exchange rate on
 * their behalf.
 *
 * `formatUsdAmount` widens precision below a cent. One interview's
 * conversation spend is routinely a fraction of one, and two fixed decimals
 * would round a real charge to `0.00` — which reads as free.
 */
const costLabel = computed(() => {
  if (!metrics.value) return '–'

  return t('dashboard.kpi.costValue', {
    usd: formatUsdAmount(metrics.value.costs.total_usd, locale.value),
  })
})

/**
 * The headline answers "how much"; without this line the next question — "on
 * what" — has no answer anywhere on the page. The two halves behave
 * differently: scoring is per completed evaluation and predictable,
 * conversation is per minute of interview and is the one that moves.
 */
const costBreakdown = computed(() => {
  if (!metrics.value) return undefined

  return t('dashboard.kpi.costBreakdown', {
    scoring: formatUsdAmount(metrics.value.costs.scoring_usd, locale.value),
    conversation: formatUsdAmount(metrics.value.costs.conversation_usd, locale.value),
  })
})

/**
 * The period every panel on this page is describing.
 *
 * ONE range passed to BOTH endpoints. Fetching them with separately-derived
 * filters would eventually let the tiles and the activity list cover different
 * months, and nothing on the screen would say so.
 */
const range = ref<DateRange>({})

async function load(): Promise<void> {
  try {
    const response = await fetchMetrics(range.value)
    metrics.value = response.data
    loadError.value = null

    // Deliberately AFTER the metrics call and deliberately swallowed: the feed
    // is context, and a dashboard that refuses to render its counters because a
    // secondary panel failed reports the wrong problem to the operator.
    try {
      activity.value = (await fetchActivity(range.value)).data
    } catch {
      activity.value = []
    }
  } catch (error) {
    loadError.value = resolveResourceErrorState(error)
  }
}

function onRangeChange(next: DateRange): void {
  range.value = next
  void load()
}

onMounted(load)
</script>
