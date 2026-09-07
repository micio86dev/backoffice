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
    <!--
      LOADING is checked before "no data", and that ordering is the fix. `metrics`
      starts null, so on first paint this page told the operator "No data
      available" about numbers nobody had read yet — and it said it again on
      every range change, for as long as the request took.

      It is checked on EVERY load, not only the first, for the other half of the
      same problem: keeping the previous period's figures on screen under the
      new period's filter label makes the page contradict itself with nothing
      saying so, which is exactly what the shared `range` and `loadToken` exist
      to prevent.
    -->
    <div
      v-else-if="loading"
      class="grid grid-cols-2 gap-4 xl:grid-cols-4"
      data-testid="dashboard-loading"
    >
      <Skeleton v-for="n in 5" :key="n" class="h-28 w-full" />
    </div>
    <p v-else-if="!metrics" class="text-muted-foreground text-sm">
      {{ $t('dashboard.kpi.noData') }}
    </p>
    <div v-else class="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <MetricCard
        :label="$t('dashboard.kpi.totalParticipants')"
        :value="formatNumber(totalParticipants, locale)"
        test-id="dashboard-total-participants"
      />
      <MetricCard
        :label="$t('dashboard.kpi.completionRate')"
        :value="formatPercent(metrics.completion_rate, locale)"
        test-id="dashboard-completion-rate"
      />
      <MetricCard
        :label="$t('dashboard.kpi.tokensUsed')"
        :value="formatNumber(totalTokens, locale)"
        test-id="dashboard-tokens-used"
      />
      <MetricCard
        :label="$t('dashboard.kpi.latency')"
        :value="latencyLabel"
        test-id="dashboard-latency"
      />
      <MetricCard
        :label="$t('dashboard.kpi.cost')"
        :value="costLabel"
        :detail="costBreakdown"
        test-id="dashboard-cost"
      />
    </div>

    <RecentActivity
      v-if="!loadError"
      :rows="activity"
      :locale="locale"
      :failure="activityFailure"
      :loading="activityLoading"
    />
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
import { Skeleton } from '@/components/ui/skeleton'
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
// The feed's own read failed. Separate from `loadError`, which is the METRICS
// read: the counters can be perfectly good while the feed is not.
/**
 * How the feed's read failed, or null. Was a boolean, which flattened
 * 409/403/404/500 into one sentence while the metrics read on the same page
 * kept them distinct — the inconsistency is what made it a defect.
 */
const activityFailure = ref<ResourceErrorState | null>(null)

/**
 * A read is in flight. Not derived from `metrics === null`: that is false for
 * every load after the first, which is precisely when stale numbers sit under
 * a filter that has already moved on.
 */
const loading = ref(true)

/**
 * The FEED's own in-flight flag, separate from the tiles'.
 *
 * One shared flag put `loading = false` after the activity fetch, so a slow
 * secondary panel held the counters as skeletons when they had already
 * resolved — the same "a secondary panel must not hold the dashboard hostage"
 * argument the swallowed catch below is built on, one await too late.
 */
const activityLoading = ref(true)

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
  // Unreachable in the template — the KPI grid renders inside `v-else` of
  // `!metrics` — but kept as the computed's own contract, since a computed that
  // dereferences a nullable ref should say what it does when it is null.
  if (!metrics.value) return t('dashboard.kpi.notMeasured')
  const { latency_ms_p50, latency_ms_p95 } = metrics.value.ai_usage
  // The unit travels WITH a number, or not at all.
  //
  // `latencyValue` used to be "{p50} / {p95} ms", with `ms` glued to the end of
  // the joining template. Interpolating the missing-value label into a slot a
  // unit follows produced "not measured / not measured ms" — "not measured
  // milliseconds", which is worse than the bare dash it replaced. The dash
  // needed a label; the label needed to not inherit somebody else's unit.
  const measured = (value: number | null): string =>
    value === null
      ? t('dashboard.kpi.notMeasured')
      : t('dashboard.kpi.latencyMs', { value: formatNumber(value, locale.value) })

  const p50 = measured(latency_ms_p50)
  const p95 = measured(latency_ms_p95)
  // The unit and the separator are user-facing copy, not machine-readable
  // values — they belong in the locale files, not in a template literal.
  return t('dashboard.kpi.latencyValue', { p50, p95 })
})

/**
 * What the organization has spent, in USD.
 *
 * The currency comes from the API. `useDashboardMetrics` types
 * `costs.currency` and its docblock says it is "carried rather than assumed —
 * a bare number on a dashboard is read in whatever currency the reader happens
 * to think in". The page then assumed anyway: `$` was baked into the i18n
 * string in BOTH locales, which is the one place nobody looks for a business
 * rule, on a figure an operator may reconcile against an invoice. The symbol is
 * now a parameter and the contract's value is what renders.
 *
 * Nothing CONVERTS it, and that is deliberate: putting a conversion in front of
 * a figure an operator may reconcile against an invoice would mean choosing an
 * exchange rate on their behalf.
 *
 * `formatUsdAmount` widens precision below a cent. One interview's
 * conversation spend is routinely a fraction of one, and two fixed decimals
 * would round a real charge to `0.00` — which reads as free.
 */
const costLabel = computed(() => {
  // Unreachable for the same reason as `latencyLabel` above.
  if (!metrics.value) return t('dashboard.kpi.notMeasured')

  return t('dashboard.kpi.costValue', {
    currency: metrics.value.costs.currency,
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
    currency: metrics.value.costs.currency,
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

/**
 * Which load is the current one.
 *
 * `onRangeChange` fires `load()` with nothing guarding order, and both fetches
 * are bare requests with no dedup. Change year, then month quickly, and two
 * loads are in flight: whichever resolves LAST wins, so the slower, older range
 * can overwrite the newer one. The filter above then confidently displays a
 * period the numbers below are not describing.
 *
 * That is the same divergence the shared `range` was introduced to prevent —
 * it stops the two PANELS disagreeing with each other, and did nothing about
 * either disagreeing with the FILTER. Same class of problem as `useAuth`'s
 * single-flight refresh, and the same shape of answer: a stale resolution is
 * dropped rather than rendered.
 */
let loadToken = 0

async function load(): Promise<void> {
  const token = ++loadToken
  const isStale = (): boolean => token !== loadToken

  loading.value = true
  activityLoading.value = true

  // Cleared at the START, not on success. A retry after a 403 kept rendering
  // "You do not have permission" for the whole in-flight read, so the panel
  // never said it was loading: `statusKey` checks `failure` before `loading`,
  // and `v-if="loadError"` wins over `v-else-if="loading"`. Stale state
  // outranking the fresh read is the same defect the loading state was added
  // to fix, one variable over.
  loadError.value = null
  activityFailure.value = null

  try {
    const response = await fetchMetrics(range.value)
    if (isStale()) return

    metrics.value = response.data
    // The tiles are ready HERE — before the feed is fetched, so a slow feed
    // cannot hold them.
    loading.value = false

    // Deliberately AFTER the metrics call and deliberately swallowed: the feed
    // is context, and a dashboard that refuses to render its counters because a
    // secondary panel failed reports the wrong problem to the operator.
    try {
      const rows = (await fetchActivity(range.value)).data
      if (isStale()) return

      activity.value = rows
    } catch (activityError) {
      if (isStale()) return

      // Swallowed so the counters still render — but RECORDED, not laundered
      // into an empty feed. `activity.value = []` alone made the panel say "No
      // candidates yet", an affirmative claim about the operator's data made
      // without having read it.
      activity.value = []
      activityFailure.value = resolveResourceErrorState(activityError)
    }
  } catch (error) {
    if (isStale()) return

    loadError.value = resolveResourceErrorState(error)
  } finally {
    // Guarded like every other write in here: a superseded load must not clear
    // the flags out from under the load that replaced it, or the skeletons
    // vanish while the current request is still in flight.
    if (!isStale()) {
      loading.value = false
      activityLoading.value = false
    }
  }
}

function onRangeChange(next: DateRange): void {
  range.value = next
  void load()
}

onMounted(load)
</script>
