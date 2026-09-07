<template>
  <section class="flex flex-col gap-4" :aria-labelledby="headingId">
    <h2 :id="headingId" class="text-lg font-semibold text-foreground">
      {{ $t('dashboard.activity.title') }}
    </h2>

    <!--
      THREE states, not two. "We could not fetch this" is not "there is nothing
      here", and collapsing them put an affirmative FALSE sentence on the
      screen: a 403 or a 500 on the feed rendered "No candidates yet. They
      appear here as soon as the calling system creates one." — a confident
      statement about the operator's data, made without having read it.
      `error-state.ts`'s own docblock names this exact failure: "letting a
      rejection fall through into an EMPTY state that looks like success".
    -->
    <!--
      `role="status"` because this text appears AFTER an async rejection,
      replacing content, with no focus change — WCAG 2.1 AA SC 4.1.3 Status
      Messages. Without it a screen-reader user gets silence: the panel simply
      stops having a list and nobody says why.

      The inconsistency is what makes it clearly a defect rather than a taste
      call: the METRICS failure on this same page goes through `Alert`, which
      carries `role="alert"` and IS announced. Two async failures, one screen,
      one spoken and one mute.

      `status` rather than `alert`: the counters above are still good, so this
      is polite information about a secondary panel, not an interruption.

      And the region is rendered UNCONDITIONALLY, with only its TEXT toggled.
      `v-if` on the region itself put the element and its content into the DOM
      in the same frame — and screen readers announce a live region by watching
      for mutations INSIDE one already in the accessibility tree, so a region
      inserted with its text already present is unreliably announced across
      NVDA, JAWS and VoiceOver. The first version of this fix reproduced the
      silence it was written to end.
    -->
    <p role="status" class="text-sm text-muted-foreground" :data-testid="regionTestId">
      {{ statusKey ? $t(statusKey) : '' }}
    </p>

    <ol
      v-if="!failure && !loading && rows.length > 0"
      class="flex flex-col"
      data-testid="activity-list"
    >
      <!--
        Keyed on `row.id`, not on the display fields. This keyed on
        `project_name` — typed `string | null`, so it stringified to "null-…" —
        plus `candidate_ref`, while this component's own spec asserts the row
        LINKS on the id "never on the calling system's reference", because
        `candidate_ref` is opaque and addresses nothing in this product. The
        file argued the point and keyed on it anyway. Two projects sharing a
        name in one organization with the same reference gives duplicate keys,
        and Vue reuses the wrong DOM node.
      -->
      <li
        v-for="row in rows"
        :key="row.id"
        class="flex items-center gap-4 border-b border-border py-3 last:border-b-0"
      >
        <div class="flex min-w-0 flex-1 flex-col">
          <!--
            A LINK, not a label. The feed exists to answer "is anything
            moving?", and a row that names a candidate without a way to go and
            look sends the reader to the search box on another page — which is
            the trip this panel was added to remove.
          -->
          <NuxtLink
            :to="`/participants/${row.id}`"
            class="truncate text-sm font-medium text-foreground hover:underline"
            data-testid="activity-candidate-link"
            >{{ row.display_name }}</NuxtLink
          >
          <span class="truncate text-xs text-muted-foreground">{{
            row.project_name ?? $t('dashboard.activity.noProject')
          }}</span>
        </div>

        <StatusBadge :status="row.status" />

        <!--
          `datetime` carries the machine-readable instant while the text is
          locale-formatted: the two are not the same value and conflating them
          is how a date ends up unreadable to one of the two audiences.
        -->
        <time
          :datetime="row.updated_at"
          class="w-32 shrink-0 text-right text-xs text-muted-foreground"
        >
          {{ formatDate(row.updated_at, locale) }}
        </time>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
/**
 * The dashboard's recent-activity feed (DESIGN.md §8.2).
 *
 * The dashboard was four counters and 650px of nothing: it said how much work
 * existed but never what had just happened, so the answer to "is anything
 * moving?" lived one page away in the candidate list.
 *
 * Presentational: the page owns the fetch, this owns the rendering. Rows arrive
 * already ordered by the API (most recent first) and already capped, so there
 * is no sorting or slicing here to drift out of step with the server.
 */
import { computed, useId } from 'vue'
import StatusBadge from '@/components/atoms/StatusBadge.vue'
import { formatDate } from '@/utils/format'
import { resourceErrorKey, type ResourceErrorState } from '@/utils/error-state'
import type { DashboardActivityRow } from '@/composables/useDashboardMetrics'

const props = withDefaults(
  defineProps<{
    rows: DashboardActivityRow[]
    locale: string
    /**
     * How the feed's own read failed, or null if it did not.
     *
     * This was `failed: boolean`, and that was a defect by this page's own
     * standard: the METRICS read on the same screen resolves through
     * `resolveResourceErrorState` and keeps 409/403/404/500 distinct, while the
     * feed flattened all four into one sentence. An operator without the
     * candidate-list ability read "could not be loaded", retried, and filed a
     * bug, because nothing said PERMISSION.
     *
     * It happens to be unreachable today — both endpoints authorize through
     * `AdminParticipantReader::listQuery()`, so a 403 fails the metrics read
     * too and this panel is hidden behind that error. That coupling is a fact
     * about the API this component cannot see and does not control.
     */
    failure?: ResourceErrorState | null
    /**
     * A read is in flight. Distinct from BOTH other states: an empty feed is a
     * claim about the operator's data, and making it before the first response
     * lands is making it without having read anything.
     */
    loading?: boolean
  }>(),
  { failure: null, loading: false }
)

/**
 * Unique per instance: two feeds on one page sharing a hardcoded heading id
 * gives duplicate ids and makes `getByRole('region', { name })` ambiguous —
 * and `MetricCard` next door already argues the case for `useId()`.
 */
const headingId = useId()

/**
 * The live region's i18n KEY, empty when the feed loaded fine — a region that
 * always says something has nothing left to announce.
 *
 * A key rather than translated text, and `$t` in the template rather than
 * `useI18n()` here: this component is mounted in unit tests with `$t` stubbed
 * globally and no i18n plugin installed, so calling `useI18n()` throws "Need to
 * install with `app.use` function" and takes every existing spec down with it.
 */
const statusKey = computed<string>(() => {
  if (props.failure) return resourceErrorKey(props.failure, 'message')
  if (props.loading) return 'dashboard.activity.loading'
  // An empty feed is a state, not a failure: a brand-new organization has no
  // candidates yet, and a blank panel would read as something broken. It says
  // what will fill it and who fills it, because BEAI never creates candidates
  // itself (CLAUDE.md, ruling 8).
  //
  // It lives IN the live region rather than in a paragraph beside it, and that
  // is not tidiness. This component spends fifteen lines arguing that a message
  // appearing after an async resolution with no focus change needs
  // `role="status"` — and then applied that reasoning to the failure branch
  // only. On a slow load of an empty feed a screen reader heard "Loading...",
  // then the region emptied, then a plain paragraph was inserted OUTSIDE it:
  // silence, which is exactly the silence the region was added to end. Empty
  // and failed are the same class of message — a claim about the operator's
  // data, delivered after an async resolution.
  if (props.rows.length === 0) return 'dashboard.activity.empty'

  return ''
})

/**
 * Which of the four states the region is in, as a test hook.
 *
 * `activity-empty` keeps its name: the page spec and the E2E both query it, and
 * it now marks the same message in the place it should always have been
 * rendered.
 */
const regionTestId = computed<string>(() => {
  if (props.failure) return 'activity-failed'
  if (props.loading) return 'activity-loading'
  if (props.rows.length === 0) return 'activity-empty'

  return 'activity-status'
})
</script>
