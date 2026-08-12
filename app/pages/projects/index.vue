<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold text-foreground">{{ $t('projects.title') }}</h1>
      <Button data-testid="projects-new" @click="editing = 'new'">
        {{ $t('projects.action.new') }}
      </Button>
    </div>

    <Alert
      v-if="loadError"
      :variant="loadError === 'not-ready' ? 'default' : 'destructive'"
      :data-state="loadError"
      data-testid="projects-error"
    >
      <AlertTitle>{{ $t(loadErrorTitleKey) }}</AlertTitle>
      <AlertDescription>{{ $t(loadErrorMessageKey) }}</AlertDescription>
    </Alert>
    <ProjectTable v-else :projects="projects" @edit="onEdit" />

    <Dialog :open="editing !== null" @update:open="(open) => !open && (editing = null)">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {{ editing === 'new' ? $t('projects.form.newTitle') : $t('projects.form.editTitle') }}
          </DialogTitle>
        </DialogHeader>
        <ProjectForm
          v-if="editing !== null"
          :project="editingProject"
          @close="editing = null"
          @saved="onFormSaved"
        />
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ProjectTable from '@/components/organisms/ProjectTable.vue'
import { useProjects, type Project } from '@/composables/useProjects'
import {
  resolveResourceErrorState,
  resourceErrorKey,
  type ResourceErrorState,
} from '@/utils/error-state'

// The form organism is code-split (D10): only needed once an operator opens
// create/edit, never on the list's initial route chunk.
const ProjectForm = defineAsyncComponent(() => import('@/components/organisms/ProjectForm.vue'))

definePageMeta({
  name: 'projects',
})

const { t } = useI18n()

useHead({
  title: () => t('head.title.projects'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { listProjects } = useProjects()

const projects = ref<Project[]>([])

// null = closed, 'new' = create form, string id = edit form for that project.
const editing = ref<'new' | string | null>(null)

const editingProject = computed<Project | null>(() => {
  if (editing.value === null || editing.value === 'new') return null
  return projects.value.find((project) => project.id === editing.value) ?? null
})

// A failed list fetch must NEVER fall through to the table's empty state —
// same D4 discipline as pages/participants/index.vue.
const loadError = ref<ResourceErrorState | null>(null)

const loadErrorTitleKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'title'))
const loadErrorMessageKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'message'))

async function load(): Promise<void> {
  try {
    const response = await listProjects()
    projects.value = response.data
    loadError.value = null
  } catch (error) {
    loadError.value = resolveResourceErrorState(error)
  }
}

function onEdit(id: string): void {
  editing.value = id
}

async function onFormSaved(): Promise<void> {
  editing.value = null
  await load()
}

onMounted(() => {
  void load()
})
</script>
