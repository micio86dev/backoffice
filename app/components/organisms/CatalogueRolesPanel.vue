<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <div class="flex flex-col gap-1">
        <p class="text-muted-foreground text-sm" data-testid="roles-scope">
          {{ $t('catalogue.roles.description') }}
        </p>
        <!--
          Points at the control that now exists (framework-catalogue-
          authoring PR10c, PR8b's `PUT .../competencies`) — the "not
          supported yet" copy this note carried through PR10b is gone.
        -->
        <p
          v-if="editable"
          class="text-muted-foreground text-xs"
          data-testid="roles-assignment-note"
        >
          {{ $t('catalogue.roles.assignmentNote') }}
        </p>
      </div>
      <Button v-if="editable" data-testid="roles-new" @click="editing = 'new'">
        {{ $t('catalogue.roles.new') }}
      </Button>
    </div>

    <FormMessage
      v-if="loadError !== null"
      :kind="loadError === 'not-ready' ? 'waiting' : 'error'"
      :text="$t(resourceErrorKey(loadError, 'message'))"
      test-id="roles-load-error"
    />

    <FormMessage
      v-if="actionError !== null"
      :kind="actionError.kind"
      :text="actionError.text"
      test-id="roles-action-error"
    />

    <Table v-if="loadError === null">
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t('catalogue.roles.table.code') }}</TableHead>
          <TableHead>{{ $t('catalogue.roles.table.name') }}</TableHead>
          <TableHead>{{ $t('catalogue.roles.table.competencies') }}</TableHead>
          <TableHead>
            <span class="sr-only">{{ $t('catalogue.roles.table.actions') }}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty v-if="roles.length === 0" :colspan="4">
          {{ $t('catalogue.roles.table.empty') }}
        </TableEmpty>
        <TableRow v-for="role in roles" :key="role.id">
          <TableCell>{{ role.code }}</TableCell>
          <TableCell>
            <template v-if="displayName(role)">{{ displayName(role) }}</template>
            <template v-else>
              <span class="sr-only">{{ $t('catalogue.roles.table.noName') }}</span>
              <span aria-hidden="true">—</span>
            </template>
          </TableCell>
          <TableCell :data-testid="`role-competency-codes-${role.id}`">
            {{ competencyCodes(role) || $t('catalogue.roles.table.noCompetencies') }}
          </TableCell>
          <TableCell class="flex justify-end gap-2">
            <template v-if="editable">
              <Button
                variant="outline"
                size="sm"
                :data-testid="`role-competencies-${role.id}`"
                @click="managingCompetencies = role"
              >
                {{ $t('catalogue.roles.manageCompetencies') }}
              </Button>
              <Button
                variant="outline"
                size="sm"
                :data-testid="`role-edit-${role.id}`"
                @click="editing = role.id"
              >
                {{ $t('catalogue.roles.edit') }}
              </Button>
              <Button
                variant="outline"
                size="sm"
                :data-testid="`role-delete-${role.id}`"
                @click="deleteTarget = role"
              >
                {{ $t('catalogue.roles.delete') }}
              </Button>
            </template>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <FormDrawer
      :open="editing !== null"
      :title="editing === 'new' ? $t('catalogue.roles.new') : $t('catalogue.roles.edit')"
      form-id="role-form"
      :pending="saving"
      @update:open="(open) => !open && (editing = null)"
    >
      <RoleForm
        v-if="editing !== null"
        :role="editingRole"
        @update:pending="(value) => (saving = value)"
        @saved="onFormSaved"
      />
    </FormDrawer>

    <FormDrawer
      :open="managingCompetencies !== null"
      :title="
        managingCompetencies
          ? $t('catalogue.roles.competencies.title', { role: managingCompetencies.code })
          : ''
      "
      form-id="role-competencies-form"
      :pending="competenciesSaving"
      @update:open="(open) => !open && (managingCompetencies = null)"
    >
      <RoleCompetenciesForm
        v-if="managingCompetencies !== null"
        :role="managingCompetencies"
        :competencies="standardCompetencies"
        @update:pending="(value) => (competenciesSaving = value)"
        @saved="onCompetenciesSaved"
      />
    </FormDrawer>

    <ConfirmDialog
      :open="deleteTarget !== null"
      variant="destructive"
      :title="$t('catalogue.roles.confirmDeleteTitle')"
      :description="$t('catalogue.roles.confirmDeleteBody')"
      :confirm-label="$t('catalogue.roles.delete')"
      @confirm="onConfirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Superadmin CRUD over catalogue roles (framework-catalogue-authoring
 * PR10b/PR10c, DESIGN.md §8.2.10). Same table + `FormDrawer` + `ConfirmDialog`
 * shape as `CatalogueCompetenciesPanel.vue`/`UsersPanel.vue`.
 *
 * A second `FormDrawer` per row mounts `RoleCompetenciesForm` (PR10c,
 * 39c.2), which owns the role→competency assignment editing itself — this
 * container only loads the standard competency list it needs and reloads
 * roles after a save (`competency_ids` changed).
 */
import { ref, computed, onMounted } from 'vue'
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
import FormDrawer from '@/components/organisms/FormDrawer.vue'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import RoleForm from '@/components/organisms/RoleForm.vue'
import RoleCompetenciesForm from '@/components/organisms/RoleCompetenciesForm.vue'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import {
  useCatalogue,
  type CatalogueCompetency,
  type CatalogueRole,
} from '@/composables/useCatalogue'
import { resolveResourceErrorState, resourceErrorKey } from '@/utils/error-state'
import { actionErrorMessage } from '@/utils/action-error-message'
import type { ResourceErrorState } from '@/utils/error-state'

defineProps<{
  /** See `CatalogueCompetenciesPanel`'s own prop — identical here. */
  editable: boolean
}>()

const emit = defineEmits<{ (e: 'refresh-revision'): void }>()

const { listRoles, deleteRole, listCompetencies } = useCatalogue()
const { t, locale } = useI18n()

const roles = ref<CatalogueRole[]>([])
const competencies = ref<CatalogueCompetency[]>([])
const editing = ref<'new' | number | null>(null)
const saving = ref(false)
const managingCompetencies = ref<CatalogueRole | null>(null)
const competenciesSaving = ref(false)
const deleteTarget = ref<CatalogueRole | null>(null)
const loadError = ref<ResourceErrorState | null>(null)
const actionError = ref<{ kind: FormMessageKind; text: string } | null>(null)

/** Never `type === 'potential'` — see `RoleCompetenciesForm`'s own docblock. */
const standardCompetencies = computed<CatalogueCompetency[]>(() =>
  competencies.value.filter((competency) => competency.type === 'standard')
)

const editingRole = computed<CatalogueRole | null>(() => {
  if (editing.value === null || editing.value === 'new') return null
  return roles.value.find((r) => r.id === editing.value) ?? null
})

/**
 * The role's competency set in its assigned order, as codes — shown in both
 * modes, since the read-only view has no drawer to reveal it.
 */
function competencyCodes(role: CatalogueRole): string {
  const codeById = new Map(competencies.value.map((competency) => [competency.id, competency.code]))

  return role.competency_ids
    .map((id) => codeById.get(id))
    .filter((code): code is string => code !== undefined)
    .join(', ')
}

/** Operator UI locale first, English fallback — same rule as the competencies panel. */
function displayName(role: CatalogueRole): string | null {
  return role.name?.[locale.value] ?? role.name?.en ?? null
}

async function load(): Promise<void> {
  loadError.value = null

  try {
    const [rolesResponse, competenciesResponse] = await Promise.all([
      listRoles(),
      listCompetencies(),
    ])
    roles.value = rolesResponse.data
    competencies.value = competenciesResponse.data
  } catch (error) {
    roles.value = []
    competencies.value = []
    loadError.value = resolveResourceErrorState(error)
  }
}

async function onFormSaved(): Promise<void> {
  editing.value = null
  actionError.value = null
  await load()
  emit('refresh-revision')
}

async function onCompetenciesSaved(): Promise<void> {
  managingCompetencies.value = null
  actionError.value = null
  await load()
  emit('refresh-revision')
}

async function onConfirmDelete(): Promise<void> {
  if (deleteTarget.value === null) return
  const target = deleteTarget.value
  deleteTarget.value = null
  actionError.value = null

  try {
    await deleteRole(target.id)
    await load()
    emit('refresh-revision')
  } catch (error) {
    actionError.value = actionErrorMessage(error, t, 'catalogue.roles.deleteError')
  }
}

onMounted(() => {
  void load()
})

defineExpose({ load })
</script>
