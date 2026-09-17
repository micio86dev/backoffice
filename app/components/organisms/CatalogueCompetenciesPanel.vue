<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <p class="text-muted-foreground text-sm" data-testid="competencies-scope">
        {{ $t('catalogue.competencies.description') }}
      </p>
      <Button v-if="editable" data-testid="competencies-new" @click="editing = 'new'">
        {{ $t('catalogue.competencies.new') }}
      </Button>
    </div>

    <FormMessage
      v-if="loadError !== null"
      :kind="loadError === 'not-ready' ? 'waiting' : 'error'"
      :text="$t(resourceErrorKey(loadError, 'message'))"
      test-id="competencies-load-error"
    />

    <FormMessage
      v-if="actionError !== null"
      :kind="actionError.kind"
      :text="actionError.text"
      test-id="competencies-action-error"
    />

    <Table v-if="loadError === null">
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t('catalogue.competencies.table.code') }}</TableHead>
          <TableHead>{{ $t('catalogue.competencies.table.name') }}</TableHead>
          <TableHead>{{ $t('catalogue.competencies.table.type') }}</TableHead>
          <TableHead>
            <span class="sr-only">{{ $t('catalogue.competencies.table.actions') }}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty v-if="competencies.length === 0" :colspan="4">
          {{ $t('catalogue.competencies.table.empty') }}
        </TableEmpty>
        <TableRow v-for="competency in competencies" :key="competency.id">
          <TableCell>{{ competency.code }}</TableCell>
          <TableCell>
            <template v-if="displayName(competency)">{{ displayName(competency) }}</template>
            <template v-else>
              <span class="sr-only">{{ $t('catalogue.competencies.table.noName') }}</span>
              <span aria-hidden="true">—</span>
            </template>
          </TableCell>
          <TableCell>{{ $t(`catalogue.competencies.typeOption.${competency.type}`) }}</TableCell>
          <TableCell class="flex justify-end gap-2">
            <template v-if="editable">
              <Button
                variant="outline"
                size="sm"
                :data-testid="`competency-edit-${competency.id}`"
                @click="editing = competency.id"
              >
                {{ $t('catalogue.competencies.edit') }}
              </Button>
              <Button
                variant="outline"
                size="sm"
                :data-testid="`competency-delete-${competency.id}`"
                @click="deleteTarget = competency"
              >
                {{ $t('catalogue.competencies.delete') }}
              </Button>
            </template>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <FormDrawer
      :open="editing !== null"
      :title="
        editing === 'new' ? $t('catalogue.competencies.new') : $t('catalogue.competencies.edit')
      "
      form-id="competency-form"
      :pending="saving"
      @update:open="(open) => !open && (editing = null)"
    >
      <CompetencyForm
        v-if="editing !== null"
        :competency="editingCompetency"
        @update:pending="(value) => (saving = value)"
        @saved="onFormSaved"
      />
    </FormDrawer>

    <ConfirmDialog
      :open="deleteTarget !== null"
      variant="destructive"
      :title="$t('catalogue.competencies.confirmDeleteTitle')"
      :description="$t('catalogue.competencies.confirmDeleteBody')"
      :confirm-label="$t('catalogue.competencies.delete')"
      @confirm="onConfirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Superadmin CRUD over catalogue competencies (framework-catalogue-
 * authoring PR10b, DESIGN.md §8.2.10). Same table + `FormDrawer` +
 * `ConfirmDialog` shape as `UsersPanel.vue` — list, table + dialog, per
 * §8.2.1's own description of that shape for `/settings`.
 *
 * `createCompetency` opens the draft revision on this platform's first
 * catalogue write (PR3's `OpenDraftRevision`, via `CompetencyController::
 * store()`) — the page's own revision header refreshes independently after
 * `saved`, via the `refresh-revision` emit.
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
import CompetencyForm from '@/components/organisms/CompetencyForm.vue'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import { useCatalogue, type CatalogueCompetency } from '@/composables/useCatalogue'
import { resolveResourceErrorState, resourceErrorKey } from '@/utils/error-state'
import { actionErrorMessage } from '@/utils/action-error-message'
import type { ResourceErrorState } from '@/utils/error-state'

defineProps<{
  /**
   * The page's answer from the revision it shows: `false` for the published
   * revision's read-only view, where every add/edit/delete control is
   * hidden — those rows' ids are never writable.
   */
  editable: boolean
}>()

const emit = defineEmits<{ (e: 'refresh-revision'): void }>()

const { listCompetencies, deleteCompetency } = useCatalogue()
const { t, locale } = useI18n()

/**
 * The operator's own UI locale first, falling back to English (gga review
 * finding: an earlier version always showed `name.en`, so an Italian
 * operator read English names even when an Italian one existed). `null`
 * when neither locale has been authored yet — rendered as an accessible
 * dash below, never a raw `'—'` a screen reader cannot make sense of.
 */
function displayName(competency: CatalogueCompetency): string | null {
  return competency.name?.[locale.value] ?? competency.name?.en ?? null
}

const competencies = ref<CatalogueCompetency[]>([])
const editing = ref<'new' | number | null>(null)
const saving = ref(false)
const deleteTarget = ref<CatalogueCompetency | null>(null)
const loadError = ref<ResourceErrorState | null>(null)
const actionError = ref<{ kind: FormMessageKind; text: string } | null>(null)

const editingCompetency = computed<CatalogueCompetency | null>(() => {
  if (editing.value === null || editing.value === 'new') return null
  return competencies.value.find((c) => c.id === editing.value) ?? null
})

async function load(): Promise<void> {
  loadError.value = null

  try {
    const response = await listCompetencies()
    competencies.value = response.data
  } catch (error) {
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

async function onConfirmDelete(): Promise<void> {
  if (deleteTarget.value === null) return
  const target = deleteTarget.value
  deleteTarget.value = null
  actionError.value = null

  try {
    await deleteCompetency(target.id)
    await load()
    emit('refresh-revision')
  } catch (error) {
    actionError.value = actionErrorMessage(error, t, 'catalogue.competencies.deleteError')
  }
}

onMounted(() => {
  void load()
})

defineExpose({ load })
</script>
