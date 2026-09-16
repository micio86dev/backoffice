<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <div class="flex flex-col gap-1">
        <p class="text-muted-foreground text-sm" data-testid="roles-scope">
          {{ $t('catalogue.roles.description') }}
        </p>
        <!--
          The honest limitation, stated where the superadmin is actually
          looking for the control that does not exist (catalogue-authoring
          PR3's own `RoleController::store()` scope note): neither
          `CatalogueRoleResource` nor `StoreRoleRequest`/`UpdateRoleRequest`
          carries a competency list, so there is nothing here to edit.
        -->
        <p class="text-muted-foreground text-xs" data-testid="roles-assignment-note">
          {{ $t('catalogue.roles.assignmentNote') }}
        </p>
      </div>
      <Button data-testid="roles-new" @click="editing = 'new'">
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
          <TableHead>
            <span class="sr-only">{{ $t('catalogue.roles.table.actions') }}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty v-if="roles.length === 0" :colspan="3">
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
          <TableCell class="flex justify-end gap-2">
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
 * PR10b, DESIGN.md §8.2.10). Same table + `FormDrawer` + `ConfirmDialog`
 * shape as `CatalogueCompetenciesPanel.vue`/`UsersPanel.vue`.
 *
 * Deliberately carries NO role→competency assignment UI — see `RoleForm`'s
 * own docblock and `roles.assignmentNote` for why the contract has nothing
 * to call.
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
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import { useCatalogue, type CatalogueRole } from '@/composables/useCatalogue'
import { resolveResourceErrorState, resourceErrorKey } from '@/utils/error-state'
import { actionErrorMessage } from '@/utils/action-error-message'
import type { ResourceErrorState } from '@/utils/error-state'

const emit = defineEmits<{ (e: 'refresh-revision'): void }>()

const { listRoles, deleteRole } = useCatalogue()
const { t, locale } = useI18n()

const roles = ref<CatalogueRole[]>([])
const editing = ref<'new' | number | null>(null)
const saving = ref(false)
const deleteTarget = ref<CatalogueRole | null>(null)
const loadError = ref<ResourceErrorState | null>(null)
const actionError = ref<{ kind: FormMessageKind; text: string } | null>(null)

const editingRole = computed<CatalogueRole | null>(() => {
  if (editing.value === null || editing.value === 'new') return null
  return roles.value.find((r) => r.id === editing.value) ?? null
})

/** Operator UI locale first, English fallback — same rule as the competencies panel. */
function displayName(role: CatalogueRole): string | null {
  return role.name?.[locale.value] ?? role.name?.en ?? null
}

async function load(): Promise<void> {
  loadError.value = null

  try {
    const response = await listRoles()
    roles.value = response.data
  } catch (error) {
    roles.value = []
    loadError.value = resolveResourceErrorState(error)
  }
}

async function onFormSaved(): Promise<void> {
  editing.value = null
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
