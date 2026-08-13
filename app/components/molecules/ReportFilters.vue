<template>
  <div class="flex flex-wrap items-end gap-3">
    <Field>
      <FieldLabel for="report-filter-project">{{ $t('reports.filters.project') }}</FieldLabel>
      <select
        id="report-filter-project"
        data-testid="report-filter-project"
        class="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-(--spacing-control-sm) w-full min-w-40 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
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
        class="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-(--spacing-control-sm) w-full min-w-40 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
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
        class="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-(--spacing-control-sm) w-full min-w-40 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
        @change="onRoleCodeChange"
      >
        <option value="">{{ $t('reports.filters.allRoles') }}</option>
        <option v-for="code in ROLE_CODES" :key="code" :value="code">
          {{ $t(`projects.roleCode.${code}`) }}
        </option>
      </select>
    </Field>

    <Field>
      <FieldLabel>{{ $t('reports.filters.status') }}</FieldLabel>
      <ToggleGroup
        type="single"
        :model-value="modelValue.status ?? ''"
        data-testid="report-filter-status"
        @update:model-value="onStatusChange"
      >
        <ToggleGroupItem value="completed">{{
          $t('reports.filters.statusCompleted')
        }}</ToggleGroupItem>
        <ToggleGroupItem value="pending">{{ $t('reports.filters.statusPending') }}</ToggleGroupItem>
      </ToggleGroup>
    </Field>

    <Field>
      <FieldLabel for="report-filter-from">{{ $t('reports.filters.from') }}</FieldLabel>
      <Input
        id="report-filter-from"
        type="date"
        data-testid="report-filter-from"
        @change="onFromChange"
      />
    </Field>

    <Field>
      <FieldLabel for="report-filter-to">{{ $t('reports.filters.to') }}</FieldLabel>
      <Input
        id="report-filter-to"
        type="date"
        data-testid="report-filter-to"
        @change="onToChange"
      />
    </Field>
  </div>
</template>

<script setup lang="ts">
// Report filters (D6/D8): the whitelisted set, emitting ONE filter object —
// never a raw <select>/<button> per-filter cascade of separate emits, so the
// page always has a single source of truth for the current query.
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
