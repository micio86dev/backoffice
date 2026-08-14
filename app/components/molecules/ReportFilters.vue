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
      `resetKey` remounts the uncontrolled native controls so "clear" empties
      what the operator SEES, not just the emitted query. The selects and date
      inputs stay uncontrolled on purpose: `:value` on a native <select> sets
      the attribute rather than the property and would not move the selection.
    -->
    <div :key="resetKey" class="flex flex-col gap-4">
      <div class="grid gap-4 md:grid-cols-3">
        <Field>
          <FieldLabel for="report-filter-project">{{ $t('reports.filters.project') }}</FieldLabel>
          <select
            id="report-filter-project"
            data-testid="report-filter-project"
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
        <Field class="w-auto">
          <FieldLabel>{{ $t('reports.filters.status') }}</FieldLabel>
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
        </Field>

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
import { computed, ref } from 'vue'
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

const resetKey = ref(0)

const activeCount = computed(
  () =>
    Object.values(props.modelValue).filter((value) => value !== undefined && value !== '').length
)

function clearAll(): void {
  resetKey.value += 1
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
