<template>
  <Badge :variant="variant">
    <CheckCircleIcon v-if="status === 'judged'" aria-hidden="true" class="size-4" />
    <ExclamationCircleIcon v-else-if="status === 'unavailable'" aria-hidden="true" class="size-4" />
    <ExclamationTriangleIcon v-else-if="status === 'malformed'" aria-hidden="true" class="size-4" />
    <MinusCircleIcon v-else-if="status === 'skipped'" aria-hidden="true" class="size-4" />
    <QuestionMarkCircleIcon
      v-else-if="status === 'never_audited'"
      aria-hidden="true"
      class="size-4"
    />
    <NoSymbolIcon v-else aria-hidden="true" class="size-4" />
    <span aria-hidden="true">{{ display }}</span>
    <span class="sr-only">
      {{ $t(labelKey) }}
      <template v-if="percentage">— {{ percentage }}</template>
      <template v-if="reasonKey">— {{ $t(reasonKey) }}</template>
    </span>
  </Badge>
</template>

<script setup lang="ts">
// AuditFlag — the net-new, per-indicator audit signal (scoring-audit-jev
// design D9, admin-backoffice spec "A Net-New Review-Status Element Renders
// Per-Indicator Audit Signal — ScoreChip Stays Score-Only").
//
// Deliberately its OWN element, never folded into ScoreChip: ScoreChip
// encodes the numeric score the model assigned; this encodes whether that
// score's evidence was later JUDGED to support it — two different
// questions, and ScoreChip's own output MUST stay byte-identical whether or
// not an indicator was ever audited (IndicatorEvidence.spec.ts pins this).
//
// Five wire statuses, five distinct Badge variants (utils/audit.ts) — the
// spec's own scenario requires "visually and semantically distinct"
// treatment per status. `support_probability` is a SEPARATE axis: rendered
// verbatim as a percentage with no derived band (D9 / CLAUDE.md ruling 1's
// precedent, already applied to `reliability` by ReliabilityBadge.vue) — a
// low probability renders identically to a high one apart from the number
// itself; nothing here colours or labels the VALUE.
//
// Each status ALSO renders its own VISIBLE icon (WCAG 2.1 AA 1.4.1 — meaning
// is never conveyed by colour alone). Four of the five statuses carry no
// `support_probability` and would otherwise all render the same neutral "–"
// glyph, distinguishable only by the Badge's colour variant — exactly the
// failure ScoreChip's own docblock already refuses to reproduce for score
// rendering (independent signals: icon shape + border style + colour, never
// colour alone).
import { computed } from 'vue'
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
  QuestionMarkCircleIcon,
  NoSymbolIcon,
} from '@heroicons/vue/24/outline'
import { Badge } from '@/components/ui/badge'
import {
  auditFlagVariant,
  auditFlagLabelKey,
  auditOutcomeReasonKey,
  auditSupportPercentage,
} from '@/utils/audit'

const props = defineProps<{
  // `EvaluationAuditVerdict['status']` (useEvaluationReport.ts) is `string`
  // (the closed 5-value vocabulary is a database/serializer invariant, not
  // expressible in the generated OpenAPI type). `utils/audit.ts`'s mapping
  // functions are TOTAL over any string, with an explicit `unknown` fallback
  // for anything outside the five known values.
  status: string
  supportProbability: number | null
  outcomeReason: string | null
}>()

const variant = computed(() => auditFlagVariant(props.status))
const labelKey = computed(() => auditFlagLabelKey(props.status))
const reasonKey = computed(() => auditOutcomeReasonKey(props.outcomeReason))

// `judged` renders the probability verbatim; every other status renders a
// neutral dash — the same "no bare literal" discipline ScoreChip already
// applies to its own unassessable state.
const display = computed(() => auditSupportPercentage(props.supportProbability) ?? '–')

// The percentage is REAL, non-bucketed information (D9/ruling 1's "render
// verbatim" doctrine) — hiding it from assistive tech would be a content
// loss, not a decorative omission, unlike the dash glyph the non-`judged`
// statuses render (which asserts nothing). Read into the sr-only label
// separately from `display`, whose own `aria-hidden="true"` keeps it out of
// the accessibility tree entirely.
const percentage = computed(() => auditSupportPercentage(props.supportProbability))
</script>
