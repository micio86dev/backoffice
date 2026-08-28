<template>
  <AccordionItem :value="value">
    <AccordionTrigger heading-as="h5">
      <span class="flex items-start gap-3">
        <ScoreChip
          class="shrink-0"
          :score="behavior.score"
          :unassessable-reason="behavior.unassessable_reason"
        />
        <span class="text-foreground pt-0.5 leading-5 font-medium">{{ behavior.indicator }}</span>
      </span>
    </AccordionTrigger>

    <AccordionContent>
      <div class="flex flex-col gap-3 pl-1">
        <div v-if="explanation" class="flex flex-col gap-1">
          <p class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {{ $t('report.evidence.explanation') }}
          </p>
          <p class="text-foreground text-sm leading-6">{{ explanation }}</p>
        </div>

        <ExcerptList :excerpts="behavior.excerpts ?? []" />
      </div>
    </AccordionContent>
  </AccordionItem>
</template>

<script setup lang="ts">
/**
 * One indicator, disclosed as a unit: its SCORE, its TEXT, and the EVIDENCE
 * behind the score.
 *
 * This is the whole point of the restructure. The grid gives a competency's
 * score, reliability and a strip of chips; before this component the
 * indicator text and the excerpts lived in a separate block underneath, with
 * neither scores nor any link back — so an operator looking at a chip reading
 * "2" had no path to the sentence the candidate actually said. Putting the
 * chip and the indicator text on the SAME trigger, in the same order as the
 * chip strip, is what closes that gap.
 *
 * `explanation` (the scorer's rationale) has been in the payload all along and
 * was rendered nowhere. Here is its natural home — it answers "why this
 * score", which is the question the operator opens the row to ask. It is
 * omitted entirely when blank rather than printing a heading over nothing.
 */
import { computed } from 'vue'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import ScoreChip from '@/components/atoms/ScoreChip.vue'
import ExcerptList from '@/components/molecules/ExcerptList.vue'
import type { EvaluationBehavior } from '@/composables/useEvaluationReport'

const props = defineProps<{
  /** Unique within the enclosing Accordion — see EvidenceAccordion.vue. */
  value: string
  behavior: EvaluationBehavior
}>()

const explanation = computed(() => props.behavior.explanation?.trim() ?? '')
</script>
