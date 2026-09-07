<template>
  <section
    class="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
    :aria-label="$t('reports.filters.legend')"
    data-testid="report-filters"
  >
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <FunnelIcon class="size-4 text-muted-foreground" aria-hidden="true" />
        <h2 class="text-sm font-medium text-foreground">{{ $t('reports.filters.legend') }}</h2>
        <Badge v-if="activeCount > 0" data-testid="report-filters-active-count">
          {{ activeCount }}
        </Badge>
      </div>
      <!--
        The reset only exists while there is something to reset: a permanently
        visible "clear" on an untouched filter bar is a dead control that
        teaches the operator nothing about the current state.
      -->
      <Button
        v-if="activeCount > 0"
        variant="ghost"
        size="sm"
        data-testid="report-filters-clear"
        @click="clearAll"
      >
        <XMarkIcon class="size-4" aria-hidden="true" />
        {{ $t('reports.filters.clear') }}
      </Button>
    </div>

    <!--
      CONTROLLED, like the `ToggleGroup` twenty lines down has always been.

      These five sat uncontrolled behind a `:key` remount, justified by the
      claim that "`:value` on a native <select> sets the attribute rather than
      the property and would not move the selection". Vue 3 does not behave
      that way: `shouldSetAsProp` ends in `return key in el`, and `'value' in
      HTMLSelectElement` is true, so it is set as a PROPERTY —
      `DashboardFilters`, `ClientSwitcher`, `LlmModelPicker` and
      `AvatarTemplateForm` all rely on that today.

      The remount hid the consequence rather than removing it: `activeCount`
      read from the model while the controls did not, so the badge and the
      controls were one hydration away from disagreeing — "3 active" over five
      empty fields the first time a query string or a saved view seeds
      `modelValue`. Reading from the model makes "clear" empty what the
      operator SEES for the same reason it empties the query: they are now the
      same source.
    -->
    <div class="flex flex-col gap-4">
      <div class="grid gap-4 md:grid-cols-3">
        <Field>
          <FieldLabel for="report-filter-project">{{ $t('reports.filters.project') }}</FieldLabel>
          <select
            id="report-filter-project"
            data-testid="report-filter-project"
            :value="modelValue.project_id ?? ''"
            :class="formControlClass"
            @change="onProjectChange"
          >
            <option value="">{{ $t('reports.filters.allProjects') }}</option>
            <option v-for="project in projects" :key="project.id" :value="project.id">
              {{ project.name }}
            </option>
          </select>
        </Field>

        <Field>
          <FieldLabel for="report-filter-assessment-type">
            {{ $t('reports.filters.assessmentType') }}
          </FieldLabel>
          <select
            id="report-filter-assessment-type"
            data-testid="report-filter-assessment-type"
            :value="modelValue.assessment_type ?? ''"
            :class="formControlClass"
            @change="onAssessmentTypeChange"
          >
            <option value="">{{ $t('reports.filters.allTypes') }}</option>
            <option value="standard">{{ $t('projects.assessmentType.standard') }}</option>
            <option value="potential">{{ $t('projects.assessmentType.potential') }}</option>
          </select>
        </Field>

        <Field>
          <FieldLabel for="report-filter-role">{{ $t('reports.filters.roleCode') }}</FieldLabel>
          <select
            id="report-filter-role"
            data-testid="report-filter-role"
            :value="modelValue.role_code ?? ''"
            :class="formControlClass"
            @change="onRoleCodeChange"
          >
            <option value="">{{ $t('reports.filters.allRoles') }}</option>
            <option v-for="code in ROLE_CODES" :key="code" :value="code">
              {{ $t(`projects.roleCode.${code}`) }}
            </option>
          </select>
        </Field>
      </div>

      <Separator />

      <div class="flex flex-wrap items-end gap-x-8 gap-y-4">
        <!--
          FieldSet + FieldLegend, the shape the date range eleven lines down
          already uses — because this is the same thing: a labelled GROUP of
          controls, not a single labelled control.

          `FieldLabel` renders a real `<label>` (ui/field/FieldLabel -> ui/label).
          With no `for`, and a `ToggleGroup` that reka-ui renders as a
          `role="group"` div with no id, it was an orphan label pointing at
          nothing: a screen reader announced two bare buttons, "Completed" and
          "Pending", with no way to know they filter STATUS. It also lost
          `cursor: pointer`, since `main.css` keys that on `label[for]`.
        -->
        <FieldSet class="w-auto gap-2">
          <FieldLegend variant="label">{{ $t('reports.filters.status') }}</FieldLegend>
          <ToggleGroup
            type="single"
            variant="outline"
            :model-value="modelValue.status ?? ''"
            data-testid="report-filter-status"
            @update:model-value="onStatusChange"
          >
            <ToggleGroupItem value="completed">
              {{ $t('reports.filters.statusCompleted') }}
            </ToggleGroupItem>
            <ToggleGroupItem value="pending">
              {{ $t('reports.filters.statusPending') }}
            </ToggleGroupItem>
          </ToggleGroup>
        </FieldSet>

        <!--
          The two dates are one filter, not two, so they read as one control
          with an explicit direction rather than two unrelated fields that
          happened to land next to each other.
        -->
        <FieldSet class="w-auto gap-2">
          <FieldLegend variant="label">{{ $t('reports.filters.period') }}</FieldLegend>
          <div class="flex items-center gap-2">
            <Field class="w-auto">
              <FieldLabel class="sr-only" for="report-filter-from">
                {{ $t('reports.filters.from') }}
              </FieldLabel>
              <Input
                id="report-filter-from"
                type="date"
                autocomplete="off"
                class="w-40"
                :model-value="modelValue.evaluated_from ?? ''"
                data-testid="report-filter-from"
                @change="onFromChange"
              />
            </Field>
            <span aria-hidden="true" class="text-sm text-muted-foreground">&rarr;</span>
            <Field class="w-auto">
              <FieldLabel class="sr-only" for="report-filter-to">
                {{ $t('reports.filters.to') }}
              </FieldLabel>
              <Input
                id="report-filter-to"
                type="date"
                autocomplete="off"
                class="w-40"
                :model-value="modelValue.evaluated_to ?? ''"
                data-testid="report-filter-to"
                @change="onToChange"
              />
            </Field>
          </div>
        </FieldSet>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// Report filters (D6/D8): the whitelisted set, emitting ONE filter object —
// never a raw <select>/<button> per-filter cascade of separate emits, so the
// page always has a single source of truth for the current query.
import { computed } from 'vue'
import { FunnelIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { formControlClass } from '@/components/ui/form-control'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { EvaluationQueryParams } from '@/utils/evaluation-query'

const ROLE_CODES = ['ICO', 'FLL', 'MLL', 'BUL', 'SRX'] as const

export interface ReportFilterProject {
  id: string | number
  name: string
}

const props = defineProps<{
  projects: ReportFilterProject[]
  modelValue: EvaluationQueryParams
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: EvaluationQueryParams): void
}>()

const activeCount = computed(
  () =>
    Object.values(props.modelValue).filter((value) => value !== undefined && value !== '').length
)

function clearAll(): void {
  emit('update:modelValue', {})
}

function emitPatch(
  clearedKey: keyof EvaluationQueryParams,
  value?: EvaluationQueryParams[typeof clearedKey]
): void {
  const next: EvaluationQueryParams = { ...props.modelValue }
  if (value === undefined || value === '') {
    next[clearedKey] = undefined
  } else {
    next[clearedKey] = value as never
  }
  emit('update:modelValue', next)
}

function onProjectChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emitPatch('project_id', value ? Number(value) : undefined)
}

function onAssessmentTypeChange(event: Event): void {
  const value = (event.target as HTMLSelectElement)
    .value as EvaluationQueryParams['assessment_type']
  emitPatch('assessment_type', value || undefined)
}

function onRoleCodeChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emitPatch('role_code', value || undefined)
}

function onStatusChange(value: unknown): void {
  emitPatch('status', value === 'completed' || value === 'pending' ? value : undefined)
}

function onFromChange(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  emitPatch('evaluated_from', value || undefined)
}

function onToChange(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  emitPatch('evaluated_to', value || undefined)
}
</script>
