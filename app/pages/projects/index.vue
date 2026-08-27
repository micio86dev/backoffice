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

    <!--
      Right-side drawer, not a centred dialog (feature/form-drawer). The
      Dialog this replaces needed a `max-h-[85vh]` cap plus its own internal
      scroll because the project form — the longest in the product — otherwise
      grew past the viewport and took its submit button with it: the control
      was visible, enabled and stable, and simply not reachable, which E2E
      caught as a click that retried until it timed out. FormDrawer's footer is
      a SIBLING of the scroll region rather than a descendant, so that defect
      is structurally impossible here instead of held off by a magic height.
    -->
    <FormDrawer
      :open="editing !== null"
      :title="editing === 'new' ? $t('projects.form.newTitle') : $t('projects.form.editTitle')"
      form-id="project-form"
      :pending="saving"
      @update:open="(open) => !open && (editing = null)"
    >
      <ProjectForm
        v-if="editing !== null"
        :project="editingProject"
        @update:pending="(value) => (saving = value)"
        @saved="onFormSaved"
      />
    </FormDrawer>
  </div>
</template>

<script setup lang="ts">
import PageHeader from '@/components/molecules/PageHeader.vue'
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import FormDrawer from '@/components/organisms/FormDrawer.vue'
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

// Mirrored from ProjectForm's own in-flight flag (feature/form-drawer). The
// form still owns persistence; the drawer footer that holds its submit control
// needs to know when that control must be disabled.
const saving = ref(false)

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
