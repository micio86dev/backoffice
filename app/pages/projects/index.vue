<template>
  <div class="flex flex-col gap-6">
    <PageHeader :title="$t('projects.title')" :subtitle="$t('projects.subtitle')">
      <template #actions>
        <Button v-if="canCreate" data-testid="projects-new" @click="editing = 'new'">
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
      :can-edit="canEdit"
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
      @update:open="(open) => !open && closeDrawer()"
    >
      <ProjectForm
        v-if="editing !== null"
        :project="editingProject"
        @update:pending="(value) => (saving = value)"
        @update:competencies="(value) => (liveCompetencies = value)"
        @saved="onFormSaved"
      />

      <!--
        Only for a SAVED project. A question needs a `project_id`, so offering
        the editor while one is being created would collect input with nowhere
        to put it — and the competencies it groups by are not chosen yet either.
      -->
      <template v-if="editingProject">
        <Separator class="my-6" />
        <ProjectQuestionsPanel
          :project-id="editingProject.id"
          :competencies="panelCompetencies"
          :locale="editingProject.language"
        />

        <!--
          Deletion, offered ONLY where the API will accept it. `can.delete`
          carries both halves — the admin-only policy and the not-while-active
          state rule — so an operator never meets this control and an admin
          never meets it on a live project. A button that always earns a 409
          is worse than one that is not there.
        -->
        <template v-if="editingProject.can?.delete">
          <Separator class="my-6" />

          <div class="flex flex-col gap-2">
            <h3 class="text-foreground text-sm font-semibold">
              {{ $t('projects.delete.title') }}
            </h3>
            <p class="text-muted-foreground text-sm">{{ $t('projects.delete.description') }}</p>

            <div>
              <Button
                type="button"
                variant="destructive"
                :disabled="deleting"
                data-testid="project-delete"
                @click="confirmingDelete = true"
              >
                {{ $t('projects.delete.action') }}
              </Button>
            </div>

            <FormMessage
              v-if="deleteError"
              kind="error"
              :text="deleteError"
              test-id="project-delete-error"
            />
          </div>
        </template>
      </template>
    </FormDrawer>

    <!--
      Outside the drawer: the dialog teleports to the body anyway, and nesting
      it under a `v-if="editingProject"` would unmount the confirmation the
      moment the delete succeeds and closed the drawer.
    -->
    <ConfirmDialog
      :open="confirmingDelete"
      variant="destructive"
      :title="$t('projects.delete.confirmTitle')"
      :description="$t('projects.delete.confirmDescription')"
      :confirm-label="$t('projects.delete.action')"
      @confirm="onDeleteConfirmed"
      @cancel="confirmingDelete = false"
    />
  </div>
</template>

<script setup lang="ts">
import PageHeader from '@/components/molecules/PageHeader.vue'
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import FormDrawer from '@/components/organisms/FormDrawer.vue'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import FormMessage from '@/components/molecules/FormMessage.vue'
import { getErrorStatus } from '@/utils/http-error'
import { Separator } from '@/components/ui/separator'
import ProjectTable from '@/components/organisms/ProjectTable.vue'
import { useProjects, type Project } from '@/composables/useProjects'
import { useBarsCoverage } from '@/composables/useBarsCoverage'
import { useCurrentUser } from '@/composables/useCurrentUser'
import {
  resolveResourceErrorState,
  resourceErrorKey,
  type ResourceErrorState,
} from '@/utils/error-state'

// The form organism is code-split (D10): only needed once an operator opens
// create/edit, never on the list's initial route chunk.
const ProjectForm = defineAsyncComponent(() => import('@/components/organisms/ProjectForm.vue'))
// Async like ProjectForm: neither is needed until the drawer opens, and the
// panel drags the question editor and its composable in with it.
const ProjectQuestionsPanel = defineAsyncComponent(
  () => import('@/components/organisms/ProjectQuestionsPanel.vue')
)

definePageMeta({
  name: 'projects',
})

const { t, locale } = useI18n()

useHead({
  title: () => t('head.title.projects'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { listProjects, deleteProject } = useProjects()
const { uncoveredIdsByRole, loadRoles } = useBarsCoverage()

/**
 * What this operator may do, ANSWERED BY THE SERVER'S POLICIES.
 *
 * This page used to fetch `/api/profile`, read `data.role` out of it, and
 * compare the string to `'viewer'`. That is the second copy of an
 * authorization rule that `UserAbilities` exists to prevent, and it had
 * already gone stale in two ways: `projects-new` was gated on nothing at all
 * (a viewer was offered a form the API refuses), and "invite candidate" was
 * derived from the project role when the rule that governs it lives in
 * `ParticipantPolicy` — two different policies collapsed into one string
 * comparison.
 *
 * It also cost a second round trip. `/auth/me` is fetched once per page load
 * and shared; `can()` reads that cache and fails closed, so a transient error
 * hides controls rather than offering ones that come back 403.
 */
const { can } = useCurrentUser()
const canCreate = computed(() => can('projects.create'))
const canEdit = computed(() => can('projects.update'))
// Minting an entry link STARTS an assessment — a participant write, governed
// by ParticipantPolicy, never by whether this person may edit the project.
const canInvite = computed(() => can('participants.create'))

const projects = ref<Project[]>([])

// null = closed, 'new' = create form, number id = edit form for that project.
const editing = ref<'new' | number | null>(null)

// Mirrored from ProjectForm's own in-flight flag (feature/form-drawer). The
// form still owns persistence; the drawer footer that holds its submit control
// needs to know when that control must be disabled.
const saving = ref(false)

/**
 * The competencies the FORM currently has ticked.
 *
 * Held here rather than read from `editingProject`, because the questions
 * panel is a sibling of the form and the persisted set is exactly what is
 * stale while the operator is editing. `ProjectForm` publishes it immediately
 * on mount, so this is populated before the panel first renders.
 */
const liveCompetencies = ref<{ id: number; code: string }[] | null>(null)

/**
 * The questions panel's competencies: the form's live set once it has
 * published one, the project's persisted set until then.
 *
 * `null` vs `[]` is the whole distinction, and `.length > 0` collapsed it:
 * `CompetencyPicker` legitimately emits `[]` when the operator unticks the
 * last box, and treating that as "nothing published yet" handed back the
 * PERSISTED set — question editors for competencies they had just detached.
 * Empty is not unknown.
 *
 * The form holds its first emit until its options resolve, so the fallback is
 * what stops the panel saying "this project has no competencies yet" about a
 * fully configured project while that fetch is in flight.
 */
const panelCompetencies = computed(
  () => liveCompetencies.value ?? editingProject.value?.competencies ?? []
)

/**
 * Closing forgets the form's published set.
 *
 * It is scoped to the project that published it; leaving it behind means
 * opening the NEXT project shows the previous one's competency groups until
 * its form re-emits.
 */
function closeDrawer(): void {
  editing.value = null
  liveCompetencies.value = null
  deleteError.value = null
}

const confirmingDelete = ref(false)
const deleting = ref(false)
const deleteError = ref<string | null>(null)

/**
 * Delete, then close and reload.
 *
 * The confirmation is what makes this legal at all — `deleteProject(` matches
 * DESTRUCTIVE_CALL_REGEX, and the guard exists because a project takes every
 * participant, session and evaluation beneath it out of every list.
 */
async function onDeleteConfirmed(): Promise<void> {
  const target = editingProject.value

  confirmingDelete.value = false

  if (target === null) return

  deleting.value = true
  deleteError.value = null

  try {
    await deleteProject(target.id)
    closeDrawer()
    await load()
  } catch (error) {
    // The 409 the endpoint answers while a project is live has its own
    // sentence. Anything else gets the generic one, because there is nothing
    // more specific that is also true.
    deleteError.value =
      getErrorStatus(error) === 409 ? t('projects.delete.stillActive') : t('projects.delete.error')
  } finally {
    deleting.value = false
  }
}

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
  closeDrawer()
  await load()
}

onMounted(() => {
  void load()

  // Fills the shared `/auth/me` cache `can()` reads. Swallowed: `can()`
  // already answers false without it, so a failure hides controls rather
  // than offering ones the API would refuse.
  void useCurrentUser()
    .ensureLoaded()
    .catch(() => undefined)
})
</script>
