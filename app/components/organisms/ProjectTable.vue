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

defineProps<{
  projects: Project[]
}>()

defineEmits<{
  (e: 'edit', id: string): void
}>()
</script>
