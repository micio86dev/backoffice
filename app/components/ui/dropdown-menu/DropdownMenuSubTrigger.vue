<script setup lang="ts">
import type { DropdownMenuSubTriggerProps } from 'reka-ui'

import type { HTMLAttributes } from 'vue'
import { ChevronRightIcon } from '@heroicons/vue/24/outline'
import { reactiveOmit } from '@vueuse/core'
import { DropdownMenuSubTrigger, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<
  DropdownMenuSubTriggerProps & { class?: HTMLAttributes['class']; inset?: boolean }
>()

const delegatedProps = reactiveOmit(props, 'class', 'inset')
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <DropdownMenuSubTrigger
    data-slot="dropdown-menu-sub-trigger"
    :data-inset="inset ? '' : undefined"
    v-bind="forwardedProps"
    :class="
      cn(
        'focus:bg-accent-dark focus:text-white data-open:bg-accent-dark data-open:text-white not-data-[variant=destructive]:focus:**:text-white gap-1.5 rounded-md px-1.5 py-1 text-sm data-inset:pl-7 [&_svg:not([class*=size-])]:size-4 flex cursor-pointer items-center outline-hidden select-none data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
        props.class
      )
    "
  >
    <slot />
    <ChevronRightIcon class="cn-rtl-flip ml-auto" aria-hidden="true" />
  </DropdownMenuSubTrigger>
</template>
