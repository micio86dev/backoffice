<template>
  <div class="flex flex-col gap-6">
    <PageHeader :title="$t('projects.title')" :subtitle="$t('projects.subtitle')">
      <template #actions>
        <Button data-testid="projects-new" @click="editing = 'new'">
          {{ $t('projects.action.new') }}
        </Button>
      </template>
    </PageHeader>

    <Alert
      v-if="loadError"
      :variant="loadError === 'not-ready' ? 'default' : 'destructive'"
      :data-state="loadError"
      data-testid="projects-error"
    >
      <AlertTitle>{{ $t(loadErrorTitleKey) }}</AlertTitle>
      <AlertDescription>{{ $t(loadErrorMessageKey) }}</AlertDescription>
    </Alert>
    <ProjectTable
      v-else
      :projects="projects"
      :coverage="uncoveredIdsByRole"
      :can-invite="canInvite"
      :locale="locale"
      @edit="onEdit"
    />

    <Dialog :open="editing !== null" @update:open="(open) => !open && (editing = null)">
      <!--
        The height cap and internal scroll are load-bearing, not polish. The
        project form is the longest in the product, and without them the dialog
        grew past the viewport and took its submit button with it: the control
        was visible, enabled and stable, and simply not reachable — E2E caught
        it as a click that retried until it timed out. A form you cannot submit
        is not a styling issue.
      -->
      <DialogContent class="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-lg">
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
import PageHeader from '@/components/molecules/PageHeader.vue'
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ProjectTable from '@/components/organisms/ProjectTable.vue'
import { useProjects, type Project } from '@/composables/useProjects'
import { useBarsCoverage } from '@/composables/useBarsCoverage'
import { useProfile } from '@/composables/useProfile'
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

const { t, locale } = useI18n()

useHead({
  title: () => t('head.title.projects'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { listProjects } = useProjects()
const { uncoveredIdsByRole, loadRoles } = useBarsCoverage()
const { fetchProfile } = useProfile()

// "Invite candidate" (operator-interview-link, design D4): minting starts an
// assessment, it is not a read — a viewer must see neither this row action
// nor the participant-detail "Generate new link" card. Fail-closed default
// (false) until the profile fetch confirms a non-viewer role, mirroring
// profile.vue:52's own coercion of a missing/unrecognized role to 'viewer'.
const canInvite = ref(false)

async function loadViewerGate(): Promise<void> {
  try {
    const profile = await fetchProfile()
    canInvite.value = (profile.data.role ? String(profile.data.role) : 'viewer') !== 'viewer'
  } catch {
    canInvite.value = false
  }
}

const projects = ref<Project[]>([])

// null = closed, 'new' = create form, number id = edit form for that project.
const editing = ref<'new' | number | null>(null)

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
    // bars-coverage-visibility Phase 4 (D1): resolved for every distinct
    // non-null role_code among the loaded projects, not awaited — the list
    // itself must render immediately; the coverage line fills in once its
    // own request(s) settle.
    void loadRoles(projects.value.map((project) => project.role_code))
  } catch (error) {
    loadError.value = resolveResourceErrorState(error)
  }
}

function onEdit(id: number): void {
  editing.value = id
}

async function onFormSaved(): Promise<void> {
  editing.value = null
  await load()
}

onMounted(() => {
  void load()
  void loadViewerGate()
})
</script>
