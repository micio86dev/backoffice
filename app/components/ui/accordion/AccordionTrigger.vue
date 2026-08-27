<script setup lang="ts">
/**
 * One deviation from the stock shadcn-vue accordion, and it is deliberate:
 * `headingAs`.
 *
 * reka-ui's `AccordionHeader` renders an `<h3>`. An accordion nested under a
 * section heading and a group heading would then jump BACK up a level for
 * every item, telling assistive tech that each item is a sibling of the
 * section rather than a child of its group. The level therefore has to be a
 * decision of the caller, which knows where in the outline it sits.
 * Defaults to `h3`, i.e. the stock behaviour.
 */
import type { AccordionTriggerProps, AsTag } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { AccordionHeader, AccordionTrigger, useForwardProps } from 'reka-ui'
import { ChevronDownIcon } from '@heroicons/vue/24/outline'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<
    AccordionTriggerProps & {
      class?: HTMLAttributes['class']
      headingAs?: AsTag
    }
  >(),
  { headingAs: 'h3' }
)

const delegatedProps = reactiveOmit(props, 'class', 'headingAs')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <AccordionHeader :as="headingAs" data-slot="accordion-header" class="flex">
    <AccordionTrigger
      data-slot="accordion-trigger"
      v-bind="forwarded"
      :class="
        cn(
          'focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-3 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50',
          '[&[data-state=open]>svg]:rotate-180',
          'motion-reduce:transition-none!',
          props.class
        )
      "
    >
      <slot />
      <ChevronDownIcon
        aria-hidden="true"
        class="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200 motion-reduce:transition-none!"
      />
    </AccordionTrigger>
  </AccordionHeader>
</template>
