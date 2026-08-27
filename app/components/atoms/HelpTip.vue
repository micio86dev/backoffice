<template>
  <span class="inline-flex items-baseline">
    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          :aria-label="$t('report.help.trigger', { term: $t(termKey) })"
          class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 focus-visible:border-ring inline-flex items-center gap-1 rounded-sm underline decoration-dotted underline-offset-4 transition-colors outline-none focus-visible:ring-3 motion-reduce:transition-none!"
        >
          {{ $t(termKey) }}
          <InformationCircleIcon aria-hidden="true" class="size-3.5 shrink-0" />
        </button>
      </TooltipTrigger>
      <TooltipContent class="max-w-xs motion-reduce:animate-none!">
        <p class="leading-5">{{ $t(definitionKey) }}</p>
      </TooltipContent>
    </Tooltip>

    <!--
      The definition, in the DOM, always. A tooltip is a hover/focus surface:
      reka-ui only mounts its content while open, so a screen-reader user
      linearising the page would otherwise get the term and never its meaning.
      This span is what makes the tip readable without a pointer at all.
    -->
    <span class="sr-only">{{ $t(definitionKey) }}</span>
  </span>
</template>

<script setup lang="ts">
/**
 * A glossary term the operator can interrogate in place.
 *
 * Two constraints shape it, and neither is negotiable:
 *
 * 1. The trigger is a real `<button>`, not a styled `<span>` with a hover
 *    handler. A hover-only affordance does not exist for keyboard users, and
 *    reka-ui opens the tooltip on focus as well as on hover — but only if the
 *    trigger is focusable in the first place.
 * 2. The definition is rendered as `sr-only` text next to the button, so the
 *    meaning survives even when the tooltip never opens.
 *
 * Content comes from the SAME `help.glossary.*` namespace HelpSheet reads, so
 * a term is defined once and cannot drift between the two surfaces.
 */
import { computed } from 'vue'
import { InformationCircleIcon } from '@heroicons/vue/24/outline'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const props = defineProps<{
  /** A `help.glossary.*` key suffix, e.g. `indicator`. */
  term: string
}>()

const termKey = computed(() => `help.glossary.${props.term}.term`)
const definitionKey = computed(() => `help.glossary.${props.term}.definition`)
</script>
