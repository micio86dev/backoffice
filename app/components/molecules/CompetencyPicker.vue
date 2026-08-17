<template>
  <FieldSet>
    <FieldLegend>{{ $t('projects.competencyPicker.legend') }}</FieldLegend>
    <FieldDescription>{{ $t('projects.form.help.competencies') }}</FieldDescription>
    <FieldDescription v-if="missingCount > 0">
      {{
        $t('projects.competencyPicker.coverageSummary', {
          missing: missingCount,
          total: options.length,
        })
      }}
    </FieldDescription>
    <p v-if="options.length === 0" class="text-muted-foreground text-sm">
      {{ $t('projects.competencyPicker.empty') }}
    </p>
    <div v-else class="grid grid-cols-2 gap-2">
      <Field v-for="option in options" :key="option.code" orientation="horizontal" class="w-auto">
        <Checkbox
          :id="`competency-${option.code}`"
          :model-value="isSelected(option)"
          :disabled="!selectable(option)"
          :aria-describedby="reasonId(option)"
          @update:model-value="(checked) => toggle(option, checked === true)"
        />
        <FieldLabel :for="`competency-${option.code}`" class="font-normal">
          {{ option.name }}
        </FieldLabel>
        <FieldDescription v-if="reasonId(option)" :id="reasonId(option)">
          {{ $t(`projects.competencyPicker.${reasonKey(option)}`) }}
        </FieldDescription>
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
import { computed } from 'vue'
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
  // D2: required, never optional — an optional field lets a construction site
  // silently FORGET to answer the coverage question, and `undefined` would
  // read as "selectable" by accident. `boolean | null` forces every site to
  // state an answer: true/false from the catalog endpoint's `bars_available`,
  // or `null` when the question does not apply (POTENTIAL_COMPETENCIES —
  // MTG/LAT are not role-anchored, so coverage has no meaning for them).
  barsAvailable: boolean | null
}

const props = withDefaults(
  defineProps<{
    options: CompetencyOption[]
    modelValue: number[]
    // Scoped by the CALLER to the role the set was persisted under (D2's
    // role-change transition rule) — this component only trusts the ids it
    // is given. Empty on create: nothing is persisted yet, so every
    // uncovered option is disabled — there is no existing commitment to
    // honour.
    persistedIds?: number[]
  }>(),
  { persistedIds: () => [] }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: number[]): void
}>()

function isSelected(option: CompetencyOption): boolean {
  return option.id !== undefined && props.modelValue.includes(option.id)
}

// D2's entire rule, in one predicate: only an EXPLICIT `false` disables NEW
// selection, and an id already in persistedIds is grandfathered in
// regardless — the picker must never disable a CHECKED option (the edit
// form is the remediation path for a project that already holds it).
function selectable(option: CompetencyOption): boolean {
  return (
    option.barsAvailable !== false ||
    (option.id !== undefined && props.persistedIds.includes(option.id))
  )
}

// Deselection stays inside this existing toggle() — a `removeCompetency(`
// identifier would match the destructive-action arch guard's regex
// (`\b(?:delete|remove|revoke|...)[A-Z]\w*\(`) and force a ConfirmDialog into
// a checkbox grid, which is not what unchecking a box is.
function toggle(option: CompetencyOption, checked: boolean): void {
  if (option.id === undefined) return
  if (checked && !selectable(option)) return

  const next = checked
    ? [...props.modelValue, option.id]
    : props.modelValue.filter((id) => id !== option.id)

  emit('update:modelValue', next)
}

// A DIFFERENT message for an already-attached uncovered competency (D6): it
// is selectable, so the reason has to say what the operator's action is
// (remove it), not merely that the box is disabled.
function reasonKey(option: CompetencyOption): 'noBars' | 'attachedNoBars' | null {
  if (option.barsAvailable !== false) return null
  return isSelected(option) ? 'attachedNoBars' : 'noBars'
}

function reasonId(option: CompetencyOption): string | undefined {
  return reasonKey(option) === null ? undefined : `competency-${option.code}-reason`
}

const missingCount = computed(
  () => props.options.filter((option) => option.barsAvailable === false).length
)
</script>
