<template>
  <section :aria-labelledby="headingId" class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-baseline gap-2">
        <h3 :id="headingId" class="text-foreground text-sm font-semibold">
          {{ $t('report.evidence.title') }}
        </h3>
        <HelpTip term="excerpt" />
      </div>

      <Button
        v-if="allValues.length > 0"
        variant="ghost"
        size="sm"
        data-testid="evidence-toggle-all"
        @click="toggleAll"
      >
        {{ allOpen ? $t('report.evidence.collapseAll') : $t('report.evidence.expandAll') }}
      </Button>
    </div>

    <p class="text-muted-foreground text-xs leading-5">{{ $t('report.evidence.intro') }}</p>

    <Accordion v-model="open" type="multiple" class="flex flex-col gap-5">
      <div v-for="(result, code) in evaluation" :key="code" class="flex flex-col gap-1">
        <h4 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {{ code }}
        </h4>

        <p v-if="result.behaviors.length === 0" class="text-muted-foreground text-sm">
          {{ $t(emptyKey(result), { reason: result.unscorable_reason }) }}
        </p>

        <template v-else>
          <IndicatorEvidence
            v-for="(behavior, index) in result.behaviors"
            :key="index"
            :value="itemValue(code, index)"
            :behavior="behavior"
          />
        </template>
      </div>
    </Accordion>
  </section>
</template>

<script setup lang="ts">
/**
 * The evidence half of the BARS report, rebuilt as disclosures.
 *
 * What it replaces: a flat block that re-listed every competency and printed
 * indicator text + excerpts with no scores, while the grid above printed
 * scores with no indicator text. Two renderings of the same evaluation, and
 * the join between them left to the reader.
 *
 * How the join works now: within a competency group, item N is the indicator
 * that drew chip N in that competency's strip in the grid — same order, same
 * ScoreChip component, same accessible label. The intro line states that
 * relationship in words rather than leaving the operator to infer it.
 *
 * Collapsed by default, on purpose: the grid is the summary and this is the
 * detail behind it. "Expand all" exists for the operator who wants to read
 * (or print) the whole thing, and is the only reason this component holds
 * state at all.
 *
 * Everything here renders OUTSIDE the `<table>` — tests/e2e/admin-flow.spec.ts
 * screenshots `getByRole('table')` against four committed baselines.
 */
import { computed, ref, useId } from 'vue'
import { Accordion } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import HelpTip from '@/components/atoms/HelpTip.vue'
import IndicatorEvidence from '@/components/molecules/IndicatorEvidence.vue'
import { unscorableReasonKey } from '@/utils/bars'
import type {
  EvaluationCompetencyResult,
  EvaluationReportData,
} from '@/composables/useEvaluationReport'

const props = defineProps<{
  evaluation: EvaluationReportData
}>()

const headingId = useId()

const open = ref<string[]>([])

// `::` is not a legal competency code character, so an item value can never
// collide with another competency's.
function itemValue(code: string, index: number): string {
  return `${code}::${index}`
}

const allValues = computed(() =>
  Object.entries(props.evaluation).flatMap(([code, result]) =>
    result.behaviors.map((_, index) => itemValue(code, index))
  )
)

const allOpen = computed(
  () => allValues.value.length > 0 && open.value.length === allValues.value.length
)

function toggleAll(): void {
  open.value = allOpen.value ? [] : [...allValues.value]
}

/**
 * A competency with no indicators must say WHY, not present an expander with
 * nothing behind it. When the API gave a reason (`role_no_bars`,
 * `llm_truncated`, …) that reason is the honest answer; the neutral fallback
 * is used only when there is genuinely nothing more to say.
 */
function emptyKey(result: EvaluationCompetencyResult): string {
  return unscorableReasonKey(result.unscorable_reason) ?? 'report.evidence.noIndicators'
}
</script>
