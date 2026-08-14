<template>
  <FieldSet>
    <FieldLegend>{{ $t('projects.competencyPicker.legend') }}</FieldLegend>
    <FieldDescription>{{ $t('projects.form.help.competencies') }}</FieldDescription>
    <p v-if="options.length === 0" class="text-muted-foreground text-sm">
      {{ $t('projects.competencyPicker.empty') }}
    </p>
    <div v-else class="grid grid-cols-2 gap-2">
      <Field v-for="option in options" :key="option.code" orientation="horizontal" class="w-auto">
        <Checkbox
          :id="`competency-${option.code}`"
          :model-value="isSelected(option)"
          @update:model-value="(checked) => toggle(option, checked === true)"
        />
        <FieldLabel :for="`competency-${option.code}`" class="font-normal">
          {{ option.name }}
        </FieldLabel>
      </Field>
    </div>
  </FieldSet>
</template>

<script setup lang="ts">
// FieldSet + FieldLegend + Checkbox grid (D10 — a role carries 14-18
// competencies; a ToggleGroup is the documented choice for 2-7 options, and a
// multi-select Combobox would hide the full set behind a popover). Filtering
// by assessment type / role is the CALLER's responsibility (ProjectForm.vue
// composes the right `options` list); this molecule only renders what it is
// given and tracks selection.
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'

export interface CompetencyOption {
  code: string
  name: string
  // Optional only because the `potential` path builds its two fixed options
  // (MTG/LAT) locally. Everything sourced from the catalog carries an id, and
  // an option without one cannot be selected — `toggle()` returns early rather
  // than emitting a selection the server would reject.
  id?: number
}

const props = defineProps<{
  options: CompetencyOption[]
  modelValue: number[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: number[]): void
}>()

function isSelected(option: CompetencyOption): boolean {
  return option.id !== undefined && props.modelValue.includes(option.id)
}

function toggle(option: CompetencyOption, checked: boolean): void {
  if (option.id === undefined) return

  const next = checked
    ? [...props.modelValue, option.id]
    : props.modelValue.filter((id) => id !== option.id)

  emit('update:modelValue', next)
}
</script>
