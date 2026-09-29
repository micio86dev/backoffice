<template>
  <div
    data-slot="checkbox-field"
    :data-invalid="isInvalid ? 'true' : undefined"
    :data-disabled="disabled ? 'true' : undefined"
    :class="cn('flex items-start gap-2', $attrs.class as string | undefined)"
  >
    <!--
      The box lives in a wrapper exactly ONE label line tall (h-5 == the label's
      leading-5) and is centred inside it. With the row `items-start`, the box
      therefore stays centred on the FIRST line of the label however long the
      label wraps or however much description/error stacks below it. Plain
      `items-center` would centre on the whole stack; a hand-tuned `mt-*` nudge
      breaks at any other font size.
    -->
    <span class="flex h-5 shrink-0 items-center">
      <Checkbox
        :id="id"
        v-bind="boxAttrs"
        :model-value="model"
        :disabled="disabled"
        :aria-labelledby="labelId"
        :aria-describedby="describedBy"
        :aria-invalid="isInvalid ? 'true' : undefined"
        :required="required"
        @update:model-value="(checked) => (model = checked === true)"
      />
    </span>

    <div data-slot="checkbox-field-content" class="flex min-w-0 flex-1 flex-col gap-0.5">
      <!--
        A span + aria-labelledby, not <label for>: reka-ui renders a
        <button role="checkbox">, which a label cannot reliably name (see
        ApiKeysPanel history). The click is forwarded explicitly; Space and
        Enter come from the underlying primitive on the box itself.
      -->
      <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -->
      <span
        :id="labelId"
        :class="
          cn(
            'text-sm leading-5 font-normal select-none',
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            labelClass
          )
        "
        @click="onLabelClick"
      >
        <slot>{{ label }}</slot>
        <abbr v-if="required" :title="requiredTitle" class="text-destructive no-underline"> *</abbr>
      </span>

      <FieldDescription v-if="hasDescription" :id="resolvedDescriptionId">
        <slot name="description">{{ description }}</slot>
      </FieldDescription>

      <FieldError v-if="error" :id="resolvedErrorId" :data-testid="errorTestId">
        {{ error }}
      </FieldError>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The single checkbox standard (DESIGN.md §16.13): box first, label to its
 * right, description and error stacked under the label. Wraps the shadcn/reka-ui
 * `Checkbox`; extra attrs (`data-testid`, …) land on the box itself.
 */
import { computed, useAttrs, useSlots } from 'vue'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldDescription, FieldError } from '@/components/ui/field'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    id: string
    label?: string
    description?: string
    error?: string
    /** Marks invalid without a message (e.g. the message renders elsewhere). */
    invalid?: boolean
    required?: boolean
    disabled?: boolean
    /** Accessible title of the required marker. */
    requiredTitle?: string
    /** Extra ids appended to aria-describedby. */
    describedby?: string
    descriptionId?: string
    errorId?: string
    errorTestId?: string
    labelClass?: string
  }>(),
  {
    label: undefined,
    description: undefined,
    error: undefined,
    invalid: false,
    required: false,
    disabled: false,
    requiredTitle: undefined,
    describedby: undefined,
    descriptionId: undefined,
    errorId: undefined,
    errorTestId: undefined,
    labelClass: undefined,
  }
)

const model = defineModel<boolean>({ default: false })

const attrs = useAttrs()
const slots = useSlots()

// `class` belongs to the outer row; everything else goes to the box.
const boxAttrs = computed(() => {
  const { class: _class, ...rest } = attrs

  return rest
})

const labelId = computed(() => `${props.id}-label`)
const resolvedDescriptionId = computed(() => props.descriptionId ?? `${props.id}-description`)
const resolvedErrorId = computed(() => props.errorId ?? `${props.id}-error`)
const hasDescription = computed(() => Boolean(props.description) || Boolean(slots.description))
const isInvalid = computed(() => props.invalid || Boolean(props.error))

const describedBy = computed(() => {
  const ids = [
    props.error ? resolvedErrorId.value : null,
    hasDescription.value ? resolvedDescriptionId.value : null,
    props.describedby ?? null,
  ].filter((id): id is string => id !== null && id !== '')

  return ids.length > 0 ? ids.join(' ') : undefined
})

function onLabelClick(): void {
  if (props.disabled) return
  model.value = !model.value
}
</script>
