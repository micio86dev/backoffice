<template>
  <div class="flex flex-col gap-8" data-testid="session-review">
    <!--
      Facts first: an operator opening a review wants to know what ran, for how
      long, and roughly what it cost, before being shown anything interpretive.
    -->
    <section class="grid gap-4 md:grid-cols-3" aria-label="">
      <MetricCard :label="$t('review.duration')" :value="durationLabel" />
      <MetricCard :label="$t('review.provider')" :value="review.provider" />
      <MetricCard :label="$t('review.status')" :value="review.status" />
    </section>

    <!--
      Cost gets a section of its own rather than a fourth metric card, because
      there is no single cost figure to put on a card. Avatar minutes and
      conversation-LLM tokens are billed by DIFFERENT vendors on DIFFERENT
      meters, and the refusal to add them is already ratified server-side at
      `api/app/Services/Proctoring/SessionCostEstimator.php:20-22` — "one
      total would be a number with no owner". Two labelled lines, each naming
      its meter, is the only honest rendering.
    -->
    <section class="flex flex-col gap-3" aria-labelledby="review-cost-heading">
      <div class="flex items-center gap-2">
        <h2 id="review-cost-heading" class="text-lg font-semibold text-foreground">
          {{ $t('review.costEstimate') }}
        </h2>
        <HelpTip term="llmCost" />
      </div>

      <p class="max-w-[65ch] text-sm text-muted-foreground">
        {{ $t('review.cost.separateMeters') }}
      </p>

      <dl class="flex flex-col" data-testid="session-cost">
        <div
          class="flex flex-wrap items-baseline justify-between gap-4 border-b border-border py-2"
          data-testid="cost-avatar"
        >
          <dt class="text-sm text-muted-foreground">
            {{ $t('review.cost.avatarMeter', { provider: review.provider }) }}
          </dt>
          <dd class="text-sm font-medium text-foreground">{{ avatarCostLabel }}</dd>
        </div>

        <!--
          Every row is a DIRECT `div > dt + dd` child of the `dl`, and stays
          that way. Grouping the LLM rows under a second wrapper div nested one
          level deeper is real, serious axe breakage (`definition-list` +
          `dlitem`) — caught by `tests/e2e/session-review-cost.spec.ts`'s axe
          run, not by a component spec, which is why that E2E exists.

          No usage row at all: the session's LLM binding resolved unbound or
          degraded, so BEAI never ran a model it can price. Rendering 0 here
          would state a price — and the wrong one.
        -->
        <div
          v-if="review.cost.llm === null"
          class="flex flex-wrap items-baseline justify-between gap-4 py-2"
          data-testid="cost-llm-absent"
        >
          <dt class="text-sm text-muted-foreground">{{ $t('review.cost.llmMeter') }}</dt>
          <dd class="max-w-[45ch] text-sm text-muted-foreground">
            {{ $t('review.cost.llmNotBilled') }}
          </dd>
        </div>

        <div
          v-else
          class="flex flex-wrap items-baseline justify-between gap-4 py-2"
          data-testid="cost-llm-estimated"
        >
          <dt class="text-sm text-muted-foreground">{{ $t('review.cost.llmEstimated') }}</dt>
          <dd class="text-sm font-medium text-foreground">{{ llmEstimatedLabel }}</dd>
        </div>

        <!--
          Rendered ONLY when the API sends a figure. In managed mode the
          provider calls Google on its own account, so `actual_usd` is
          permanently null and an always-empty Actual row would be a knob that
          never turns. The column exists for a later change in which BEAI runs
          the model itself.
        -->
        <div
          v-if="review.cost.llm !== null && review.cost.llm.actual_usd !== null"
          class="flex flex-wrap items-baseline justify-between gap-4 border-t border-border py-2"
          data-testid="cost-llm-actual"
        >
          <dt class="text-sm text-muted-foreground">{{ $t('review.cost.llmActual') }}</dt>
          <dd class="text-sm font-medium text-foreground">{{ llmActualLabel }}</dd>
        </div>
      </dl>
    </section>

    <section class="flex flex-col gap-3" aria-labelledby="review-integrity-heading">
      <div class="flex items-center gap-3">
        <h2 id="review-integrity-heading" class="text-lg font-semibold text-foreground">
          {{ $t('review.integrity.title') }}
        </h2>
        <!--
          A null band means the system has NO OPINION, and it must LOOK like
          one. Falling back to "Rischio basso" here is the defect this whole
          change exists to remove: it asserted a candidate had behaved well from
          observations nobody made.
        -->
        <Badge
          v-if="review.integrity.band === null"
          :class="BAND_CLASS.unmeasured"
          data-testid="integrity-band"
        >
          {{ $t('review.integrity.notMeasured') }}
        </Badge>
        <Badge v-else :class="BAND_CLASS[review.integrity.band]" data-testid="integrity-band">
          {{ $t(`review.integrity.band.${review.integrity.band}`) }}
        </Badge>
        <span class="text-sm text-muted-foreground" data-testid="integrity-score">
          {{ $t('review.integrity.score', { score: review.integrity.score }) }}
        </span>
      </div>

      <!--
        Named explicitly, and beside the badge rather than buried below the
        timeline: an operator scanning a list reads the badge, so the reason it
        is missing has to travel with it.

        Tested for `=== false`, not falsiness. An API that predates these fields
        sends neither, and `undefined` there means "this server has no opinion
        about coverage" — not "coverage was incomplete". Warning on every session
        during a version skew would be noise, and noise is how a real warning
        stops being read.
      -->
      <p
        v-if="review.integrity.coverage_complete === false"
        class="text-sm text-warning-dark"
        data-testid="integrity-coverage-warning"
      >
        {{ $t('review.integrity.coverageIncomplete') }}
        <span v-if="review.integrity.unavailable_layers.length > 0">
          {{ $t('review.integrity.unavailableLayers', { layers: unavailableLayerLabels }) }}
        </span>
      </p>

      <!--
        The score is an input to the operator's judgement, never a verdict on
        the candidate — so the events that produced it are always listed beside
        it. A band nobody can check against its evidence cannot be disagreed
        with, and a judgement that cannot be disagreed with is not one.
      -->
      <p
        v-if="review.integrity.total === 0"
        class="text-sm text-muted-foreground"
        data-testid="integrity-empty"
      >
        {{ $t('review.integrity.none') }}
      </p>

      <ol v-else class="flex flex-col" data-testid="integrity-events">
        <li
          v-for="(event, index) in review.integrity.events"
          :key="`${event.ts}-${index}`"
          class="flex items-baseline gap-4 border-b border-border py-2 last:border-b-0"
        >
          <time :datetime="event.ts" class="w-40 shrink-0 text-xs text-muted-foreground">
            {{ formatDate(event.ts, locale) }}
          </time>
          <span class="text-sm text-foreground">{{
            $t(`review.integrity.kind.${event.kind}`)
          }}</span>
          <span v-if="durationOf(event) !== null" class="text-xs text-muted-foreground">
            {{ $t('review.integrity.forSeconds', { seconds: durationOf(event) }) }}
          </span>
        </li>
      </ol>
    </section>

    <section class="flex flex-col gap-3" aria-labelledby="review-snapshots-heading">
      <h2 id="review-snapshots-heading" class="text-lg font-semibold text-foreground">
        {{ $t('review.snapshots.title') }}
      </h2>

      <p
        v-if="review.snapshots.length === 0"
        class="text-sm text-muted-foreground"
        data-testid="snapshots-empty"
      >
        {{ $t('review.snapshots.none') }}
      </p>

      <div v-else class="flex flex-wrap gap-3" data-testid="snapshots">
        <figure v-for="shot in review.snapshots" :key="shot.url" class="flex flex-col gap-1">
          <!-- The URL is signed and expiring; it is used exactly as the API
               gave it, never rebuilt from a key the client does not have. -->
          <img
            :src="shot.url"
            :alt="$t('review.snapshots.alt', { time: formatDate(shot.taken_at, locale) })"
            class="h-24 w-32 rounded-lg border border-border object-cover"
            loading="lazy"
          />
          <figcaption class="text-xs text-muted-foreground">
            {{ formatDate(shot.taken_at, locale) }}
          </figcaption>
        </figure>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * One interview session, reviewed (C11).
 *
 * Presentational: the page fetches, this renders. The integrity score arrives
 * computed from the server and is NOT recomputed here — two implementations of
 * a weighted score diverge, and the figure an operator acts on has to be the
 * one the API can defend (design D3).
 */
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import HelpTip from '@/components/atoms/HelpTip.vue'
import MetricCard from '@/components/molecules/MetricCard.vue'
import { formatDate, formatDuration, formatUsdAmount } from '@/utils/format'
import type { IntegrityEventRow, SessionReview } from '@/composables/useSessionReview'

const props = defineProps<{
  review: SessionReview
  locale: string
}>()

const { t, te } = useI18n()

const BAND_CLASS: Record<string, string> = {
  // Deliberately NOT the success palette. "Not measured" must never be able to
  // read, at a glance down a list, as a clean result.
  unmeasured: 'bg-muted text-muted-foreground',
  low: 'bg-success-light text-success-dark',
  medium: 'bg-warning-light text-warning-dark',
  high: 'bg-error-light text-destructive',
}

/**
 * The dead layers, translated and joined for display.
 *
 * An unrecognised layer name falls back to its raw value rather than being
 * dropped: a detector we cannot name still did not run, and silently omitting
 * it would understate the gap — the exact failure mode this change removes.
 */
const unavailableLayerLabels = computed(() =>
  (props.review.integrity.unavailable_layers ?? [])
    .map((layer) => {
      const key = `review.integrity.layer.${layer}`
      return te(key) ? t(key) : layer
    })
    .join(', ')
)

const durationLabel = computed(() => formatDuration(props.review.duration_seconds, t))

// Always the word "estimate": no provider exposes a per-session billed amount,
// and an operator who reads this as an invoice line will reconcile it against a
// real bill and find a discrepancy that was never a defect.
//
// One formatter for every cost figure on this panel. Two meters rendered by
// two different code paths drift into two different shapes, and a reader
// comparing them then has to work out whether the difference is in the money
// or in the formatting.
function costLabel(usd: number): string {
  return t('review.costValue', { usd: formatUsdAmount(usd, props.locale) })
}

const avatarCostLabel = computed(() => {
  const avatar = props.review.cost.avatar
  // A dash, never 0 — an unpriceable session is not a free one.
  if (avatar === null) return '–'

  return costLabel(avatar.usd)
})

/**
 * The session's conversation-LLM spend, as a TOTAL for the session.
 *
 * Deliberately NOT divided by duration. Input tokens grow QUADRATICALLY in
 * turn count, because the model is re-sent the entire conversation on every
 * turn — minute 20 costs several times minute 1. A per-minute figure would be
 * arithmetically meaningless, and worse, an operator would multiply it by a
 * session length and get a confidently wrong answer.
 */
const llmEstimatedLabel = computed(() => {
  const usd = props.review.cost.llm?.estimated_usd
  if (usd === null || usd === undefined) return '–'

  return costLabel(usd)
})

/** Present only in a future non-managed mode; see the template comment. */
const llmActualLabel = computed(() => {
  const usd = props.review.cost.llm?.actual_usd
  if (usd === null || usd === undefined) return '–'

  return formatUsdAmount(usd, props.locale)
})

function durationOf(event: IntegrityEventRow): number | null {
  const ms = event.payload?.durationMs
  return typeof ms === 'number' && ms > 0 ? Math.round(ms / 1000) : null
}
</script>
