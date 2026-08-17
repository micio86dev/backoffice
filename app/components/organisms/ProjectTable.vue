<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>{{ $t('projects.table.name') }}</TableHead>
        <TableHead>{{ $t('projects.table.assessmentType') }}</TableHead>
        <TableHead>{{ $t('projects.table.status') }}</TableHead>
        <TableHead>
          <span class="sr-only">{{ $t('projects.table.actions') }}</span>
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableEmpty v-if="projects.length === 0" :colspan="4">
        {{ $t('projects.table.empty') }}
      </TableEmpty>
      <TableRow v-for="project in projects" :key="project.id">
        <TableCell>
          <span class="text-foreground font-medium">{{ project.name }}</span>
          <div class="text-muted-foreground text-xs">{{ project.slug }}</div>
          <div
            v-if="uncoveredCount(project) > 0"
            class="text-destructive text-xs"
            :data-testid="`project-row-uncovered-${project.id}`"
          >
            {{ $t('projects.table.uncoveredCompetencies', { count: uncoveredCount(project) }) }}
          </div>
        </TableCell>
        <TableCell>{{ $t(`projects.assessmentType.${project.assessment_type}`) }}</TableCell>
        <TableCell>
          <ProjectStatusBadge :status="project.status" />
        </TableCell>
        <TableCell class="text-right">
          <Button
            variant="outline"
            size="sm"
            :data-testid="`project-row-edit-${project.id}`"
            @click="$emit('edit', project.id)"
          >
            {{ $t('projects.action.edit') }}
          </Button>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>

<script setup lang="ts">
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import ProjectStatusBadge from '@/components/atoms/ProjectStatusBadge.vue'
import type { Project } from '@/composables/useProjects'

// bars-coverage-visibility Phase 4 (design D1): `coverage` maps role_code ->
// the IDS of that role's competencies with no BARS anchors, resolved by the
// PARENT via `useBarsCoverage()` (this molecule stays presentational and
// does not fetch). A role_code absent from the map — not yet resolved, or
// the fetch failed — renders NOTHING, never a zero.
//
// PROJECT-scoped, not role-scoped — verified fix for a real bug: the count
// MUST be the intersection of THIS project's own `competencies` with the
// role's uncovered-id set, never the role's raw uncovered count. Two
// projects can share a role and hold entirely different competency subsets;
// rendering the role's count unmodified made every project sharing a role
// report the identical number regardless of what it actually selected.
const props = withDefaults(
  defineProps<{
    projects: Project[]
    coverage?: Record<string, number[]>
  }>(),
  { coverage: () => ({}) }
)

defineEmits<{
  (e: 'edit', id: number): void
}>()

function uncoveredCount(project: Project): number {
  if (!project.role_code) return 0
  const uncoveredIds = props.coverage[project.role_code]
  if (!uncoveredIds || uncoveredIds.length === 0) return 0
  const uncoveredIdSet = new Set(uncoveredIds)
  return project.competencies.filter((competency) => uncoveredIdSet.has(competency.id)).length
}
</script>
