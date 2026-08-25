<template>
  <div class="flex flex-col gap-8" data-testid="session-review">
    <!--
      Facts first: an operator opening a review wants to know what ran, for how
      long, and roughly what it cost, before being shown anything interpretive.
    -->
    <section class="grid gap-4 md:grid-cols-4" aria-label="">
      <MetricCard :label="$t('review.duration')" :value="durationLabel" />
      <MetricCard :label="$t('review.provider')" :value="review.provider" />
      <MetricCard :label="$t('review.status')" :value="review.status" />
      <MetricCard :label="$t('review.costEstimate')" :value="costLabel" />
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
import MetricCard from '@/components/molecules/MetricCard.vue'
import { formatDate, formatDuration } from '@/utils/format'
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
const costLabel = computed(() => {
  const avatar = props.review.cost.avatar
  if (avatar === null) return '–'

  return t('review.costValue', { usd: avatar.usd.toFixed(2) })
})

function durationOf(event: IntegrityEventRow): number | null {
  const ms = event.payload?.durationMs
  return typeof ms === 'number' && ms > 0 ? Math.round(ms / 1000) : null
}
</script>
