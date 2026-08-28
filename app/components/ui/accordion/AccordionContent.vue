<script setup lang="ts">
import type { AccordionContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { AccordionContent, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<AccordionContentProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <!--
    `motion-reduce:animate-none!` is not decoration: DESIGN.md requires every
    animation to honour `prefers-reduced-motion`, and the height keyframes
    carry no such guard on their own (same gap already closed for the vendored
    sheet in FormDrawer.vue).
  -->
  <AccordionContent
    data-slot="accordion-content"
    v-bind="forwarded"
    class="data-open:animate-accordion-down data-closed:animate-accordion-up motion-reduce:animate-none! overflow-hidden text-sm"
  >
    <div :class="cn('pt-0 pb-4', props.class)">
      <slot />
    </div>
  </AccordionContent>
</template>
