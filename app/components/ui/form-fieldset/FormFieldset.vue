<script setup lang="ts">
/**
 * FormFieldset — disables every control inside it while a submit is in flight.
 *
 * WHY A FIELDSET AND NOT A `:disabled` ON EACH FIELD
 * ---------------------------------------------------
 * `<fieldset disabled>` is the one thing in HTML that disables a whole subtree
 * at once, including controls added later. Wiring `:disabled="saving"` onto
 * each input is the same rule written N times, and the Nth one is always the
 * field somebody adds next week — a form that stays half-editable mid-save,
 * which is exactly the state that produces two conflicting writes from one
 * user.
 *
 * It also disables NATIVE VALIDATION and SUBMISSION for the controls inside,
 * so a stray Enter keypress during a save cannot start a second one.
 *
 * WHY THE STYLE RESET IS NOT COSMETIC
 * ------------------------------------
 * A `<fieldset>` carries user-agent margin, padding and a border, and — the
 * part that actually breaks layouts — `min-width: min-content`, which makes it
 * refuse to shrink inside a flex or grid parent. Dropping one around existing
 * markup without this reset visibly moves the form. `min-w-0` is the load
 * bearing half; the rest just makes it invisible.
 *
 * `contents` is deliberately NOT used as the display value: a fieldset with
 * `display: contents` stops disabling its descendants in some browsers, which
 * would make this component silently do nothing.
 */
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  /** True while the form's submit request is in flight. */
  disabled?: boolean
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <fieldset
    :disabled="disabled || undefined"
    data-slot="form-fieldset"
    :class="cn('m-0 min-w-0 border-0 p-0', props.class)"
  >
    <slot />
  </fieldset>
</template>
